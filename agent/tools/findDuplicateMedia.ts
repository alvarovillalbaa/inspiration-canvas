import { defineTool } from "eve/tools";
import { z } from "zod";

import { listCanvasMedia } from "@/lib/db/repository";

export default defineTool({
  description:
    "Find likely duplicate media on a canvas using file metadata and storage keys. Use when the user asks to clean repeated references. Do NOT use for style similarity. Side effects: read-only.",
  inputSchema: z.object({ canvasId: z.string().min(1) }),
  execute: async ({ canvasId }) => {
    const media = await listCanvasMedia(canvasId);
    const groups = new Map<string, typeof media>();
    for (const item of media) {
      const key = `${item.fileName}:${item.sizeBytes}:${item.mimeType}`;
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return {
      duplicateGroups: [...groups.values()].filter((group) => group.length > 1),
    };
  },
});

