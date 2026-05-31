# syntax=docker/dockerfile:1
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PNPM_STORE_DIR="/pnpm/store"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# ── install deps (cached until lockfile changes) ──────────────────────────────
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json             packages/core/
COPY packages/core-cad/package.json         packages/core-cad/
COPY packages/core-scene3d/package.json     packages/core-scene3d/
COPY packages/ui-core/package.json          packages/ui-core/
COPY packages/ui-components-scene3d/package.json packages/ui-components-scene3d/
COPY packages/texteditor/package.json       packages/texteditor/
COPY packages/web-client/package.json       packages/web-client/
COPY app/cad-app/package.json               app/cad-app/
COPY app/cad-backend/package.json           app/cad-backend/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --fetch-timeout 120000

# ── build all packages + apps ─────────────────────────────────────────────────
COPY packages/core/             packages/core/
COPY packages/core-cad/         packages/core-cad/
COPY packages/core-scene3d/     packages/core-scene3d/
COPY packages/ui-core/          packages/ui-core/
COPY packages/ui-components-scene3d/ packages/ui-components-scene3d/
COPY packages/texteditor/       packages/texteditor/
COPY packages/web-client/       packages/web-client/
COPY app/cad-app/               app/cad-app/
COPY app/cad-backend/           app/cad-backend/

RUN pnpm --filter @mhersztowski/core build --silent
RUN pnpm --filter @mhersztowski/core-cad build --silent
RUN pnpm --filter @mhersztowski/ui-core build --silent
RUN pnpm --filter @mhersztowski/core-scene3d build --silent
RUN pnpm --filter @mhersztowski/ui-components-scene3d build --silent
RUN pnpm --filter @mhersztowski/texteditor build --silent
RUN pnpm --filter @mhersztowski/web-client build --silent
# Build frontend → outputs to app/cad-backend/public/
RUN pnpm --filter cad-app build
RUN pnpm --filter cad-backend build --silent

# ── production image ──────────────────────────────────────────────────────────
FROM node:20-slim AS runner
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json             packages/core/
COPY packages/core-cad/package.json         packages/core-cad/
COPY packages/core-scene3d/package.json     packages/core-scene3d/
COPY packages/ui-core/package.json          packages/ui-core/
COPY packages/ui-components-scene3d/package.json packages/ui-components-scene3d/
COPY packages/texteditor/package.json       packages/texteditor/
COPY packages/web-client/package.json       packages/web-client/
COPY app/cad-app/package.json               app/cad-app/
COPY app/cad-backend/package.json           app/cad-backend/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

COPY --from=base /app/packages/core/dist/       packages/core/dist/
COPY --from=base /app/app/cad-backend/dist/     app/cad-backend/dist/
COPY --from=base /app/app/cad-backend/public/   app/cad-backend/public/

WORKDIR /app/app/cad-backend
ENV NODE_ENV=production
ENV CAD_BACKEND_PORT=1892
ENV CAD_DATA_DIR=/data
EXPOSE 1892
CMD ["node", "dist/index.js"]
