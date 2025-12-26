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
    const historyThumb = historyStrip.getByTestId("history-card").first();

    await historyThumb.dragTo(starredStrip);

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
});
