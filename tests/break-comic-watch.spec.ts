import { test, expect } from "@playwright/test";
import { appendFileSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resetImageToolsPersistence, setOpenRouterApiKey } from "./playwright_helpers";

// Runs break-comic through the REAL UI with Gemini 3 Pro on the real poster,
// mirrors every "[break-comic]" console line to a log file (shared reality),
// then KEEPS THE BROWSER OPEN at the end so the result can be inspected by eye.

const here = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.resolve(here, "experiments", "ui-run.log");
const POSTER = "C:\\Users\\hatto\\Downloads\\bloom-ai-28rj0ng.png";
const API_KEY =
  process.env.SIL_BLOOM_DOCS_OPEN_ROUTER ||
  process.env.BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS ||
  "";

test("watch break-comic end to end (browser stays open)", async ({ page }) => {
  test.skip(!API_KEY, "no OpenRouter key available");
  test.setTimeout(2_000_000);

  writeFileSync(LOG, "");
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[break-comic]") || msg.type() === "error" || msg.type() === "warning") {
      appendFileSync(LOG, `[${msg.type()}] ${t}\n`);
    }
  });
  page.on("pageerror", (e) => appendFileSync(LOG, `[pageerror] ${e.message}\n`));

  await resetImageToolsPersistence(page);
  await page.goto("/");
  await setOpenRouterApiKey(page, API_KEY);

  await page.getByRole("button", { name: /^Model:/i }).click();
  await page.getByText("Gemini 3 Pro", { exact: false }).first().click();
  await page.getByRole("button", { name: /^OK$/ }).click();

  await page.getByRole("button", { name: "More" }).first().click();
  await page.locator('[data-tool-id="break_comic_into_images"]').click();
  await page.getByTestId("target-upload-input").setInputFiles(POSTER);
  await expect(page.getByTestId("target-panel").locator('img[alt="Original Comic"]')).toBeVisible();

  await page.getByRole("button", { name: /Break into Images/i }).click();

  await expect
    .poll(
      () => {
        try {
          return readFileSync(LOG, "utf8").includes("[break-comic] PIECES CREATED") ? 1 : 0;
        } catch {
          return 0;
        }
      },
      { timeout: 300_000, intervals: [1000] },
    )
    .toBe(1);

  appendFileSync(LOG, "=== DONE — browser staying open for inspection ===\n");

  // Keep the browser open so the human can look at the pieces / captions.
  await page.waitForTimeout(1_800_000);
});
