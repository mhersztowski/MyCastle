# Wtyczki edytora — przewodnik terenowy

Rzeczy, których nie widać w typach, a które decydują o tym, czy wtyczka działa.
Każdy punkt pochodzi z usterki, która realnie kosztowała czas — kolejność mniej
więcej według tego, jak łatwo się na nią nadziać.

Nie jest to opis API. Typy są w `src/monaco/plugins/types.ts` i są czytelne.
Tu jest to, co typy przepuszczają.

---

## 1. Polecenia mają prefiks z **dwukropkiem**

Host rejestruje polecenia wtyczek jako `pluginId:commandId`:

```ts
// PluginAPI.ts
const pluginPrefix = `${pluginId}:`;
globalCommandRegistry.register(`${pluginPrefix}${id}`, handler);
```

Wpis paska narzędzi i palety musi wskazywać **pełny** identyfikator:

```ts
const command = (id: string) => `${api.pluginId}:${id}`;   // dwukropek!
```

**Dlaczego to boli:** `globalCommandRegistry.execute()` na nieznanym poleceniu
niczego nie zgłasza. Przycisk istnieje, daje się kliknąć, ma podpowiedź — i nie
robi nic. Bez błędu w konsoli, bez śladu. Kropka zamiast dwukropka wygląda
niewinnie i kosztowała kilka rund debugowania.

**Jak sprawdzić:** test wiążący każdy wpis paska z zarejestrowanym poleceniem
(patrz §9).

---

## 2. Eksplorator porównuje **ścieżki VFS**, nie identyfikatory zakładek

`VfsExplorer` dostaje `selectedPath` i szuka węzła o takim identyfikatorze.
Węzły drzewa nazywają się zwykłymi ścieżkami (`/user/drive/…`).

Zakładki wtyczek mają własny schemat (`hydra-studio:///user/drive/…`), żeby nie
kolidować z zakładką tekstową tego samego pliku. Bez odcięcia schematu aktywny
widok wtyczki nie zaznacza niczego:

```ts
function vfsPathOfTab(tab: string | null | undefined): string | undefined {
  if (!tab) return undefined;
  const match = /^[a-z][a-z0-9+.-]*:\/\/(\/.*)$/i.exec(tab);
  return match ? match[1] : tab;
}
```

Wygląda to jak „eksplorator nie nadąża", a jest niedopasowaniem kluczy.

---

## 3. Drzewo eksploratora ładuje gałęzie **leniwie**

`tree.setExpandedItems([...])` oznacza katalogi jako rozwinięte, ale **nie
pobiera ich zawartości**. Jeśli węzeł nie był wcześniej wczytany, nie powstanie
— nie ma czego zaznaczyć ani przewinąć.

Poprawna kolejność, od najpłytszego katalogu (dziecko nie istnieje, dopóki
rodzic nie jest wczytany):

```ts
for (const dir of ancestors) {
  await tree.handleItemExpansionToggle(null, dir, true);   // to faktycznie ładuje
}
tree.setExpandedItems(prev => [...new Set([...prev, ...ancestors])]);
setSelectedItems([path]);
requestAnimationFrame(scrollWithRetry);   // węzeł pojawia się dopiero po renderze
```

Przewijanie wymaga kilku prób przez `requestAnimationFrame` — element w DOM
istnieje później niż stan Reacta. `scrollIntoView({ block: 'nearest' })`, żeby
pozycja już widoczna nie skakała przy każdym przełączeniu zakładki.

---

## 4. Otwarcie zakładki przegrywa wyścig o fokus

`api.openEditorTab()` emituje `system:editor:openVirtualTab` na `globalEventBus`.
Obsługa w `MonacoMultiEditor` tworzy zakładkę i ustawia ją aktywną.

Problem: podwójne kliknięcie w Drive obsługuje funkcja **asynchroniczna**.
Wczytuje plik, budzi wtyczki (i wtedy wtyczka otwiera swoją zakładkę), a po
powrocie z `await` ustawia aktywną zakładkę na plik tekstowy. Zakładka wtyczki
powstaje i natychmiast traci fokus — użytkownik widzi goły tekst.

Lekarstwo: odroczyć o jedno przejście pętli zdarzeń.

```ts
pendingTabTimer = setTimeout(() => api.openEditorTab({ … }), 0);
// i skasować w deactivate()
```

`toSide: true` tworzy **nową grupę** zakładek. Dla innego widoku tego samego
dokumentu właściwe jest `toSide: false` — panel obok jest do porównywania.

Zakładki wirtualne **nie tworzą modeli Monaco**, więc `total models=1` przy
otwartej zakładce wtyczki jest normalne i niczego nie dowodzi.

---

## 5. Motyw MUI jest jasny, chrom edytora ciemny

Chrom edytora ma kolory wpisane na stałe (`#1e1e1e`, `#ccc`, `#3c3c3c`).
Komponenty MUI dostają domyślny motyw **jasny** i rysują niemal czarny tekst.
Efekt: ciemne na ciemnym, panel nieczytelny.

Zawartość zakładki trzeba owinąć własnym motywem dobranym pod paletę edytora,
a nie liczyć na to, że coś się odziedziczy:

```tsx
const studioTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { paper: '#1e1e1e', default: '#1e1e1e' },
    text: { primary: '#cccccc', secondary: '#9d9d9d' },
    divider: '#3c3c3c',
  },
});
```

