# Architecture

The canvas supports three explicit persistence modes:

- With neither local opt-in nor Supabase configuration, anonymous uploads remain
  in browser storage for four hours.
- `LOCAL_PERSISTENCE_ENABLED=true` plus a PostgreSQL `DATABASE_URL` enables a
  single-user local API and the `inspiration_canvas_local` schema. Files use the
  configured storage adapter. The app and request checks restrict this mode to
  loopback; Vercel refuses it.
- Supabase configuration uses real Supabase sessions, per-user default canvases,
  existing public-schema ownership/RLS and Supabase Storage or Vercel Blob. It
  takes precedence over local mode. The local repository never impersonates a
  Supabase user or runs its DDL against those public tables.

`app/` owns routes; `components/canvas/` owns the actual editor;
`lib/db/repository.ts` owns the local PostgreSQL contract and
`lib/db/supabase-repository.ts` owns the authenticated hosted contract.
`GET /api/canvas` explicitly returns `persistence: local | supabase`; the client
does not infer a signed-in identity from an arbitrary successful response.

The local `pg` pool is lazy and bounded. Repository SQL uses native parameters
and fully qualified names. Versioned initialization and batch updates use one
checked-out connection per transaction. JSONB and timestamp rows map back to the
shared DTOs. CLI shutdown drains the pool. See [local setup](local-development.md)
for opt-in, isolation and existing-data limits.

Uploads pass file-signature validation and then store media objects and rows.
Canvas changes use the matching local or Supabase API; AI calls remain optional
through Vercel AI Gateway. Workflow SDK entrypoints live in `workflows/`; the Eve
Curator source is in `agent/`. Source and mocked/CI evidence do not establish live
provider or complete Eve-suite acceptance.

Large media stay outside PostgreSQL. Rows contain storage keys, URLs, dimensions,
crop/metadata, comments, generation runs and lineage. The
[temporary-to-account copy](temporary-canvas-transfer.md) retains its independent
recovery/idempotency contract and uses only the authenticated Supabase path.

