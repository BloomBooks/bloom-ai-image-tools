import { test, expect } from "@playwright/test";
import {
  resetImageToolsPersistence,
  uploadImageToTarget,
  ALT_SAMPLE_IMAGE_PATH,
  uploadSampleImageToTarget,
} from "./playwright_helpers";

const isVerbose = !!process.env.E2E_VERBOSE;

const activateHistoryStrip = async (page: import("@playwright/test").Page) => {
  await page.getByTestId("thumbnail-tab-history").click();
  const historyStrip = page.getByTestId("thumbnail-strip-history").first();
  await expect(historyStrip).toHaveAttribute("data-active", "true");
  return historyStrip;
};

test.describe("thumbnail strips", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ navigationTimeout: 20_000, actionTimeout: 10_000 });
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    if (isVerbose) {
      await page.addInitScript(() => {
        (window as any).__E2E_VERBOSE = true;
      });

      page.on("console", (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
      page.on("pageerror", (error) => console.log(`[pageerror] ${error?.message ?? error}`));
      page.on("requestfailed", (request) =>
        console.log(
          `[requestfailed] ${request.method()} ${request.url()} (${request.failure()?.errorText})`,
        ),
      );
    }

    await resetImageToolsPersistence(page);
    await page.goto("/");
    await uploadSampleImageToTarget(page);

    if (isVerbose) {
      await page.evaluate(() => {
        const formatTypes = (dt: DataTransfer | null) => {
          if (!dt) return [];
          try {
            return Array.from(dt.types || []);
          } catch {
            return [];
          }
        };

        const logDt = (label: string, event: DragEvent) => {
          const dt = event.dataTransfer;
          const types = formatTypes(dt);
          let plain = "";
          let internal = "";
          let pointInfo = "";
          try {
            plain = dt?.getData("text/plain") || "";
            internal = dt?.getData("application/x-bloom-image-id") || "";
          } catch {
            // ignore
          }

          try {
            const x = (event as unknown as { clientX?: number }).clientX ?? 0;
            const y = (event as unknown as { clientY?: number }).clientY ?? 0;
            const el = document.elementFromPoint(x, y) as HTMLElement | null;
            const elTestId =
              el?.getAttribute("data-testid") ||
              el?.closest("[data-testid]")?.getAttribute("data-testid") ||
              "";
            const elStripId = el?.closest("[data-strip-id]")?.getAttribute("data-strip-id") || "";
            const elTag = el?.tagName?.toLowerCase() || "";
            pointInfo = ` @(${x},${y}) el=${elTag}${elTestId ? ` testid=${elTestId}` : ""}${elStripId ? ` elStrip=${elStripId}` : ""}`;
          } catch {
            // ignore
          }
          const strip = (event.target as HTMLElement | null)?.closest("[data-strip-id]");
          console.log(
            `[dnd] ${label} strip=${strip?.getAttribute("data-strip-id") || "?"} defaultPrevented=${event.defaultPrevented} types=${JSON.stringify(types)} text/plain=${plain} internal=${internal}${pointInfo}`,
          );
        };

        document.addEventListener("dragenter", (event) => {
          logDt("dragenter", event as DragEvent);
        });
        document.addEventListener("dragover", (event) => {
          logDt("dragover", event as DragEvent);
        });

        document.addEventListener("dragstart", (event) => {
          logDt("dragstart(bubble)", event as DragEvent);
          queueMicrotask(() => logDt("dragstart(after)", event as DragEvent));
        });

        document.addEventListener("drop", (event) => {
          logDt("drop(bubble)", event as DragEvent);
          queueMicrotask(() => logDt("drop(after)", event as DragEvent));
        });
        document.addEventListener("dragend", (event) => {
          logDt("dragend", event as DragEvent);
        });
      });
    }
  });

  test("switches the active strip when selecting tabs", async ({ page }) => {
    const bookImagesStrip = page.getByTestId("thumbnail-strip-bookImages").first();
    const historyStrip = page.getByTestId("thumbnail-strip-history").first();
    const starredStrip = page.getByTestId("thumbnail-strip-starred").first();
    await expect(bookImagesStrip).toHaveAttribute("data-active", "true");
    await expect(historyStrip).toHaveAttribute("data-active", "false");
    await expect(starredStrip).toHaveAttribute("data-active", "false");

    const stripTabs = page.locator(
      'button[data-testid^="thumbnail-tab-"]:not([data-testid*="pin-"])',
    );
    await expect(stripTabs.first()).toHaveAttribute("data-testid", "thumbnail-tab-bookImages");

    await page.getByTestId("thumbnail-tab-reference").click();

    const referenceStrip = page.getByTestId("thumbnail-strip-reference");
    await expect(referenceStrip).toHaveAttribute("data-active", "true");
    await expect(starredStrip).toHaveAttribute("data-active", "false");
  });

  test("allows pinning and unpinning strips", async ({ page }) => {
    const starPin = page.getByTestId("thumbnail-tab-pin-starred");

    await expect(page.locator('[data-strip-id="starred"][data-pinned="false"]')).toHaveCount(1);

    await starPin.click();

    await expect(page.locator('[data-strip-id="starred"][data-pinned="true"]')).toHaveCount(1);
    await expect(page.locator('[data-strip-id="starred"][data-pinned="false"]')).toHaveCount(0);

    await starPin.click();

    await expect(page.locator('[data-strip-id="starred"][data-pinned="true"]')).toHaveCount(0);
    await expect(page.locator('[data-strip-id="starred"][data-pinned="false"]')).toHaveCount(1);
  });

  test("copies history entries when dragged between strips", async ({ page }) => {
    const historyStrip = await activateHistoryStrip(page);
    await page.getByTestId("thumbnail-tab-pin-starred").click();
    const starredStrip = page.getByTestId("thumbnail-strip-starred").first();
    const historyThumb = historyStrip.getByTestId("thumbnail-strip-item-history").first();

    const from = await historyThumb.boundingBox();
    const to = await starredStrip.boundingBox();
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    if (!from || !to) return;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 12,
    });
    await page.mouse.up();

    await expect(starredStrip.getByTestId("history-card")).toHaveCount(1);
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(1);
  });

  test("disables deleting history entries that also exist in another strip", async ({ page }) => {
    const historyStrip = await activateHistoryStrip(page);
    const starredTab = page.getByTestId("thumbnail-tab-starred");
    const starredStrip = page.getByTestId("thumbnail-strip-starred");

    const firstHistoryCard = historyStrip.getByTestId("history-card").first();
    await firstHistoryCard.hover();
    await firstHistoryCard.locator('button[title="Star image"]').click();

    await starredTab.click();
    await expect(starredStrip.getByTestId("history-card")).toHaveCount(1);

    await page.getByTestId("thumbnail-tab-history").click();

    const deleteActionWrapper = firstHistoryCard.locator(
      'span[aria-label="Cannot delete this image because it also exists in the Starred strip."]',
    );
    const deleteActionContainer = deleteActionWrapper.locator("..");
    await expect(deleteActionContainer).toHaveCSS("opacity", "0");

    await firstHistoryCard.hover();
    await expect(deleteActionContainer).toHaveCSS("opacity", "1");

    const deleteButton = firstHistoryCard.getByRole("button", {
      name: /Cannot delete this image because it also exists in the Starred strip\./,
    });
    await expect(deleteButton).toBeDisabled();

    await deleteActionWrapper.hover();
    await expect(page.getByRole("tooltip")).toContainText(
      "Cannot delete this image because it also exists in the Starred strip.",
    );
  });

  test("shows newest history item first", async ({ page }) => {
    const historyStrip = await activateHistoryStrip(page);

    const initialTargetSrc = await page
      .getByRole("img", { name: "Image to Edit" })
      .getAttribute("src");
    expect(initialTargetSrc).toBeTruthy();

    await uploadImageToTarget(page, ALT_SAMPLE_IMAGE_PATH);

    const newTargetImage = page.getByRole("img", { name: "Image to Edit" });
    await expect(newTargetImage).toBeVisible();

    await expect
      .poll(async () => newTargetImage.getAttribute("src"), {
        timeout: 5000,
      })
      .not.toEqual(initialTargetSrc);

    const updatedTargetSrc = await newTargetImage.getAttribute("src");
    expect(updatedTargetSrc).toBeTruthy();

    const firstHistoryThumbImg = historyStrip
      .getByTestId("history-card")
      .first()
      .locator("img")
      .first();

    await expect(firstHistoryThumbImg).toBeVisible();
    const firstThumbSrc = await firstHistoryThumbImg.getAttribute("src");
    expect(firstThumbSrc).toEqual(updatedTargetSrc);
  });

  test("allows reordering history items", async ({ page }) => {
    const historyStrip = await activateHistoryStrip(page);

    const initialTargetSrc = await page
      .getByRole("img", { name: "Image to Edit" })
      .getAttribute("src");
    expect(initialTargetSrc).toBeTruthy();

    await uploadImageToTarget(page, ALT_SAMPLE_IMAGE_PATH);

    const firstHistoryCard = historyStrip.getByTestId("history-card").nth(0);
    const secondHistoryCard = historyStrip.getByTestId("history-card").nth(1);

    await expect(firstHistoryCard).toBeVisible();
    await expect(secondHistoryCard).toBeVisible();

    const firstSrcBefore = await firstHistoryCard.locator("img").first().getAttribute("src");
    const secondSrcBefore = await secondHistoryCard.locator("img").first().getAttribute("src");
    expect(firstSrcBefore).toBeTruthy();
    expect(secondSrcBefore).toBeTruthy();
    expect(firstSrcBefore).not.toEqual(secondSrcBefore);

    const firstSortableCard = historyStrip.getByTestId("thumbnail-strip-item-history").nth(0);
    const secondSortableCard = historyStrip.getByTestId("thumbnail-strip-item-history").nth(1);

    const fromBox = await firstSortableCard.boundingBox();
    const toBox = await secondSortableCard.boundingBox();
    expect(fromBox).toBeTruthy();
    expect(toBox).toBeTruthy();
    if (!fromBox || !toBox) return;

    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const firstSrcAfter = await historyStrip
          .getByTestId("history-card")
          .nth(0)
          .locator("img")
          .first()
          .getAttribute("src");
        const secondSrcAfter = await historyStrip
          .getByTestId("history-card")
          .nth(1)
          .locator("img")
          .first()
          .getAttribute("src");

        return [firstSrcAfter, secondSrcAfter];
      })
      .toEqual([secondSrcBefore, firstSrcBefore]);
  });

  test("opens the full-screen preview dialog when control is released after selecting thumbnails", async ({
    page,
  }) => {
    const historyStrip = await activateHistoryStrip(page);

    await uploadImageToTarget(page, ALT_SAMPLE_IMAGE_PATH);
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(2);

    const newestCard = historyStrip.getByTestId("history-card").nth(0);
    const olderCard = historyStrip.getByTestId("history-card").nth(1);

    await page.keyboard.down("Control");
    await newestCard.hover();
    await expect(newestCard).toHaveCSS("cursor", "zoom-in");

    await newestCard.click();
    await expect(newestCard.getByTestId("preview-selection-indicator")).toBeVisible();

    await olderCard.click();
    await expect(olderCard.getByTestId("preview-selection-indicator")).toBeVisible();

    await expect(page.getByTestId("image-preview-dialog")).toHaveCount(0);

    await page.keyboard.up("Control");

    const previewDialog = page.getByTestId("image-preview-dialog");
    await expect(previewDialog).toBeVisible();
    await expect(page.getByTestId(/image-preview-dialog-item-/)).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    await expect(page.getByTestId("preview-selection-indicator")).toHaveCount(0);

    await page.getByTestId("image-preview-dialog-close").click();
    await expect(previewDialog).toBeHidden();
  });

  test("deduplicates preview selections when the same thumbnail is control-clicked multiple times", async ({
    page,
  }) => {
    const historyStrip = await activateHistoryStrip(page);

    await uploadImageToTarget(page, ALT_SAMPLE_IMAGE_PATH);
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(2);

    const newestCard = historyStrip.getByTestId("history-card").nth(0);
    const newestCardImage = newestCard.locator("img").first();
    const newestSrc = await newestCardImage.getAttribute("src");
    expect(newestSrc).toBeTruthy();

    await page.keyboard.down("Control");
    await newestCard.click();
    await newestCard.click();
    await expect(newestCard.getByTestId("preview-selection-indicator")).toBeVisible();
    await page.keyboard.up("Control");

    const previewDialog = page.getByTestId("image-preview-dialog");
    await expect(previewDialog).toBeVisible();
    await expect(page.getByTestId(/image-preview-dialog-item-/)).toHaveCount(1);

    const previewImage = previewDialog.locator("img").first();
    await expect(previewImage).toHaveAttribute("src", newestSrc ?? "");

    await page.getByTestId("image-preview-dialog-close").click();
    await expect(previewDialog).toBeHidden();
  });

  test("strip expand button opens a large horizontal preview for history", async ({ page }) => {
    const historyStrip = await activateHistoryStrip(page);

    await uploadImageToTarget(page, ALT_SAMPLE_IMAGE_PATH);
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(2);

    const newestSrc = await historyStrip
      .getByTestId("history-card")
      .nth(0)
      .locator("img")
      .first()
      .getAttribute("src");
    const olderSrc = await historyStrip
      .getByTestId("history-card")
      .nth(1)
      .locator("img")
      .first()
      .getAttribute("src");

    await page.getByTestId("thumbnail-strip-expand-history").click();

    const previewDialog = page.getByTestId("image-preview-dialog");
    const previewItems = page.getByTestId(/image-preview-dialog-item-/);
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.getByText("Gallery", { exact: true })).toBeVisible();
    await expect(previewItems).toHaveCount(2);
    await expect(previewDialog.locator("img").nth(0)).toHaveAttribute("src", newestSrc ?? "");
    await expect(previewDialog.locator("img").nth(1)).toHaveAttribute("src", olderSrc ?? "");

    const firstPreviewBox = await previewItems.nth(0).boundingBox();
    const secondPreviewBox = await previewItems.nth(1).boundingBox();
    expect(firstPreviewBox).toBeTruthy();
    expect(secondPreviewBox).toBeTruthy();
    if (firstPreviewBox && secondPreviewBox) {
      expect(secondPreviewBox.x - (firstPreviewBox.x + firstPreviewBox.width)).toBeLessThanOrEqual(
        20.5,
      );
    }

    await page.getByTestId("image-preview-dialog-close").click();
    await expect(previewDialog).toBeHidden();
  });

  test("standalone book images allow editing current images and clear outgoing only via x button", async ({
    page,
  }) => {
    const pinnedHistoryStrip = page.locator(
      '[data-testid="thumbnail-strip-history"][data-pinned="true"]',
    );
    if ((await pinnedHistoryStrip.count()) === 0) {
      await page.getByTestId("thumbnail-tab-pin-history").click();
    }

    const bookImagesTab = page.getByTestId("thumbnail-tab-bookImages");
    await bookImagesTab.hover();
    await expect(page.getByRole("tooltip").last()).toContainText("Book Images");

    const bookImagesStrip = page.getByTestId("thumbnail-strip-bookImages");
    await expect(bookImagesStrip).toHaveAttribute("data-active", "true");
    await expect(bookImagesStrip.getByText("Current", { exact: true })).toHaveCount(1);
    await expect(bookImagesStrip.getByText("Replacement", { exact: true })).toHaveCount(1);

    const initialCount = await bookImagesStrip
      .getByTestId("thumbnail-strip-item-bookImages")
      .count();
    expect(initialCount).toBeGreaterThan(0);

    const historyStrip = page
      .locator('[data-testid="thumbnail-strip-history"][data-pinned="true"]')
      .first();
    const historyThumb = historyStrip.getByTestId("thumbnail-strip-item-history").first();
    const firstIncomingCard = bookImagesStrip
      .getByTestId("thumbnail-strip-item-bookImages")
      .first();
    const emptyCurrentSlot = page.getByTestId("book-image-current-slot-new");
    const firstIncomingImage = firstIncomingCard.getByTestId("history-card").first();

    await firstIncomingCard.hover();
    await expect(
      firstIncomingCard.getByRole("button", { name: "Remove image", exact: true }),
    ).toBeVisible();

    const firstIncomingSrcBefore = await firstIncomingImage
      .locator("img")
      .first()
      .getAttribute("src");
    expect(firstIncomingSrcBefore).toBeTruthy();

    const fromBox = await historyThumb.boundingBox();
    const toBox = await emptyCurrentSlot.boundingBox();
    expect(fromBox).toBeTruthy();
    expect(toBox).toBeTruthy();
    if (!fromBox || !toBox) return;

    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    await expect(bookImagesStrip.getByTestId("thumbnail-strip-item-bookImages")).toHaveCount(
      initialCount + 1,
    );
    await expect(firstIncomingImage.locator("img").first()).toHaveAttribute(
      "src",
      firstIncomingSrcBefore ?? "",
    );
    await expect(page.getByTestId("book-image-current-slot-new")).toBeVisible();

    const firstOutgoingSlot = page.getByTestId(/book-image-outgoing-slot-/).first();
    const toOutgoingBox = await firstOutgoingSlot.boundingBox();
    expect(toOutgoingBox).toBeTruthy();
    if (!fromBox || !toOutgoingBox) return;

    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      toOutgoingBox.x + toOutgoingBox.width / 2,
      toOutgoingBox.y + toOutgoingBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    const outgoingImage = firstOutgoingSlot.locator("img").first();
    const outgoingSrcBeforeClick = await outgoingImage.getAttribute("src");
    expect(outgoingSrcBeforeClick).toBeTruthy();

    await outgoingImage.click();
    await firstOutgoingSlot.hover();
    const clearButton = firstOutgoingSlot.getByRole("button", {
      name: "Remove image",
      exact: true,
    });
    await expect(clearButton).toBeVisible();
    await expect(firstOutgoingSlot.locator("img").first()).toHaveAttribute(
      "src",
      outgoingSrcBeforeClick ?? "",
    );

    await clearButton.click();
    await expect(
      firstOutgoingSlot.getByRole("button", { name: "Remove image", exact: true }),
    ).toHaveCount(0);
    await expect(firstOutgoingSlot.locator("img")).toHaveCount(0);

    const newestBookImagePair = bookImagesStrip
      .getByTestId("thumbnail-strip-item-bookImages")
      .last();
    await newestBookImagePair.hover();
    const removeCurrentButton = newestBookImagePair.getByRole("button", {
      name: "Remove image",
      exact: true,
    });
    await expect(removeCurrentButton).toBeVisible();
    await removeCurrentButton.evaluate((button: HTMLButtonElement) => button.click());
    await expect(bookImagesStrip.getByTestId("thumbnail-strip-item-bookImages")).toHaveCount(
      initialCount,
    );
    await expect(page.getByTestId("book-image-current-slot-new")).toBeVisible();
  });

  test("book images strip expand preserves current-over-replacement preview order", async ({
    page,
  }) => {
    const pinnedHistoryStrip = page.locator(
      '[data-testid="thumbnail-strip-history"][data-pinned="true"]',
    );
    if ((await pinnedHistoryStrip.count()) === 0) {
      await page.getByTestId("thumbnail-tab-pin-history").click();
    }

    const bookImagesStrip = page.getByTestId("thumbnail-strip-bookImages");
    const historyStrip = page
      .locator('[data-testid="thumbnail-strip-history"][data-pinned="true"]')
      .first();
    const historyThumb = historyStrip.getByTestId("thumbnail-strip-item-history").first();
    const firstOutgoingSlot = page.getByTestId(/book-image-outgoing-slot-/).first();

    const historyBox = await historyThumb.boundingBox();
    const firstOutgoingBox = await firstOutgoingSlot.boundingBox();
    expect(historyBox).toBeTruthy();
    expect(firstOutgoingBox).toBeTruthy();
    if (!historyBox || !firstOutgoingBox) return;

    await page.mouse.move(
      historyBox.x + historyBox.width / 2,
      historyBox.y + historyBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      firstOutgoingBox.x + firstOutgoingBox.width / 2,
      firstOutgoingBox.y + firstOutgoingBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    const firstPair = bookImagesStrip.getByTestId("thumbnail-strip-item-bookImages").first();
    const currentSrc = await firstPair
      .locator('[data-testid^="book-image-current-slot-"] img')
      .first()
      .getAttribute("src");
    const replacementSrc = await firstPair
      .locator('[data-testid^="book-image-outgoing-slot-"] img')
      .first()
      .getAttribute("src");

    await page.getByTestId("thumbnail-strip-expand-bookImages").click();

    const previewDialog = page.getByTestId("image-preview-dialog");
    const firstPreviewItem = page.getByTestId("image-preview-dialog-item-0");
    await expect(previewDialog).toBeVisible();
    await expect(firstPreviewItem.locator("img")).toHaveCount(2);
    await expect(firstPreviewItem.locator("img").nth(0)).toHaveAttribute("src", currentSrc ?? "");
    await expect(firstPreviewItem.locator("img").nth(1)).toHaveAttribute(
      "src",
      replacementSrc ?? "",
    );

    await page.getByTestId("image-preview-dialog-close").click();
    await expect(previewDialog).toBeHidden();
  });

  test("clicking a replacement book image shows that replacement in the result pane", async ({
    page,
  }) => {
    const pinnedHistoryStrip = page.locator(
      '[data-testid="thumbnail-strip-history"][data-pinned="true"]',
    );
    if ((await pinnedHistoryStrip.count()) === 0) {
      await page.getByTestId("thumbnail-tab-pin-history").click();
    }

    const historyStrip = page
      .locator('[data-testid="thumbnail-strip-history"][data-pinned="true"]')
      .first();
    const historyThumb = historyStrip.getByTestId("thumbnail-strip-item-history").first();
    const replacementSlot = page.getByTestId(/book-image-outgoing-slot-/).first();
    const resultPanel = page.getByTestId("result-panel");

    const historyBox = await historyThumb.boundingBox();
    const replacementBox = await replacementSlot.boundingBox();
    expect(historyBox).toBeTruthy();
    expect(replacementBox).toBeTruthy();
    if (!historyBox || !replacementBox) return;

    await page.mouse.move(
      historyBox.x + historyBox.width / 2,
      historyBox.y + historyBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      replacementBox.x + replacementBox.width / 2,
      replacementBox.y + replacementBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    const replacementImage = replacementSlot.locator("img").first();
    const replacementSrc = await replacementImage.getAttribute("src");
    expect(replacementSrc).toBeTruthy();

    await replacementImage.click();

    await expect(resultPanel.locator("img").first()).toHaveAttribute("src", replacementSrc ?? "");
  });

  test("allows dragging a current book image into Image to Edit", async ({ page }) => {
    const bookImagesStrip = page.getByTestId("thumbnail-strip-bookImages");
    const targetPanel = page.getByTestId("target-panel");
    const firstCurrentSlot = bookImagesStrip
      .locator('[data-testid^="book-image-current-slot-"]')
      .first();

    const firstCurrentImage = firstCurrentSlot.locator("img").first();
    await expect(firstCurrentImage).toBeVisible();
    const currentSrc = await firstCurrentImage.getAttribute("src");
    expect(currentSrc).toBeTruthy();

    await uploadImageToTarget(page, ALT_SAMPLE_IMAGE_PATH);

    const targetImage = targetPanel.getByRole("img", { name: "Image to Edit" });
    await expect(targetImage).toBeVisible();
    const targetSrcBefore = await targetImage.getAttribute("src");
    expect(targetSrcBefore).toBeTruthy();
    expect(targetSrcBefore).not.toEqual(currentSrc);

    const fromBox = await firstCurrentSlot.boundingBox();
    const toBox = await targetPanel.boundingBox();
    expect(fromBox).toBeTruthy();
    expect(toBox).toBeTruthy();
    if (!fromBox || !toBox) return;

    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, {
      steps: 12,
    });
    await page.mouse.up();

    await expect(targetImage).toHaveAttribute("src", currentSrc ?? "");
  });

  test("dragging a replacement to another replacement moves it, and dragging to result copies it", async ({
    page,
  }) => {
    const pinnedHistoryStrip = page.locator(
      '[data-testid="thumbnail-strip-history"][data-pinned="true"]',
    );
    if ((await pinnedHistoryStrip.count()) === 0) {
      await page.getByTestId("thumbnail-tab-pin-history").click();
    }

    const bookImagesStrip = page.getByTestId("thumbnail-strip-bookImages");
    const historyStrip = page
      .locator('[data-testid="thumbnail-strip-history"][data-pinned="true"]')
      .first();
    const historyThumb = historyStrip.getByTestId("thumbnail-strip-item-history").first();
    const firstOutgoingSlot = page.getByTestId(/book-image-outgoing-slot-/).nth(0);
    const secondOutgoingSlot = page.getByTestId(/book-image-outgoing-slot-/).nth(1);
    const resultPanel = page.getByTestId("result-panel");

    const historyBox = await historyThumb.boundingBox();
    const firstOutgoingBox = await firstOutgoingSlot.boundingBox();
    expect(historyBox).toBeTruthy();
    expect(firstOutgoingBox).toBeTruthy();
    if (!historyBox || !firstOutgoingBox) return;

    await page.mouse.move(
      historyBox.x + historyBox.width / 2,
      historyBox.y + historyBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      firstOutgoingBox.x + firstOutgoingBox.width / 2,
      firstOutgoingBox.y + firstOutgoingBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    const replacementSrc = await firstOutgoingSlot.locator("img").first().getAttribute("src");
    expect(replacementSrc).toBeTruthy();

    const secondOutgoingBox = await secondOutgoingSlot.boundingBox();
    expect(secondOutgoingBox).toBeTruthy();
    if (!secondOutgoingBox) return;

    await page.mouse.move(
      firstOutgoingBox.x + firstOutgoingBox.width / 2,
      firstOutgoingBox.y + firstOutgoingBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      secondOutgoingBox.x + secondOutgoingBox.width / 2,
      secondOutgoingBox.y + secondOutgoingBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    await expect(firstOutgoingSlot.locator("img")).toHaveCount(0);
    await expect(secondOutgoingSlot.locator("img").first()).toHaveAttribute(
      "src",
      replacementSrc ?? "",
    );

    const resultBox = await resultPanel.boundingBox();
    expect(resultBox).toBeTruthy();
    if (!resultBox) return;

    await page.mouse.move(
      secondOutgoingBox.x + secondOutgoingBox.width / 2,
      secondOutgoingBox.y + secondOutgoingBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(resultBox.x + resultBox.width / 2, resultBox.y + resultBox.height / 2, {
      steps: 12,
    });
    await page.mouse.up();

    await expect(secondOutgoingSlot.locator("img").first()).toHaveAttribute(
      "src",
      replacementSrc ?? "",
    );
    await expect(resultPanel.locator("img").first()).toHaveAttribute("src", replacementSrc ?? "");
    await expect(bookImagesStrip).toBeVisible();
  });
});
