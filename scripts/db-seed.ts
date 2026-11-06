import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import { getConfig } from "@/lib/config";
import { closeDatabase } from "@/lib/db/client";
import { getOrCreateDefaultCanvas, listCanvasMedia } from "@/lib/db/repository";

async function main() {
  try {
    const canvas = await getOrCreateDefaultCanvas();
    const media = await listCanvasMedia(canvas.id);
    await fs.mkdir(path.resolve(getConfig().uploadDir), { recursive: true });
    console.log(`Seed complete. Canvas ${canvas.id} has ${media.length} media item(s).`);
  } finally {
    await closeDatabase();
  }
}

main().catch(() => {
  console.error("Local database seed failed. Check the PostgreSQL configuration and database availability.");
  process.exitCode = 1;
});
