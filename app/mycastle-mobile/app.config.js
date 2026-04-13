/**
 * Dynamic Expo config — reads env vars at build time.
 *
 * Env vars:
 *   MYCASTLE_SERVER_URL   URL of the MyCastle backend  (default: http://192.168.0.207:1894)
 *   MYCASTLE_APP_NAME     Display name shown on Android (default: MyCastle)
 */

const serverUrl = process.env.MYCASTLE_SERVER_URL || 'http://192.168.0.207:1894';
const appName   = process.env.MYCASTLE_APP_NAME   || 'MyCastle';

module.exports = {
  expo: {
    name: appName,
    slug: 'mycastle-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1a1a2e',
    },
    jsEngine: 'jsc',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.mycastle.mobile',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1a1a2e',
      },
      package: 'com.mycastle.mobile',
      usesCleartextTraffic: true,
    },
    web: {
      bundler: 'metro',
    },
    plugins: ['expo-asset', 'expo-font'],
    extra: {
      serverUrl,
      appName,
    },
  },
};
