# Przykłady — operacje na API serwera (`browser/api`)

Gotowe przykłady CRUD dla osób, projektów, zadań i wydarzeń, używające klientów z
`packages/core/browser/api/` (czysty przeglądarkowy JS, VFS REST).

## Pliki

| Plik                          | Co pokazuje                                         |
|-------------------------------|-----------------------------------------------------|
| `persons.example.js`          | `ApiPerson`: create / list / get / update / matches / remove |
| `projects-tasks.example.js`   | `ApiProject` + `ApiTask`: projekt z zadaniami, `listByProject`, formatowanie |
| `events.example.js`           | `ApiEvent`: dodawanie/lista/usuwanie wydarzeń per dzień, `clearDay` |
| `full-flow.example.js`        | pełny przepływ: projekt → zadanie → wydarzenie powiązane z zadaniem |
| `index.html`                  | interaktywna strona — uruchamia przykłady na **prawdziwym** serwerze |
| `run-node.mjs`                | uruchomienie w Node z atrapą `fetch` (offline, bez serwera) |
| `scene3d.example.js`          | **scene3d**: parametry, obliczenia (objętość/pole/AABB) i siatka — bez serwera/tokenu |
| `scene3d.html`                | **scene3d**: wizualne demo — własny mini-renderer na canvas 2D (bez bibliotek) |

Każdy plik `*.example.js` eksportuje funkcję `run...Example(client, log?)`:
- `client` — instancja `ApiClient`,
- `log` — opcjonalny logger (domyślnie `console.log`).

## Uruchomienie w przeglądarce (prawdziwy serwer)

1. Zaloguj się w MyCastle (token JWT trafia do `localStorage["minis_current_user"]`).
2. Otwórz `index.html` (serwowany z tego samego origin co backend, albo podaj `baseUrl`).
3. Wpisz/sprawdź `userName` + `token`, kliknij przykład.

> Przykłady tworzą i **usuwają** rekordy testowe na koncie użytkownika — sprzątają po sobie,
> ale uruchamiaj świadomie na właściwym koncie.

Możesz też wkleić wywołanie do bloku **Plugin Script** w edytorze Markdown:

```js
const { ApiClient, ApiPerson } = await import('/.../packages/core/browser/index.js');
const client = new ApiClient({ userName: auth.user.name, token: auth.token });
const persons = await new ApiPerson(client).list();
return md`Osób: **${persons.length}**`;
```

## Uruchomienie w Node (offline, bez serwera)

```bash
node packages/core/browser/example/run-node.mjs
```

Używa in-memory atrapy `fetch`, więc weryfikuje logikę przykładów i API bez backendu.
Na końcu uruchamia też `scene3d.example.js` (czysta geometria — bez `fetch`).

## scene3d (geometria, bez serwera)

`scene3d.example.js` i `scene3d.html` nie wymagają backendu ani tokenu — to czysta
matematyka z `../scene3d/`:

```js
import { BoxGeometry, Geometry } from '../scene3d/index.js';
BoxGeometry.volume({ width: 2, height: 1, depth: 3 });       // 6
const mesh = Geometry.build('sphere', { radius: 2 });        // { positions, normals, uvs, indices }
```

Wizualne demo: otwórz `scene3d.html` (serwowane statycznie, np. `python3 -m http.server`
w `packages/core/browser/`, potem `/example/scene3d.html`). Wybierasz bryłę, przeciągasz
myszą, by obracać; panel pokazuje objętość/pole/liczbę wierzchołków i trójkątów.

## Jak zdobyć token

```js
const r = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'marcin', password: '...' }),
});
const { token } = await r.json();
```
