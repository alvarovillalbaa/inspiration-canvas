# Inspiration Canvas

`inspiration-canvas` is a local-first, Vercel-native inspiration canvas for visual references. Upload images and videos, arrange them on an infinite canvas, annotate them, ask AI for a cohesive taste/design direction, and generate child media from selected parents.

The first screen is the product canvas. There is no landing page.

Media stay visually clear along their bottom edge. Names remain in the existing
Info and inline-comment surfaces, and each media item's accessible name identifies
it. Processing state is available in its accessible description and the Info panel;
skipped analysis is labelled separately from failure.

Media Info provides searchable category/subcategory comboboxes and removable
tag chips. Choose an existing value or select the “Create” option for a new one.
Unselected search text is not metadata. “Save info” applies the draft; a failed
save keeps it available for retry. Existing comma-containing tags remain single
tags. The [metadata browser receipt](docs/results/2026/11-05/metadata-checks.md)
records all eight cases passing once against
`d817a5b99503748b1cbfc0aaaf624962f180a58c`: six desktop and two touch-emulated
Chromium cases, with no retries, skips, flaky outcomes or global errors.
Source guards and owned cleanup passed. This checks anonymous browser storage
with authored images and disabled providers; signed-in/hosted persistence, real
providers, physical touch and full product completion remain unverified. The
[scope and earlier failures](docs/proposals/metadata-checks-v2.md),
[original source/build receipt](docs/results/2026/10-29/metadata-controls.md)
and four completed crop cases remain separate evidence.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Geist
- Anonymous browser storage for four-hour temporary canvases
- Standard PostgreSQL for optional single-user local persistence
- Supabase Auth/Postgres/Storage for hosted persistence
- Optional Vercel Blob media storage for signed-in hosted uploads
- Vercel AI SDK through AI Gateway
- Vercel Workflow SDK for ingestion and child generation
- Vercel Eve for the Curator Agent and approval-gated tools
- Vitest and Playwright

## Local Setup

```bash
corepack pnpm install
cp .env.example .env
createdb inspiration_canvas
# Set LOCAL_PERSISTENCE_ENABLED=true in .env, then:
corepack pnpm db:push
corepack pnpm db:seed
corepack pnpm dev
```

Open `http://127.0.0.1:3000`. Local commands bind to loopback by default.

With local persistence enabled, the canvas, files, layout, metadata and comments
use the local PostgreSQL API and configured storage. The UI identifies this as
“Local PostgreSQL”; it does not represent a Supabase account. Without local
opt-in or Supabase credentials, the app uses a four-hour temporary browser canvas
in `localStorage` and IndexedDB. Without AI credentials, upload, comments, preview,
drag, resize, crop, delete and zoom remain available. See
[local setup and data boundaries](docs/local-development.md).

Saving a temporary canvas to an account copies its layout, crop, metadata and
comments as well as its files. Interrupted saves can be retried without creating
another copy of the same item or comment. The browser recovery copy remains until
its original four-hour expiry; a failed or incomplete save keeps it pending.
See the [transfer contract and verification limits](docs/temporary-canvas-transfer.md).

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

- `DATABASE_URL`: PostgreSQL connection string for the explicitly enabled local mode.
- `LOCAL_PERSISTENCE_ENABLED`: exact `true` enables the single-user loopback API outside Vercel. Default is off.
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
- Provider-backed Curator and generation acceptance still requires configured credentials and separate runtime checks; the supported Eve/AI versions and release evidence are recorded in `docs/implementation-notes.md`.

## Roadmap

- Supabase-backed AI ingestion and child generation workflows
- Direct Blob or Supabase client uploads for very large video files
- Vector similarity search for visual embeddings
- Generated video workflows
- Full Eve streaming UI once hosted Eve sessions are configured
