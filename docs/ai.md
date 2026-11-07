# AI

AI features use the Vercel AI SDK through AI Gateway.

## Credential Behavior

The app checks `ENABLE_AI` plus `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`.

If credentials are missing:

- Upload still works.
- Canvas features still work.
- Analysis status becomes `skipped` or an AI route returns `402`.
- The UI shows `AI analysis requires Vercel AI Gateway credentials.`

## Metadata Extraction

Structured metadata is validated with Zod in `lib/ai/schemas.ts`.

The schema includes tags, category, subcategory, description, color palette, composition, mood, style keywords, design principles, visual density, era references, material/texture, and confidence.

## Taste Briefs

`POST /api/taste-brief` gathers selected media metadata and comments, asks the model for one cohesive design direction, saves it to `taste_briefs`, and renders the result through `MessageResponse` from the AI Elements-compatible source component.

## Child Media

`POST /api/generate-child` accepts at least two parent identifiers, creates a
run and proposes a prompt when none is given.
Local mode starts the existing workflow and returns 202. Supabase mode awaits
the authenticated, request-bound coordinator and returns 200 only after the
child and completed run are confirmed. Generated images use the configured
storage adapter and `generated_image` rows with `parentIdsJson`.

Supabase generation requires at least two distinct parents belonging to the
same owned canvas. It uses the caller's authenticated client, owner checks and
conditional run transitions. Its two model calls share a 45-second/request-abort
budget and disable SDK retries. The route declares a 60-second maximum; this
does not bound every storage/database operation or make the request durable.
An uncertain known run can be checked through the owner-scoped status endpoint;
checking cannot resume it. The UI does not automatically generate again.
Unacknowledged storage outcomes retain objects, and an unacknowledged run
creation may have no recoverable identifier. See the
[coordinator contract and verification limits](proposals/supabase-child-generation.md).

## Video Generation Extension Point

Generated video is intentionally left as a v2 extension. The current generated-media workflow can add a `generated_video` branch once a stable Gateway model and SDK path are selected for video output.

