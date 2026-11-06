import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/postgres.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    allowOnly: false,
    retry: 0,
    testTimeout: 10000,
    hookTimeout: 20000,
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
