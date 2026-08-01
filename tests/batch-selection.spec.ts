import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

// Covers WP3 of PLAN-batch-processing.md: the batch-selection UI (checkboxes on
// the hosted book-images strip, the action button / "Image to Edit" morph, and
// select-all). The batch *runner* (WP4) isn't implemented yet, so these specs
// never click the morphed button expecting a result — they only assert the UI
// state around ticking.
const HARNESS_ROUTE = "/?mode=bloom-harness";

const BATCH_TOOL_TITLE = "Custom Edit"; // tools-registry id "custom", allowBatch: true

const selectCustomEditTool = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: /Enhance/i }).click();
  await page.getByText(BATCH_TOOL_TITLE, { exact: true }).click();
};

const batchTickCheckbox = (page: import("@playwright/test").Page, incomingId: string) =>
  page.getByTestId(`batch-tick-${incomingId}`);

test.describe("batch selection UI", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
  });

  test("checkboxes only appear once an allowBatch tool is active", async ({ page }) => {
    // No tool selected yet: no batch checkboxes.
    await expect(page.locator('[data-testid^="batch-tick-"]')).toHaveCount(0);

    await selectCustomEditTool(page);

    // One checkbox per book image (including the placeholder slot, which is
    // rendered but disabled rather than hidden).
    await expect(page.locator('[data-testid^="batch-tick-"]')).toHaveCount(5);
  });

  test("the placeholder slot's checkbox is disabled and can't be ticked", async ({ page }) => {
    await selectCustomEditTool(page);

    const placeholderCheckbox = batchTickCheckbox(page, "book-image-5");
    await expect(placeholderCheckbox).toBeDisabled();

    // Clicking a disabled checkbox is a no-op; it stays unticked.
    await placeholderCheckbox.click({ force: true });
    await expect(placeholderCheckbox).not.toBeChecked();
  });

  test("ticking images morphs the action button and the Image to Edit panel", async ({ page }) => {
    await selectCustomEditTool(page);

    // Before any ticks: the normal single-image button and the launched-on
    // target image (book-image-3 / paper-cut) are showing.
    await expect(page.getByRole("button", { name: "Apply Changes", exact: true })).toBeVisible();
    const targetImg = page.getByTestId("target-panel").locator("img").first();
    await expect(targetImg).toHaveAttribute("src", /paper-cut/);

    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-2").click();

    // Custom Edit has no custom actionButtonLabel, so the generic wording applies.
    await expect(
      page.getByRole("button", { name: "Apply Changes to 2 Images", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("image-panel-empty-state-message")).toHaveText(
      "Will edit the 2 selected images",
    );
    // The single-image target image is no longer shown while ticked.
    await expect(page.getByTestId("target-panel").locator("img")).toHaveCount(0);

    // Clearing every tick restores the original target image and button label.
    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-2").click();

    await expect(page.getByRole("button", { name: "Apply Changes", exact: true })).toBeVisible();
    await expect(page.getByTestId("target-panel").locator("img").first()).toHaveAttribute(
      "src",
      /paper-cut/,
    );
  });

  test("a slot with an assigned replacement can't be ticked", async ({ page }) => {
    await selectCustomEditTool(page);

    // Drag book-image-1's current image onto book-image-2's replacement slot
    // (same gesture as tests/bloom-host-harness.spec.ts), giving book-image-2
    // an assigned replacement.
    const from = page.getByTestId("book-image-current-slot-book-image-1");
    const to = page.getByTestId("book-image-outgoing-slot-book-image-2");
    const fromBox = await from.boundingBox();
    const toBox = await to.boundingBox();
    expect(fromBox).toBeTruthy();
    expect(toBox).toBeTruthy();
    if (!fromBox || !toBox) return;
    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(to.locator("img").first()).toBeVisible();

    await expect(batchTickCheckbox(page, "book-image-2")).toBeDisabled();
    // Its neighbor without a replacement is still tickable.
    await expect(batchTickCheckbox(page, "book-image-1")).toBeEnabled();
  });
});
