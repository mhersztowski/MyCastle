import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { Alert, BackHandler, Linking, Platform, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import Constants from 'expo-constants';
import BooxPen from './modules/boox-pen';

const SERVER_URL: string =
  (Constants.expoConfig?.extra?.serverUrl as string | undefined) ?? 'http://192.168.0.207:1894';

/**
 * URLs that should NOT navigate inside the WebView — they're file downloads
 * (Drive `Pobierz`, public file links). The Android WebView can't trigger
 * the system download manager from JS-created blobs, so the web app builds a
 * real URL with `?download=1` + token; here we hand it to the OS browser via
 * Linking.openURL, and Chrome / the system downloader takes it from there.
 *
 * Patterns matched:
 *   - /api/users/{u}/vfs/readFile?...download=1
 *   - /public/drive/users/{u}/... (with or without ?download=1)
 */
function isDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.pathname.includes('/vfs/readFile') && u.searchParams.get('download') === '1') return true;
    if (u.pathname.startsWith('/public/drive/users/')) return true;
    return false;
  } catch {
    return false;
  }
}

/* ─── Most do sterownika pióra Onyx Boox ──────────────────────────────────
 *
 * Na czytniku E Ink kreska rysowana w kanwie HTML pojawia się z opóźnieniem
 * rzędu 150–300 ms — droga przez zdarzenia wskaźnika, złożenie WebView
 * i zwykłą falę odświeżania panelu jest po prostu długa. `TouchHelper`
 * z SDK Onyksa rysuje wprost na panelu, ale w zamian **zabiera pióro
 * WebView**: dopóki tryb jest włączony, strona nie dostanie ani jednego
 * `pointerdown` ze stylusa.
 *
 * Dlatego powłoka nie decyduje, kiedy przejąć pióro — robi to strona, bo tylko
 * ona wie, czy właśnie pokazuje kanwę do rysowania. Tutaj zostaje przekazanie
 * komunikatów w obie strony.
 *
 * Powłoka celowo niczego nie interpretuje: kształt komunikatu jest jeden i ten
 * sam po obu stronach mostka (`app/mycastle-web/src/modules/native/booxPen.ts`),
 * więc logika, którą warto sprawdzać testem, siedzi po stronie, która testy ma.
 */

/** Stan wykrycia — liczony raz, bo urządzenie w trakcie działania się nie zmienia. */
function readPenSupport(): { available: boolean; info: string } {
  if (!BooxPen) return { available: false, info: 'powłoka bez modułu pióra' };
  try {
    const d = BooxPen.describe();
    return { available: d.available, info: d.info };
  } catch {
    return { available: false, info: 'moduł pióra nie odpowiedział' };
  }
}

