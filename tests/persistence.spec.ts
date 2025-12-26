import { test, expect } from "@playwright/test";
import {
  clearOpenRouterApiKey,
  resetImageToolsPersistence,
  setOpenRouterApiKey,
} from "./playwright_helpers";

const referenceFixture = "tests/fixtures/ref.svg";

test.describe("state persistence", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page);
  });

  test("restores history, auth, tool params, and model after reload", async ({
    page,
  }) => {
    test.setTimeout(20_000); // This test does a lot: uploads, opens dialogs, and reloads

    await clearOpenRouterApiKey(page);
    await setOpenRouterApiKey(page, "persist-test-key");

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

    // Wait for dialog to open
    const modelOption = page.getByRole("button", { name: /GPT-5 Image Mini/i });
    await expect(modelOption).toBeVisible();
    await modelOption.click();

    const okButton = page.getByRole("button", { name: /^OK$/i });
    await expect(okButton).toBeVisible();
    await okButton.click();

    // Wait for dialog to close
    await expect(okButton).not.toBeVisible();

    const historyStrip = page.getByTestId("thumbnail-strip-history").first();
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(2);

    await page.reload();

    // Wait for the app to load and restore state
    const settingsButton = page
      .getByRole("button", { name: /^Settings\s+•/i })
      .first();
    await expect(settingsButton).toBeVisible();

    // Connection status is surfaced via the Settings button label.
    await expect(settingsButton).toHaveAttribute(
      "aria-label",
      /OpenRouter API key linked|OpenRouter connected via OAuth|OpenRouter key supplied by environment/i,
      { timeout: 5000 }
    );

    await expect(page.getByAltText("Image to Edit")).toBeVisible();
    await expect(
      page.getByTestId("reference-slot-0").locator('img[alt="Reference"]')
    ).toBeVisible();

    await expect(historyStrip.getByTestId("history-card")).toHaveCount(2);
    await expect(promptLocator).toHaveValue(promptValue);
    await expect(page.getByRole("button", { name: /Model:/i })).toHaveText(
      /GPT-5 Image Mini/
    );
  });
});
