# syntax=docker/dockerfile:1
# Run from the repo root: docker build -f packages/webapp/Dockerfile --build-arg VITE_API_URL=https://wsbe.senireka.my .

# ─── builder ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/db/package.json       ./packages/db/
COPY packages/shared/package.json   ./packages/shared/
COPY packages/backend/package.json  ./packages/backend/
COPY packages/desktop/package.json  ./packages/desktop/
COPY packages/webapp/package.json   ./packages/webapp/
RUN pnpm install --frozen-lockfile --filter "@clawster/webapp..."

COPY tsconfig.base.json ./
COPY docs ./docs
COPY packages/shared ./packages/shared
COPY packages/webapp ./packages/webapp
RUN pnpm --filter @clawster/shared build \
    && pnpm --filter @clawster/webapp build
# Produces /app/packages/webapp/dist

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM caddy:alpine
COPY --from=builder /app/packages/webapp/dist /srv
COPY packages/webapp/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
