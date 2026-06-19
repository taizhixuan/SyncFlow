# SyncFlow

**A real-time collaborative whiteboard.** Multiple people draw shapes, sticky
notes, text, and freehand strokes on one infinite canvas — every change syncs
live, conflicts resolve automatically (CRDT), and the board survives disconnects
and reloads.

> 🚧 **Status:** under active construction, built in SDLC phases.
> **Phase 2 complete** — monorepo scaffold + Docker Compose infrastructure +
> config validation + health checks. Auth, boards, the canvas, and live sync
> land in the phases that follow.

<!-- HERO GIF (two browser windows editing one board) lands with the sync phase. -->

---

## Why it's interesting

Most portfolio apps are request → response CRUD where the database is plain
storage. SyncFlow's core is **distributed real-time state**: WebSocket room
management, multi-server fan-out via Redis pub/sub, and **conflict-free
concurrent editing** — two people dragging the same shape at the same instant
converge to the same result with no server-side lock. Solved with **CRDTs (Yjs)**,
not last-write-wins.

---

## Tech stack

**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · Konva/react-konva · Yjs
**Backend:** NestJS · Socket.io · Prisma · PostgreSQL · Redis
**Infra:** Docker Compose · MinIO (S3) · GitHub Actions · Render
**Auth:** JWT (access + rotating refresh)

---

## Monorepo layout

```
apps/web        React + Vite client
apps/api        NestJS server (REST + WebSocket gateway)
packages/shared Cross-boundary TypeScript types + Zod schemas (@syncflow/shared)
docker/         Dockerfiles + nginx config
docker-compose.yml   postgres · redis · minio (+ app profile)
```

`packages/shared` is the single source of truth for any type that crosses the
network boundary — client and server import the same definition.

---

## Run it locally

**Prerequisites:** Docker + Docker Compose, Node ≥ 20, pnpm ≥ 9.

```bash
# 1. Install dependencies
pnpm install

# 2. Configure (dev defaults work out of the box)
cp .env.example .env

# 3. Start backing services (postgres, redis, minio)
pnpm compose:up

# 4. Create the database schema
pnpm db:migrate

# 5. Run web + api together (with the shared package in watch mode)
pnpm dev
```

- **Web:** http://localhost:5173
- **API:** http://localhost:3000/api/v1
- **Health:** http://localhost:3000/api/v1/health/ready
- **MinIO console:** http://localhost:9001

The landing page shows a live **Backend status** card that polls the API
readiness endpoint and reports Postgres + Redis health — proof the whole stack
is wired end to end.

### Full stack in containers

```bash
pnpm compose:full      # builds + runs api and web in Docker too (web on :8080)
```

---

## Useful scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run web + api + shared (watch) together |
| `pnpm build` | Build all workspaces (topological order) |
| `pnpm typecheck` | Type-check every workspace |
| `pnpm lint` | ESLint across the monorepo |
| `pnpm test` | Run unit tests |
| `pnpm db:migrate` | Apply Prisma migrations (dev) |
| `pnpm compose:up` / `:down` | Start / stop backing services |

---

## Architecture at a glance

```
React client ──WS (Socket.io + Yjs)──► NestJS WS Gateway ──► Redis (pub/sub + presence)
     │                                        │
     └──REST (JWT)──────► NestJS API ──► PostgreSQL (users, boards, snapshots)
                                          │
                                          └──► S3 / MinIO (image assets)
```

Live document state lives in **Yjs** (memory + Redis); PostgreSQL stores periodic
binary **snapshots** for durability and history. Multiple API instances subscribe
to the same Redis channels, so a client on instance A sees edits from a client on
instance B.

---

## License

MIT (placeholder — to be confirmed).
