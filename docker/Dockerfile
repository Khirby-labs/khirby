# Vue SPA (nginx) + Nest API
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.0.9 --activate \
  && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/
COPY packages/plugin-host/package.json ./packages/plugin-host/
COPY packages/forms-client/package.json ./packages/forms-client/
COPY examples/crm-plugin-hello/package.json ./examples/crm-plugin-hello/
COPY plugins.manifest.json ./plugins.manifest.json

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY packages ./packages
COPY scripts ./scripts
COPY examples ./examples
COPY drizzle ./drizzle

RUN node scripts/vendor-plugins-for-build.mjs \
  && node scripts/generate-plugin-loader.mjs \
  && pnpm --filter api build \
  && pnpm --filter web build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache nginx tini wget

RUN corepack enable && corepack prepare pnpm@11.0.9 --activate \
  && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/
COPY packages/plugin-host/package.json ./packages/plugin-host/
COPY packages/forms-client/package.json ./packages/forms-client/
COPY examples/crm-plugin-hello/package.json ./examples/crm-plugin-hello/
COPY plugins.manifest.json ./plugins.manifest.json

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.bundle.conf /etc/nginx/http.d/default.conf
COPY docker/configure-proxy.sh /configure-proxy.sh
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
