import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

const HARNESS_ROUTE = "/?mode=bloom-harness";
const SEEDED_CURRENT_RESULT_ROUTE = "/?mode=bloom-harness&seed=current-result";
const STALE_REOPEN_ROUTE = "/?mode=bloom-harness&seed=stale-reopen";
// Launches on the harness's empty placeholder slot (book-image-5), as Bloom does when the
// user picks "Edit with AI..." on an image placeholder.
const EMPTY_SLOT_LAUNCH_ROUTE = "/?mode=bloom-harness&seed=empty-slot";

test.describe("Bloom host harness", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
  });

  test("loads the harness shell and exposes host controls", async ({ page }) => {
    // Init completion is signalled by the Book Images strip rendering (the status
    // chip text is intentionally left blank in the shell).
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await expect(page.locator('[data-testid^="book-image-outgoing-slot-"]')).toHaveCount(6);
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

    // Every slot says where it is in the book. Two of them are empty and show the same
    // graphic, so the label is the only thing that tells them apart.
    await expect(page.getByTestId("book-image-page-label-book-image-1")).toHaveText("Page 1");
    await expect(page.getByTestId("book-image-page-label-book-image-5")).toHaveText(
      "Page 5 - Canvas Background",
    );
    await expect(page.getByTestId("book-image-page-label-book-image-6")).toHaveText(
      "Page 5 - Image 1",
    );

    // The whole label has to be readable. "Page 5 - Canvas Background" is wider than a
    // thumbnail, so it must wrap and make its band taller rather than being cut off: the
    // tail is the part that tells one slot from another.
    const clipping = await page
      .getByTestId("book-image-page-label-book-image-5")
      .evaluate((element) => ({
        widthOverflow: element.scrollWidth - element.clientWidth,
        heightOverflow: element.scrollHeight - element.clientHeight,
        lines: Math.round(element.clientHeight / 14),
      }));
    expect(clipping.widthOverflow).toBeLessThanOrEqual(0);
    expect(clipping.heightOverflow).toBeLessThanOrEqual(0);
    expect(clipping.lines).toBeGreaterThan(1);

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

  test("an empty book slot cannot be dragged into Image to Edit", async ({ page }) => {
    // An empty slot holds no artwork, only our placeholder graphic. If the strip let the
    // user drag it into "Image to Edit", the AI would receive that graphic as if it were
    // the picture to work from (BL-16744).
    const targetPanel = page.getByTestId("target-panel");
    const targetImg = targetPanel.locator("img").first();
    await expect(targetImg).toHaveAttribute("src", /paper-cut/);

    const emptySlot = page.getByTestId("book-image-current-slot-book-image-5");
    const from = await emptySlot.boundingBox();
    const to = await targetPanel.boundingBox();
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    if (!from || !to) return;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();

    // The panel still holds the image it opened with.
    await expect(targetImg).toHaveAttribute("src", /paper-cut/);
    await expect(targetPanel.locator("img")).toHaveCount(1);
  });

  test("launched on an empty slot, opens Create an Image with nothing to edit", async ({
    page,
  }) => {
    // Bloom offers "Edit with AI..." on an image placeholder (BL-16744). There is no
    // image to edit, so the editor must not load the slot's placeholder graphic into the
    // "Image to Edit" panel; it opens the tool that makes an image from a description.
    await page.goto(EMPTY_SLOT_LAUNCH_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();

    // The Create an Image tool is the active one: its card only shows its action button
    // while it is selected, and the "More" group opens to reveal it.
    const createTool = page.locator('[data-tool-id="generate_image"]');
    await expect(createTool.getByRole("button", { name: "Generate Image" })).toBeVisible();

    // A "create" tool has no target panel at all, so the empty slot went nowhere near
    // "Image to Edit". The preceding test proves the panel does appear on a normal
    // launch, so its absence here is the empty-slot behavior, not a broken harness.
    await expect(page.getByTestId("target-panel")).toHaveCount(0);
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

  test("an image created for an empty slot commits back into that slot", async ({ page }) => {
    test.setTimeout(60_000);
    // The other half of BL-16744: the point of launching on an empty slot is to put the
    // created image there, so the result must carry that slot and "Use this Image" must
    // commit it to it. Without that the button never appears and the user has to drag
    // the result onto the strip by hand.
    await page.goto(EMPTY_SLOT_LAUNCH_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();

    // Create an Image is already the active tool; switch it to the local dummy model so
    // the generation runs without AI or a key.
    await page.getByTestId("tool-model-picker-generate_image").click();
    await page.getByText("Local Dummy (No AI)").click();
    await page.keyboard.press("Escape");

    await page.getByTestId("input-prompt").fill("A dummy picture for the empty slot");
    await page.getByRole("button", { name: /Generate Image/i }).click();

    const commitCurrentButton = page.getByTestId("bloom-host-commit-current-result");
    await expect(commitCurrentButton).toBeVisible({ timeout: 30_000 });
    await commitCurrentButton.click();

    const payload = page.getByTestId("bloom-harness-commit-payload");
    // book-image-5 is the harness's empty placeholder slot.
    await expect(payload).toContainText('"incomingId": "book-image-5"');
    await expect(payload).toContainText('"resultId"');
    // A created image is a new work: it must not inherit anyone's credits.
    await expect(payload).toContainText('"credits": null');
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

  // A narrow window is what makes these meaningful: the harness's six book
  // images then need more width than the strip has, so the launched one starts
  // out beyond the right-hand edge. `empty-slot` launches on book-image-5, far
  // enough along the strip to be off-screen at this width.
  test.describe("scrolling the launched book image into view", () => {
    test.use({ viewport: { width: 520, height: 720 } });

    /**
     * Geometry of the book-images strip: the item's box, and the box and scroll
     * state of the scroller it sits in. Found by walking up from the item to the
     * first overflowing ancestor, so no production markup exists just for tests.
     */
    const readStripGeometry = async (page: import("@playwright/test").Page, itemId: string) =>
      page.evaluate((id) => {
        const item = document.querySelector(`[data-strip-item-id="${id}"]`) as HTMLElement | null;
        let scroller = item?.parentElement ?? null;
        while (scroller && getComputedStyle(scroller).overflowX !== "auto") {
          scroller = scroller.parentElement;
        }
        if (!item || !scroller) {
          throw new Error(`Could not find the strip item ${id} or its scroller.`);
        }
        const itemBox = item.getBoundingClientRect();
        const scrollerBox = scroller.getBoundingClientRect();
        return {
          scrollLeft: scroller.scrollLeft,
          scrollWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth,
          itemLeft: itemBox.left,
          itemRight: itemBox.right,
          scrollerLeft: scrollerBox.left,
          scrollerRight: scrollerBox.right,
        };
      }, itemId);

    const scrollStripToStart = async (page: import("@playwright/test").Page, itemId: string) =>
      page.evaluate((id) => {
        const item = document.querySelector(`[data-strip-item-id="${id}"]`) as HTMLElement | null;
        let scroller = item?.parentElement ?? null;
        while (scroller && getComputedStyle(scroller).overflowX !== "auto") {
          scroller = scroller.parentElement;
        }
        if (!scroller) {
          throw new Error("Could not find the strip scroller.");
        }
        scroller.scrollLeft = 0;
      }, itemId);

    test("scrolls the launched book image into view on open", async ({ page }) => {
      await page.goto(EMPTY_SLOT_LAUNCH_ROUTE);
      await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
      await expect(page.locator('[data-strip-item-id="book-image-5"]')).toHaveCount(1);

      const geometry = await readStripGeometry(page, "book-image-5");

      // Sanity check: if everything already fitted, the assertions below would
      // pass without the strip having scrolled at all, proving nothing.
      expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
      expect(geometry.scrollLeft).toBeGreaterThan(0);

      // The launched item sits inside the visible part of the strip.
      expect(geometry.itemLeft).toBeGreaterThanOrEqual(geometry.scrollerLeft - 1);
      expect(geometry.itemRight).toBeLessThanOrEqual(geometry.scrollerRight + 1);
    });

    test("leaves the strip where the user later scrolled it", async ({ page }) => {
      await page.goto(EMPTY_SLOT_LAUNCH_ROUTE);
      await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
      await expect(page.locator('[data-strip-item-id="book-image-5"]')).toHaveCount(1);
      expect((await readStripGeometry(page, "book-image-5")).scrollLeft).toBeGreaterThan(0);

      // The user scrolls back to the start to look at the first images.
      await scrollStripToStart(page, "book-image-5");
      expect(await readStripGeometry(page, "book-image-5")).toMatchObject({ scrollLeft: 0 });

      // Anything that re-renders the strip must not drag it back to the
      // launched image. Picking a different book image and typing a prompt are
      // the everyday cases; the prompt's value confirms a re-render really
      // happened, so a passing result here is not just a test that did nothing.
      await page.getByTestId("book-image-current-slot-book-image-1").click();
      await page.getByTestId("input-prompt").fill("a goat");
      await expect(page.getByTestId("input-prompt")).toHaveValue("a goat");

      expect((await readStripGeometry(page, "book-image-5")).scrollLeft).toBe(0);
    });
  });
});
