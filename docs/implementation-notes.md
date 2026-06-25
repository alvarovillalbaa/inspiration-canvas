# Implementation Notes

## Current Docs Checked

- Vercel Eve: `https://vercel.com/docs/eve`
- AI SDK: `https://ai-sdk.dev/docs`
- AI Gateway: `https://vercel.com/docs/ai-gateway`
- Workflow: `https://vercel.com/docs/workflow` and `https://workflow-sdk.dev`
- Vercel Blob: `https://vercel.com/docs/vercel-blob`
- Next.js: local `node_modules/next/dist/docs/` plus `https://nextjs.org/docs`
- shadcn/ui: `https://ui.shadcn.com/docs`

## Deviations From The Original Prompt

- `@vercel/blob@^1.2.0` no longer exists; the implementation uses `@vercel/blob@2.4.1`.
- The installed Eve package is beta and declares a newer AI SDK peer. App AI code still uses the requested AI SDK v6 APIs (`generateText`, `Output.object`, current transport-compatible rendering patterns).
- Video ingestion does not extract duration or thumbnails without an ffmpeg-capable runtime. Upload and preview still work.
- Generated video is documented as an extension point; generated images are implemented first.
- Local workflow fallback runs direct async functions if Workflow runtime start is unavailable.
- Geist is loaded via local WOFF2 files under `app/fonts` instead of `next/font/google` so local and CI builds do not require Google Fonts network access.
- `pnpm build` uses `next build --webpack`; the default Turbopack build path stalled during local verification after Workflow manifest generation in this environment.
- Local `next dev` skips `withEve` unless `ENABLE_EVE_DEV=true` because Eve 0.13.8 peers AI SDK 7 beta and its dev worker currently fails against the requested AI SDK v6 package.

## Build-Safety Notes

Database, storage, and AI clients are initialized lazily. `next build` should not require a live database, Blob token, or AI Gateway credential.
