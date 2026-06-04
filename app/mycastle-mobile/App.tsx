import React, { useRef, useCallback, useEffect } from 'react';
import { Alert, BackHandler, Linking, Platform, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import Constants from 'expo-constants';

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
        injectedJavaScript={`
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
