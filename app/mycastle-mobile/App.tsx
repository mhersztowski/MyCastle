import React, { useRef, useCallback, useEffect } from 'react';
import { BackHandler, Platform, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';
import Constants from 'expo-constants';

const SERVER_URL: string =
  (Constants.expoConfig?.extra?.serverUrl as string | undefined) ?? 'http://192.168.0.207:1894';

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);

  const handleNavigationStateChange = useCallback((state: WebViewNavigation) => {
    canGoBackRef.current = state.canGoBack;
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
