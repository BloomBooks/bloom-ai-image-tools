import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

const referenceFixture = "tests/fixtures/ref.svg";

test.describe("state persistence", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page);
  });

  test("restores history, auth, tool params, and model after reload", async ({
    page,
  }) => {
    const clearKeyButton = page.getByTestId("openrouter-clear-key");
    if (
      (await clearKeyButton.count()) > 0 &&
      (await clearKeyButton.isEnabled())
    ) {
      await clearKeyButton.click();
    }

    await page.getByTestId("openrouter-provide-key").click();
    await page.getByTestId("openrouter-key-input").fill("persist-test-key");
    await page.getByTestId("openrouter-key-submit").click();

    await page
      .getByTestId("target-upload-input")
      .setInputFiles(referenceFixture);

    await page.getByRole("button", { name: /Custom Edit/i }).click();

    await expect(page.getByTestId("reference-panel")).toBeVisible();
    await page
      .getByTestId("reference-upload-input-0")
      .setInputFiles(referenceFixture);

    const promptLocator = page.getByTestId("input-prompt");
    const promptValue = "Make the background teal and add glowing stars.";
    await promptLocator.fill(promptValue);

    await page.getByRole("button", { name: /Model:/i }).click();
    await page.getByRole("button", { name: /GPT-5 Image Mini/i }).click();
    await page.getByRole("button", { name: /^OK$/i }).click();

    await expect(page.getByTestId("history-card")).toHaveCount(2);

    await page.reload();

    await expect(page.getByTestId("openrouter-status")).toHaveText(
      "Using stored OpenRouter key"
    );

    await expect(page.getByAltText("Image to Edit")).toBeVisible();
    await expect(
      page.getByTestId("reference-slot-0").locator('img[alt="Reference"]')
    ).toBeVisible();

    await expect(page.getByTestId("history-card")).toHaveCount(2);
    await expect(promptLocator).toHaveValue(promptValue);
    await expect(page.getByRole("button", { name: /Model:/i })).toHaveText(
      /GPT-5 Image Mini/
    );
  });
});
