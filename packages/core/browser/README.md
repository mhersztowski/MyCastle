# @mhersztowski/core — przeglądarkowe klasy węzłów (vanilla JS)

Czysto przeglądarkowe moduły ES (zwykły JavaScript, **bez TypeScriptu i bez builda**),
wzorowane 1:1 na nodach z `packages/core/src/nodes/`:

| Plik             | Klasa        | Odpowiednik TS              |
|------------------|--------------|-----------------------------|
| `NodeBase.js`    | `NodeBase`   | `nodes/NodeBase.ts`         |
| `PersonNode.js`  | `PersonNode` | `nodes/PersonNode.ts`       |
| `ProjectNode.js` | `ProjectNode`| `nodes/ProjectNode.ts`      |
| `TaskNode.js`    | `TaskNode`   | `nodes/TaskNode.ts`         |
| `EventNode.js`   | `EventNode`  | `nodes/EventNode.ts`        |
| `index.js`       | barrel       | —                           |

Te pliki **nie wchodzą** do builda pakietu (`tsup`/`tsc` budują tylko `src/`) ani do
publikacji npm (`files: ["dist"]`). To samodzielne źródła do użycia bezpośrednio w
przeglądarce — np. w blokach Plugin Script, komponentach Lit z `drive/public`, czy
dowolnej stronie ze `<script type="module">`.

## Użycie

```html
<script type="module">
  import { PersonNode, ProjectNode, TaskNode, EventNode }
    from '/sciezka/do/packages/core/browser/index.js';

  const person = PersonNode.fromModel({
    type: 'person', id: 'p1', nick: 'mh', firstName: 'Marcin', secondName: 'H',
  });
  console.log(person.getDisplayName()); // "Marcin H"
  console.log(person.getInitials());    // "MH"

  const project = ProjectNode.fromModel({
    type: 'project', id: 'prj1', name: 'Dom',
    tasks: [
      { type: 'task', id: 't1', name: 'Fundamenty', duration: 40, cost: 1000 },
      { type: 'task', id: 't2', name: 'Dach', duration: 30, cost: 2000,
        components: [{ type: 'task_interval', daysInterval: 7 }] },
    ],
    projects: [
      { type: 'project', id: 'prj2', name: 'Ogród', cost: 500 },
    ],
  });
  console.log(project.getTaskCount());            // 2
  console.log(project.getTotalCost());            // 3500 (z pod-projektem)
  console.log(project.getCostFormatted('PLN', true));
  console.log(project.getAllTasks().map(t => t.name));

  const event = EventNode.fromModel({
    type: 'event', name: 'Spotkanie',
    startTime: '2026-06-12T10:00:00', endTime: '2026-06-12T11:30:00',
  });
  console.log(event.getTimeRange());        // "10:00 - 11:30"
  console.log(event.getDurationFormatted()); // "1h30m"
</script>
```

## Klienty API serwera (`./api/`)

Klasy z `browser/api/` wywołują **realne operacje serwera** na danych PIM użytkownika.
MyCastle nie ma dedykowanych endpointów REST dla PIM — to pliki JSON czytane/zapisywane
przez generyczne **VFS REST API** (`/api/users/{userName}/vfs/...`, auth `Bearer <JWT>`).

| Klasa        | Plik backendu                              | Envelope                                   |
|--------------|--------------------------------------------|--------------------------------------------|
| `ApiPerson`  | `data/persons.json`                        | `{ type:'persons', items: [...] }`         |
| `ApiProject` | `data/projects.json`                       | `{ type:'projects', projects: [...] }`     |
| `ApiTask`    | `data/tasks.json`                          | `{ type:'tasks', tasks: [...] }`           |
| `ApiEvent`   | `data/calendar/{YYYY}/{MM}/{DD}.json`      | `{ type:'events', tasks: [...] }` (per dzień) |

`ApiClient` to wspólny, cienki klient VFS (readFile/writeFile/mkdir/delete + readJson/writeJson,
base64, nagłówek Authorization).

```js
import { ApiClient, ApiPerson, ApiTask, ApiEvent } from '/.../packages/core/browser/index.js';

// baseUrl pusty = ten sam origin (produkcja). Token JWT z logowania.
const client = new ApiClient({ userName: 'marcin', token });
// cross-origin (np. dev): new ApiClient({ baseUrl: 'https://mycastle.hersztowski.org', userName, token })

const persons = new ApiPerson(client);
const task    = new ApiTask(client);
const events  = new ApiEvent(client);

const p = await persons.create({ nick: 'mh', firstName: 'Marcin' }); // -> PersonNode (id = UUID)
await persons.update(p.id, { description: '...' });
const all = await persons.list();          // -> PersonNode[]
await persons.remove(p.id);

const t = await task.create({ name: 'Dach', projectId, duration: 30, cost: 2000 });
const projTasks = await task.listByProject(projectId);

await events.add('2026-06-12', { name: 'Spotkanie', startTime: '2026-06-12T10:00:00', endTime: '2026-06-12T11:30:00' });
const todays = await events.listByDate(new Date()); // -> EventNode[]
```

Wspólny wzorzec metod: `list()`, `get(id)`, `create(model)`, `update(id, patch)`, `remove(id)`,
`save(items)` (nadpisuje całość). Metody odczytu zwracają węzły (Node), zapisu przyjmują modele
lub węzły. `ApiEvent` jest per-dzień: `listByDate(date)`, `add(date, model)`, `remove(date, predicate)`,
`save(date, events)`, `clearDay(date)`.

Pobranie tokenu (logowanie): `POST /api/auth/login` z `{ name, password }` → `{ token }`.

## Różnice względem wersji TypeScript

- **EventNode** używa natywnego `Date` zamiast `dayjs` (zero zależności). Helpery
  dat (`getStartDate`, `getDateFormatted`, `getRelativeTime`…) zwracają natywne `Date`
  / stringi w analogicznych formatach.
- Brak typów — pola modeli są takie same jak w `src/models/` (PersonModel,
  ProjectModel, TaskModel, EventModel), tyle że nieweryfikowane przez kompilator.
- API metod (nazwy, sygnatury, łańcuchowalne settery, `toModel`/`fromModel`/`clone`/
  `matches`) jest zgodne z nodami TS.
