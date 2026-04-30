# Deploy to VPS

Production stack: **Caddy** (auto-TLS) → **nginx** (web SPA) + **NestJS** (API) + **Postgres**.
Build is BuildKit-cached pnpm multi-stage; deploys are one command and self-verify.

## 0. Prerequisites on the VPS

- Linux (Debian/Ubuntu tested) with `git`, `docker` (24+), `docker compose` plugin.
- Public domain with an A-record pointing at the VPS — required because the
  Telegram WebApp only loads HTTPS origins.
- Ports `80`, `443` open (TCP) and `443/udp` (HTTP/3, optional).

## 1. First-time setup

```sh
ssh you@vps
git clone <your repo url> ml-moba && cd ml-moba

cp .env.production.example .env
nano .env        # set DOMAIN, POSTGRES_PASSWORD, TELEGRAM_BOT_TOKEN
```

Make sure `pnpm-lock.yaml` is committed (Docker builds rely on it for
reproducible installs).

## 2. Deploy

```sh
./scripts/deploy.sh
```

This pulls, rebuilds only the layers that changed, restarts containers, and
runs the smoke test. First build takes ~3–5 min; subsequent builds are
seconds when only source files changed (deps layer is cached).

## 3. Verify

`deploy.sh` runs `verify.sh` automatically. To re-check anytime:

```sh
./scripts/verify.sh
```

It hits:
- `https://$DOMAIN/api/healthz` — NestJS up, DB reachable
- `https://$DOMAIN/healthz` — nginx serving the SPA
- `https://$DOMAIN/` — index.html

On failure it dumps the last 30 lines of every container's logs.

## 4. Test on phone

1. Talk to **@BotFather** → set your bot's WebApp URL to `https://<DOMAIN>/`.
2. Open the bot in Telegram → tap the WebApp button.
3. Game loads. Layla spawns at the blue base. Joystick + fire button work.

## Common ops

```sh
# tail live logs
docker compose -f compose.prod.yml logs -f --tail=100 server

# restart one service
docker compose -f compose.prod.yml restart server

# wipe DB (careful — drops all users)
docker compose -f compose.prod.yml down
docker volume rm ml-moba_pgdata
./scripts/deploy.sh

# rebuild from clean
docker compose -f compose.prod.yml build --no-cache
```

## What makes builds fast

- **Two-stage pnpm install** — manifests copied first, then sources. Editing a
  `.ts` file does not invalidate the `pnpm install` layer.
- **BuildKit cache mount** for the pnpm store (`/pnpm/store`) → installs reuse
  packages across builds.
- **`pnpm deploy --prod`** for the server → runtime image only contains
  production deps + compiled `dist/` (no devDependencies, no source).
- **Local cache_to/cache_from** in `compose.prod.yml` → layers persist in
  `.docker-cache/` between deploy runs.
- **nginx + immutable assets** → browsers cache `*.js`/`*.css` for 1 year
  (Vite hashes filenames so cache-busting is automatic).

## What to commit before the first deploy

- `pnpm-lock.yaml`  (currently untracked)

Delete `package-lock.json` if it sneaked in — this project uses pnpm only.

---

## Deploying via Dokploy

Use `compose.dokploy.yml` (Caddy removed — Dokploy's built-in Traefik handles
TLS and routing). Domains are attached through the Dokploy UI.

### 1. Create the service

Dokploy → your project → **Create Service → Compose**.

- **Source**: Git → connect GitHub → repo `SHX-Developer/MOBILE-LEGENDS`
- **Branch**: `main`
- **Compose Path**: `compose.dokploy.yml`

### 2. Environment variables

In the Compose service's **Environment** tab paste:

```
DOMAIN=play.example.com
POSTGRES_PASSWORD=<strong password>
POSTGRES_USER=postgres
POSTGRES_DB=ml_moba
TELEGRAM_BOT_TOKEN=<token from BotFather>
```

`DOMAIN` is the public domain you'll attach in step 4.

### 3. Deploy once

Click **Deploy**. Watch logs — first build takes ~3–5 min. The stack comes
up but isn't reachable yet because no domain is attached.

### 4. Attach domains

In the Compose service's **Domains** tab click **Add Domain** twice:

| # | Host             | Path  | Service  | Container Port | HTTPS |
|---|------------------|-------|----------|---------------:|:-----:|
| 1 | `<DOMAIN>`       | `/`   | `web`    | `80`           | ✓     |
| 2 | `<DOMAIN>`       | `/api`| `server` | `3000`         | ✓     |

Pick **Let's Encrypt** as certificate type for both. DNS A-record for the
domain must already point to the Dokploy host.

> The server already serves everything under `/api` (NestJS global prefix),
> so do NOT enable any strip-prefix middleware. Dokploy passes the path
> through as-is.

### 5. Verify

```sh
curl -I https://<DOMAIN>/
curl    https://<DOMAIN>/api/healthz
```

The second call should return `{"ok":true,"uptime":...}`.

### 6. Test on phone

- @BotFather → set the bot's WebApp URL to `https://<DOMAIN>/`.
- Open the bot in Telegram → tap the WebApp button.

### Redeploys

Push to `main` → in Dokploy click **Deploy** (or enable **Auto Deploy** in
the General tab to redeploy on every push). BuildKit cache + the layered
pnpm install keep rebuilds in the seconds range when only source changed.

To avoid a short public 404 window during redeploys:

- Keep the `web` healthcheck enabled from `compose.dokploy.yml`; it verifies
  nginx is already serving `/healthz`.
- In Dokploy, enable zero-downtime / rolling deploy for the Compose service
  when the option is available.
- If Dokploy supports scaling Compose services, run at least 2 `web` replicas
  so Traefik always has an old healthy container while the new one starts.
- `index.html` is served with `no-store` so Telegram/WebView does not keep an
  old HTML shell that points to deleted Vite hashed assets.
