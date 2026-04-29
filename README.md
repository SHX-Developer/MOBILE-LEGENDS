# ML MOBA

Browser MOBA (Mobile Legends-like) for Telegram Web App.

## Stack

- **Frontend** — React 18 + Vite + TypeScript + Phaser 3, Zustand for state
- **Backend** — NestJS 10 + TypeORM + PostgreSQL
- **Monorepo** — pnpm workspaces

## Layout

```
apps/
  web/      Vite + React + Phaser game client
  server/   NestJS API + Postgres
packages/
  shared/   shared TS types (DTOs, API contracts)
  game-core/ pure game logic (entities, input) — no rendering
```

Game logic lives in `packages/game-core` and is consumed by the Phaser scenes
in `apps/web/src/game`. React components contain no business logic — they
only render UI and wire stores/APIs.

## Prerequisites

- Node 20+
- pnpm 9+
- PostgreSQL 14+ running locally

## Setup

```sh
pnpm install

cp apps/web/.env.example apps/web/.env
cp apps/server/.env.example apps/server/.env
```

Create the database referenced in `apps/server/.env` (default `ml_moba`):

```sh
createdb ml_moba
```

## Run

Run both apps in parallel:

```sh
pnpm dev
```

Or individually:

```sh
pnpm dev:web      # http://localhost:5173
pnpm dev:server   # http://localhost:3000
```

## API

- `POST /auth/telegram` — body `{ initData }`. Returns `{ user, isNew }`.
- `POST /user/create-nickname` — body `{ telegramId, nickname }`. Returns `PublicUser`.

If `TELEGRAM_BOT_TOKEN` is unset, the server skips signature verification
(local dev). Set it in production to enforce Telegram's HMAC check.

## Game controls

- **WASD** — move
- **Click / tap** — fire projectile toward cursor
- Bottom-left circle is a placeholder for the mobile joystick — wire it to
  `GameScene.setJoystickAxis(x, y)` to feed input.

## Scripts

- `pnpm dev` — run web + server together
- `pnpm build` — build all packages
- `pnpm typecheck` — type-check the entire workspace
