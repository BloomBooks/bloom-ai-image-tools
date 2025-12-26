import { test, expect } from "@playwright/test";
import {
  resetImageToolsPersistence,
  uploadImageToTarget,
  ALT_SAMPLE_IMAGE_PATH,
  uploadSampleImageToTarget,
} from "./playwright_helpers";

const isVerbose = !!process.env.E2E_VERBOSE;

test.describe("thumbnail strips", () => {
  test.beforeEach(async ({ page }) => {
  if (isVerbose) {
    await page.addInitScript(() => {
      (window as any).__E2E_VERBOSE = true;
    });

    page.on("console", (msg) =>
      console.log(`[browser:${msg.type()}] ${msg.text()}`)
    );
    page.on("pageerror", (error) =>
      console.log(`[pageerror] ${error?.message ?? error}`)
    );
    page.on("requestfailed", (request) =>
      console.log(
        `[requestfailed] ${request.method()} ${request.url()} (${request.failure()?.errorText})`
      )
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
          const elStripId =
            el?.closest("[data-strip-id]")?.getAttribute("data-strip-id") || "";
          const elTag = el?.tagName?.toLowerCase() || "";
          pointInfo = ` @(${x},${y}) el=${elTag}${elTestId ? ` testid=${elTestId}` : ""}${elStripId ? ` elStrip=${elStripId}` : ""}`;
        } catch {
          // ignore
        }
        const strip = (event.target as HTMLElement | null)?.closest(
          "[data-strip-id]"
        );
        console.log(
          `[dnd] ${label} strip=${strip?.getAttribute("data-strip-id") || "?"} defaultPrevented=${event.defaultPrevented} types=${JSON.stringify(types)} text/plain=${plain} internal=${internal}${pointInfo}`
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
        queueMicrotask(() =>
          logDt("dragstart(after)", event as DragEvent)
        );
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
    const starredStrip = page.getByTestId("thumbnail-strip-starred").first();
    await expect(starredStrip).toHaveAttribute("data-active", "true");

    await page.getByTestId("thumbnail-tab-reference").click();

    const referenceStrip = page.getByTestId("thumbnail-strip-reference");
    await expect(referenceStrip).toHaveAttribute("data-active", "true");
    await expect(starredStrip).toHaveAttribute("data-active", "false");
  });

  test("allows pinning and unpinning strips", async ({ page }) => {
    const starPin = page.getByTestId("thumbnail-tab-pin-starred");

    await expect(
      page.locator('[data-strip-id="starred"][data-pinned="false"]')
    ).toHaveCount(1);

    await starPin.click();

    await expect(
      page.locator('[data-strip-id="starred"][data-pinned="true"]')
    ).toHaveCount(1);
    await expect(
      page.locator('[data-strip-id="starred"][data-pinned="false"]')
    ).toHaveCount(0);

    await starPin.click();

    await expect(
      page.locator('[data-strip-id="starred"][data-pinned="true"]')
    ).toHaveCount(0);
    await expect(
      page.locator('[data-strip-id="starred"][data-pinned="false"]')
    ).toHaveCount(1);
  });

  test("copies history entries when dragged between strips", async ({
    page,
  }) => {
    const historyStrip = page.getByTestId("thumbnail-strip-history").first();
    const starredStrip = page.getByTestId("thumbnail-strip-starred").first();
    const historyThumb = historyStrip
      .getByTestId("thumbnail-strip-item-history")
      .first();

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

  test("shows newest history item first", async ({ page }) => {
    const historyStrip = page.getByTestId("thumbnail-strip-history").first();

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

  test("environment strip is editable for sample app (Book pages)", async ({
    page,
  }) => {
    // Verify the tab label via tooltip.
    const envTab = page.getByTestId("thumbnail-tab-environment");
    await envTab.hover();
    await expect(page.getByRole("tooltip").last()).toContainText("Book pages");

    // Switch to the environment strip.
    await envTab.click();
    const envStrip = page.getByTestId("thumbnail-strip-environment");
    await expect(envStrip).toHaveAttribute("data-active", "true");

    // Environment strip starts with seeded items.
    const initialCount = await envStrip.getByTestId("history-card").count();
    expect(initialCount).toBeGreaterThan(0);

    // Add: drag a history item into Book pages.
    const historyStrip = page.getByTestId("thumbnail-strip-history").first();
    const historyThumb = historyStrip
      .getByTestId("thumbnail-strip-item-history")
      .first();

    const fromBox = await historyThumb.boundingBox();
    const toBox = await envStrip.boundingBox();
    expect(fromBox).toBeTruthy();
    expect(toBox).toBeTruthy();
    if (!fromBox || !toBox) return;

    await page.mouse.move(
      fromBox.x + fromBox.width / 2,
      fromBox.y + fromBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    await expect(envStrip.getByTestId("history-card")).toHaveCount(
      initialCount + 1
    );

    // Remove: remove the first book page.
    const firstCardForRemove = envStrip.getByTestId("history-card").first();
    await firstCardForRemove.hover();
    await firstCardForRemove.getByRole("button", { name: "Remove image" }).click();
    await expect(envStrip.getByTestId("history-card")).toHaveCount(
      initialCount
    );

    // Reorder: move first thumbnail after the second (sortable behavior).
    const firstImg = envStrip
      .getByTestId("history-card")
      .nth(0)
      .locator("img")
      .first();
    const secondImg = envStrip
      .getByTestId("history-card")
      .nth(1)
      .locator("img")
      .first();

    const firstSrcBefore = await firstImg.getAttribute("src");
    const secondSrcBefore = await secondImg.getAttribute("src");
    expect(firstSrcBefore).toBeTruthy();
    expect(secondSrcBefore).toBeTruthy();

    const firstSortableCard = envStrip
      .getByTestId("thumbnail-strip-item-environment")
      .nth(0);
    const secondSortableCard = envStrip
      .getByTestId("thumbnail-strip-item-environment")
      .nth(1);

    const fromReorderBox = await firstSortableCard.boundingBox();
    const toReorderBox = await secondSortableCard.boundingBox();
    expect(fromReorderBox).toBeTruthy();
    expect(toReorderBox).toBeTruthy();
    if (!fromReorderBox || !toReorderBox) return;

    await page.mouse.move(
      fromReorderBox.x + fromReorderBox.width / 2,
      fromReorderBox.y + fromReorderBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      toReorderBox.x + toReorderBox.width / 2,
      toReorderBox.y + toReorderBox.height / 2,
      {
      steps: 10,
      }
    );
    await page.mouse.up();

    await expect
      .poll(async () => {
        const firstSrcAfter = await envStrip
          .getByTestId("history-card")
          .nth(0)
          .locator("img")
          .first()
          .getAttribute("src");
        return firstSrcAfter;
      })
      .not.toEqual(firstSrcBefore);
  });
});
