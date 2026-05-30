import { test, expect } from "@playwright/test";
import {
  resetImageToolsPersistence,
  setOpenRouterApiKey,
  SAMPLE_IMAGE_PATH,
} from "./playwright_helpers";

test("extract cast of characters with split-into-separate-files (dummy model)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const logs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (text.includes("ExtractCast/debug") || msg.type() === "error" || msg.type() === "warning") {
      // eslint-disable-next-line no-console
      console.log(`BROWSER_${msg.type().toUpperCase()}:`, text);
    }
  });
  page.on("pageerror", (err) => {
    // eslint-disable-next-line no-console
    console.log("PAGEERR:", err.message);
  });

  await resetImageToolsPersistence(page);
  await page.goto("/");
  await setOpenRouterApiKey(page, "dummy-test-key");

  // Open model chooser and pick the local dummy model.
  await page.getByRole("button", { name: /^Model:/i }).click();
  const dummyCard = page.getByText("Local Dummy Extract Cast").first();
  await expect(dummyCard).toBeVisible({ timeout: 5000 });
  await dummyCard.click();
  await page.getByRole("button", { name: /^OK$/ }).click();

  // Expand "Localize Images" section if collapsed.
  const localizeHeader = page.getByRole("button", { name: /Localize Images/i }).first();
  if (await localizeHeader.count()) {
    await localizeHeader.click().catch(() => {});
  }

  // Select "Extract Cast of Characters" tool by title (this reveals reference panel).
  await page.getByText("1) Extract Cast of Characters", { exact: false }).click();

  // Upload a reference image.
  await page.getByTestId("reference-upload-input-0").setInputFiles(SAMPLE_IMAGE_PATH);
  await expect(page.getByTestId("reference-slot-0").locator('img[alt="Reference"]')).toBeVisible();

  // Check "Split into separate files".
  const splitCheckbox = page.getByTestId("input-splitIntoSeparateFiles");
  await expect(splitCheckbox).toBeVisible();
  if (!(await splitCheckbox.isChecked())) {
    await splitCheckbox.check();
  }
  await expect(splitCheckbox).toBeChecked();

  // Click Extract Characters.
  await page.getByRole("button", { name: /Extract Characters/i }).click();

  // Wait for processing to finish (look for non-cancel state) or until our debug logs arrive.
  await expect
    .poll(() => logs.filter((l) => l.includes("extractDerivedImageItems result")).length, {
      timeout: 120_000,
      intervals: [500],
    })
    .toBeGreaterThan(0);

  // Dump all relevant debug logs to the test stdout.
  const debugLogs = logs.filter((l) => l.includes("ExtractCast/debug"));
  // eslint-disable-next-line no-console
  console.log("\n=========== DEBUG LOGS ===========");
  for (const line of debugLogs) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
  // eslint-disable-next-line no-console
  console.log("==================================\n");
});
