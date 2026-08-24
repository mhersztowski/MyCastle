/**
 * MyCastle Watch — przycisk na zegarku.
 *
 * Aplikacja natywna, **bez `WebView`**. Poprzednia wersja była opakowaniem
 * strony `/watch` w przeglądarkę i nie miała szans zadziałać: Wear OS nie
 * zawiera silnika przeglądarki. Objaw był mylący — aplikacja instalowała się,
 * pojawiała w menu, startowała, pokazywała splash i znikała, a w logu
 * systemowym (nie aplikacji) stało:
 *
 *     java.lang.UnsupportedOperationException
 *         at android.webkit.WebViewFactory.getProvider
 *
 * Zamiast przeglądarki jest więc zwykły `fetch` na `POST /api/watch/press`.
 * MQTT zostaje po stronie backendu, gdzie i tak już jest — biblioteka MQTT
 * w React Native wymaga polyfilli (`buffer`, `stream`) i bywa kapryśna, a tu
 * chodzi o wysłanie jednego zdarzenia.
 *
 * ## Co widać na ekranie
 *
 * Jeden okrągły przycisk, jak na stronie `/watch`, plus **stan ostatniego
 * wysłania**. Na telefonie stan można pominąć, bo obok jest przeglądarka
 * i konsola; na zegarku ekran jest jedynym, co użytkownik ma — jeśli przycisk
 * nie odpowie, nie ma jak zgadnąć, czy sygnał doszedł.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import Constants from 'expo-constants';

/*
 * Adres z konfiguracji budowania, nie z kodu.
 *
 * Zegarek trafia do innej sieci niż stanowisko, na którym powstaje APK, więc
 * adres serwera musi dać się podmienić bez ruszania źródeł — tak samo, jak
 * w `mycastle-mobile`.
 */
const BASE_URL =
  (Constants.expoConfig?.extra?.serverUrl as string | undefined) ?? 'http://192.168.0.207:1894';
const PRESS_URL = `${BASE_URL.replace(/\/$/, '')}/api/watch/press`;

/**
 * Po ilu milisekundach uznajemy, że serwer nie odpowie.
 *
 * Zegarek na Wi-Fi bywa wolny, ale użytkownik trzyma rękę uniesioną — po pięciu
 * sekundach patrzenia w kręcące się kółko i tak naciśnie ponownie. Lepiej
 * powiedzieć „nie udało się" i pozwolić spróbować, niż wisieć bez końca.
 */
const TIMEOUT_MS = 5000;

/** Jak długo pokazujemy potwierdzenie, zanim wrócimy do stanu spoczynku. */
const CONFIRM_MS = 2500;

type Stan =
  | { kind: 'spoczynek' }
  | { kind: 'wysyłanie' }
  | { kind: 'wysłano'; czas: string }
  | { kind: 'błąd'; powód: string };

export default function App() {
  const [stan, setStan] = useState<Stan>({ kind: 'spoczynek' });

  /*
   * Znacznik trwającego wysyłania w ref, nie w stanie.
   *
   * Ekran zegarka bywa dotykany nadgarstkiem i rękawem; bez blokady jedno
   * przypadkowe otarcie wysyła serię zgłoszeń. Ref, bo sprawdzenie musi być
   * natychmiastowe — stan Reacta zdąży się zaktualizować dopiero po renderze,
   * a dwa dotknięcia w tej samej klatce widziałyby tę samą starą wartość.
   */
  const trwaRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const press = useCallback(async () => {
    if (trwaRef.current) return;
    trwaRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setStan({ kind: 'wysyłanie' });

    // `AbortController` zamiast `Promise.race`: przerywa samo żądanie, a nie
    // tylko przestaje na nie czekać — zegarek nie trzyma wtedy otwartego gniazda.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(PRESS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pressed: true, at: Date.now(), device: 'watch' }),
        signal: abort.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStan({
        kind: 'wysłano',
        czas: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
      timerRef.current = setTimeout(() => setStan({ kind: 'spoczynek' }), CONFIRM_MS);
    } catch (err) {
      /*
       * Komunikat mówi, **co zrobić**, a nie jak nazywa się wyjątek.
       * Na ekranie wielkości znaczka „TypeError: Network request failed"
       * nie niesie nic poza niepokojem.
       */
      const przerwane = (err as Error).name === 'AbortError';
      setStan({ kind: 'błąd', powód: przerwane ? 'brak odpowiedzi' : 'brak połączenia' });
      timerRef.current = setTimeout(() => setStan({ kind: 'spoczynek' }), CONFIRM_MS);
    } finally {
      clearTimeout(timeout);
      trwaRef.current = false;
    }
  }, []);

  const wysyłanie = stan.kind === 'wysyłanie';

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <Pressable
        onPress={press}
        disabled={wysyłanie}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          wysyłanie && styles.buttonBusy,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Wyślij sygnał"
      >
        {wysyłanie
          ? <ActivityIndicator color="#fff" size="large" />
          : <Text style={styles.buttonText}>Press</Text>}
      </Pressable>

      {/* Miejsce na komunikat jest **zawsze zajęte**, także w spoczynku.
          Inaczej przycisk podskakiwałby przy każdym naciśnięciu, bo napis
          pojawiałby się i znikał, zmieniając wysokość układu. */}
      <View style={styles.statusBox}>
        {stan.kind === 'wysłano' && <Text style={styles.ok}>wysłano {stan.czas}</Text>}
        {stan.kind === 'błąd' && <Text style={styles.error}>{stan.powód}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * Ekran zegarka jest okrągły, więc treść musi trzymać się środka —
   * to, co wygląda dobrze w narożniku prostokąta, na zegarku jest ucięte.
   */
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  button: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: '#c73652', transform: [{ scale: 0.95 }] },
  buttonBusy: { backgroundColor: '#8d3040' },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  statusBox: { height: 22, marginTop: 10, justifyContent: 'center' },
  ok: { color: '#7ddf90', fontSize: 13 },
  error: { color: '#ff8a8a', fontSize: 13 },
});
