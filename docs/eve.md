# Eve

The Curator Agent is implemented with Vercel Eve under `agent/`.

## Files

- `agent/agent.ts`: agent configuration.
- `agent/instructions.md`: behavior, scope, and guardrails.
- `agent/tools/*.ts`: file-derived Eve tool definitions.

## Tool Policy

Read-only tools execute directly:

- `listCanvasMedia`
- `getSelectedMedia`
- `inspectMedia`
- `listComments`
- `proposeChildMediaPrompt`
- `findSimilarMedia`
- `findDuplicateMedia`

Mutating tools create approval records and do not write directly:

- `updateMediaMetadata`
- `createTasteBrief`
- `generateChildMedia`
- `autoArrangeMedia`

Approval records are stored in `agent_tool_approvals` and can be confirmed through `/api/agent/approvals/[id]`.

## Local Behavior

The canvas sheet includes a local fallback panel that surfaces selected context and documents where the Eve runtime files live. Full Eve session streaming depends on the Eve Next integration and project deployment/runtime configuration.

`next dev` skips `withEve` by default because Eve 0.13.8 currently peers AI SDK `7.0.0-beta.178`, while this app intentionally uses AI SDK v6 for the product AI routes. Set `ENABLE_EVE_DEV=true` to opt into the Eve dev worker after aligning the Eve/AI SDK peer versions.

## Assumptions

Eve is beta. The installed package exposes `defineAgent`, `defineTool`, and `withEve`. Its package currently declares a peer on a newer AI SDK beta, while the product implementation follows the requested AI SDK v6 APIs for app AI features.
