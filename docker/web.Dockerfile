# SyncFlow Web — build the Vite app, serve static via nginx.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @syncflow/shared build \
  && pnpm --filter @syncflow/web build

FROM nginx:alpine AS run
COPY docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
