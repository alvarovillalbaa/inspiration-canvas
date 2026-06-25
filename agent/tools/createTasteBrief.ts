import { defineTool } from "eve/tools";
import { z } from "zod";

import { createAgentApproval } from "@/lib/db/repository";

export default defineTool({
  description:
    "Propose creating and saving a taste brief for selected media. Use when the agent has synthesized a final brief. Do NOT use for draft-only text. Side effects: creates an approval request; it does not write the taste brief directly.",
  inputSchema: z.object({
    canvasId: z.string().min(1),
    mediaIds: z.array(z.string().min(1)).min(1),
    text: z.string().min(1),
  }),
  needsApproval: () => true,
  execute: async ({ canvasId, mediaIds, text }) => ({
    approval: await createAgentApproval({
      toolName: "createTasteBrief",
      canvasId,
      mediaIds,
      payload: { canvasId, mediaIds, text },
    }),
  }),
});

