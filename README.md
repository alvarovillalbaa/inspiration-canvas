# Inspiration Canvas

`inspiration-canvas` is a local-first, Vercel-native inspiration canvas for visual references. Upload images and videos, arrange them on an infinite canvas, annotate them, ask AI for a cohesive taste/design direction, and generate child media from selected parents.

The first screen is the product canvas. There is no landing page.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Geist
- Local SQLite/libSQL query layer with a Neon-compatible hosted path
- Local filesystem uploads by default, Vercel Blob in hosted mode
- Vercel AI SDK through AI Gateway
- Vercel Workflow SDK for ingestion and child generation
- Vercel Eve for the Curator Agent and approval-gated tools
- Vitest and Playwright

## Local Setup

```bash
corepack pnpm install
cp .env.example .env.local
corepack pnpm db:push
corepack pnpm db:seed
corepack pnpm dev
```

Open `http://localhost:3000`.

Without AI credentials, uploads, canvas persistence, comments, preview, drag, resize, crop metadata, delete, and zoom still work. AI actions show a clear credentials message.

## Vercel Setup

1. Create/link a Vercel project.
2. Enable AI Gateway and run `vercel env pull .env.local` for OIDC, or set `AI_GATEWAY_API_KEY`.
3. Provision Vercel Blob and set `BLOB_READ_WRITE_TOKEN`.
4. Provision Neon Postgres through Vercel Marketplace and set `DATABASE_URL`.
5. Set `STORAGE_DRIVER=blob` and `ENABLE_BLOB_STORAGE=true`.
6. Deploy normally through Vercel.

## Environment

See `.env.example` for all variables:

- `DATABASE_URL`: local `file:.data/inspiration-canvas.db` or hosted Postgres.
- `STORAGE_DRIVER`: `local` or `blob`.
- `UPLOAD_DIR`: local upload directory.
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token for hosted media.
- `ENABLE_AI`: toggles AI features.
- `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`: AI Gateway credentials.
- `MAX_UPLOAD_MB`, `ENABLE_VIDEO_UPLOADS`, `AI_TEXT_MODEL`, `AI_IMAGE_MODEL`.

## Eve Curator Agent

The Eve agent lives under `agent/`. It exposes tools for reading canvas media, inspecting selections/comments, proposing metadata, creating taste briefs, proposing child prompts, generating child media, auto-arranging media, and finding similar/duplicate media.

All mutating Eve tools create approval records instead of writing directly.

## Workflows

`workflows/media-ingestion.ts` analyzes uploaded media. `workflows/child-generation.ts` creates generated child media. Local route handlers fall back to direct execution if Workflow runtime endpoints are not available.

## Commands

```bash
corepack pnpm dev
corepack pnpm build
corepack pnpm start
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm db:push
corepack pnpm db:seed
```

## Known Limitations

- Video thumbnail/duration extraction is best-effort locally without ffmpeg.
- Generated video is documented as an extension point; v1 implements generated images.
- Eve is beta and currently has a newer AI SDK peer than the app's requested AI SDK v6 path; see `docs/implementation-notes.md`.

## Roadmap

- Auth and multi-user workspaces
- Direct Blob client uploads for very large video files
- Vector similarity search for visual embeddings
- Generated video workflows
- Richer crop UI with visible crop handles
- Full Eve streaming UI once hosted Eve sessions are configured

