import { defineConfig } from "@playwright/test";

if (!process.env.CANVAS_POSTGRES_BROWSER_REPORT || !process.env.CANVAS_POSTGRES_BROWSER_OUTPUT) {
  throw new Error("Owned PostgreSQL browser report/output paths are required.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "local-postgres.spec.ts",
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  globalTimeout: 300_000,
  expect: { timeout: 10_000 },
  reporter: [["line"], ["json", { outputFile: process.env.CANVAS_POSTGRES_BROWSER_REPORT }]],
  outputDir: process.env.CANVAS_POSTGRES_BROWSER_OUTPUT,
  preserveOutput: "never",
  use: {
    baseURL: "http://127.0.0.1:3100",
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    acceptDownloads: false,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false } },
    { name: "narrow-chromium", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false } },
  ],
});
