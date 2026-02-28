FROM node:20-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/core-backend/ packages/core-backend/
COPY packages/web-client/ packages/web-client/
COPY app/mycastle-backend/ app/mycastle-backend/
COPY app/mycastle-web/ app/mycastle-web/
RUN pnpm install --frozen-lockfile
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
