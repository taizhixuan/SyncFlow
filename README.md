# SyncFlow

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-v9+-red.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)

A multi-user, real-time collaborative whiteboard inspired by Miro and Excalidraw. Work with a team on an infinite canvas — draw shapes, add sticky notes, paste images, freehand sketch, and see changes appear instantly on everyone's screen. Conflicts between simultaneous edits resolve automatically (using CRDTs, not last-write-wins), presence shows who's working where, and work survives network hiccups, tab reloads, and even server restarts.

The core challenge solved here is **distributed real-time state**: conflict-free concurrent editing, presence awareness, offline reconciliation, and version history — all fanned out across multiple server instances with Redis pub/sub.

## What makes it different

SyncFlow tackles the hard part: **distributed real-time state**. Imagine two people dragging the same shape at the exact same moment. No server-side locks, no "last write wins" conflicts. They end up at the same answer because of **CRDTs (using Yjs)** — a data structure that merges concurrent changes correctly by design. The server acts as a persistence layer, storing periodic snapshots, not inventing state.

## Features

### Real-time collaboration
- **CRDT sync (Yjs)** — every canvas is a Yjs document that merges edits conflict-free. The server persists state; it doesn't invent it.
- **Scale to multiple servers** — updates fan out across API instances via Redis pub/sub, so edits on server A are instantly visible to clients on server B.
- **Presence & live cursors** — see where teammates are pointing, what they're selecting, and know who's online. All ephemeral — not saved to the database.
- **Work offline, sync on return** — edits made while disconnected (stored locally in IndexedDB) merge cleanly the moment you reconnect.
- **Undo that respects teamwork** — undo your own changes without undoing what someone else did.
- **Rewind and restore** — snapshots of the board at any point in time, restored without breaking live collaboration.

### Rich canvas
- Core elements: rectangles, circles, diamonds, triangles, stars, sticky notes, text, freehand drawing, code blocks, and images. **Smart connectors** that automatically re-route when shapes move.
- Write **Markdown** in text boxes, embed **web links** with favicons and titles, and keep everything looking polished.
- Organize with **frames** (think slides or sections), create **mind maps** with auto-layout (just press Tab to add a child), convert lists to linked nodes, and quickly align or distribute objects.
- Select multiple items at once, snap to grid, group related objects, copy and paste, dark mode with automatic color adjustment, and even a sketch/hand-drawn aesthetic if you like.

### Built for teams
- **Comments** — thread discussions pinned to any element or spot on the board, reply in-line, and mark resolved.
- **Voting** — dot-vote or emoji-react on ideas, see the top-voted items highlighted.
- **Tags** — label content and instantly filter or group by tags.
- **Shared timer** and **laser pointer** for presentations and facilitated sessions.

### Ready-made workflows and exports
- **Start with templates** — retro boards, kanban, flowcharts, mind maps, and user-story maps.
- **Component library** — save a set of objects and drag them in as reusable copies.
- **Present** — turn frames into slides, others follow along as you navigate.
- **Export** — PNG, SVG, PDF, PDF with frames as individual slides, and mind maps as Markdown outlines.
- **Minimap** overview with viewport rectangle + click-to-pan.

### Platform essentials
- **Secure login** — JWT-based with rotating refresh tokens and a revocation list.
- **Board management** — create, edit, delete, manage who can access each board, and send invites via shareable links or email.
- **Image uploads** — drag images onto the canvas; they're stored securely on S3 (or MinIO locally).

## Tech stack

| Layer | Tools |
|-------|-------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Konva/react-konva, Yjs, TanStack Query, Socket.io-client |
| **Backend** | NestJS, Socket.io, Prisma, PostgreSQL, Redis, Yjs |
| **Storage & Deployment** | S3 (MinIO locally), Docker, GitHub Actions CI/CD, Render |
| **Shared** | `@syncflow/shared` — shared TypeScript types and Zod schemas |
| **Auth** | JWT with rotating refresh tokens and revocation lists |

## Project structure

```
apps/
  web/              React + Vite client (organized by feature)
  api/              NestJS server (REST + WebSocket)
packages/
  shared/           Shared TypeScript types and Zod schemas
docker/             Container configs and nginx setup
docker-compose.yml  Local dev stack: postgres, redis, minio
.github/workflows/  Automated testing, linting, building, and deployment
render.yaml         Deployment blueprint for Render hosting
```

**Key principle:** `packages/shared` is the single source of truth. Any type or schema that crosses the network boundary lives here — client and server both import the same definition, preventing sync bugs.

## Get started locally

**You need:** Docker + Docker Compose, Node 20+, and pnpm 9+.

```bash
# Install dependencies
pnpm install

# Copy dev config (defaults work fine locally)
cp .env.example .env

# Start the database, cache, and storage services
pnpm compose:up

# Set up the database schema
pnpm db:deploy

# Start the app (web and API)
pnpm dev
```

Then visit:
- **Canvas app:** http://localhost:5173
- **API:** http://localhost:3000/api/v1
- **API health check:** http://localhost:3000/api/v1/health/ready
- **MinIO storage console:** http://localhost:9001

> **Note:** Postgres runs on port 5433 (not the default 5432) to avoid conflicts if you have a local Postgres. The connection string in `.env` is already set up for this.

### Full stack in containers

```bash
pnpm compose:full      # builds + runs api and web in Docker too (web on :8080)
```

## Testing

```bash
# Unit tests (frontend and backend)
pnpm test

# Set up an isolated test database (first time only)
pnpm db:test:deploy

# API end-to-end tests (auth, boards, invites, uploads, real sync through the gateway)
pnpm test:e2e
```

Tests cover the core: board CRUD and permissions, auth flows, image uploads, and the hardest part — **two clients editing simultaneously and converging to the same state** through the actual gateway, Postgres, and Redis.

## Deployment

Every push and PR automatically runs linting, type-checking, tests, and a build. For production, the app is containerized and deployed to **Render** — API service, static web, managed Postgres, and Redis. See [`DEPLOY.md`](./DEPLOY.md) for setup details and required environment variables.

## How it works

```
React client ──WS (Socket.io + Yjs)──► NestJS WS Gateway ──► Redis (broadcast + presence)
     │                                        │
     └──REST (JWT)──────► NestJS API ──► PostgreSQL (users, boards, members, snapshots)
                                          │
                                          └──► S3 / MinIO (image uploads)
```

**The key parts:**

- **Canvas state** is a Yjs document that lives in memory on the server (one per board). It's also mirrored across multiple server instances via Redis pub/sub. PostgreSQL stores periodic snapshots for durability and version history.
- **Ephemeral stuff** — cursors, selections, who's online, laser pointers — rides Yjs Awareness. Never persisted, just broadcast to everyone in the room.
- **Horizontal scaling** — add more API servers, they all subscribe to the same Redis topics, and every client sees every change regardless of which server they're connected to.
- **Image storage** — the browser gets a short-lived signed URL from the API and uploads directly to MinIO/S3. No image bytes touch the API server itself.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
</content>
