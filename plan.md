# Self-host Clawster Backend + Postgres via Cloudflare Tunnel

Modeled after `poket-ebook` / `poket-ebook-dev` (two worktrees, single tunnel, env-suffixed container names).

## Context

Self-host the Clawster Fastify backend + PostgreSQL on the rkb home server with two parallel environments:

- **prod** ← `main` branch  → `wsbe.senireka.my`
- **dev**  ← `dev`  branch  → `dev-wsbe.senireka.my`

Public reachability via a single shared Cloudflare Tunnel (no port forwarding, bypasses CGNAT). Domain `senireka.my` is registered at Exabytes; nameservers must be moved to Cloudflare so the tunnel can manage `wsbe` / `dev-wsbe` CNAMEs. Desktop app is decoupled, out of scope.

The repo already ships a production-ready Dockerfile, automatic Prisma migrations on boot, and a pg-boss queue inside Postgres (no Redis) — deployment just needs compose files that wire backend + db, persistent volumes on `/mnt/storage`, and a single tunnel ingress that fans out to both stacks.

## Layout (matches poket-ebook)

```
~/projects/clawster/         ← main branch        → docker-compose.server.yml + .env.prod
~/projects/clawster-dev/     ← dev branch         → docker-compose.dev.yml    + .env.dev
```

Persistent data on HDD:
```
/mnt/storage/docker-volumes/clawster/{postgres-data,media}/
/mnt/storage/docker-volumes/clawster-dev/{postgres-data,media}/
```

Compose project names (sets the prefix Docker uses for auto-named networks/volumes):
- prod: `name: clawster`
- dev:  `name: clawster-dev`

Container names (poket-ebook style — short prefix, `-dev` suffix on dev only):
- prod: `clawster-backend`, `clawster-db`, `clawster-cloudflared`
- dev:  `clawster-backend-dev`, `clawster-db-dev`

Networks:
- `proxy-net` — external, shared (cloudflared + both backends)
- `clawster_internal` — auto-created by prod compose (backend ↔ db)
- `clawster-dev_internal` — auto-created by dev compose (backend-dev ↔ db-dev)

The dev DB is fully separate from prod — no shared `prod-internal` (poket-ebook only shares because it uses external Supabase; clawster has its own DB per env).

## Architecture

```
                      Internet
                         │
                Cloudflare Edge (TLS)
                         │
                ┌────────┴────────┐
                │  clawster-prod  │   ← single tunnel, token mode
                │   tunnel (CF)   │     ingress configured in CF dashboard
                └────────┬────────┘
                         │
                ┌────────▼─────────┐
                │ clawster-cloud-  │
                │     flared       │   container in prod stack
                └────────┬─────────┘
                         │ proxy-net
              ┌──────────┴──────────┐
              ▼                     ▼
      clawster-backend      clawster-backend-dev
         :8080                  :8080
              │                     │
              ▼ internal            ▼ internal
        clawster-db            clawster-db-dev
```

Ingress (set in Cloudflare Zero Trust dashboard → tunnel `clawster-prod` → Public Hostnames):
- `wsbe.senireka.my`     → `http://clawster-backend:8080`
- `dev-wsbe.senireka.my` → `http://clawster-backend-dev:8080`

## Step 1 — One-time prerequisites

```bash
# Shared external network (skip if NPM/poket already created it)
docker network create proxy-net 2>/dev/null || true

# HDD volume dirs
sudo mkdir -p /mnt/storage/docker-volumes/clawster/{postgres-data,media}
sudo mkdir -p /mnt/storage/docker-volumes/clawster-dev/{postgres-data,media}
sudo chown -R 1000:1000 /mnt/storage/docker-volumes/clawster /mnt/storage/docker-volumes/clawster-dev

# Two worktrees (clawster/ already exists on dev — switch back to main; clone -dev separately)
cd ~/projects
git -C clawster checkout main
git clone -b dev git@github.com:Zen0space/clawster.git clawster-dev
```

## Step 2 — Domain on Cloudflare

