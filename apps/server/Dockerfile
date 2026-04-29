# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20-alpine
ARG PNPM_VERSION=9.0.0

# ── base: pnpm ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo

# ── deps: workspace install with cached store ──────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/game-core/package.json packages/game-core/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter @ml/server...

# ── build: nest compile + deploy prod-only deps to /tmp/deploy ─────────────
FROM deps AS build
COPY packages packages
COPY apps/server apps/server
RUN pnpm --filter @ml/server build && \
    pnpm --filter @ml/server --prod --no-optional deploy /tmp/deploy

# ── runtime: minimal node image, non-root ───────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
RUN apk add --no-cache wget tini
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=node:node /tmp/deploy/dist ./dist
COPY --from=build --chown=node:node /tmp/deploy/node_modules ./node_modules
COPY --from=build --chown=node:node /tmp/deploy/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
    CMD wget -qO- http://127.0.0.1:3000/api/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
