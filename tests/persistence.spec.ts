import { test, expect } from "@playwright/test";
import {
  clearOpenRouterApiKey,
  resetImageToolsPersistence,
  setOpenRouterApiKey,
} from "./playwright_helpers";
import { selectTool } from "./screenshots/screenshotHelpers";

const referenceFixture = "tests/fixtures/ref.svg";

test.describe("state persistence", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page);
  });

  test("restores history, auth, tool params, and model after reload", async ({ page }) => {
    test.setTimeout(20_000); // This test does a lot: uploads, opens dialogs, and reloads

    await clearOpenRouterApiKey(page);
    await setOpenRouterApiKey(page, "persist-test-key");

    await page.getByTestId("target-upload-input").setInputFiles(referenceFixture);

    await selectTool(page, "custom");

    await expect(page.getByTestId("reference-panel")).toBeVisible();
    await page.getByTestId("reference-upload-input-0").setInputFiles(referenceFixture);

    const promptLocator = page.getByTestId("input-prompt");
    const promptValue = "Make the background teal and add glowing stars.";
    await promptLocator.fill(promptValue);

    // The tool carries its own model and reasoning choice, both from the
    // picker on its card.
    const modelPicker = page.getByTestId("tool-model-picker-custom");
    await modelPicker.click();
    // Each item's accessible name is the model's description tooltip, so pick
    // it out by the name shown on it.
    await page.getByRole("menuitem").filter({ hasText: "Gemini 3 Pro Preview" }).click();

    await modelPicker.click();
    const reasoningSelect = page.getByTestId("tool-reasoning-custom");
    // Gemini 3 Pro names no initialReasoningLevel, so an untouched tool sits at
    // "Default" until the user picks a level.
    await expect(reasoningSelect).toHaveText(/Default/i);
    await reasoningSelect.click();
    await page.getByRole("option", { name: /^High$/i }).click();
    await page.keyboard.press("Escape");
    await expect(reasoningSelect).toBeHidden();

    const historyStrip = page.getByTestId("thumbnail-strip-history").first();
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(2);

    // Give the debounced persistence writer time to flush auth/model/params to IndexedDB.
    // (Persistence saves during idle time with a short debounce.)
    await page.waitForTimeout(2200);

    await page.reload();

    // Wait for the app to load and restore state
    const settingsButton = page.getByRole("button", { name: /^Settings\s+•/i }).first();
    await expect(settingsButton).toBeVisible();

    // Connection status is surfaced via the Settings button label.
    await expect(settingsButton).toHaveAttribute(
      "aria-label",
      /OpenRouter API key linked|OpenRouter connected via OAuth|OpenRouter key supplied by environment/i,
      { timeout: 5000 },
    );

    // Restoring image blobs from IndexedDB can be a bit slow on CI.
    await expect(page.getByAltText("Image to Edit")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("reference-slot-0").locator('img[alt="Reference"]')).toBeVisible({
      timeout: 15_000,
    });

    await expect(historyStrip.getByTestId("history-card")).toHaveCount(2);
    await expect(promptLocator).toHaveValue(promptValue);
    await expect(page.getByTestId("tool-model-picker-custom")).toHaveAttribute(
      "aria-label",
      /Gemini 3 Pro Preview/,
    );

    await page.getByTestId("tool-model-picker-custom").click();
    await expect(page.getByTestId("tool-reasoning-custom")).toHaveText(/High/i);
    await page.keyboard.press("Escape");
  });

  test("persists textarea size across reload", async ({ page }) => {
    test.setTimeout(25_000);

    await clearOpenRouterApiKey(page);
    await setOpenRouterApiKey(page, "persist-textarea-size-key");

    // Image Description (generate_image / prompt)
    await selectTool(page, "generate_image");
    const promptLocator = page.getByTestId("input-prompt");
    await expect(promptLocator).toBeVisible();
    await promptLocator.fill("A test prompt");

    await promptLocator.evaluate((el) => {
      (el as HTMLTextAreaElement).style.height = "120px";
      el.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });

    // Extra Instructions (change_style / extraInstructions)
    await selectTool(page, "change_style");
    const extraLocator = page.getByTestId("input-extraInstructions");
    await expect(extraLocator).toBeVisible();
    await extraLocator.fill("Extra instructions");

    await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="input-extraInstructions"]',
      ) as HTMLTextAreaElement | null;
      if (!el) throw new Error("Missing extraInstructions textarea");
      el.style.height = "160px";
      el.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });

    await page.reload();

    // Verify Extra Instructions height restored.
    await selectTool(page, "change_style");
    const restoredExtra = page.getByTestId("input-extraInstructions");
    await expect(restoredExtra).toBeVisible();
    const extraHeight = await restoredExtra.evaluate((el) =>
      Math.round(el.getBoundingClientRect().height),
    );
    expect(extraHeight).toBeGreaterThanOrEqual(140);

    // Switch back to Create an Image and verify prompt height restored.
    await selectTool(page, "generate_image");
    const restoredPrompt = page.getByTestId("input-prompt");
    const promptHeight = await restoredPrompt.evaluate((el) =>
      Math.round(el.getBoundingClientRect().height),
    );
    expect(promptHeight).toBeGreaterThanOrEqual(105);
  });
});
