import { defineConfig, devices } from "@playwright/test";
import { inexpensive_model_for_testing } from "./tests/playwright_helpers";

// Each checkout that runs e2e needs its own dev server. Set E2E_PORT when another
// checkout or worktree already has `vp dev` on 3000. The server is never reused: a
// busy port fails the run instead of silently testing whatever app is listening there.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests",
  timeout: 10_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    headless: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 2_000,
    navigationTimeout: 10_000,
  },
  webServer: {
    command: `vp dev --host --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 10_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      E2E_OPENROUTER_API_KEY: process.env.BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS ?? "",
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