1. Cloudflare dashboard → Add a site → `senireka.my` → Free plan.
2. In Exabytes domain panel, change nameservers to the two Cloudflare-assigned nameservers. Wait for propagation (10 min – few hrs).
3. Once active, Cloudflare manages `senireka.my` DNS — the tunnel can auto-create `wsbe` and `dev-wsbe` CNAMEs in step 4.

## Step 3 — Backend + Postgres compose files

`.env` files are already gitignored (`.env.*` excluded, only `.env.example` tracked).

### 3a. `clawster/docker-compose.server.yml` (prod, commit on `main`)

```yaml
name: clawster

services:
  clawster-backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
    container_name: clawster-backend
    restart: unless-stopped
    env_file: .env.prod
    volumes:
      - /mnt/storage/docker-volumes/clawster/media:/app/data/media
    networks:
      - proxy-net
      - internal
    depends_on:
      clawster-db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/healthz"]
      interval: 30s
      timeout: 5s
      retries: 5

  clawster-db:
    image: postgres:16-alpine
    container_name: clawster-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: clawster
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: clawster
    volumes:
      - /mnt/storage/docker-volumes/clawster/postgres-data:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clawster -d clawster"]
      interval: 10s
      timeout: 5s
      retries: 5

  clawster-cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: clawster-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}
    depends_on:
      - clawster-backend
    networks:
      - proxy-net

networks:
  proxy-net:
    external: true
  internal:
```

### 3b. `clawster-dev/docker-compose.dev.yml` (dev, commit on `dev`)

```yaml
name: clawster-dev

services:
  clawster-backend-dev:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
    container_name: clawster-backend-dev
    restart: unless-stopped
    env_file: .env.dev
    volumes:
      - /mnt/storage/docker-volumes/clawster-dev/media:/app/data/media
    networks:
      - proxy-net
      - internal
    depends_on:
      clawster-db-dev:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/healthz"]
      interval: 30s
      timeout: 5s
      retries: 5

  clawster-db-dev:
    image: postgres:16-alpine
    container_name: clawster-db-dev
    restart: unless-stopped
    environment:
      POSTGRES_USER: clawster
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: clawster
    volumes:
      - /mnt/storage/docker-volumes/clawster-dev/postgres-data:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clawster -d clawster"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  proxy-net:
    external: true
  internal:
```

No cloudflared in dev — the prod cloudflared reaches `clawster-backend-dev` over `proxy-net`.

### 3c. `.env.prod` (in `clawster/`, gitignored)

```
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DATABASE_URL=postgresql://clawster:REPLACE_DB_PASSWORD@clawster-db:5432/clawster
DB_PASSWORD=REPLACE_DB_PASSWORD
JWT_SECRET=REPLACE_64_HEX_CHARS
MASTER_KEY=REPLACE_64_HEX_CHARS
MEDIA_ROOT=/app/data/media

# Tunnel (single token serves prod + dev hostnames)
TUNNEL_TOKEN=REPLACE_FROM_CF_DASHBOARD

# Optional AI chatbot (leave blank to disable)
CHAT_BASE_URL=
CHAT_API_KEY=
CHAT_MODEL=
```

### 3d. `.env.dev` (in `clawster-dev/`, gitignored)

```
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DATABASE_URL=postgresql://clawster:REPLACE_DEV_DB_PASSWORD@clawster-db-dev:5432/clawster
DB_PASSWORD=REPLACE_DEV_DB_PASSWORD
JWT_SECRET=REPLACE_DIFFERENT_64_HEX
MASTER_KEY=REPLACE_DIFFERENT_64_HEX
MEDIA_ROOT=/app/data/media

CHAT_BASE_URL=
CHAT_API_KEY=
CHAT_MODEL=
```

Generate secrets:
```bash
openssl rand -hex 24   # DB_PASSWORD
openssl rand -hex 32   # JWT_SECRET, MASTER_KEY (must be 32-byte hex / 64 chars)
```

Update `.env.example` on both branches with the same shape (no real values) and commit.

## Step 4 — Cloudflare Tunnel

