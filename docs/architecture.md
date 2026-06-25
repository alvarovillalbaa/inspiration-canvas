# Architecture

`inspiration-canvas` is a local-first Next.js app with Vercel-native adapters.

## Runtime Shape

- `app/` owns App Router pages and route handlers.
- `components/canvas/` owns the browser canvas experience.
- `lib/db/` owns schema creation and repository methods.
- `lib/storage/` owns local filesystem and Vercel Blob storage.
- `lib/ai/` owns AI Gateway calls and Zod schemas.
- `workflows/` owns durable Workflow SDK entrypoints.
- `agent/` owns Eve agent configuration and tools.

## Local Mode

Local mode is the default:

- Metadata uses SQLite/libSQL at `file:.data/inspiration-canvas.db`.
- Media files are written under `.data/uploads`.
- Uploaded files are served through `/api/uploads/[...key]`.
- AI actions fail gracefully when no AI Gateway credential is present.

## Hosted Mode

Hosted mode switches adapters through environment variables:

- `DATABASE_URL=postgres://...` enables the Neon-compatible query adapter.
- `STORAGE_DRIVER=blob` enables Vercel Blob.
- AI calls route through Vercel AI Gateway by model slug.
- Workflow and Eve integrations use their Next plugins in `next.config.ts`.

## Data Flow

Uploads enter through `/api/upload`, are validated, stored, inserted into `media_items`, and then handed to the ingestion workflow. Canvas interactions use optimistic client state and debounced or stop-event PATCH requests back to route handlers. AI generation routes save durable records before starting long-running work.

## Storage Rules

Large media never goes into the database. Database rows store URLs, storage keys, dimensions, metadata, analysis state, comments, generation runs, and lineage.

