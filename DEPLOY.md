# SyncFlow — Deployment Guide

Complete, step-by-step instructions to deploy SyncFlow full-stack to production
on free tiers, using your domain **`syncflows.xyz`**.

## Topology

| Layer | Provider | Why |
|---|---|---|
| **Frontend** (React/Vite static SPA) | **Vercel** | Best CDN + cleanest apex-domain handling on GoDaddy |
| **Backend API + WebSocket** (NestJS + Socket.io) | **Render** (Docker web service) | Long-running process; WebSockets; runs Prisma migrations on boot |
| **Pub/Sub cache** (cross-instance fan-out) | **Render** (managed Key-Value / Redis) | Required by the realtime sync bridge |
| **Database** (Postgres) | **Supabase** | Persistent free tier (Render's free Postgres is deleted after 30 days) |
| **Image storage** (uploads) | **AWS S3** | S3-compatible; works with the existing presign + public-URL code as-is |

```
                      syncflows.xyz / www.syncflows.xyz
                                   │  (DNS → Vercel)
                                   ▼
   Browser ───────────────►  Vercel (static SPA)
      │                          serves index.html + JS/CSS
      │
      │  REST  https://api.syncflows.xyz/api/v1   ┐
      │  WS    wss://api.syncflows.xyz/socket.io  ┘  (DNS → Render)
      ▼
   Render: syncflow-api (NestJS)  ──► Supabase Postgres   (data)
      │                            ──► Render Redis        (pub/sub)
      │
      └─ presigned PUT ──► AWS S3 bucket  ◄── browser GET (public asset URL)
```

Two URL facts that drive everything (getting these wrong is the #1 cause of a
broken deploy):

- **`VITE_API_URL` MUST end in `/api/v1`** — the REST client concatenates paths
  like `/boards` directly onto it. Example: `https://api.syncflows.xyz/api/v1`.
- **`VITE_SYNC_URL` is a BARE origin, no path** — Socket.io appends `/socket.io`
  itself. Example: `https://api.syncflows.xyz`.

Both are **build-time** values: Vite bakes `import.meta.env.VITE_*` into the
bundle during `vite build`. Changing them later requires a **rebuild/redeploy**
of the Vercel project — not just an env edit on a running server.

---

## Prerequisites

- The repo pushed to GitHub (Vercel and Render deploy from it).
- Accounts: **Vercel**, **Render**, **Supabase**, **AWS**, and your **GoDaddy**
  domain `syncflows.xyz`.
- A way to generate secrets: `openssl rand -hex 32` (Git Bash has it).

> **Recommended order:** deploy first on the providers' default URLs
> (`*.onrender.com`, `*.vercel.app`) and confirm it works end-to-end, **then**
> attach `syncflows.xyz` (Step 6) and redeploy. This isolates app bugs from DNS
> issues. The steps below are written in that order.

---

## Step 1 — Supabase Postgres

1. In Supabase, create a new project (pick a region close to your Render region).
   Set and save a strong database password.
2. Wait for it to finish provisioning, then open **Connect** (top bar) →
   **Connection string** → choose the **Session pooler** (Mode: *Session*,
   port **5432**). It looks like:

   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

3. Replace `[YOUR-PASSWORD]` with your DB password. Append `?sslmode=require`:

   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```

   This is your **`DATABASE_URL`** (used in Step 3).

> **Why the Session pooler and not the others?**
> - Render's network is **IPv4-only**; Supabase's *direct* host (`db.<ref>.supabase.co`) is **IPv6-only** → it won't connect from Render.
> - The **Transaction pooler** (port **6543**) doesn't support prepared statements, so `prisma migrate deploy` (which runs on every API boot) fails.
> - The **Session pooler** (port **5432**) is IPv4 **and** migration-safe. Use it for both runtime and migrations.

> Supabase free projects **pause after ~1 week of inactivity** — resume from the
> dashboard if the API later returns 503 on its readiness check.

---

## Step 2 — AWS S3 (image uploads)

Create a bucket and credentials so the browser can upload directly (presigned
`PUT`) and read back the public asset URL.

### 2a. Create the bucket
- S3 → **Create bucket**. Name e.g. `syncflow-assets`, region e.g. `us-east-1`.
- **Uncheck "Block all public access"** and acknowledge the warning (the public
  read policy below needs this). Create the bucket.

### 2b. Bucket policy — public read of uploaded objects
Bucket → **Permissions → Bucket policy** → paste (replace the bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadUploads",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::syncflow-assets/uploads/*"
    }
  ]
}
```

### 2c. CORS — allow the browser to PUT/GET
Bucket → **Permissions → Cross-origin resource sharing (CORS)** → paste. Start
with the Vercel default URL; add your custom domains in Step 6.

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://<your-project>.vercel.app",
      "https://syncflows.xyz",
      "https://www.syncflows.xyz"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

### 2d. IAM user for the API
- IAM → **Users → Create user** (programmatic access). Attach an inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::syncflow-assets/*"
    }
  ]
}
```

- Create an **access key** → save the **Access key ID** and **Secret access key**.

### 2e. The resulting S3 env values (used in Step 3)

| Variable | Value |
|---|---|
| `S3_ENDPOINT` | `https://s3.us-east-1.amazonaws.com` (use your region) |
| `S3_REGION` | `us-east-1` |
| `S3_BUCKET` | `syncflow-assets` |
| `S3_ACCESS_KEY` | *(IAM access key id)* |
| `S3_SECRET_KEY` | *(IAM secret access key)* |
| `S3_FORCE_PATH_STYLE` | `true` *(already set in `render.yaml`)* |

> **Why path-style?** The API builds the public asset URL as
> `${S3_ENDPOINT}/${S3_BUCKET}/${key}`. With `S3_FORCE_PATH_STYLE=true` and a
> regional `S3_ENDPOINT`, the presigned upload URL and the stored public URL
> match: `https://s3.us-east-1.amazonaws.com/syncflow-assets/uploads/...`.

---

## Step 3 — Render (API + Redis)

1. Render Dashboard → **New → Blueprint**. Connect this GitHub repo. Render reads
   `render.yaml` and proposes two resources: **`syncflow-api`** (Docker web
   service) and **`syncflow-redis`** (managed Redis). Apply the blueprint.
2. `REDIS_URL` is wired automatically. Open **`syncflow-api` → Environment** and
   set the `sync:false` variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Supabase **Session pooler** URL from Step 1 |
   | `WEB_ORIGIN` | `https://<your-project>.vercel.app` *(comma-separated; add custom domains in Step 6)* |
   | `JWT_ACCESS_SECRET` | `openssl rand -hex 32` |
   | `JWT_REFRESH_SECRET` | a **different** `openssl rand -hex 32` |
   | `S3_ENDPOINT` `S3_REGION` `S3_BUCKET` `S3_ACCESS_KEY` `S3_SECRET_KEY` | from Step 2e |

3. Save. Render builds `docker/api.Dockerfile`; on boot the container runs
   `prisma migrate deploy` then `node dist/main.js`. Watch the logs.
4. Wait for the health check at **`/api/v1/health/ready`** to go green (it
   returns 200 only when **both** Postgres and Redis are reachable; 503
   otherwise). Note the API URL, e.g. `https://syncflow-api.onrender.com`.
5. Quick check in a browser: `https://syncflow-api.onrender.com/api/v1/health/ready`
   should return `{"status":"ok",...}`.

> **Free-tier cold starts:** the free API spins down after ~15 min idle; the
> next request takes ~50s to wake it. Fine for a demo/portfolio; upgrade the
> instance for always-on.

---

## Step 4 — Vercel (frontend)

1. Vercel → **Add New → Project** → import this GitHub repo.
2. Leave **Root Directory** as the repo root (`./`). `vercel.json` already
   defines the install/build commands, output directory (`apps/web/dist`), and
   the SPA rewrite — so the framework/build fields can stay as detected.
3. **Environment Variables** (Production scope) — set these *before* the first
   build, since Vite bakes them in:

   | Variable | Value (default-URL phase) |
   |---|---|
   | `VITE_API_URL` | `https://syncflow-api.onrender.com/api/v1` |
   | `VITE_SYNC_URL` | `https://syncflow-api.onrender.com` |

4. **Deploy.** Note the URL, e.g. `https://<your-project>.vercel.app`.
5. If you set `WEB_ORIGIN` (Step 3) or the S3 CORS (Step 2c) before you knew the
   exact Vercel URL, update them now to match it, and **redeploy the API**
   (restart) so CORS picks up the change.

> If `VITE_*` were wrong at build time, fix them in Vercel and **Redeploy** — an
> env edit alone won't change the already-built bundle.

---

## Step 5 — Verify end-to-end (on default URLs)

Open `https://<your-project>.vercel.app` and confirm:

1. **Sign up / log in** works (REST + cookies; proves `VITE_API_URL` + CORS).
2. **Create a board**, draw a few shapes.
3. Open the **same board in a second browser/incognito** (log in as another
   user, share/join the board). Confirm **live cursors** and that shapes/sticky
   notes **converge in both** (proves `VITE_SYNC_URL` + WebSocket).
4. **Upload an image** via the Image tool; confirm it renders (proves S3 presign
   + CORS + public read).
5. Refresh — your work persists (Postgres snapshot + IndexedDB).

If all five pass, the stack is correct. Now attach the domain.

---

## Step 6 — Custom domain (`syncflows.xyz` via GoDaddy)

Plan: **`syncflows.xyz` + `www.syncflows.xyz` → Vercel** (frontend),
**`api.syncflows.xyz` → Render** (backend).

### 6a. Add domains in the dashboards
- **Vercel** → Project → **Settings → Domains** → add `syncflows.xyz` and
  `www.syncflows.xyz`. Vercel shows the exact DNS records to create (typically:
  apex `A → 76.76.21.21`, and `www CNAME → cname.vercel-dns.com`). Use the values
  Vercel displays.
- **Render** → `syncflow-api` → **Settings → Custom Domains** → add
  `api.syncflows.xyz`. Render shows a CNAME target like
  `syncflow-api.onrender.com`.

### 6b. Create the DNS records in GoDaddy
GoDaddy → your domain → **DNS → Manage Zones**. Add/replace:

| Type | Name | Value | Notes |
|---|---|---|---|
| `A` | `@` | `76.76.21.21` | apex → Vercel (use the IP Vercel shows) |
| `CNAME` | `www` | `cname.vercel-dns.com` | www → Vercel |
| `CNAME` | `api` | `syncflow-api.onrender.com` | api → Render |

Remove GoDaddy's default parked `A @` record if present. DNS propagation +
automatic SSL issuance take a few minutes to ~an hour. Each dashboard will show
the domain as **Verified / Certificate issued** when ready.

> GoDaddy has no `ALIAS`/`ANAME` at the apex, but Vercel's apex `A` record
> (`76.76.21.21`) works directly — this is why Vercel is the easy choice for the
> root domain.

### 6c. Point the app at the custom domains
Now switch every URL from the default hosts to the custom domains:

- **Vercel env** (Production) → update and **Redeploy**:
  - `VITE_API_URL` = `https://api.syncflows.xyz/api/v1`
  - `VITE_SYNC_URL` = `https://api.syncflows.xyz`
- **Render** `syncflow-api` env → update and restart:
  - `WEB_ORIGIN` = `https://syncflows.xyz,https://www.syncflows.xyz`
- **AWS S3 CORS** (Step 2c) → ensure `AllowedOrigins` includes
  `https://syncflows.xyz` and `https://www.syncflows.xyz`.

Re-run the Step 5 checks against `https://syncflows.xyz`.

---

## CI/CD

`.github/workflows/ci.yml` runs on every push to `main` and every PR:

| Job | What it does |
|---|---|
| `ci` | install → build shared → lint → typecheck → unit tests → full build |
| `e2e` | spins up Postgres 16 + Redis 7, applies migrations, runs e2e tests |
| `deploy` | curls `RENDER_DEPLOY_HOOK_URL` if that secret is set (optional) |

- **Render** auto-deploys the API on push to `main` (repo connected).
- **Vercel** auto-deploys the frontend on push to `main`, and builds a preview
  for every PR.
- Optional explicit Render trigger: Render → `syncflow-api` → **Deploy Hook** →
  copy the URL → add it as the GitHub Actions secret `RENDER_DEPLOY_HOOK_URL`.

> **Preview deployments + CORS:** Vercel PR previews have unique hashed URLs that
> won't be in `WEB_ORIGIN`, so previews can't talk to the *production* API.
> That's expected — use the production URL for live testing, or add a preview
> origin to `WEB_ORIGIN` temporarily.

---

## Environment variable reference

### `syncflow-api` (Render — runtime, `process.env`)

| Variable | Required | Example / default |
|---|---|---|
| `NODE_ENV` | — | `production` *(set in blueprint)* |
| `API_PORT` | — | `3000` *(set in blueprint)* |
| `DATABASE_URL` | **yes** | Supabase session pooler URL (`...pooler.supabase.com:5432/postgres?sslmode=require`) |
| `REDIS_URL` | **yes** | auto-wired from `syncflow-redis` |
| `WEB_ORIGIN` | **yes** | `https://syncflows.xyz,https://www.syncflows.xyz` (CORS; comma-separated) |
| `JWT_ACCESS_SECRET` | **yes** | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | **yes** | different `openssl rand -hex 32` |
| `S3_ENDPOINT` | for images | `https://s3.us-east-1.amazonaws.com` |
| `S3_REGION` | for images | `us-east-1` |
| `S3_BUCKET` | for images | `syncflow-assets` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | for images | IAM credentials |
| `S3_FORCE_PATH_STYLE` | — | `true` *(set in blueprint)* |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | — | `900` / `1209600` seconds |

### `syncflow-web` (Vercel — build-time, baked into the bundle)

| Variable | Required | Example |
|---|---|---|
| `VITE_API_URL` | **yes** | `https://api.syncflows.xyz/api/v1` *(must include `/api/v1`)* |
| `VITE_SYNC_URL` | **yes** | `https://api.syncflows.xyz` *(bare origin, no path)* |

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| All API calls 404 or hit `/api/v1` on the Vercel domain | `VITE_API_URL` missing the `/api/v1` suffix. Fix in Vercel → **Redeploy**. |
| CORS errors in the console | `WEB_ORIGIN` doesn't exactly match the page origin (scheme + host, **no trailing slash**). Fix on Render, restart. |
| Login works but **cursors/sync don't** | `VITE_SYNC_URL` wrong — must be a **bare https origin** (no `/api/v1`, no path). Or mixed content: page is `https` but URL is `http`. Fix + redeploy. |
| API stuck deploying / 503 on `/health/ready` | DB or Redis unreachable. Usually `DATABASE_URL` uses the IPv6 direct host or the 6543 transaction pooler — switch to the **Session pooler (5432)**. Check Render logs. |
| `prisma migrate deploy` fails on boot | Same as above — migrations need the Session pooler, not the transaction pooler. |
| First request after idle takes ~50s | Render free-tier cold start. Expected; upgrade for always-on. |
| Image upload fails (CORS / 403) | S3 CORS missing the page origin (Step 2c), bucket not public (Step 2b), wrong region in `S3_ENDPOINT`, or `S3_FORCE_PATH_STYLE` not `true`. |
| Everything 503 after a quiet week | Supabase free project paused — resume it in the Supabase dashboard. |
| Domain not resolving / no SSL | DNS still propagating, or a stale GoDaddy parked `A @` record — remove it. Confirm records match what Vercel/Render show. |

---

## Local development

```bash
# Start Postgres, Redis, MinIO (backing services)
pnpm compose:up

# Run all services in dev mode (web :5173, api :3000)
pnpm dev

# Apply migrations
pnpm db:deploy

# Unit tests
pnpm test

# e2e tests (needs .env.test and the test DB on port 5433)
pnpm db:test:deploy
pnpm test:e2e

# Full local stack in containers (web on :8080 via nginx)
pnpm compose:full
```
