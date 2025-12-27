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

    // Give the debounced persistence writer time to flush auth/model/params to IndexedDB.
    // (Persistence saves during idle time with a short debounce.)
    await page.waitForTimeout(2200);

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

    // Restoring image blobs from IndexedDB can be a bit slow on CI.
    await expect(page.getByAltText("Image to Edit")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByTestId("reference-slot-0").locator('img[alt="Reference"]')
    ).toBeVisible({ timeout: 15_000 });

    await expect(historyStrip.getByTestId("history-card")).toHaveCount(2);
    await expect(promptLocator).toHaveValue(promptValue);
    await expect(page.getByRole("button", { name: /Model:/i })).toHaveText(
      /GPT-5 Image Mini/
    );
  });


  test("persists textarea size across reload", async ({ page }) => {
    test.setTimeout(25_000);

    await clearOpenRouterApiKey(page);
    await setOpenRouterApiKey(page, "persist-textarea-size-key");

    // Image Description (generate_image / prompt)
    await page.getByRole("button", { name: /Create an Image/i }).click();
    const promptLocator = page.getByTestId("input-prompt");
    await expect(promptLocator).toBeVisible();
    await promptLocator.fill("A test prompt");

    await promptLocator.evaluate((el) => {
      (el as HTMLTextAreaElement).style.height = "120px";
      el.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });

    // Extra Instructions (enhance_drawing / extraInstructions)
    await page.getByRole("button", { name: /Enhance Line Drawing/i }).click();
    const extraLocator = page.getByTestId("input-extraInstructions");
    await expect(extraLocator).toBeVisible();
    await extraLocator.fill("Extra instructions");

    await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="input-extraInstructions"]'
      ) as HTMLTextAreaElement | null;
      if (!el) throw new Error("Missing extraInstructions textarea");
      el.style.height = "160px";
      el.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });

    await page.reload();

    // Verify Extra Instructions height restored.
    await page.getByRole("button", { name: /Enhance Line Drawing/i }).click();
    const restoredExtra = page.getByTestId("input-extraInstructions");
    await expect(restoredExtra).toBeVisible();
    const extraHeight = await restoredExtra.evaluate((el) =>
      Math.round(el.getBoundingClientRect().height)
    );
    expect(extraHeight).toBeGreaterThanOrEqual(140);

    // Switch back to Create an Image and verify prompt height restored.
    await page.getByRole("button", { name: /Create an Image/i }).click();
    const restoredPrompt = page.getByTestId("input-prompt");
    const promptHeight = await restoredPrompt.evaluate((el) =>
      Math.round(el.getBoundingClientRect().height)
    );
    expect(promptHeight).toBeGreaterThanOrEqual(105);
  });
});
