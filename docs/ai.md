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

`POST /api/generate-child` creates a generation run, proposes a prompt if needed, and starts the child generation workflow. Generated images are stored through the configured storage adapter and inserted as `generated_image` rows with `parentIdsJson`.

## Video Generation Extension Point

Generated video is intentionally left as a v2 extension. The current generated-media workflow can add a `generated_video` branch once a stable Gateway model and SDK path are selected for video output.

