import { defineTool } from "eve/tools";
import { z } from "zod";

import { listComments } from "@/lib/db/repository";

export default defineTool({
  description:
    "List comments for one media item. Use when comments may explain why a reference matters. Do NOT use to inspect media metadata. Side effects: read-only.",
  inputSchema: z.object({ mediaId: z.string().min(1) }),
  execute: async ({ mediaId }) => ({ comments: await listComments(mediaId) }),
});

