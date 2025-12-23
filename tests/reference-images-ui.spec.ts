import { test, expect } from "@playwright/test";

test("multi-reference tools keep one extra empty slot", async ({ page }) => {
  await page.goto("/");

  // Enable tools without requiring a real OpenRouter key.
  await page.getByTestId("openrouter-provide-key").click();
  await page.getByTestId("openrouter-key-input").fill("test-key");
  await page.getByTestId("openrouter-key-submit").click();

  // Select a tool that supports multiple optional references.
  await page.getByRole("button", { name: /New Image/i }).click();

  const slotLocator = page.locator('[data-testid^="reference-slot-"]');

  // With no references, there should be exactly one empty slot.
  await expect(slotLocator).toHaveCount(1);

  await page
    .getByTestId("reference-upload-input")
    .setInputFiles("tests/fixtures/ref.svg");

  // After adding one reference, we should have the filled slot + one empty slot.
  await expect(slotLocator).toHaveCount(2);
  await expect(
    page.getByTestId("reference-slot-0").locator('img[alt="Reference"]')
  ).toBeVisible();

  await page
    .getByTestId("reference-upload-input")
    .setInputFiles("tests/fixtures/ref.svg");

  // After adding a second reference, we should again have one extra empty slot.
  await expect(slotLocator).toHaveCount(3);

  // Removing a reference should collapse the list back down.
  await page
    .getByTestId("reference-slot-0")
    .getByRole("button", { name: /remove reference/i })
    .click();

  await expect(slotLocator).toHaveCount(2);
});