/** Skrypt wstrzykiwany przed uruchomieniem strony — musi zdążyć przed Reactem. */
function penBridgeScript(support: { available: boolean; info: string }): string {
  return `(function () {
    if (window.__booxPen) return;
    window.__booxPen = {
      available: ${support.available ? 'true' : 'false'},
      info: ${JSON.stringify(support.info)},
      onStroke: null,
      onStatus: null,
      send: function (message) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    };
  })();
  true;`;
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);

  const handleNavigationStateChange = useCallback((state: WebViewNavigation) => {
    canGoBackRef.current = state.canGoBack;
  }, []);

  // Intercept downloads — see isDownloadUrl(). On Android this is the only
  // way to get files actually saved to disk; the WebView ignores the JS
  // `<a download>` trick and would otherwise navigate to an octet-stream
  // response and render garbage.
  const handleShouldStartLoad = useCallback((req: ShouldStartLoadRequest): boolean => {
    if (isDownloadUrl(req.url)) {
      Linking.openURL(req.url).catch((err: unknown) => {
        Alert.alert('Pobieranie nieudane', err instanceof Error ? err.message : String(err));
      });
      return false; // tell WebView NOT to navigate
    }
    return true;
  }, []);

  // ── Pióro sterownika (Onyx Boox) ─────────────────────────────────────────

  const penSupport = useMemo(readPenSupport, []);

  /**
   * Zgłoszenie awarii sterownika z powrotem do strony.
   *
   * Wykrycie po producencie urządzenia bywa hojne — czytnik może być Onyksem,
   * a mimo to `TouchHelper` odmówi (inna wersja firmware'u, brak usługi).
   * Strona musi się o tym dowiedzieć, bo inaczej dalej odsiewa zdarzenia pióra
   * w oczekiwaniu na pociągnięcia, które nigdy nie przyjdą — czyli rysowanie
   * przestaje działać zupełnie zamiast wrócić do wolniejszej ścieżki.
   */
  const reportPenFailure = useCallback((err: unknown) => {
    const reason = err instanceof Error ? err.message : String(err);
    webViewRef.current?.injectJavaScript(
      `(function () {
        if (!window.__booxPen) return;
        window.__booxPen.available = false;
        window.__booxPen.info = ${JSON.stringify('sterownik odmówił: ')} + ${JSON.stringify(reason)};
      })();
      true;`,
    );
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let message: { type?: unknown } | null = null;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return; // nie nasz komunikat
    }
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('boox:')) return;
    if (!BooxPen) return;

    const msg = message as Record<string, unknown>;
    switch (msg.type) {
      case 'boox:area':
        BooxPen.setArea({
          left: Number(msg.left), top: Number(msg.top),
          width: Number(msg.width), height: Number(msg.height),
          strokeWidth: Number(msg.strokeWidth),
        }).catch(reportPenFailure);
        break;
      case 'boox:enabled':
        BooxPen.setEnabled(msg.enabled === true).catch(reportPenFailure);
        break;
      case 'boox:release':
        // Zwolnienie nie ma komu zgłosić porażki — strona już się rozmontowała.
        BooxPen.release().catch(() => undefined);
        break;
    }
  }, [reportPenFailure]);

  // Gotowe pociągnięcia wracają do strony jako literał JSON. Wstrzyknięcie
  // zamiast `postMessage` w drugą stronę, bo WebView nie ma kanału natywne→strona
  // innego niż wykonanie kodu.
  useEffect(() => {
    if (!BooxPen) return;
    const sub = BooxPen.addListener('onStroke', ({ stroke }) => {
      webViewRef.current?.injectJavaScript(
        `window.__booxPen && window.__booxPen.onStroke && window.__booxPen.onStroke(${stroke});
        true;`,
      );
    });
    return () => sub.remove();
  }, []);

  // Faktyczny stan sterownika — nie to, o co strona poprosiła, tylko co z tego
  // wyszło. Bez tego kanału każda awaria po stronie natywnej jest niewidoczna,
  // bo dzieje się wewnątrz `runOnUiThread`, już po spełnieniu obietnicy.
  useEffect(() => {
    if (!BooxPen) return;
    const sub = BooxPen.addListener('onStatus', ({ engaged, error }) => {
      webViewRef.current?.injectJavaScript(
        `window.__booxPen && window.__booxPen.onStatus && window.__booxPen.onStatus({
          engaged: ${engaged ? 'true' : 'false'},
          error: ${error ? JSON.stringify(error) : 'null'}
        });
        true;`,
      );
    });
    return () => sub.remove();
  }, []);

  // Android hardware back button — go back in WebView history instead of closing the app
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      if (canGoBackRef.current) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <WebView
        ref={webViewRef}
        source={{ uri: SERVER_URL }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={handleMessage}
        // Most musi istnieć, zanim wystartuje React strony — inaczej pierwsza
        // kanwa sprawdzi `window.__booxPen` i nie zastanie go.
        injectedJavaScriptBeforeContentLoaded={penBridgeScript(penSupport)}
        mixedContentMode="always"
        domStorageEnabled
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        applicationNameForUserAgent="MyCastleMobile/1.0"
        overScrollMode="never"
        bounces={false}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        cacheEnabled={false}
        // Trigger resize events after page load so Blockly can re-measure blocks
        // once native layout has settled. Spread across 3 s to cover variable init timing.
        //
        // Most pióra wstrzykiwany jest **drugi raz**, po załadowaniu strony.
        // `injectedJavaScriptBeforeContentLoaded` na Androidzie nie ma gwarancji
        // uruchomienia przed treścią, a jego pominięcie wygląda dokładnie tak
        // jak brak modułu natywnego: strona nie zastaje `window.__booxPen`
        // i milcząco wraca do wolnego rysowania. Skrypt jest idempotentny
        // (`if (window.__booxPen) return;`), więc drugie wykonanie nic nie psuje.
        injectedJavaScript={penBridgeScript(penSupport) + `
          (function() {
            function triggerResize() { window.dispatchEvent(new Event('resize')); }
            [100, 500, 900, 1400, 2000, 3000].forEach(function(ms) {
              setTimeout(triggerResize, ms);
            });
          })();
          true;
        `}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  webview: {
    flex: 1,
  },
});
