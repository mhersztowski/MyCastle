FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY app/mycastle-backend/ app/mycastle-backend/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mhersztowski/core build
RUN pnpm --filter mycastle-backend build

FROM base AS production
WORKDIR /app
COPY --from=build /app/app/mycastle-backend/dist ./dist
COPY --from=build /app/app/mycastle-backend/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/dist ./node_modules/@mhersztowski/core/dist
COPY --from=build /app/packages/core/package.json ./node_modules/@mhersztowski/core/

ENV NODE_ENV=production
ENV PORT=1894
ENV ROOT_DIR=/data
EXPOSE 1894
CMD ["node", "dist/index.js"]
