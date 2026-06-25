import { defineTool } from "eve/tools";
import { z } from "zod";

import { getMediaItem, listComments } from "@/lib/db/repository";

export default defineTool({
  description:
    "Inspect one media item with comments. Use when the agent needs detail for a known media ID. Do NOT use for broad canvas listing. Side effects: read-only.",
  inputSchema: z.object({ mediaId: z.string().min(1) }),
  execute: async ({ mediaId }) => ({
    media: await getMediaItem(mediaId),
    comments: await listComments(mediaId),
  }),
});

