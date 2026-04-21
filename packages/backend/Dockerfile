# syntax=docker/dockerfile:1
# Run from the repo root: docker build -f packages/backend/Dockerfile .

# ─── base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache openssl python3 make g++
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# ─── install workspace deps (only backend + db) ──────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/db/package.json ./packages/db/
COPY packages/backend/package.json ./packages/backend/
COPY packages/desktop/package.json ./packages/desktop/
RUN pnpm install --frozen-lockfile --filter "@clawster/backend..." --filter "@clawster/db..."

# ─── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY packages/backend ./packages/backend
RUN pnpm --filter @clawster/db generate \
    && pnpm --filter @clawster/db build \
    && pnpm --filter @clawster/backend build

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=8080
ENV MEDIA_ROOT=/app/data/media

COPY --from=build /app /app
WORKDIR /app

EXPOSE 8080
VOLUME ["/app/data"]

# Run migrations on boot, then start the API
CMD ["sh", "-c", "pnpm --filter @clawster/db migrate:deploy && node packages/backend/dist/index.js"]
