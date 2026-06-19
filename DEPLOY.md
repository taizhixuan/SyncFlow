# SyncFlow — Deployment Guide

## Overview

SyncFlow deploys on **Render** using the `render.yaml` blueprint in this repo.
CI runs on **GitHub Actions** on every push to `main` and every pull request.

---

## CI (GitHub Actions)

File: `.github/workflows/ci.yml`

| Job | What it does |
|---|---|
| `ci` | Install → build shared → lint → typecheck → unit tests → full build |
| `e2e` | Spin up Postgres 16 + Redis 7 service containers, apply migrations, run e2e tests |
| `deploy` | Curl the Render deploy hook (no-op if `RENDER_DEPLOY_HOOK_URL` secret is absent) |

The `e2e` job runs after `ci` passes. The `deploy` job is an optional supplement —
Render's built-in auto-deploy (triggered by the connected GitHub repo) is the
primary deploy mechanism.

---

## Render Blueprint

File: `render.yaml` (repo root)

Connect the repo in the Render dashboard → **New → Blueprint Instance** → point
at this repo. Render provisions:

| Resource | Type | Notes |
|---|---|---|
| `syncflow-api` | Web service (Docker) | Builds from `docker/api.Dockerfile`; runs `prisma migrate deploy` on start |
| `syncflow-web` | Static site | Vite build output at `apps/web/dist`; SPA rewrite `/* → /index.html` |
| `syncflow-db` | Managed Postgres (free) | `DATABASE_URL` auto-wired to the api service |
| `syncflow-redis` | Managed Redis (free) | `REDIS_URL` auto-wired to the api service |

---

## Secrets the Owner Must Set Manually

After the blueprint is applied, open each service's **Environment** panel in
the Render dashboard and fill in these `sync: false` variables:

### `syncflow-api` service

| Variable | Description | Example |
|---|---|---|
| `WEB_ORIGIN` | Full `https://` URL of the web static site. Used for CORS. | `https://syncflow-web.onrender.com` |
| `JWT_ACCESS_SECRET` | Long random string (≥ 32 chars). Used to sign access tokens. | — |
| `JWT_REFRESH_SECRET` | Long random string (≥ 32 chars). Must differ from access secret. | — |
| `S3_ENDPOINT` | Your S3-compatible endpoint URL (omit for AWS S3). | — |
| `S3_REGION` | AWS/MinIO region. | `us-east-1` |
| `S3_BUCKET` | Bucket name for image uploads. | `syncflow-assets` |
| `S3_ACCESS_KEY` | S3 access key ID. | — |
| `S3_SECRET_KEY` | S3 secret access key. | — |

`S3_FORCE_PATH_STYLE` defaults to `false` (correct for AWS S3); set to `true`
for self-hosted MinIO with a path-style endpoint.

> **Why manual for `WEB_ORIGIN`?** Render's `fromService { property: host }`
> yields a bare hostname (e.g. `syncflow-web.onrender.com`) with no scheme.
> The browser Origin header always includes `https://`, so a bare hostname
> would cause every CORS preflight to fail. Set the full URL manually.

### `syncflow-web` service

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Full `https://` URL of the api service. Baked into the JS bundle at build time. | `https://syncflow-api.onrender.com` |
| `VITE_SYNC_URL` | Full `https://` URL for Socket.io. Typically the same host as `VITE_API_URL`. | `https://syncflow-api.onrender.com` |

> **Why manual for `VITE_API_URL` / `VITE_SYNC_URL`?** Vite replaces
> `import.meta.env.VITE_*` at build time. A bare hostname (no scheme) baked
> into the bundle produces broken `fetch()` and Socket.io connection URLs.
> The full `https://` URL must be set before the build runs.

`DATABASE_URL` and `REDIS_URL` are auto-wired by the blueprint (`fromDatabase`
/ `fromService connectionString`) — no manual entry needed for those.

---

## Optional: Render Deploy Hook in CI

If you want CI to trigger a Render deploy after tests pass (in addition to
Render's auto-deploy):

1. In Render → `syncflow-api` → **Deploy Hook** → copy the URL.
2. Add it as a GitHub Actions secret: `RENDER_DEPLOY_HOOK_URL`.

When the secret is present the `deploy` CI job curls it after `ci` + `e2e` both
pass on `main`. If the secret is absent the step is skipped silently.

---

## Local Development

```bash
# Start Postgres, Redis, MinIO
pnpm compose:up

# Run all services in dev mode
pnpm dev

# Apply migrations
pnpm db:deploy

# Run unit tests
pnpm test

# Run e2e tests (needs .env.test and test DB on port 5433)
pnpm db:test:deploy
pnpm test:e2e
```
