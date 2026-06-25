import { defineTool } from "eve/tools";
import { z } from "zod";

import { getMediaItem, listCanvasMedia } from "@/lib/db/repository";

function scoreSimilarity(aTags: string[], bTags: string[]): number {
  const a = new Set(aTags.map((tag) => tag.toLowerCase()));
  const b = new Set(bTags.map((tag) => tag.toLowerCase()));
  const overlap = [...a].filter((tag) => b.has(tag)).length;
  const union = new Set([...a, ...b]).size || 1;
  return overlap / union;
}

export default defineTool({
  description:
    "Find media similar to one reference using tags/category/analysis overlap. Use when a user asks for related references. Do NOT use for exact duplicate detection. Side effects: read-only.",
  inputSchema: z.object({
    canvasId: z.string().min(1),
    mediaId: z.string().min(1),
  }),
  execute: async ({ canvasId, mediaId }) => {
    const target = await getMediaItem(mediaId);
    const media = await listCanvasMedia(canvasId);
    if (!target) return { matches: [] };
    const matches = media
      .filter((item) => item.id !== target.id)
      .map((item) => ({
        media: item,
        score:
          scoreSimilarity(target.tagsJson, item.tagsJson) +
          (target.category && target.category === item.category ? 0.25 : 0),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return { matches };
  },
});

