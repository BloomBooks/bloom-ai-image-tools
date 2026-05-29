import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

const HARNESS_ROUTE = "/?mode=bloom-harness";

test.describe("Bloom host harness", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
  });

  test("loads the harness shell and exposes host controls", async ({ page }) => {
    await expect(page.getByTestId("bloom-host-status")).toContainText("Connected to Harness Book");
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await expect(page.locator('[data-testid^="book-image-outgoing-slot-"]')).toHaveCount(4);

    await page.getByTestId("bloom-host-commit").click();
    await expect(page.getByTestId("bloom-harness-commit-payload")).toContainText("[]");

    await page.getByTestId("bloom-host-cancel").click();
    await expect(page.getByTestId("bloom-harness-cancelled")).toContainText("yes");
  });
});
