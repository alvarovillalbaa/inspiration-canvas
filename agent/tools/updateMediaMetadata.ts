import { defineTool } from "eve/tools";
import { z } from "zod";

import { createAgentApproval } from "@/lib/db/repository";

export default defineTool({
  description:
    "Propose metadata updates for a media item. Use when tags/category/description should change. Do NOT use for position, size, or deletion changes. Side effects: creates an approval request; it does not mutate media directly.",
  inputSchema: z.object({
    mediaId: z.string().min(1),
    metadata: z.object({
      title: z.string().nullable().optional(),
      tagsJson: z.array(z.string()).optional(),
      category: z.string().nullable().optional(),
      subcategory: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    }),
  }),
  approval: () => true,
  execute: async ({ mediaId, metadata }) => ({
    approval: await createAgentApproval({
      toolName: "updateMediaMetadata",
      mediaIds: [mediaId],
      payload: { mediaId, metadata },
    }),
  }),
});
