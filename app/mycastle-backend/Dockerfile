FROM node:20-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apt-get update && apt-get install -y python3 make g++ ca-certificates curl --no-install-recommends \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only manifests first — pnpm install layer is cached until lockfile/package.json changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/core-backend/package.json packages/core-backend/
COPY packages/web-client/package.json packages/web-client/
COPY packages/core-scene3d/package.json packages/core-scene3d/
COPY packages/ui-core/package.json packages/ui-core/
COPY packages/ui-components-scene3d/package.json packages/ui-components-scene3d/
COPY app/mycastle-backend/package.json app/mycastle-backend/
COPY app/mycastle-web/package.json app/mycastle-web/
COPY app/mycastle-mobile/package.json app/mycastle-mobile/
COPY app/mycastle-watch/package.json app/mycastle-watch/
COPY app/demo-scene-3d/package.json app/demo-scene-3d/
RUN pnpm install --frozen-lockfile

# Now copy source files and build
COPY packages/core/ packages/core/
COPY packages/core-backend/ packages/core-backend/
COPY packages/web-client/ packages/web-client/
COPY app/mycastle-backend/ app/mycastle-backend/
COPY app/mycastle-web/ app/mycastle-web/
RUN pnpm --filter @mhersztowski/core build
RUN pnpm --filter @mhersztowski/core-backend build
RUN pnpm --filter @mhersztowski/web-client build
RUN pnpm --filter mycastle-backend build
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter mycastle-web build

WORKDIR /app/app/mycastle-backend
ENV NODE_ENV=production
ENV PORT=1894
ENV ROOT_DIR=/data
ENV STATIC_DIR=/app/app/mycastle-web/build
EXPOSE 1894
CMD ["node", "dist/index.js"]
