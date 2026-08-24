# Media — backend razem z wbudowanym frontendem.
#
# Jeden obraz i jeden port, bo `media-web` buduje się do `media-backend/public`
# i backend serwuje go jako statyczny frontend (ta sama relacja co
# monaco-web → monaco-backend). Osobny kontener z nginxem dokładałby warstwę
# pośrednika bez powodu — a przy strumieniowaniu odcinków pośrednik jest
# miejscem, w którym trzeba pamiętać o wyłączeniu limitów czasu.
#
# Obraz **buduje się na serwerze**, inaczej niż mycastle-backend. Tam był to
# problem: `vite build` w mycastle-web żąda 8 GB heapu, a maszyna ma 3,4 GB.
# Tutaj cały frontend to ~1200 linii i buduje się w pięć sekund, więc dwustopniowy
# przepływ (zbuduj obraz gdzie indziej → wypchnij → Redeploy) byłby kosztem bez
# korzyści.
#
# Budowanie jest **dwuetapowe**: etap `builder` ma pełne `node_modules` całego
# monorepo (kilkaset megabajtów narzędzi), a obraz końcowy dostaje wyłącznie to,
# co potrzebne do uruchomienia — `pnpm deploy` rozwiązuje zależności workspace
# w samodzielny katalog.

# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PNPM_STORE_DIR="/pnpm/store"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Manifesty przed źródłami — warstwa z `pnpm install` przeżywa wtedy każdą
# zmianę w kodzie, która nie rusza zależności.
#
# `scripts/` musi wejść **przed** instalacją: root `package.json` ma hook
# `postinstall`, który bez tego katalogu przerywa instalację po pobraniu
# wszystkich paczek. To samo wywróciło kiedyś build mycastle-backendu.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY packages/core/package.json packages/core/
COPY packages/core-backend/package.json packages/core-backend/
COPY app/media-backend/package.json app/media-backend/
COPY app/media-web/package.json app/media-web/

# Instalujemy tylko to, czego potrzebują cztery pakiety powyżej. Bez `--filter`
# pnpm ściągałby zależności całego monorepo — łącznie z Monaco, Three.js
# i Playwrightem, których Media nie dotyka.
# Bez `--mount=type=cache` na store pnpm: ta składnia wymaga BuildKit, a
# Dockerfile ma się zbudować także zwykłym `docker build`. Strata jest niewielka —
# warstwa z instalacją i tak siedzi w cache'u Dockera, dopóki manifesty powyżej
# się nie zmienią.
RUN pnpm install --frozen-lockfile \
      --filter media-backend... --filter media-web...

COPY packages/core/ packages/core/
COPY packages/core-backend/ packages/core-backend/
COPY app/media-backend/ app/media-backend/
COPY app/media-web/ app/media-web/

# Kolejność wymuszona przez typy: `tsc` w kolejnym pakiecie rozwiązuje je
# z `dist/` poprzedniego, więc nie da się tego zrównoleglić.
RUN pnpm --filter @mhersztowski/core build --silent
RUN pnpm --filter @mhersztowski/core-backend build --silent
RUN pnpm --filter media-backend build --silent
# Frontend na końcu: ląduje w `app/media-backend/public/`.
RUN pnpm --filter media-web build

# Samodzielny katalog uruchomieniowy: zależności workspace rozwiązane do
# prawdziwych plików, bez dowiązań do reszty monorepo i bez narzędzi budowania.
RUN pnpm deploy --filter media-backend --prod --legacy /runtime

# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime

# `tini` jako PID 1: bez niego Node dostaje sygnały bezpośrednio i nie sprząta
# procesów potomnych, a `docker stop` czeka do końca limitu zamiast zamknąć
# serwer.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /runtime/ ./
# `public/` nie wchodzi do `pnpm deploy` (jest w .gitignore, bo powstaje
# z builda), więc kopiujemy go osobno — bez niego serwer wystawiłby samo API.
COPY --from=builder /app/app/media-backend/public/ ./public/

ENV NODE_ENV=production
ENV MEDIA_BACKEND_PORT=1996
# Ścieżka bezwzględna, więc `path.resolve` w `index.ts` zignoruje katalog
# aplikacji i wskaże wprost wolumen.
ENV MEDIA_DATA_DIR=/data

# Serwer zakłada katalog danych sam, ale deklaracja wolumenu tutaj sprawia, że
# dane przeżyją odtworzenie kontenera nawet bez jawnego montowania w compose.
VOLUME ["/data"]
EXPOSE 1996

# Zdrowie sprawdzamy endpointem, który **czyta stan z dysku** (`/api/queue`),
# a nie samym faktem, że port odpowiada: zepsute uprawnienia do wolumenu
# przy pingu portu wyglądałyby jak działająca aplikacja.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MEDIA_BACKEND_PORT||1996)+'/api/queue').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
