# @mhersztowski/hydra-studio

Środowisko projektowe frameworka [Hydra](https://github.com/platform-minis/MinisProjects)
— wtyczka edytora, która otwiera pliki `.hydra` w interfejsie zamiast
w zwykłym edytorze tekstu, oraz model tych plików wraz z generatorami plików
budowania.

Plik pozostaje tekstem: da się go poprawić ręcznie, obejrzeć w recenzji zmian
i scalić. Formularz i zakładka tekstowa patrzą na ten sam model Monaco, więc
zmiana z jednej strony jest natychmiast widoczna z drugiej.

## Podpięcie

```tsx
import { createHydraStudioPlugin } from '@mhersztowski/hydra-studio';
import * as monaco from 'monaco-editor';

const hydraPlugin = useMemo(() => createHydraStudioPlugin({
  models: {
    getModel: (uri) => monaco.editor.getModels()
      .find((m) => m.uri.toString() === uri || m.uri.path === uri),
  },
}), []);

<TextEditorWorkspace extraPlugins={[hydraPlugin]} … />
```

Wtyczka rejestruje polecenia w palecie (kategoria „Hydra"), przyciski na pasku
narzędzi, pozycję na pasku stanu i panel boczny z biblioteką komponentów.
Edytor nie ma punktu rozszerzenia dla paska menu, więc pozycje z projektu
interfejsu („Projekt / Buduj", „Widok / Schemat") trafiają do palety pod tymi
samymi nazwami.

## Wejścia pakietu

| Wejście | Zawartość | Wymaga |
|---|---|---|
| `.` | wtyczka edytora + cały model | React, MUI, Monaco |
| `./model` | model pliku `.hydra`, walidacja, generatory, symulacja | nic |
| `./panels` | panele interfejsu do osadzenia we własnym układzie | React, MUI |
| `hydra` (bin) | wiersz poleceń: sprawdzanie, generowanie, budowanie | Node |

Panele są ładowane leniwie, więc samo wczytanie wtyczki nie ciągnie Material UI
— edytor nie płaci za interfejs Studia, dopóki nikt nie otworzy pliku `.hydra`.

`./model` nie dotyka Reacta ani systemu plików: ten sam kod działa
w przeglądarce i w skryptach budowania.

## Co robi wtyczka

**Formularz wyprowadzany ze schematu.** Inspektor nie ma własnej listy pól —
powstaje z tego samego opisu, z którego działa walidacja. Nowe ustawienie
w formacie pojawia się w interfejsie samo, wraz z opisem, listą dozwolonych
wartości i zakresem.

**Zapis nie przepisuje pliku.** Zmiana wartości idzie do Monaco jako przedział
tekstu: zmienia się jeden wiersz, komentarze i wyrównanie zostają, cofanie
działa krok po kroku. Gdy treść w edytorze zmieniła się w międzyczasie, zapis
jest odrzucany — przedziały wskazywałyby wtedy nie to miejsce.

**Walidacja dwuprzebiegowa.** Poza zgodnością ze schematem sprawdzane są
zależności między polami: cel domyślny wskazujący nieistniejące środowisko,
moduł sieciowy na płytce bez radia, dwa układy pod jednym adresem I²C, hasło
wpisane wprost do pliku, który trafia do repozytorium.

**Biblioteka komponentów.** Paczki pogrupowane po tym, czym są dla frameworka.
Komponent niepasujący do wybranego celu zostaje na liście, wyszarzony,
z powodem — ukrycie zostawiałoby użytkownika z pytaniem, czemu nie widzi
czujnika, który na pewno istnieje.

**Schemat połączeń.** Płótno na `@xyflow/react`, reguły elektryczne i
generowanie `boards/*.hpp` z połączeń: sieć `I2C0_SDA` dotyka pinu `IO8`, więc
w nagłówku jest 8.

**Panel dolny.** Kompilacja, monitor portu, magistrala zdarzeń, problemy,
symulacja i farma testowa.

## Rozwój

```bash
pnpm --filter @mhersztowski/hydra-studio run build
pnpm --filter @mhersztowski/hydra-studio run test
pnpm --filter @mhersztowski/hydra-studio run schema   # odświeża schema/*.json
```

Pliki w `schema/` są wynikiem generowania z `src/model/hydraSchema.ts` i służą
edytorom zewnętrznym do podpowiadania nazw pól. Test pilnuje, żeby nie zdążyły
się zestarzeć.
