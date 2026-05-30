import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

const HARNESS_ROUTE = "/?mode=bloom-harness";
const SEEDED_CURRENT_RESULT_ROUTE = "/?mode=bloom-harness&seed=current-result";

test.describe("Bloom host harness", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
  });

  test("loads the harness shell and exposes host controls", async ({ page }) => {
    await expect(page.getByTestId("bloom-host-status")).toContainText("Connected to Harness Book");
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await expect(page.locator('[data-testid^="book-image-outgoing-slot-"]')).toHaveCount(4);
    await expect(page.getByTestId("bloom-host-commit-book-images")).toBeDisabled();
    await expect(page.getByTestId("bloom-host-commit-current-result")).toHaveCount(0);

    const firstCurrentSlot = page.getByTestId("book-image-current-slot-book-image-1");
    const secondOutgoingSlot = page.getByTestId("book-image-outgoing-slot-book-image-2");
    const fromBox = await firstCurrentSlot.boundingBox();
    const toBox = await secondOutgoingSlot.boundingBox();
    expect(fromBox).toBeTruthy();
    expect(toBox).toBeTruthy();
    if (!fromBox || !toBox) return;

    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, {
      steps: 12,
    });
    await page.mouse.up();

    await expect(secondOutgoingSlot.locator("img").first()).toBeVisible();
    await expect(page.getByTestId("bloom-host-commit-book-images")).toBeEnabled();

    await page.getByTestId("bloom-host-commit-book-images").click();
    await expect(page.getByTestId("bloom-harness-commit-payload")).toContainText(
      '"incomingId": "book-image-2"',
    );

    await page.getByTestId("bloom-host-cancel").click();
    await expect(page.getByTestId("bloom-harness-cancelled")).toContainText("yes");
  });

  test("commits just the current result image from the result overlay", async ({ page }) => {
    await resetImageToolsPersistence(page, SEEDED_CURRENT_RESULT_ROUTE);
    await page.goto(SEEDED_CURRENT_RESULT_ROUTE);

    const commitCurrentButton = page.getByTestId("bloom-host-commit-current-result");
    await expect(commitCurrentButton).toBeVisible();

    await commitCurrentButton.click();

    await expect(page.getByTestId("bloom-harness-commit-payload")).toContainText(
      '"incomingId": "book-image-1"',
    );
    await expect(page.getByTestId("bloom-harness-commit-payload")).not.toContainText(
      '"incomingId": "book-image-2"',
    );
  });
});
