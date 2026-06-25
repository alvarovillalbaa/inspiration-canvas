import { defineTool } from "eve/tools";
import { z } from "zod";

import { createAgentApproval } from "@/lib/db/repository";

export default defineTool({
  description:
    "Propose starting child-media generation. Use when the user wants new generated media from selected parents. Do NOT use for prompt-only requests. Side effects: creates an approval request; generation starts only after approval.",
  inputSchema: z.object({
    canvasId: z.string().min(1),
    mediaIds: z.array(z.string().min(1)).min(2),
    prompt: z.string().min(1),
  }),
  needsApproval: () => true,
  execute: async ({ canvasId, mediaIds, prompt }) => ({
    approval: await createAgentApproval({
      toolName: "generateChildMedia",
      canvasId,
      mediaIds,
      payload: { canvasId, mediaIds, prompt },
    }),
  }),
});

