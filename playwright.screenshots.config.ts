// Playwright config for `pnpm screenshots:capture`: the Crowdin screenshot scenes in
// tests/screenshots/. Kept apart from playwright.config.ts so `pnpm e2e` never runs them and so
// they can run headless with a single worker (the harness dev server misbehaves under parallel
// workers; see PAPERCUTS.md).
import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  testDir: "tests/screenshots",
  testMatch: /.*\.screenshots\.ts/,
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  // The dev server hot-reloads the page whenever a file changes; one retry rides that out.
  retries: 1,
  reporter: "list",
  outputDir: "test-results/screenshots",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 800 },
    // DOM rectangles and PNG pixels are then the same numbers.
    deviceScaleFactor: 1,
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
  },
  webServer: base.webServer,
});
