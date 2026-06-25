import "dotenv/config";

import { initializeDatabase } from "@/lib/db/client";
import { getOrCreateDefaultCanvas } from "@/lib/db/repository";

async function main() {
  await initializeDatabase();
  await getOrCreateDefaultCanvas();
  console.log("Database schema is ready.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
