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

`next dev` keeps the Eve worker opt-in with `ENABLE_EVE_DEV=true`. Production retains the existing `withEve(withWorkflow(nextConfig))` integration. The approved supported-runtime update pins Eve 0.18.0 and AI SDK 7.0.15; its hosted acceptance is recorded in [the crop release receipt](results/2026/10-27/visual-crop.md).

## Assumptions

Eve 0.18.0 requires Node >=24 and AI SDK `^7.0.0`. Its versioned source retains `defineAgent`, `defineTool` and `withEve`; four tool definitions use `approval: () => true` in place of the removed `needsApproval` field. Their existing app-level approval records and execute functions are unchanged. This compatibility update does not establish live model, provider, session or approval-UI acceptance.
