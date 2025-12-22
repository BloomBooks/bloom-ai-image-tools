import { defineConfig, devices } from "@playwright/test";
import { inexpensive_model_for_testing } from "./tests/playwright_helpers";

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --host --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      E2E_OPENROUTER_API_KEY:
        process.env.BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
