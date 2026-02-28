FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/core-backend/ packages/core-backend/
COPY app/mycastle-backend/ app/mycastle-backend/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mhersztowski/core build
RUN pnpm --filter @mhersztowski/core-backend build
RUN pnpm --filter mycastle-backend build
# pnpm deploy resolves workspace deps and removes symlinks
RUN pnpm --filter mycastle-backend deploy --prod /app/production

FROM base AS production
WORKDIR /app
COPY --from=build /app/production ./

ENV NODE_ENV=production
ENV PORT=1894
ENV ROOT_DIR=/data
EXPOSE 1894
CMD ["node", "dist/index.js"]
