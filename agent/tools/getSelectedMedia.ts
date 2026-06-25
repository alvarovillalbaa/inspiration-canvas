import { defineTool } from "eve/tools";
import { z } from "zod";

import { getMediaItem } from "@/lib/db/repository";

export default defineTool({
  description:
    "Fetch selected media records by ID. Use when the user has selected known items and the agent needs their metadata. Do NOT use to list an entire canvas. Side effects: read-only.",
  inputSchema: z.object({ mediaIds: z.array(z.string().min(1)).min(1) }),
  execute: async ({ mediaIds }) => ({
    mediaItems: (await Promise.all(mediaIds.map((mediaId) => getMediaItem(mediaId)))).filter(
      (item) => item != null,
    ),
  }),
});

