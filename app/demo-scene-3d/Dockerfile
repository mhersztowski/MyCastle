FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core-scene3d/ packages/core-scene3d/
COPY packages/ui-core/ packages/ui-core/
COPY packages/ui-components-scene3d/ packages/ui-components-scene3d/
COPY app/demo-scene-3d/ app/demo-scene-3d/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mhersztowski/core-scene3d build
RUN pnpm --filter @mhersztowski/ui-core build
RUN pnpm --filter @mhersztowski/ui-components-scene3d build
RUN pnpm --filter demo-scene-3d build

FROM nginx:alpine AS production
COPY --from=build /app/app/demo-scene-3d/dist /usr/share/nginx/html
COPY app/demo-scene-3d/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
