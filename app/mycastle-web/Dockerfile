FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY app/mycastle-web/ app/mycastle-web/
# Remove dev .env so auto-detect URLs work in production
RUN rm -f app/mycastle-web/.env app/mycastle-web/.env.local
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mhersztowski/core build
RUN pnpm --filter mycastle-web build

FROM nginx:alpine AS production
COPY --from=build /app/app/mycastle-web/build /usr/share/nginx/html
COPY app/mycastle-web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
