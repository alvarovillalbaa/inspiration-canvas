import "dotenv/config";

import { closeDatabase, initializeDatabase } from "@/lib/db/client";
import { getOrCreateDefaultCanvas } from "@/lib/db/repository";

async function main() {
  try {
    await initializeDatabase();
    await getOrCreateDefaultCanvas();
    console.log("Local PostgreSQL schema is ready.");
  } finally {
    await closeDatabase();
  }
}

main().catch(() => {
  console.error("Local database setup failed. Check the PostgreSQL configuration and database availability.");
  process.exitCode = 1;
});
