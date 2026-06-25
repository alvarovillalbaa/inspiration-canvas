import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import { getOrCreateDefaultCanvas, listCanvasMedia } from "@/lib/db/repository";

async function main() {
  await fs.mkdir(path.join(process.cwd(), ".data", "uploads"), { recursive: true });
  const canvas = await getOrCreateDefaultCanvas();
  const media = await listCanvasMedia(canvas.id);
  console.log(`Seed complete. Canvas ${canvas.id} has ${media.length} media item(s).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
