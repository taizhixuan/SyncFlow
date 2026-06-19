# SyncFlow API — multi-stage build for the NestJS server.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @syncflow/shared build \
  && pnpm --filter @syncflow/api exec prisma generate \
  && pnpm --filter @syncflow/api build

FROM node:22-alpine AS run
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
WORKDIR /app/apps/api
EXPOSE 3000
# Apply pending migrations, then start.
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/main.js"]
