import { defineConfig, devices } from "@playwright/test";
import { inexpensive_model_for_testing } from "./tests/playwright_helpers";

export default defineConfig({
  testDir: "tests",
  timeout: 10_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 2_000,
    navigationTimeout: 3_000,
  },
  webServer: {
    command: "corepack pnpm dev --host --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 10_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      E2E_OPENROUTER_API_KEY:
        process.env.BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS,
      // Ensure E2E runs against an inexpensive model, regardless of the UI default.
      VITE_OPENROUTER_IMAGE_MODEL: inexpensive_model_for_testing,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
