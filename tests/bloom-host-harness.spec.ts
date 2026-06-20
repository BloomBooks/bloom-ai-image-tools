import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

const HARNESS_ROUTE = "/?mode=bloom-harness";
const SEEDED_CURRENT_RESULT_ROUTE = "/?mode=bloom-harness&seed=current-result";
const STALE_REOPEN_ROUTE = "/?mode=bloom-harness&seed=stale-reopen";

test.describe("Bloom host harness", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
  });

  test("loads the harness shell and exposes host controls", async ({ page }) => {
    // Init completion is signalled by the Book Images strip rendering (the status
    // chip text is intentionally left blank in the shell).
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await expect(page.locator('[data-testid^="book-image-outgoing-slot-"]')).toHaveCount(5);
    await expect(page.getByTestId("bloom-host-commit-book-images")).toBeDisabled();
    await expect(page.getByTestId("bloom-host-commit-current-result")).toHaveCount(0);

    // The placeholder slot shows our own placeholder graphic (image_placeholder.svg,
    // which the bundler inlines as a data: URL), not the book's unservable placeHolder.png.
    const placeholderImg = page
      .getByTestId("book-image-current-slot-book-image-5")
      .locator("img")
      .first();
    await expect(placeholderImg).toHaveAttribute("src", /^data:image\/svg\+xml/);
    await expect(placeholderImg).not.toHaveAttribute("src", /placeHolder\.png/);

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

  test("commits every assigned book-image replacement at once", async ({ page }) => {
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();

    const dragCurrentOntoOutgoing = async (fromIncomingId: string, toIncomingId: string) => {
      const from = page.getByTestId(`book-image-current-slot-${fromIncomingId}`);
      const to = page.getByTestId(`book-image-outgoing-slot-${toIncomingId}`);
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
    };

    await dragCurrentOntoOutgoing("book-image-1", "book-image-2");
    await dragCurrentOntoOutgoing("book-image-3", "book-image-4");

    await page.getByTestId("bloom-host-commit-book-images").click();

    const payload = page.getByTestId("bloom-harness-commit-payload");
    await expect(payload).toContainText('"incomingId": "book-image-2"');
    await expect(payload).toContainText('"incomingId": "book-image-4"');
  });

  test("opens with the launched-on image in the Image to Edit slot", async ({ page }) => {
    // The harness init sets selectedBookImageId to book-image-3 (paper-cut-collage).
    const targetImg = page.getByTestId("target-panel").locator("img").first();
    await expect(targetImg).toHaveAttribute("src", /paper-cut/);
  });

  test("on reopen, refreshes originals from the book and clears replacements", async ({ page }) => {
    // Seeded prior-session state has a stale book-image-1 record and an assigned
    // replacement. The host must show the current book image and an empty outgoing slot.
    await page.goto(STALE_REOPEN_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();

    const current = page.getByTestId("book-image-current-slot-book-image-1").locator("img").first();
    // Fresh init image (retro-futurism) wins over the stale persisted record (paper-cut).
    await expect(current).toHaveAttribute("src", /retro-futurism/);
    await expect(current).not.toHaveAttribute("src", /paper-cut/);

    // The previously-assigned replacement is not restored: the outgoing slot is empty
    // and the commit button is disabled.
    await expect(
      page.getByTestId("book-image-outgoing-slot-book-image-1").locator("img"),
    ).toHaveCount(0);
    await expect(page.getByTestId("bloom-host-commit-book-images")).toBeDisabled();
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
