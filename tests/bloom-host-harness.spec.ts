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
    // With no replacement assigned yet, the strip shows the explanatory tip in
    // place of the Replace button (one or the other, never both).
    await expect(page.getByTestId("bloom-host-commit-book-images-tip")).toBeVisible();
    await expect(page.getByTestId("bloom-host-commit-book-images")).toHaveCount(0);
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
    await expect(page.getByTestId("bloom-host-commit-book-images")).toBeVisible();

    await page.getByTestId("bloom-host-commit-book-images").click();
    await expect(page.getByTestId("bloom-harness-commit-payload")).toContainText(
      '"incomingId": "book-image-2"',
    );
    // The reused image is book-image-1, which the host supplied with credits:
    // they ride along on the replacement.
    await expect(page.getByTestId("bloom-harness-commit-payload")).toContainText(
      '"creator": "Ada Artist"',
    );

    await page.getByTestId("bloom-host-cancel").click();
    await expect(page.getByTestId("bloom-harness-cancelled")).toContainText("yes");
  });

  test("commits every assigned book-image replacement at once", async ({ page }) => {
    test.setTimeout(30_000);
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
    // An uncredited image (book-image-2) into a slot: its replacement must
    // carry credits: null, NOT the target slot's old credits.
    await dragCurrentOntoOutgoing("book-image-2", "book-image-5");

    await page.getByTestId("bloom-host-commit-book-images").click();

    const payload = page.getByTestId("bloom-harness-commit-payload");
    await expect(payload).toContainText('"incomingId": "book-image-2"');
    await expect(payload).toContainText('"incomingId": "book-image-4"');
    // Each reused book image carries its own credits (or explicit null).
    await expect(payload).toContainText('"creator": "Ada Artist"');
    await expect(payload).toContainText('"creator": "Pat Papercut"');
    await expect(payload).toContainText('"credits": null');
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

    // The previously-assigned replacement is not restored: the outgoing slot is
    // empty and the Replace button hasn't appeared (the tip shows instead).
    await expect(
      page.getByTestId("book-image-outgoing-slot-book-image-1").locator("img"),
    ).toHaveCount(0);
    await expect(page.getByTestId("bloom-host-commit-book-images-tip")).toBeVisible();
    await expect(page.getByTestId("bloom-host-commit-book-images")).toHaveCount(0);
  });

  test("on reopen, the Result pane starts empty even if a prior result was persisted", async ({
    page,
  }) => {
    // In host mode each launch starts fresh: the previous session's result is
    // not restored into the Result pane, so its commit button never appears.
    // (Committing a live current result is covered by the edit-credits test.)
    await resetImageToolsPersistence(page, SEEDED_CURRENT_RESULT_ROUTE);
    await page.goto(SEEDED_CURRENT_RESULT_ROUTE);

    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await expect(page.getByTestId("bloom-host-commit-current-result")).toHaveCount(0);
  });

  test("an edit carries the source book image's credits onto the committed result", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // The harness launches on book-image-3, which the host supplied with credits.
    const targetImg = page.getByTestId("target-panel").locator("img").first();
    await expect(targetImg).toHaveAttribute("src", /paper-cut/);

    // Select the Custom Edit tool (inside the collapsed "Enhance" section) and
    // switch it to the local dummy model so the "edit" runs without AI or a key.
    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Custom Edit", { exact: true }).click();
    await page.getByTestId("tool-model-picker-custom").click();
    await page.getByText("Local Dummy (No AI)").click();
    await page.keyboard.press("Escape");

    await page.getByTestId("input-prompt").fill("Add a dummy banner");
    await page.getByRole("button", { name: /Apply Changes/i }).click();

    // The result lands assigned to the launched-on slot; commit just it.
    const commitCurrentButton = page.getByTestId("bloom-host-commit-current-result");
    await expect(commitCurrentButton).toBeVisible({ timeout: 30_000 });
    await commitCurrentButton.click();

    const payload = page.getByTestId("bloom-harness-commit-payload");
    await expect(payload).toContainText('"incomingId": "book-image-3"');
    await expect(payload).toContainText('"resultId"');
    // The generated result inherited its edit source's credits.
    await expect(payload).toContainText('"creator": "Pat Papercut"');
  });

  test("hides the dummy model when the host does not enable developer tools", async ({ page }) => {
    // A host that is NOT in developer mode (init without showDeveloperTools —
    // simulated via ?devtools=off) must not offer the "Local Dummy (No AI)"
    // model, even though the editor is served from localhost.
    await page.goto("/?mode=bloom-harness&devtools=off");
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();

    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Custom Edit", { exact: true }).click();
    await page.getByTestId("tool-model-picker-custom").click();

    // The menu is open (it lists real models) but the dummy is absent.
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    await expect(page.getByText("Local Dummy (No AI)")).toHaveCount(0);
  });
});
