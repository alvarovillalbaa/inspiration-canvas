import { defineTool } from "eve/tools";
import { z } from "zod";

import { createAgentApproval, getMediaItem } from "@/lib/db/repository";

function getArrangement(
  mediaIds: string[],
  strategy: "grid" | "cluster" | "timeline",
): Array<{ id: string; x: number; y: number }> {
  const gap = strategy === "cluster" ? 36 : 72;
  const columns = strategy === "timeline" ? mediaIds.length : Math.ceil(Math.sqrt(mediaIds.length));
  return mediaIds.map((id, index) => ({
    id,
    x: 240 + (index % columns) * (320 + gap),
    y: 180 + Math.floor(index / columns) * (260 + gap),
  }));
}

export default defineTool({
  description:
    "Propose moving selected media into an arrangement. Use when selected items should be grouped spatially. Do NOT use to change metadata. Side effects: creates an approval request; it does not move items directly.",
  inputSchema: z.object({
    canvasId: z.string().min(1),
    mediaIds: z.array(z.string().min(1)).min(1),
    strategy: z.enum(["grid", "cluster", "timeline"]).default("grid"),
  }),
  approval: () => true,
  execute: async ({ canvasId, mediaIds, strategy }) => {
    const existing = (
      await Promise.all(mediaIds.map((mediaId) => getMediaItem(mediaId)))
    ).filter((item) => item != null);
    const positions = getArrangement(
      existing.map((item) => item.id),
      strategy,
    );
    return {
      approval: await createAgentApproval({
        toolName: "autoArrangeMedia",
        canvasId,
        mediaIds,
        payload: { canvasId, mediaIds, strategy, positions },
      }),
      positions,
    };
  },
});

