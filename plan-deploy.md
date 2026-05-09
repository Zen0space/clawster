# Auto-deploy Clawster to rkb via GitHub Actions + Cloudflare Tunnel SSH

Companion to [`plan.md`](./plan.md). That plan stands up the runtime (backend + db + cloudflared HTTP routes for `wsbe.senireka.my` / `dev-wsbe.senireka.my`); **this** plan wires up the CI/CD path so a push to `dev` or `main` redeploys the right worktree on rkb without ever opening an inbound port.

Modeled after `poket-ebook`'s `deploy-rkb-dev.yml` / `deploy-rkb-prod.yml`.

## Context

Why GitHub Actions instead of a webhook or `git pull` cron:
- The rkb host is on a CGNAT residential ISP — no inbound IP, port 22 cannot be exposed publicly.
- Cloudflare Tunnel already terminates on rkb (it's how `wsbe.senireka.my` works). Adding one more route — `ssh.senireka.my` → `ssh://host.docker.internal:22` — gives Actions a way in **without** opening any port at home.
- Cloudflare Access service tokens authenticate the runner so the SSH route isn't open to the world.

End-to-end flow:

```
git push origin dev
        │
        ▼
GitHub Actions (ubuntu-latest)
        │
        │  ── installs cloudflared client
        │  ── opens SSH via cloudflared access ssh ProxyCommand
        │       (auth: Access service token CF_ACCESS_CLIENT_ID/SECRET)
        ▼
Cloudflare Edge ──► clawster-prod tunnel ──► clawster-cloudflared
        │                                            │
        │                                            ▼
        │                          host.docker.internal:22 (rkb host SSH)
        ▼
ssh ssh.senireka.my (key auth: SSH_DEPLOY_KEY)
        │
        ▼
cd ~/projects/clawster-dev
git fetch && git reset --hard origin/dev
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --build
        │
        ▼
Health probe: https://dev-wsbe.senireka.my/healthz
```

Same shape for `main` → `~/projects/clawster/` → `docker-compose.server.yml`.

## Differences from poket-ebook's pipeline

| Aspect | poket-ebook | clawster |
|---|---|---|
| DB migration step | runs `supabase db push` from the runner against external Supabase | **omitted** — Prisma migrations auto-run inside the container on boot via the Dockerfile entrypoint (`pnpm --filter @clawster/db migrate:deploy`) |
| Healthcheck path | `/health` | `/healthz` |
| Hosts probed | apex + seller + backend | `wsbe.senireka.my` (prod) / `dev-wsbe.senireka.my` (dev) |
| SSH ingress hostname | `ssh.poket-ebook.com` (existing) | `ssh.senireka.my` (new — see step 1) |

Net effect: clawster's deploy job is **simpler** than poket-ebook's. No DB CLI, no extra app container probes — one curl per env.

## Prerequisites

- [`plan.md`](./plan.md) executed on rkb: prod stack up at `wsbe.senireka.my`, dev stack up at `dev-wsbe.senireka.my`, `clawster-prod` Cloudflare Tunnel running with `clawster-cloudflared` container on `proxy-net`.
- rkb has `~/projects/clawster/` (main worktree) and `~/projects/clawster-dev/` (dev linked worktree).

## Step 1 — Add SSH ingress to `clawster-prod` tunnel

Two changes — one in code, one in Cloudflare dashboard.

### 1a. Update `docker-compose.server.yml` (commit on `main`)

Add `extra_hosts` to the existing `clawster-cloudflared` service so it can reach the rkb host's port 22:

```yaml
  clawster-cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: clawster-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}
    depends_on:
      - clawster-backend
    extra_hosts:
      - "host.docker.internal:host-gateway"   # NEW — lets cloudflared reach rkb's :22
    networks:
      - proxy-net
```

(rkb's sshd already listens on `0.0.0.0:22` for LAN — no host change needed. The `extra_hosts` directive injects an `/etc/hosts` entry inside the container resolving `host.docker.internal` to the Docker bridge gateway IP.)

### 1b. Add the SSH public hostname in Cloudflare Zero Trust

Tunnel `clawster-prod` → **Public Hostnames** → Add:

| Subdomain | Domain        | Type | URL                        |
|-----------|---------------|------|----------------------------|
| `ssh`     | `senireka.my` | SSH  | `ssh://host.docker.internal:22` |

Cloudflare auto-creates the CNAME `ssh.senireka.my → <tunnel-id>.cfargotunnel.com`.

## Step 2 — Cloudflare Access (service token auth for the runner)

The SSH route must be locked down — without Access in front, anyone who guesses the hostname could try SSH brute force at the Cloudflare edge.

In Zero Trust → **Access** → **Applications**:
1. **Add an application** → Self-hosted.
2. Application name: `rkb-ssh-deploy-clawster`. Application domain: `ssh.senireka.my`. App type: **SSH**.
3. **Add policy** — Action: **Service Auth** (not Allow!). Name: `github-actions`. Configure rules → Include → **Service Token** → create new token named `clawster-deploy`.
4. Copy the **Client ID** and **Client Secret** shown once (these are `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`).

`Service Auth` policies skip the human SSO/login flow when the request presents valid `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers (which `cloudflared access ssh` sets automatically).

## Step 3 — SSH key for the deploy user on rkb

Generate a fresh ed25519 keypair (run on your laptop, **not** on rkb so the private key stays out of the server):

```bash
ssh-keygen -t ed25519 -f ./clawster-deploy-key -C "github-actions-clawster" -N ""
```

Add the public half to rkb's `authorized_keys` for `rekabytes`:

```bash
# from your laptop, copying the .pub content
ssh rekabytes@192.168.3.3 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '<paste contents of clawster-deploy-key.pub>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Keep `clawster-deploy-key` (private) — that's the `SSH_DEPLOY_KEY` GitHub secret. Delete the local copy after pasting it into GitHub.

If you already have a deploy key from poket-ebook, you can reuse it (one key per host is fine), but a per-project key gives cleaner audit/revocation.

## Step 4 — GitHub repository secrets

In the `Zen0space/clawster` repo → Settings → Secrets and variables → **Actions** → New repository secret. Add three:

| Secret name              | Value source                                                  |
|--------------------------|---------------------------------------------------------------|
| `SSH_DEPLOY_KEY`         | Contents of `clawster-deploy-key` (the private file, full PEM, including `-----BEGIN OPENSSH PRIVATE KEY-----` and trailing newline) |
| `CF_ACCESS_CLIENT_ID`    | Client ID from step 2                                         |
| `CF_ACCESS_CLIENT_SECRET`| Client Secret from step 2                                     |

## Step 5 — Workflow files

Create both files at `.github/workflows/`. Commit `deploy-rkb-prod.yml` to `main`, `deploy-rkb-dev.yml` to `dev`, then merge dev → main so prod ends up with both files (and dev keeps just its own — or commit both to both branches if you want symmetry; symmetric is simpler).

### 5a. `.github/workflows/deploy-rkb-prod.yml`

```yaml
name: Deploy to rkb (prod)

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: deploy-rkb-prod
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy prod stack via Cloudflare Tunnel SSH
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install cloudflared client
        run: |
          curl -L --silent --output cloudflared.deb \
            https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
          sudo dpkg -i cloudflared.deb
          cloudflared --version

      - name: Configure SSH with cloudflared ProxyCommand
        env:
          SSH_DEPLOY_KEY:          ${{ secrets.SSH_DEPLOY_KEY }}
          CF_ACCESS_CLIENT_ID:     ${{ secrets.CF_ACCESS_CLIENT_ID }}
          CF_ACCESS_CLIENT_SECRET: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          printf '%s\n' "$SSH_DEPLOY_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          cat > ~/.ssh/config <<EOF
          Host ssh.senireka.my
            User rekabytes
            IdentityFile ~/.ssh/id_ed25519
            ProxyCommand cloudflared access ssh --hostname %h --service-token-id ${CF_ACCESS_CLIENT_ID} --service-token-secret ${CF_ACCESS_CLIENT_SECRET}
            StrictHostKeyChecking accept-new
            ServerAliveInterval 30
            ServerAliveCountMax 3
          EOF
          chmod 600 ~/.ssh/config

      - name: Deploy prod stack
        run: |
          ssh ssh.senireka.my bash -s <<'REMOTE'
          set -euo pipefail
          cd /home/rekabytes/projects/clawster
          echo "→ syncing main branch"
          git fetch origin
          git reset --hard origin/main
          git clean -fd
          echo "→ building + deploying containers"
          docker compose -f docker-compose.server.yml --env-file .env.prod up -d --build
          echo "→ waiting for health"
          sleep 15
          curl -sSf -o /dev/null -w "  wsbe: HTTP %{http_code} in %{time_total}s\n" https://wsbe.senireka.my/healthz
          docker ps --filter 'name=clawster' --format 'table {{.Names}}\t{{.Status}}'
          REMOTE
```

### 5b. `.github/workflows/deploy-rkb-dev.yml`

```yaml
name: Deploy to rkb (dev)

on:
  push:
    branches:
      - dev
  workflow_dispatch:

concurrency:
  group: deploy-rkb-dev
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy dev stack via Cloudflare Tunnel SSH
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install cloudflared client
        run: |
          curl -L --silent --output cloudflared.deb \
            https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
          sudo dpkg -i cloudflared.deb
          cloudflared --version

      - name: Configure SSH with cloudflared ProxyCommand
        env:
          SSH_DEPLOY_KEY:          ${{ secrets.SSH_DEPLOY_KEY }}
          CF_ACCESS_CLIENT_ID:     ${{ secrets.CF_ACCESS_CLIENT_ID }}
          CF_ACCESS_CLIENT_SECRET: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          printf '%s\n' "$SSH_DEPLOY_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          cat > ~/.ssh/config <<EOF
          Host ssh.senireka.my
            User rekabytes
            IdentityFile ~/.ssh/id_ed25519
            ProxyCommand cloudflared access ssh --hostname %h --service-token-id ${CF_ACCESS_CLIENT_ID} --service-token-secret ${CF_ACCESS_CLIENT_SECRET}
            StrictHostKeyChecking accept-new
            ServerAliveInterval 30
            ServerAliveCountMax 3
          EOF
          chmod 600 ~/.ssh/config

      - name: Deploy dev stack
        run: |
          ssh ssh.senireka.my bash -s <<'REMOTE'
          set -euo pipefail
          cd /home/rekabytes/projects/clawster-dev
          echo "→ syncing dev branch"
          git fetch origin
          git reset --hard origin/dev
          git clean -fd
          echo "→ building + deploying containers"
          docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --build
          echo "→ waiting for health"
          sleep 15
          curl -sSf -o /dev/null -w "  dev-wsbe: HTTP %{http_code} in %{time_total}s\n" https://dev-wsbe.senireka.my/healthz
          docker ps --filter 'name=clawster' --format 'table {{.Names}}\t{{.Status}}'
          REMOTE
```

## Step 6 — First runs

1. Push `deploy-rkb-prod.yml` to `main` (and merge `deploy-rkb-dev.yml` into `main` too, so the file persists across branches).
2. Push the `extra_hosts` change to `main`. Pull on rkb manually one time to land the cloudflared change:
   ```bash
   ssh rekabytes@192.168.3.3 'cd ~/projects/clawster && git pull && docker compose -f docker-compose.server.yml --env-file .env.prod up -d clawster-cloudflared'
   ```
   (After this, all subsequent prod deploys go through Actions.)
3. Trigger workflow manually first via GitHub UI → **Actions** → "Deploy to rkb (prod)" → **Run workflow**. Verify it succeeds end-to-end before relying on auto-trigger.
4. Repeat for the dev workflow.

## Verification

- Actions tab shows green check on push.
- `docker ps` on rkb shows containers updated (`Status` column shows recent `Up X seconds`).
- `https://wsbe.senireka.my/healthz` returns 200 with current build's JSON response.
- For `dev`, same on `dev-wsbe.senireka.my`.
- Bad path test: revoke the service token in Cloudflare → re-run workflow → SSH step fails with auth error (proves Access is enforcing).

## Rollback

If a deploy breaks prod:

```bash
# on rkb
cd ~/projects/clawster
git log --oneline -5            # find last good SHA
git reset --hard <good-sha>
docker compose -f docker-compose.server.yml --env-file .env.prod up -d --build
```

Then revert the bad commit on `main` from your laptop so the next push doesn't redeploy the broken version.

## Manual deploy fallback

If GitHub Actions is unavailable (outage, rate limit, secret expired):

```bash
# Prod
cd ~/projects/clawster
git fetch origin && git reset --hard origin/main
docker compose -f docker-compose.server.yml --env-file .env.prod up -d --build

# Dev
cd ~/projects/clawster-dev
git fetch origin && git reset --hard origin/dev
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --build
```

## Required GitHub secrets (recap)

| Secret                   | Where to find it |
|--------------------------|------------------|
| `SSH_DEPLOY_KEY`         | Private ed25519 PEM you generated in step 3 |
| `CF_ACCESS_CLIENT_ID`    | Cloudflare Access → Service Tokens → `clawster-deploy` |
| `CF_ACCESS_CLIENT_SECRET`| Same — only shown once at creation; regenerate the token if lost |

## Required Cloudflare config (recap)

1. `clawster-prod` tunnel exists with HTTP routes for `wsbe.senireka.my` and `dev-wsbe.senireka.my` (from `plan.md`).
2. **NEW** SSH route: `ssh.senireka.my` → `ssh://host.docker.internal:22`.
3. **NEW** Access application `rkb-ssh-deploy-clawster` covering `ssh.senireka.my`.
4. **NEW** Access policy with action **Service Auth**, Service Token `clawster-deploy`.
