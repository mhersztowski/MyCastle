# Kasia — API dla skryptów

Asystentka Kasia mieszka w `media-backend`. Ta biblioteka pozwala sięgnąć do
niej ze **skryptów Drive** i **automatyzacji edytora Markdown**, nie wiedząc,
gdzie stoi ani czy w ogóle działa.

```ts
import { Kasia } from 'mycastle/packages/core/browser/kasia/kasia';

await Kasia.dodajDoPromptu({
  id: 'paczka',
  kind: 'update',
  tekst: 'Marcin ma dziś odebrać paczkę do 18:00 — przypomnij o tym.',
  wygasaZa: 600,          // minut; bez tego zostaje na stałe
});
```

W skryptach Drive transport podłącza runner — nic nie trzeba ustawiać.

## Dwa rodzaje promptu

To najważniejszy wybór przy dokładaniu treści, bo pomyłka nie psuje działania,
tylko daje dziwne zachowanie.

| `kind` | Znaczy | Kiedy Kasia to widzi | Przykład |
|---|---|---|---|
| `init` | **kim Kasia jest** — wiedza stała | w każdej rozmowie | „kot ma na imię Filemon", „w czwartki pracuję zdalnie" |
| `update` | **o czym ma teraz pomyśleć** | tylko przy samodzielnym namyśle | „sprawdź, czy paczka odebrana" |

Wiedza wrzucona do `update` jest niewidoczna w zwykłej rozmowie. Polecenie
jednorazowe wrzucone do `init` zostaje na zawsze — dlatego przy `update`
zwykle warto podać `wygasaZa`.

**`id` nadpisuje.** Ten sam identyfikator zastępuje poprzednią treść zamiast
dokładać kolejną — bez tego skrypt uruchamiany co godzinę zostawiłby po sobie
dwadzieścia kopii tego samego zdania. Identyfikator jest lokalny dla źródła,
więc dwa skrypty mogą używać tej samej nazwy bez kolizji.

## Co jeszcze potrafi

```ts
await Kasia.usunZPromptu('paczka');

// Wypowiedź do użytkownika. Podlega dostępności — patrz niżej.
const { wyslano, powod } = await Kasia.powiedz('Paczka czeka w paczkomacie.');

// Pytanie z odpowiedzią modelu.
const odp = await Kasia.zapytaj('Co mam dziś do zrobienia?');

// Dostępność, spotkania, dołożone fragmenty, liczba wiadomości.
const stan = await Kasia.stan();

// Skrót — sprawdź przed wysłaniem powiadomienia.
if (await Kasia.czyMoznaZaczepic()) { /* … */ }

// Pomiar wagi trafia do `data/waga.json` w MyCastle.
await Kasia.zapiszWage(84.2);
```

## Czego skrypt zrobić nie może

Dwa ograniczenia są celowe.

**`powiedz` podlega dostępności.** Gdy użytkownik ma „nie przeszkadzać" albo
„śpię", wypowiedź nie zostanie wysłana:

```ts
await Kasia.powiedz('POBUDKA!');
// → { wyslano: false, powod: 'Marcin śpi (do odwołania).' }
```

Gdyby skrypt mógł to obejść, przycisk wyciszenia przestałby cokolwiek znaczyć —
wystarczyłby jeden skrypt. `zapytaj` działa mimo wyciszenia, bo pytanie zadane
przez użytkownika to nie zaczepianie.

**`stan` nie oddaje rozmowy ani promptów.** Zwraca dostępność, godziny spotkań,
listę własnych fragmentów i liczbę wiadomości. Skrypt ma móc sprawdzić, czy
wolno zaczepiać — treść korespondencji z asystentką to co innego.

## Jak to działa pod spodem

Skrypt wykonuje się w przeglądarce otwartej na MyCastle, a Kasia siedzi
w osobnym backendzie. Rozmawiają przez brokera MQTT:

```
skrypt  ──► minis/{user}/kasia/inbox   { id, type, payload }
        ◄── minis/{user}/kasia/outbox  { requestId, ok, data | error }
```

Bezpośrednie wywołanie znaczyłoby wystawienie API Kasi na świat. Broker już
jest, każdy skrypt Drive ma do niego dostęp i tędy idą wszystkie inne polecenia
w tym systemie. Skutek uboczny jest korzystny: skrypt nie zna adresu backendu,
a gdy Kasia nie działa, dostaje czytelne „nie odpowiedziała w 20 s" zamiast
błędu sieci.

Tematy są w rejestrze Zod (`packages/core/src/mqtt/topics.ts` — `kasiaInbox`,
`kasiaOutbox`), więc widać je w MqttExplorerze.

## Poza Drive

Gdy używasz biblioteki w innym miejscu, podłącz transport sam:

```ts
Kasia.setTransport({
  userName: 'marcin',
  publish: (topic, payload) => klient.publish(topic, JSON.stringify(payload)),
  subscribe: (topic, cb) => { /* … */ return () => { /* odsubskrybuj */ }; },
}, 'nazwa-skryptu');
```

Trzeci argument to źródło fragmentów — widać je w panelu Kasi obok
dołożonej treści, więc warto, żeby mówiło, skąd wpis pochodzi.