---

## 6. MUI 6 nie ma podścieżek w `exports`

`import Box from '@mui/material/Box'` działa w bundlerze, ale **Node go nie
rozwiąże** — psuje to testy i każde ładowanie poza Vite. Panele trzeba wczytywać
przez `React.lazy`, a re-eksporty muszą zostać leniwe: jedno gorliwe
`export * from './panels'` niweczy całą konstrukcję.

Wersje mają znaczenie: aplikacja jeździ na React 18.2 / MUI 6.5. Sprawdzanie
typów wobec React 19 / MUI 7 daje fałszywy spokój.

---

## 7. Czego host **nie** ma

- **Panelu dolnego** — nie ma punktu rozszerzenia. Wynik kompilacji, monitor
  portu i podobne muszą mieszkać w zakładce wtyczki albo trzeba dopisać slot
  w `MonacoMultiEditor`.
- **Paska menu dla wtyczek** — pozycje menu idą do palety poleceń; kategoria
  pełni rolę nazwy menu.

Punkty, które są: `toolbar`, `statusbar`, `contextmenu`, `commandpalette`,
`sidebar` — i muszą być wypisane w `contributes` manifestu.

---

## 7a. `when` nie jest sprawdzane

Pole `when` jest w typach każdej kontrybucji i **nikt go nie czyta**. Pozycje
menu kontekstowego host rejestruje jako akcje Monaco bezwarunkowo:

```ts
editor.getMonacoEditor().addAction({ id: `plugin.cm.${item.id}`, label: item.label, run: … });
```

**Dlaczego to boli:** wtyczka dla plików `.cpp` pokazuje swoją pozycję także nad
`README.md`. Jeśli uchwyt polecenia sprawdza typ pliku i po cichu wychodzi,
użytkownik widzi menu, klika i nie dzieje się nic — a pozycja wygląda na
zepsutą, nie na niedotyczącą tego pliku.

**Lekarstwo:** odmowa musi **nazywać powód** (patrz §10) i wymieniać, co jest
obsługiwane. Warunek trzyma się w uchwycie polecenia, nie w `when`.

---

## 8. Pasek narzędzi: drobiazgi

- `icon` to **napis**: SVG (`<svg…`), znak Unicode albo zwykły tekst.
  Nazwy codicon renderują się jako tekst, czyli brzydko.
- `group` służy do wstawiania separatorów; grupa `markdown` jest traktowana
  osobno i rysowana w innym miejscu.
- `order` sortuje w obrębie grupy.

---

## 9. Atrapa hosta musi być **wierna, nie uprzejma**

Najdroższa lekcja tej sesji, w dwóch odsłonach: zaślepki Arduino i podwójny host
wtyczki. Obie przepuszczały kod, którego prawdziwy odpowiednik nie przyjmował.

> Podwójny host, który wybacza więcej niż prawdziwy, daje zielone testy
> i zepsuty program.

Konkretnie: atrapa `commands.register` zapisywała identyfikator bez zmian,
więc rozjazd z §1 przechodził 230 testów i nie działał w aplikacji.

Minimum, które warto mieć:

```ts
// prefiksowanie jak u hosta
register(id, handler) { commands.set(`${pluginId}:${id}`, handler); }

// i test wiążący wpisy paska z faktycznie zarejestrowanymi poleceniami
for (const item of toolbarItems) {
  expectOk(commands.has(item.command), `${item.id} → ${item.command}`);
}
```

---

## 10. Diagnostyka, gdy nie widać aplikacji

Wtyczka działa w przeglądarce, do której nie zawsze jest dostęp. Ślad włączany
z konsoli kosztuje niewiele, a skraca pętlę z dziesięciu wiadomości do jednej:

```ts
function debug(...args: unknown[]): void {
  try {
    if (globalThis.localStorage?.getItem('HYDRA_DEBUG') === '1') {
      console.log('[hydra]', ...args);
    }
  } catch { /* brak localStorage */ }
}
```

Warto oznaczyć punkty, które **rozdzielają hipotezy**, a nie te, które
potwierdzają to, co i tak wiadomo: wejście zdarzenia, koniec rejestracji,
wejście uchwytu polecenia, skutek w interfejsie. Brak konkretnego wiersza mówi
wtedy tyle samo co jego treść.

Cichy `return` na wejściu akcji (`if (!activeFile) return`) zamienić na
ostrzeżenie — inaczej wygląda jak zepsuty przycisk.

Wywołanie opcjonalne (`options.runBuild?.()`) na nieprzekazanej zależności też
nie robi nic po cichu. Jeśli czegoś brakuje, trzeba to **napisać w interfejsie**,
a nie zostawiać pustego panelu.

---

## Jak to utrzymywać

Dopisywać tu **tylko** rzeczy, które kosztowały czas i których nie widać
w typach — jedna sekcja na pułapkę, zawsze z odpowiedzią „dlaczego to boli",
bo sama reguła bez powodu zostaje zignorowana przy pierwszym pośpiechu.

Gdy pułapka da się zamknąć testem albo typem, właściwym ruchem jest zamknąć ją
tam i **skrócić** ten dokument. Przewodnik, który tylko rośnie, przestaje być
czytany.
