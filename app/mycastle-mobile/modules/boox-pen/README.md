# boox-pen — rysowanie bez opóźnień na czytnikach Onyx Boox

## Problem

Kreska rysowana w kanwie HTML pojawia się na ekranie E Ink po 150–300 ms. Nie
jest to wina kodu strony — droga jest po prostu długa:

```
pióro → zdarzenie wskaźnika → obsługa w JS → canvas 2d → złożenie w WebView
      → SurfaceFlinger → żądanie odświeżenia panelu → fala GC16/GU16
```

Dwa człony da się skrócić, trzeciego nie: panel dostaje na końcu **zwykłą falę
odświeżania**, bo system nie ma powodu sądzić, że to pisanie, a nie przewijanie
strony. Systemowa aplikacja notatek Onyksa nie ma tego problemu, bo w ogóle nie
przechodzi tą drogą.

## Rozwiązanie

`TouchHelper` z pakietu `com.onyx.android.sdk:onyxsdk-pen` przełącza sterownik
w **tryb surowy**: pociągnięcie jest malowane wprost na panelu, z pominięciem
całego potoku Androida. Opóźnienie spada do rzędu 30 ms.

Cena jest konkretna i trzeba ją znać: **dopóki tryb jest włączony, pióro nie
dociera do WebView**. Strona nie zobaczy ani jednego `pointerdown` ze stylusa.
Dlatego przepływ wygląda tak:

```
strona: „obszar kanwy to ten prostokąt, włącz tryb surowy"
                          ↓
sterownik maluje kreskę na panelu (natychmiast)
                          ↓
po oderwaniu pióra: lista punktów → powłoka RN → strona
                          ↓
strona dopisuje pociągnięcie do modelu i rysuje je po swojemu
                          ↓
odświeżenie panelu po 500 ms — surowy ślad ustępuje kresce strony
```

Rysunek jest więc widoczny od razu, a dokument dostaje ten sam ślad chwilę
później.

## Podział pracy

| gdzie | co robi | testy |
|---|---|---|
| `app/cad-app/src/native/booxPen.ts` | układy współrzędnych, skala nacisku, kształt komunikatów | 18 |
| `app/cad-app/src/native/useBooxPen.ts` | cykl życia: kiedy przejąć i oddać pióro | 11 |
| `app/mycastle-mobile/App.tsx` | przekazanie komunikatów w obie strony — **bez interpretacji** | — |
| `modules/boox-pen/android/…/PenController.kt` | `TouchHelper` i jedno przeliczenie: położenie WebView na ekranie | — |

Arytmetyka siedzi po stronie JavaScriptu **celowo**: tam da się ją sprawdzić
testem, a moduł natywny sprawdza tylko urządzenie z piórem. Kotlin dostaje
gotowy prostokąt w pikselach urządzenia względem lewego górnego rogu WebView
i oddaje punkty w tym samym układzie.

## Kontrakt

Powłoka wstrzykuje `window.__booxPen` **przed** uruchomieniem strony:

```ts
{
  available: boolean,          // czy to czytnik Onyksa z działającym sterownikiem
  info: string,                // nazwa urządzenia albo powód niedostępności
  onStroke: ((s) => void) | null,
  send(message): void,
}
```

Strona → powłoka (`postMessage`):

| komunikat | znaczenie |
|---|---|
| `{type:'boox:area', left, top, width, height, strokeWidth, color}` | obszar w pikselach urządzenia, względem WebView |
| `{type:'boox:enabled', enabled}` | przejmij / oddaj pióro |
| `{type:'boox:release'}` | zwolnij sterownik całkowicie |

Powłoka → strona (wstrzyknięcie): `window.__booxPen.onStroke({erase, points:[{x,y,pressure,ts}]})`.

## Wykrywanie urządzenia

`PenSupport` sprawdza producenta **oraz** obecność systemowej aplikacji notatek
Onyksa. Żadne z tych kryteriów samo nie wystarcza: producent bywa zapisany na
kilka sposobów, a sama nazwa nie gwarantuje, że firmware zna tę wersję pakietu.

Wykrycie jest więc świadomie hojne, a ostatecznym sędzią jest próba: gdy
`TouchHelper.create` rzuci wyjątkiem, powłoka wstrzykuje stronie
`window.__booxPen.available = false` z powodem, a kanwa wraca do zwykłej obsługi
zdarzeń wskaźnika. Na urządzeniu innym niż Onyx nie dzieje się nic — mostek
ogłasza się jako niedostępny i cała ta warstwa jest martwa.

## Znane koszty i pokrętła

- **Waga APK.** `onyxsdk-pen` ciągnie za sobą `onyxsdk-base`, a ten retrofit,
  okhttp, rxjava, mmkv, joda-time i kilkanaście innych bibliotek. To jest cena
  za jedyne wydanie SDK, jakie Onyx publikuje. Gdyby waga zaczęła przeszkadzać,
  wykluczenia dopisuje się w `android/build.gradle` — ale ostrożnie: brakująca
  klasa objawi się dopiero na urządzeniu, w środku pociągnięcia.
- **Wersja SDK** siedzi w jednym miejscu (`ext.onyxPenVersion`). Gdyby firmware
  czytnika nie znał najnowszego wydania, `1.4.10.2` jest sprawdzonym wariantem
  o lżejszym drzewie zależności.
- **`PEN_UP_REFRESH_MS`** (`PenController`) — zwłoka odświeżenia po oderwaniu
  pióra. Za krótka: kreska na moment znika, bo panel pokazuje kanwę, zanim
  strona zdąży na niej narysować. Za długa: surowy ślad i kreska strony
  współistnieją zauważalnie długo.
- **Układ współrzędnych.** Gdyby pociągnięcia lądowały konsekwentnie obok kanwy
  — przesunięte mniej więcej o wysokość paska stanu — znaczy to, że SDK zwraca
  punkty w układzie widoku, a nie ekranu. Strona wykrywa to sama i pisze
  w konsoli `[booxPen] pociągnięcia trafiają poza zadeklarowany obszar`;
  poprawką jest zdjęcie odejmowania `origin` w `PenController.emit`.

## Gdzie to działa

W trybie **Notes** aplikacji `cad-app` (`SpenNotesView`) — tej, którą wgrywa
`build-cad.sh` jako `MyCastleCAD`. Pióro przejmuje sterownik tylko przy
narzędziach **Pióro** i **Marker**; przy zaznaczaniu, kształtach, przesuwaniu
widoku i przy wysuniętym podmenu wraca do WebView, bo inaczej kreśliłoby
zamiast wykonywać narzędzie.

Powłoka `mycastle-mobile` jest jedna dla wszystkich wariantów (`build.sh`,
`build-cad.sh`, `build-media.sh`), więc most jest w każdym z nich. Stroną
webową, która z niego korzysta, jest na razie tylko `cad-app`; dołożenie
kolejnej kanwy to jedno wywołanie `useBooxPen` — koszt jest taki, że moduł
trzeba wtedy przenieść do wspólnej paczki (`packages/ui-core`) i dopisać
zależność w trzech miejscach łańcucha budowania.
