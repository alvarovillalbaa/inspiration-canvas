import { defineTool } from "eve/tools";
import { z } from "zod";

import { proposeChildMediaPrompt } from "@/lib/ai/service";
import { getMediaItem } from "@/lib/db/repository";

export default defineTool({
  description:
    "Generate a child-media prompt from selected references. Use when the user wants a prompt but has not approved generation yet. Do NOT use to create media. Side effects: AI call only, no persistent mutation.",
  inputSchema: z.object({
    mediaIds: z.array(z.string().min(1)).min(2),
    userPrompt: z.string().optional(),
  }),
  execute: async ({ mediaIds, userPrompt }) => {
    const mediaItems = (
      await Promise.all(mediaIds.map((mediaId) => getMediaItem(mediaId)))
    ).filter((item) => item != null);
    return {
      prompt: await proposeChildMediaPrompt({ mediaItems, userPrompt }),
    };
  },
});

