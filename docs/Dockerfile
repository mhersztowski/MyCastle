FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json typedoc.json ./
COPY packages/ packages/
COPY app/ app/
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN npx typedoc --html /app/docs-output

FROM nginx:alpine AS production
COPY --from=build /app/docs-output /usr/share/nginx/html
COPY docs/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
