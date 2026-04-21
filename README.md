# Clawster

A desktop app for bulk WhatsApp messaging with humanoid pacing to reduce ban risk. Built with Tauri 2 (Windows + macOS), Node.js backend, and PostgreSQL.

## Stack

| Layer | Tech |
|---|---|
| Desktop | Tauri 2 + React 19 + Vite |
| Backend | Node.js 22 + Fastify 5 + TypeScript |
| WhatsApp | `@whiskeysockets/baileys` |
| Database | PostgreSQL 16 + Prisma 6 |
| Queue | pg-boss (no Redis) |
| Deploy | Docker Compose on VPS |

## Prerequisites

- [Node.js 22+](https://nodejs.org)
- [pnpm 9+](https://pnpm.io) — `npm i -g pnpm`
- [Rust + Cargo](https://rustup.rs) — required for Tauri
- [Docker + Compose](https://docs.docker.com/get-docker) — for local Postgres
- **Windows only:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools) + WebView2 (pre-installed on Win10+)
- **macOS only:** Xcode Command Line Tools — `xcode-select --install`

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up the database

```bash
# Copy env files
cp packages/db/.env.example packages/db/.env
cp packages/backend/.env.example packages/backend/.env
# Edit both files if you change PG credentials

# Start Postgres (only service in Docker)
docker compose up -d

# Run migrations and generate Prisma client
pnpm db:migrate:dev
pnpm db:generate
```

### 3. Start the backend

```bash
pnpm dev:backend
# API running at http://127.0.0.1:8080
# Health check: http://127.0.0.1:8080/healthz
```

### 4. Start the desktop app (development)

```bash
pnpm --filter @clawster/desktop tauri:dev
# Opens a native window with hot-reload
```

## Package structure

```
clawster/
├── docker-compose.yml   # PostgreSQL only (backend + desktop run manually)
├── .env.example         # Docker Compose PG credentials
├── packages/
│   ├── db/              # @clawster/db  — Prisma schema + client singleton
│   ├── backend/         # @clawster/backend — Fastify API + WebSocket + worker
│   └── desktop/         # @clawster/desktop — Tauri 2 + React UI
└── docs/
    └── prod-nodejs.md   # Full production design document
```

## Common commands

```bash
pnpm install                    # install all packages
pnpm db:generate                # regenerate Prisma client after schema changes
pnpm db:migrate:dev             # create + apply a new migration (dev)
pnpm db:migrate:deploy          # apply pending migrations (prod/CI)
pnpm dev:backend                # start backend with tsx watch
pnpm dev:desktop                # start Vite dev server only
pnpm -r typecheck               # typecheck all packages
pnpm -r build                   # build all packages
```

## Building installers

```bash
# Requires Rust toolchain + platform build tools (see Prerequisites)
# Place app icons in packages/desktop/src-tauri/icons/ first:
#   pnpm --filter @clawster/desktop tauri icon path/to/logo.png

pnpm --filter @clawster/desktop tauri:build
# Windows → packages/desktop/src-tauri/target/release/bundle/msi/*.msi
# macOS   → packages/desktop/src-tauri/target/release/bundle/dmg/*.dmg
```

## Environment variables

| Package | File | Key vars |
|---|---|---|
| `db` | `packages/db/.env` | `DATABASE_URL` |
| `backend` | `packages/backend/.env` | `DATABASE_URL`, `JWT_SECRET`, `MASTER_KEY`, `PORT` |

See `packages/db/.env.example` for the full reference.

## Design document

See [`docs/prod-nodejs.md`](docs/prod-nodejs.md) for the full architecture, data model, API spec, humanoid pacing engine, deployment guide, and phased roadmap.
