# SyncFlow API — multi-stage build for the NestJS server.
#
# build: install the whole workspace, compile shared + api, then `pnpm deploy`
#        a self-contained copy of the api with production dependencies only
#        (the workspace `@syncflow/shared` is injected as a real package).
# run:   that pruned copy only, as the unprivileged `node` user — no compilers,
#        test tooling or source tree in the image an attacker could use.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @syncflow/shared build \
  && pnpm --filter @syncflow/api exec prisma generate \
  && pnpm --filter @syncflow/api build \
  && pnpm --filter @syncflow/api deploy --prod --legacy /out \
  # The deployed tree has its own node_modules; generate the Prisma client there.
  && cd /out && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM node:22-alpine AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
# Apply pending migrations, then start. `prisma` is a runtime dependency for this.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