1. Cloudflare Zero Trust → Networks → Tunnels → "Create a tunnel" → Cloudflared → name `clawster-prod`.
2. Copy the tunnel token (starts with `eyJ...`) into `clawster/.env.prod` as `TUNNEL_TOKEN=...`.
3. In the tunnel's **Public Hostnames** tab, add two routes (Cloudflare auto-creates the CNAMEs to `<tunnel-id>.cfargotunnel.com`):

| Subdomain    | Domain        | Type | URL                            |
|--------------|---------------|------|--------------------------------|
| `wsbe`       | `senireka.my` | HTTP | `clawster-backend:8080`        |
| `dev-wsbe`   | `senireka.my` | HTTP | `clawster-backend-dev:8080`    |

The hostnames resolve via Docker DNS over `proxy-net` — works because all three containers share that network.

## Step 5 — Bring it up

```bash
# Prod (also starts cloudflared)
cd ~/projects/clawster
docker compose -f docker-compose.server.yml --env-file .env.prod up -d --build

# Dev
cd ~/projects/clawster-dev
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --build
```

Update workflow per branch (matches poket-ebook):
```bash
cd ~/projects/clawster      && git pull && docker compose -f docker-compose.server.yml --env-file .env.prod up -d --build
cd ~/projects/clawster-dev  && git pull && docker compose -f docker-compose.dev.yml    --env-file .env.dev  up -d --build
```

## Step 6 — Backups (after initial deploy works)

The repo ships `scripts/backup.sh` and `scripts/restore.sh` (pg_dump + tar.zst, 30-day retention). Best long-term path: tweak the script to run pg_dump via `docker exec` so the DB doesn't need a host port. Wire each env to host cron, e.g.:

```cron
# /etc/cron.d/clawster-backups
0 3 * * * rekabytes cd /home/rekabytes/projects/clawster     && ./scripts/backup.sh > /var/log/clawster-backup.log     2>&1
30 3 * * * rekabytes cd /home/rekabytes/projects/clawster-dev && ./scripts/backup.sh > /var/log/clawster-dev-backup.log 2>&1
```

## Verification

1. Containers up + healthy:
   ```bash
   docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'clawster|cloudflared'
   ```
2. Migrations applied (14 expected):
   ```bash
   docker exec clawster-db     psql -U clawster -d clawster -c '\dt' | wc -l
   docker exec clawster-db-dev psql -U clawster -d clawster -c '\dt' | wc -l
   ```
3. Healthz from inside cloudflared (proves proxy-net path):
   ```bash
   docker exec clawster-cloudflared wget -qO- http://clawster-backend:8080/healthz
   docker exec clawster-cloudflared wget -qO- http://clawster-backend-dev:8080/healthz
   ```
4. Tunnel logs show 4 connections registered:
   ```bash
   docker logs clawster-cloudflared --tail 50 | grep "Registered tunnel connection"
   ```
5. External (off-LAN, e.g. cellular):
   ```bash
   curl -i https://wsbe.senireka.my/healthz
   curl -i https://dev-wsbe.senireka.my/healthz
   ```
6. DB isolation:
   ```bash
   docker exec clawster-db     psql -U clawster -d clawster -c "SELECT inet_server_addr();"
   docker exec clawster-db-dev psql -U clawster -d clawster -c "SELECT inet_server_addr();"
   ```

## Open items (manual)

1. Move `senireka.my` nameservers from Exabytes to Cloudflare.
2. Generate `DB_PASSWORD`, `JWT_SECRET`, `MASTER_KEY` — different per env. `MASTER_KEY` must be 32-byte hex (64 chars).
3. Create the `clawster-prod` tunnel and paste the token into `.env.prod`.
4. Add `wsbe` + `dev-wsbe` public hostnames in the tunnel UI.
5. Decide on `/metrics` exposure — currently unauthenticated. Recommend restricting via Cloudflare Access, or stripping the `/metrics` route from the public hostname.
6. Optional: enable Cloudflare WAF / rate-limiting on top of Fastify's built-in 200 req/min IP limit.
