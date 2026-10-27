# Inspiration Canvas

`inspiration-canvas` is a local-first, Vercel-native inspiration canvas for visual references. Upload images and videos, arrange them on an infinite canvas, annotate them, ask AI for a cohesive taste/design direction, and generate child media from selected parents.

The first screen is the product canvas. There is no landing page.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Geist
- Anonymous browser storage for four-hour temporary canvases
- Local SQLite/libSQL query layer for development
- Supabase Auth/Postgres/Storage for hosted persistence
- Optional Vercel Blob media storage for signed-in hosted uploads
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

Without Supabase credentials, the app runs as an anonymous browser canvas and stores uploads temporarily for four hours in `localStorage` plus IndexedDB. Without AI credentials, uploads, comments, preview, drag, resize, visual image cropping, delete, and zoom still work. AI actions ask anonymous users to sign in or show a clear credentials message.

The crop editor previews the original image with a movable selection and eight resize handles. Drag with a mouse or touch, or focus a handle and use arrow keys (Shift for larger steps). Reset restores the full image; Cancel discards the current selection. Save keeps the existing normalized crop metadata and original file. Failed saves keep the dialog and selection available for retry. See [the crop release evidence](docs/results/2026/10-27/visual-crop.md) for checks and outstanding browser acceptance.

## Vercel Setup

1. Create/link a Vercel project.
2. Create a Supabase project and run `supabase/migrations/20260626000000_create_inspiration_canvas_schema.sql`.
3. In Supabase Auth, add the production origin and `/auth/confirm` callback URL.
4. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_MEDIA_BUCKET=inspiration-media` in Vercel.
5. Use `STORAGE_DRIVER=supabase` for Supabase Storage, or provision Vercel Blob, set `BLOB_READ_WRITE_TOKEN`, and use `STORAGE_DRIVER=blob`.
6. Enable AI Gateway and run `vercel env pull .env.local` for OIDC, or set `AI_GATEWAY_API_KEY`.
7. Deploy normally through Vercel.

## Environment

See `.env.example` for all variables:

- `DATABASE_URL`: local `file:.data/inspiration-canvas.db` for development fallback.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase Auth/Postgres credentials for hosted persistence.
- `SUPABASE_MEDIA_BUCKET`: Supabase Storage bucket, default `inspiration-media`.
- `STORAGE_DRIVER`: `local`, `supabase`, or `blob`.
- `UPLOAD_DIR`: local upload directory.
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token when `STORAGE_DRIVER=blob`.
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

- Supabase-backed AI ingestion and child generation workflows
- Direct Blob or Supabase client uploads for very large video files
- Vector similarity search for visual embeddings
- Generated video workflows
- Full Eve streaming UI once hosted Eve sessions are configured
