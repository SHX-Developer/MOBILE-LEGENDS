# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20-alpine
ARG PNPM_VERSION=9.0.0

# ── base: pnpm + workspace skeleton ─────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo

# ── deps: install once, cache pnpm store ────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/game-core/package.json packages/game-core/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @ml/web...

# ── build: compile Vite bundle ──────────────────────────────────────────────
FROM deps AS build
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter @ml/web build

# ── runtime: nginx serving the dist ────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache wget
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1
