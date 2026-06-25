import { defineTool } from "eve/tools";
import { z } from "zod";

import { listCanvasMedia as listCanvasMediaRecords } from "@/lib/db/repository";

export default defineTool({
  description:
    "List media items on a canvas. Use when the agent needs the current canvas inventory. Do NOT use for fetching a specific known media item. Side effects: read-only.",
  inputSchema: z.object({ canvasId: z.string().min(1) }),
  execute: async ({ canvasId }) => ({
    mediaItems: await listCanvasMediaRecords(canvasId),
  }),
});

