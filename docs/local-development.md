# Local Development

## Setup

```bash
corepack pnpm install
cp .env.example .env.local
corepack pnpm db:push
corepack pnpm db:seed
corepack pnpm dev
```

## Local Defaults

- `DATABASE_URL=file:.data/inspiration-canvas.db`
- `STORAGE_DRIVER=local`
- `UPLOAD_DIR=.data/uploads`
- `ENABLE_AI=true`
- `ENABLE_EVE_DEV=false`

AI features require `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`. Without those credentials, AI routes return clear errors and the rest of the app continues to work.

Eve files are present under `agent/`, and production builds include `withEve`. Local `next dev` skips Eve's dev worker by default to avoid the current Eve beta peer mismatch with AI SDK v6; set `ENABLE_EVE_DEV=true` only after aligning those versions.

## Verification

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm build
```

Playwright starts the Next dev server automatically unless one is already running.
