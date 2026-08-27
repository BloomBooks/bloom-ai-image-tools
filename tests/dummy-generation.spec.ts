import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

// What the Local Dummy draws on a generated (no-source) image. A generation's
// composed prompt is paragraphs long, so painting it filled the whole picture
// with text; the dummy now draws the target slot's label when there is one and
// a labelless stick person otherwise. The `__bloomDummyLastText` window hook
// (services/openRouterService.ts) records what the last dummy call drew, which
// is what makes the "drew nothing" case assertable.
const HARNESS_ROUTE = "/?mode=bloom-harness";

test.describe("local dummy generation text", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 100;
    });
  });

  test("Create an Image with no target slot draws no text (stick person, not the prompt)", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByText("Create an Image", { exact: true }).click();
    await page.getByTestId("tool-model-picker-generate_image").click();
    await page.getByText("Local Dummy (No AI)").click();
    await page.keyboard.press("Escape");

    const card = page.locator('[data-tool-id="generate_image"]');
    await card.locator("textarea").first().fill("a red hen");
    await card.getByRole("button", { name: /Generate Image/i }).click();

    const resultImage = page.getByTestId("result-panel").locator("img").first();
    await expect(resultImage).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      const lastText = await page.evaluate(() => (window as any).__bloomDummyLastText);
      expect(lastText).toBeNull();
    }).toPass({ timeout: 10_000 });
  });

  test("an edit on a book slot still draws the slot's label", async ({ page }) => {
    test.setTimeout(30_000);
    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Custom Edit", { exact: true }).click();
    await page.getByTestId("tool-model-picker-custom").click();
    await page.getByText("Local Dummy (No AI)").click();
    await page.keyboard.press("Escape");

    await page.getByTestId("input-prompt").fill("brighten it");
    await page.getByRole("button", { name: "Apply Changes", exact: true }).click();

    const resultImage = page.getByTestId("result-panel").locator("img").first();
    await expect(resultImage).toBeVisible({ timeout: 15_000 });
    const lastText = await page.evaluate(() => (window as any).__bloomDummyLastText);
    expect(lastText).not.toBeNull();
    expect(lastText.length).toBeLessThan(80); // a label, never a composed prompt
  });
});
