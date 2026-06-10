# syntax=docker/dockerfile:1
FROM node:20-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PNPM_STORE_DIR="/pnpm/store"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# System deps + Docker CLI
RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends python3 python3-pip make g++ ca-certificates curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Python deps
RUN pip3 install --break-system-packages --quiet --no-cache-dir pygbag==0.9.3

WORKDIR /app

# Copy only manifests first — pnpm install layer is cached until lockfile/package.json changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY patches/ patches/
COPY packages/core/package.json packages/core/
COPY packages/core-backend/package.json packages/core-backend/
COPY packages/texteditor/package.json packages/texteditor/
COPY packages/web-client/package.json packages/web-client/
COPY packages/ui-core/package.json packages/ui-core/
COPY packages/core-scene3d/package.json packages/core-scene3d/
COPY packages/core-cad/package.json packages/core-cad/
COPY packages/ui-components-scene3d/package.json packages/ui-components-scene3d/
COPY packages/minislib/package.json packages/minislib/
COPY packages/minisc/package.json packages/minisc/
COPY packages/web-cpp/package.json packages/web-cpp/
COPY app/mycastle-backend/package.json app/mycastle-backend/
COPY app/mycastle-web/package.json app/mycastle-web/
COPY app/cad-backend/package.json app/cad-backend/
COPY app/cad-app/package.json app/cad-app/
COPY app/demo-scene-3d/package.json app/demo-scene-3d/
COPY app/mycastle-mobile/package.json app/mycastle-mobile/
COPY app/mycastle-watch/package.json app/mycastle-watch/
COPY app/testminislib/package.json app/testminislib/
COPY app/trail-map/package.json app/trail-map/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --fetch-timeout 120000

# Now copy source files and build
COPY packages/core/ packages/core/
COPY packages/core-backend/ packages/core-backend/
COPY packages/texteditor/ packages/texteditor/
COPY packages/web-client/ packages/web-client/
COPY packages/web-cpp/ packages/web-cpp/
COPY app/mycastle-backend/ app/mycastle-backend/
COPY app/mycastle-web/ app/mycastle-web/
COPY docs/ docs/
RUN pnpm --filter @mhersztowski/core build --silent
RUN pnpm --filter @mhersztowski/core-backend build --silent
RUN pnpm --filter @mhersztowski/texteditor build --silent
RUN pnpm --filter @mhersztowski/web-client build --silent
RUN pnpm --filter @mhersztowski/web-cpp build --silent
RUN pnpm --filter mycastle-backend build --silent
RUN pnpm --filter mycastle-web build

WORKDIR /app/app/mycastle-backend
ENV NODE_ENV=production
ENV PORT=1894
ENV ROOT_DIR=/data
ENV STATIC_DIR=/app/app/mycastle-web/build
EXPOSE 1894
CMD ["node", "dist/index.js"]
