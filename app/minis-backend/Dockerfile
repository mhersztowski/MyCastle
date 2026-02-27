FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS build
WORKDIR /app
# Native modules (better-sqlite3, node-pty) need build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/core-backend/ packages/core-backend/
COPY packages/web-client/ packages/web-client/
COPY app/minis-backend/ app/minis-backend/
COPY app/minis-web/ app/minis-web/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mhersztowski/core build
RUN pnpm --filter @mhersztowski/core-backend build
RUN pnpm --filter @mhersztowski/web-client build
RUN pnpm --filter minis-backend build
RUN pnpm --filter minis-web build

FROM base AS production
WORKDIR /app
COPY --from=build /app/app/minis-backend/dist ./dist
COPY --from=build /app/app/minis-backend/package.json ./
COPY --from=build /app/app/minis-web/build ./static
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/dist ./node_modules/@mhersztowski/core/dist
COPY --from=build /app/packages/core/package.json ./node_modules/@mhersztowski/core/
COPY --from=build /app/packages/core-backend/dist ./node_modules/@mhersztowski/core-backend/dist
COPY --from=build /app/packages/core-backend/package.json ./node_modules/@mhersztowski/core-backend/

ENV NODE_ENV=production
ENV PORT=1902
ENV ROOT_DIR=/data
ENV STATIC_DIR=/app/static
EXPOSE 1902
CMD ["node", "dist/index.js"]
