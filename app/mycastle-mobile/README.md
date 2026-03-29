# MyCastle Mobile

React Native / Expo WebView wrapper dla MyCastle.

## Setup

```bash
cd app/mycastle-mobile
npm install -g expo-cli eas-cli   # jednorazowo
npm install
```

## Uruchomienie (Expo Go)

Najszybszy sposób — bez budowania APK:

```bash
npx expo start
```

Zeskanuj QR kod aplikacją **Expo Go** na telefonie (ten sam network WiFi).

## Build APK (standalone, bez Expo Go)

Wymaga konta na https://expo.dev (darmowe):

```bash
eas login
eas build:configure   # jednorazowo — tworzy eas.json
eas build --platform android --profile preview
```

Po buildzie pobierz `.apk` z dashboardu Expo i zainstaluj na telefonie.

## Zmiana adresu serwera

Edytuj `App.tsx`, linia:
```typescript
const SERVER_URL = 'http://192.168.0.207:1894';
```

## Co robi

- Pełnoekranowy WebView z adresem serwera
- Android back button → cofanie w historii WebView (nie zamykanie aplikacji)
- `domStorageEnabled` — localStorage działa (sesja logowania persystuje)
- `mixedContentMode="always"` — HTTP na Androidzie 9+ działa
- MQTT WebSocket działa przez WebView
