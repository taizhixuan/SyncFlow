# SyncFlow

**A multi-user, real-time collaborative whiteboard** (Miro / Excalidraw-style).
Many people draw shapes, sticky notes, text, connectors, images and freehand
strokes on one infinite canvas — every change syncs live, edits made at the same
instant resolve automatically (CRDT, not last-write-wins), live cursors and
presence show who's doing what, and the board survives disconnects, reloads, and
even multiple back-end servers.

The hard core is **distributed real-time state**: conflict-free concurrent
editing, presence, offline reconciliation, collaboration-aware undo/redo, and
version-history playback — fanned out across server instances via Redis pub/sub.

---

## Why it's interesting

Most portfolio apps are request → response CRUD where the database is plain
storage. SyncFlow's center of gravity is **distributed real-time state**:
WebSocket room management, multi-server fan-out via Redis pub/sub, and
**conflict-free concurrent editing** — two people dragging the same shape at the
same instant converge to the same result with no server-side lock. Solved with
**CRDTs (Yjs)**, with the server persisting periodic binary snapshots rather than
inventing state.

---

## Features

### Real-time collaboration
- **CRDT sync (Yjs)** — the canvas document is a Yjs doc; concurrent edits merge
  conflict-free. The server is authority for persistence, not content.
- **Multi-server horizontal scaling** — Yjs updates fan out across API instances
  over **Redis pub/sub**, so a client on instance A sees edits from instance B.
- **Presence & live cursors** — Yjs Awareness drives remote cursors, selection
  outlines, and an online-avatar stack (ephemeral, never persisted).
- **Offline reconciliation** — edits made offline (persisted via IndexedDB)
  merge cleanly on reconnect.
- **Collaboration-aware undo/redo** — per-origin undo via the Yjs UndoManager.
- **Version history** — versioned snapshots with restore that reconciles live
  clients.

### Rich canvas
- Shapes (rect, ellipse, diamond, triangle, star), sticky notes, text, freehand,
  code blocks, images, **binding connectors** that re-route as shapes move.
- **Markdown text** and **link/embed cards** (favicon + title).
- **Frames** (containers / columns / slides), **mind-map** nodes with tidy-tree
  auto-layout (Tab/Enter, collapse, subtree drag), **list → linked nodes**, and
  **arrange in row/column**.
- Multi-select, alignment & distribution, smart snapping + grid, grouping,
  clipboard, **dark mode** with theme-aware (`auto`) colors, optional sketch mode.

### Collaboration tools
- **Comments** (threads pinned to elements or board points; reply, resolve).
- **Dot-voting & emoji reactions** with a voting mode + top-voted highlight.
- **Tags** with filter/highlight and cluster-by-tag.
- **Board timer** (shared) and **laser pointer** (ephemeral presence).

### Modes & export
- **Templates** (retro, kanban, flowchart, mind-map, user-story map).
- **Component library** — save a selection, drag in reusable instances.
- **Presentation / follow mode** — frames as slides, followers track the presenter.
- **Export** — PNG, SVG, PDF, frames-as-slide-PDF, and mind-map → Markdown outline.
- **Minimap** overview with viewport rectangle + click-to-pan.

### Platform
- **JWT auth** (access + rotating refresh tokens, revocation list).
- **Boards** — CRUD, membership, and **invites** (reusable share links + email
  invites with an accept flow).
- **Image uploads** to S3/MinIO via presigned URLs.

---

## Tech stack

**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · Konva/react-konva ·
Yjs · TanStack Query · Socket.io-client
**Backend:** NestJS · Socket.io · Prisma · PostgreSQL · Redis · Yjs
**Storage / infra:** S3-compatible object storage (MinIO locally) · Docker
Compose · GitHub Actions · Render
**Shared:** `@syncflow/shared` — cross-boundary TypeScript types + Zod schemas
**Auth:** JWT (access + rotating refresh)

---

## Monorepo layout

```
apps/web         React + Vite client (feature-sliced)
apps/api         NestJS server (REST + WebSocket gateway)
packages/shared  Cross-boundary types + Zod schemas (@syncflow/shared)
docker/          Dockerfiles + nginx config
docker-compose.yml   postgres · redis · minio (+ app profile)
.github/workflows    CI (lint → typecheck → test → build → e2e)
render.yaml          Render deploy blueprint  (see DEPLOY.md)
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

# 4. Apply the database schema
pnpm db:deploy        # applies migrations (use db:migrate to author a new one)

# 5. Run web + api together (with the shared package in watch mode)
pnpm dev
```

- **Web:** http://localhost:5173
- **API:** http://localhost:3000/api/v1
- **Health:** http://localhost:3000/api/v1/health/ready
- **MinIO console:** http://localhost:9001

> **Note:** the local Postgres container is mapped to host port **5433** (to avoid
> clashing with a host Postgres on 5432) — `DATABASE_URL` uses `localhost:5433`.

### Full stack in containers

```bash
pnpm compose:full      # builds + runs api and web in Docker too (web on :8080)
```

---

## Testing

```bash
pnpm test              # unit tests (web Vitest + api Jest + shared)
pnpm db:test:deploy    # apply migrations to the isolated test DB (first time)
pnpm test:e2e          # api e2e (auth, boards, invites, storage, sync convergence)
```

Coverage spans pure logic (CRDT binding, snapping, mind-map layout, export
serializers, vote/tag helpers), NestJS services, and end-to-end flows — including
**two-client convergence** through the real gateway + Postgres and cross-instance
fan-out via Redis.

---

## Deployment

CI runs on every push/PR (lint → typecheck → test → build, plus an e2e job with
Postgres/Redis service containers). Production deploys to **Render** from
`render.yaml` (Dockerized API + static web + managed Postgres + Redis). See
[`DEPLOY.md`](./DEPLOY.md) for the blueprint and the secrets the owner must set.

---

## Architecture at a glance

```
React client ──WS (Socket.io + Yjs)──► NestJS WS Gateway ──► Redis (pub/sub fan-out + presence)
     │                                        │
     └──REST (JWT)──────► NestJS API ──► PostgreSQL (users, boards, members, snapshots, invites)
                                          │
                                          └──► S3 / MinIO (image assets, presigned upload)
```

- **Live document state** lives in **Yjs** (in-memory per board, mirrored across
  instances over Redis); PostgreSQL stores periodic **binary snapshots** for
  durability and version history.
- **Ephemeral state** (cursors, selections, laser pointer, presenter position)
  rides **Yjs Awareness** and is never written to the document.
- **Multiple API instances** subscribe to the same Redis channels, so the system
  scales horizontally — any client sees any other client's edits regardless of
  which instance each is connected to.
- **Image uploads** go browser → MinIO/S3 directly via a short-lived presigned
  PUT URL minted by the API.

---

## License

MIT (placeholder — to be confirmed).
</content>
