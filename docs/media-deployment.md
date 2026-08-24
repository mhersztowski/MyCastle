# Media na Coolify

Podcasty z notatkami — `app/media-backend` razem z wbudowanym frontendem
`app/media-web`.

## Dlaczego jeden serwis, a nie dwa

`media-web` buduje się do `media-backend/public`, a backend serwuje ten katalog
jako statyczny frontend (`vite.config.ts` → `outDir`). To ta sama relacja co
monaco-web → monaco-backend. Osobny kontener z nginxem dokładałby warstwę
pośrednika bez powodu — a przy strumieniowaniu odcinków (`/api/media`)
pośrednik jest właśnie tym miejscem, w którym trzeba pamiętać o wyłączeniu
limitów czasu, inaczej dłuższy odcinek urywa się w połowie.

## Dlaczego build na serwerze, inaczej niż przy MyCastle

`docker-compose.yml` MyCastle świadomie **nie** buduje na miejscu: maszyna ma
3,4 GB RAM, a `vite build` w mycastle-web żąda 8 GB heapu — build wchodził
w swap, mielił 19 minut i kończył się zabiciem procesu przez OOM, kładąc przy
okazji panel Coolify.

Media nie ma tego problemu: cały frontend to ~1200 linii (React + MUI) i buduje
się w pięć sekund. Dwustopniowy przepływ „zbuduj obraz gdzie indziej → wypchnij
→ Redeploy" byłby tu kosztem bez korzyści. Zmiana w kodzie sprowadza się do
`git push` i „Redeploy".

Gdyby aplikacja urosła na tyle, że build zacznie się dławić, przejście na obraz
z rejestru jest podmianą `build:` na `image:` w `docker-compose.media.yml` plus
skopiowaniem `scripts/deploy-image.sh` z nową nazwą obrazu.

## Konfiguracja w Coolify

1. **New Resource → Docker Compose**, źródło = to repozytorium.
2. **Compose file**: `docker-compose.media.yml`.
3. **Domenę** przypisz serwisowi `media` (port kontenera **1996**).
4. **Environment Variables** — dwie, obie opcjonalne, oznacz jako *secret*:

   | Zmienna | Po co |
   |---|---|
   | `PODCASTINDEX_KEY` | dostęp do katalogu Podcast Index |
   | `PODCASTINDEX_SECRET` | sekret do podpisu żądań |

   **Bez nich aplikacja działa** — wyszukiwanie idzie wtedy przez katalog
   iTunes, który nie wymaga rejestracji. Podcast Index dokłada wyniki spoza
   ekosystemu Apple i pełniejsze opisy kanałów. Klucze: <https://api.podcastindex.org/signup>.

   Sekret nigdy nie opuszcza backendu: podpisem żądania jest SHA-1 ze sklejenia
   klucza, sekretu i czasu uniksowego.

5. Deploy. Pierwszy build trwa kilka minut (instalacja zależności), kolejne są
   szybsze — warstwa z `pnpm install` siedzi w cache'u, dopóki manifesty się nie
   zmienią.

## Dane

Lista odtwarzania (`queue.json`) i notatki (`notes.json`) leżą w nazwanym
wolumenie `media-data` zamontowanym pod `/data`. Nazwany wolumen, a nie
podpięcie katalogu z hosta: dane należą wyłącznie do tej aplikacji i nikt inny
ich nie czyta, więc nie ma powodu wystawiać ich w systemie plików serwera.

Kopia zapasowa:

```bash
docker run --rm -v media-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/media-data-$(date +%F).tar.gz -C /data .
```

## Sprawdzenie po wdrożeniu

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://TWOJA-DOMENA/          # 200, frontend
curl -s https://TWOJA-DOMENA/api/queue                                  # [] albo lista
curl -s 'https://TWOJA-DOMENA/api/podcasts/search?q=radio' | head -c 200 # wyniki z iTunes
```

Healthcheck kontenera odpytuje `/api/queue`, a więc endpoint **czytający stan
z dysku** — nie sam fakt, że port odpowiada. Zepsute uprawnienia do wolumenu
przy pingu portu wyglądałyby jak działająca aplikacja.

## Budowanie i uruchomienie lokalnie

```bash
docker build -f app/media-backend/Dockerfile -t media-backend:local .
docker run --rm -p 1996:1996 -v media-data:/data media-backend:local
```

Sprawdzone: obraz waży **413 MB**, wstaje w kilka sekund, serwuje frontend i API,
a dane przeżywają restart kontenera.

Bez Dockera, w trybie deweloperskim:

```bash
pnpm dev:media-backend   # 1996
pnpm dev:media-web       # 1997, proxy /api → 1996
```

## Uwagi o samym obrazie

- **Dwa etapy budowania.** Etap `builder` ma pełne `node_modules` (narzędzia,
  Vite, TypeScript), a obraz końcowy dostaje wyłącznie to, co potrzebne do
  uruchomienia — `pnpm deploy --prod` rozwiązuje zależności workspace
  w samodzielny katalog, bez dowiązań do reszty monorepo.
- **Instalacja jest zawężona** przez `--filter media-backend... --filter
  media-web...`. Bez tego pnpm ściągałby zależności całego monorepo, łącznie
  z Monaco, Three.js i Playwrightem, których Media nie dotyka.
- **`scripts/` kopiujemy przed instalacją.** Root `package.json` ma hook
  `postinstall`; bez tego katalogu instalacja przerywa się po pobraniu paczek.
  Ta sama pułapka wywróciła kiedyś build mycastle-backendu.
- **Bez `--mount=type=cache`** — ta składnia wymaga BuildKit, a Dockerfile ma
  działać także pod zwykłym `docker build`. Warstwa z instalacją i tak siedzi
  w cache'u Dockera.
- **`tini` jako PID 1** — bez niego Node dostaje sygnały bezpośrednio i nie
  sprząta procesów potomnych, a `docker stop` czeka do końca limitu zamiast
  zamknąć serwer.
