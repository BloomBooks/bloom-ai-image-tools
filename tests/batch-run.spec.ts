import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

// Covers WP4/WP7 of PLAN-batch-processing.md: the batch runner behind the morphed
// "Apply Changes to N Images" button, running up to BATCH_CONCURRENCY (lib/batchPool.ts,
// currently 4) images in parallel with 429 backoff. Uses the Local Dummy model
// (localhost-only, never calls OpenRouter) so these specs run with zero API spend.
//
// Test-only hooks read by the dummy image path in services/openRouterService.ts
// (`applyDummyImageTestHooks`) and lib/batchPool.ts (`resolveBatchRetryDelaysMs`):
//   - __bloomDummyDelayMs: delay before every dummy call (defaults to ~1s otherwise;
//     set explicitly here so timing is deterministic and specs don't wait a full
//     second per call for no reason).
//   - __bloomDummyFailOnCallNumber: 1-indexed call number that should throw instead
//     of returning an image.
//   - __bloomDummyRateLimitOnCallNumbers: 1-indexed call numbers that should throw a
//     rate-limited OpenRouterApiError instead of returning an image, to exercise the
//     429 backoff + concurrency-drop path.
//   - __bloomBatchRetryDelaysMsOverride: overrides the 5s/15s/30s backoff schedule so
//     specs don't wait through the real delays.
//
// The harness has only 5 book images (1 a placeholder), so at most 4 are ever
// tickable — conveniently equal to BATCH_CONCURRENCY, meaning every ticked image in
// these specs starts in the same wave rather than queuing behind another.
const HARNESS_ROUTE = "/?mode=bloom-harness";
const BATCH_TOOL_TITLE = "Custom Edit"; // tools-registry id "custom", allowBatch: true

const selectCustomEditToolWithDummyModel = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: /Enhance/i }).click();
  await page.getByText(BATCH_TOOL_TITLE, { exact: true }).click();
  await page.getByTestId("tool-model-picker-custom").click();
  await page.getByText("Local Dummy (No AI)").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("input-prompt").fill("Add a dummy banner");
};

const batchTickCheckbox = (page: import("@playwright/test").Page, incomingId: string) =>
  page.getByTestId(`batch-tick-${incomingId}`);

const outgoingSlotImage = (page: import("@playwright/test").Page, incomingId: string) =>
  page.getByTestId(`book-image-outgoing-slot-${incomingId}`).locator("img").first();

const currentSlot = (page: import("@playwright/test").Page, incomingId: string) =>
  page.getByTestId(`book-image-current-slot-${incomingId}`);

const resultPanelImage = (page: import("@playwright/test").Page) =>
  page.getByTestId("result-panel").locator("img").first();

test.describe("batch runner", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
  });

  test("happy path: runs all ticked images, fills their slots, and clears ticks", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 800;
    });
    await selectCustomEditToolWithDummyModel(page);

    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-2").click();
    await batchTickCheckbox(page, "book-image-4").click();
    await expect(
      page.getByRole("button", { name: "Apply Changes to 3 Images", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Apply Changes to 3 Images", exact: true }).click();

    // All 3 run in parallel (BATCH_CONCURRENCY is 4), so no single id is
    // guaranteed to land first; wait for every slot to fill, in any order.
    for (const id of ["book-image-1", "book-image-2", "book-image-4"]) {
      await expect(outgoingSlotImage(page, id)).toBeVisible({ timeout: 15_000 });
    }
    // The right-panel loading overlay is never used for batch runs (WP5
    // owns the dedicated progress bar instead).
    expect(await page.getByTestId("result-panel").getByRole("progressbar").count()).toBe(0);

    // Successful images untick themselves (assignment makes the slot
    // ineligible), so the button un-morphs back to the single-image label.
    for (const id of ["book-image-1", "book-image-2", "book-image-4"]) {
      await expect(batchTickCheckbox(page, id)).not.toBeChecked();
    }
    await expect(page.getByRole("button", { name: "Apply Changes", exact: true })).toBeVisible();
  });

  test("runs ticked images in parallel: multiple spinners are visible at once (WP7)", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 2500;
    });
    await selectCustomEditToolWithDummyModel(page);

    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-2").click();
    await batchTickCheckbox(page, "book-image-4").click();
    await page.getByRole("button", { name: "Apply Changes to 3 Images", exact: true }).click();

    // All 3 fit inside BATCH_CONCURRENCY (4) and should start together. A
    // sequential runner could never show more than one spinner at a time, so
    // seeing >=2 at once is proof of real parallelism; asserting exactly 3
    // would be racy (one could already be finishing).
    await expect(async () => {
      expect(await page.getByTestId("batch-active-spinner").count()).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5_000 });
  });

  test("shows a determinate progress bar with a Processed-count label while running (WP5/WP7)", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 1500;
      // Book-strip order is 1, 2, 4 — the 3rd dummy call is book-image-4's
      // first attempt. Same-delay parallel completions can land close enough
      // together to collapse into a single render (skipping every
      // intermediate "Processed N of 3" value, straight to the run
      // finishing) — staggering book-image-4 behind a short rate-limit
      // backoff guarantees an observable "Processed 2 of 3" in between.
      (window as any).__bloomDummyRateLimitOnCallNumbers = [3];
      (window as any).__bloomBatchRetryDelaysMsOverride = [1500];
    });
    await selectCustomEditToolWithDummyModel(page);

    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-2").click();
    await batchTickCheckbox(page, "book-image-4").click();
    await page.getByRole("button", { name: "Apply Changes to 3 Images", exact: true }).click();

    // The generic "Click to Cancel" processing button never appears for a
    // batch run — it's replaced by the progress bar + labeled Cancel.
    await expect(page.getByText(/Click to Cancel/i)).toHaveCount(0);
    await expect(page.getByTestId("batch-progress-label")).toHaveText("Processed 0 of 3");
    const progressBar = page.getByTestId("batch-progress-bar");
    await expect(progressBar).toHaveAttribute("aria-valuenow", "0");

    // book-image-1 and book-image-2 land together; book-image-4 is still
    // backing off, giving a solid window to observe "Processed 2 of 3".
    await expect(page.getByTestId("batch-progress-label")).toHaveText("Processed 2 of 3", {
      timeout: 15_000,
    });
    const valueAfterTwoCompletions = Number(await progressBar.getAttribute("aria-valuenow"));
    expect(valueAfterTwoCompletions).toBeGreaterThan(0);

    await expect(page.getByTestId("batch-progress-cancel-button")).toBeVisible();
  });

  test("book-strip clicks pin the Result pane mid-run; Follow latest resumes (WP5)", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 800;
      // Book-strip order for the ticked set below is 1, 4 — book-image-4's
      // first attempt is dummy call #2. Rate-limiting it (with a generously
      // long overridden backoff) staggers its completion well behind
      // book-image-1's, giving a wide, machine-load-tolerant pin/unpin window
      // instead of racing two same-delay parallel completions against each
      // other.
      (window as any).__bloomDummyRateLimitOnCallNumbers = [2];
      (window as any).__bloomBatchRetryDelaysMsOverride = [6000];
    });
    await selectCustomEditToolWithDummyModel(page);

    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-4").click();
    await page.getByRole("button", { name: "Apply Changes to 2 Images", exact: true }).click();

    // book-image-1 isn't rate-limited and lands first; the pane follows it.
    await expect(outgoingSlotImage(page, "book-image-1")).toBeVisible({ timeout: 15_000 });
    const srcAfterFirstResult = await resultPanelImage(page).getAttribute("src");

    // book-image-4 is still retrying (rate-limited once, backing off) —
    // clicking it inspects its current (pre-edit) state and pins the pane.
    await currentSlot(page, "book-image-4").click();
    await expect(page.getByTestId("batch-follow-latest-chip")).toBeVisible();
    const pinnedSrc = await resultPanelImage(page).getAttribute("src");
    expect(pinnedSrc).not.toBe(srcAfterFirstResult);

    // book-image-4 is still retrying (backing off) at this point — the "Follow
    // latest" chip only renders while a batch is running, so un-pin now,
    // before the run finishes and the chip disappears on its own.
    await page.getByTestId("batch-follow-latest-chip").click();
    await expect(page.getByTestId("batch-follow-latest-chip")).toHaveCount(0);

    // Un-pinning doesn't jump back retroactively — it only resumes following
    // FUTURE completions. book-image-4 (the pinned item) is still retrying;
    // once it lands, the pane should show its new result rather than the
    // pre-edit original it was pinned on.
    await expect(outgoingSlotImage(page, "book-image-4")).toBeVisible({ timeout: 15_000 });
    await expect(resultPanelImage(page)).not.toHaveAttribute("src", pinnedSrc!);
  });

  test("book-strip clicks revert to normal target-loading when no ticks and no batch (WP5)", async ({
    page,
  }) => {
    await selectCustomEditToolWithDummyModel(page);

    // No ticks, no batch running: clicking a "Current" book image still
    // retargets "Image to Edit", not the Result pane.
    const bookImage2Src = await currentSlot(page, "book-image-2")
      .locator("img")
      .first()
      .getAttribute("src");
    expect(bookImage2Src).toBeTruthy();

    await currentSlot(page, "book-image-2").click();
    const targetImg = page.getByTestId("target-panel").locator("img").first();
    await expect(targetImg).toHaveAttribute("src", bookImage2Src!);
  });

  test("editing a book image snapshots the pre-edit original into history", async ({ page }) => {
    test.setTimeout(30_000);
    await selectCustomEditToolWithDummyModel(page);

    // The bytes the snapshot must preserve: the slot's current image, exactly
    // as a data URL (ensureBookOriginalInHistory inlines the bytes so they
    // survive after a committed replacement overwrites the book file).
    const originalSrc = await currentSlot(page, "book-image-2")
      .locator("img")
      .first()
      .getAttribute("src");
    expect(originalSrc).toBeTruthy();
    const expectedSnapshotSrc = await page.evaluate(async (src: string) => {
      if (src.startsWith("data:")) return src;
      const blob = await (await fetch(src)).blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }, originalSrc!);

    await batchTickCheckbox(page, "book-image-2").click();
    await page.getByRole("button", { name: "Apply Changes to 1 Image", exact: true }).click();
    await expect(outgoingSlotImage(page, "book-image-2")).toBeVisible({ timeout: 15_000 });

    // The history strip now holds the harness's 3 seeded entries + the
    // original's snapshot + the result.
    await page.getByTestId("thumbnail-tab-history").click();
    const historyImages = page
      .getByTestId("thumbnail-strip-history")
      .getByTestId("thumbnail-strip-item-history")
      .locator("img");
    await expect(historyImages).toHaveCount(5);
    const historySrcs = await historyImages.evaluateAll((imgs) =>
      imgs.map((img) => img.getAttribute("src")),
    );
    expect(historySrcs).toContain(expectedSnapshotSrc);
  });

  test("one failing image doesn't stop the run; a retry succeeds it", async ({ page }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      // Book-strip order is 1, 2, 4 — the 2nd dummy call is book-image-2.
      (window as any).__bloomDummyFailOnCallNumber = 2;
    });
    await selectCustomEditToolWithDummyModel(page);

    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-2").click();
    await batchTickCheckbox(page, "book-image-4").click();
    await page.getByRole("button", { name: "Apply Changes to 3 Images", exact: true }).click();

    await expect(outgoingSlotImage(page, "book-image-1")).toBeVisible({ timeout: 15_000 });
    await expect(outgoingSlotImage(page, "book-image-4")).toBeVisible({ timeout: 15_000 });

    // The failed image stays ticked; the summary notice explains why.
    await expect(batchTickCheckbox(page, "book-image-2")).toBeChecked();
    await expect(batchTickCheckbox(page, "book-image-1")).not.toBeChecked();
    await expect(batchTickCheckbox(page, "book-image-4")).not.toBeChecked();
    await expect(page.getByText(/2 of 3 images processed; 1 failed/)).toBeVisible();

    // Re-running retries exactly the straggler (only book-image-2 is still
    // ticked). The forced-failure hook only targets call #2, which is already
    // spent, so this run succeeds.
    await page.getByRole("button", { name: "Apply Changes to 1 Image", exact: true }).click();
    await expect(outgoingSlotImage(page, "book-image-2")).toBeVisible({ timeout: 15_000 });
    await expect(batchTickCheckbox(page, "book-image-2")).not.toBeChecked();
  });

  test("a rate-limited call retries with backoff and eventually succeeds (WP7)", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 100;
      // Book-strip order is 1, 2 — book-image-2's first attempt is call #2.
      (window as any).__bloomDummyRateLimitOnCallNumbers = [2];
      (window as any).__bloomBatchRetryDelaysMsOverride = [50, 50, 50];
    });
    await selectCustomEditToolWithDummyModel(page);

    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-2").click();
    await page.getByRole("button", { name: "Apply Changes to 2 Images", exact: true }).click();

    await expect(outgoingSlotImage(page, "book-image-1")).toBeVisible({ timeout: 15_000 });
    await expect(outgoingSlotImage(page, "book-image-2")).toBeVisible({ timeout: 15_000 });
    await expect(batchTickCheckbox(page, "book-image-2")).not.toBeChecked();
    // Retried to success, not failed: no "X of Y processed; Z failed" summary.
    await expect(page.getByText(/failed/)).toHaveCount(0);
  });

  test("cancel mid-run keeps completed assignments and marks a retrying image cancelled, not failed (WP7)", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 400;
      // Book-strip order is 1, 2, 4 — the 2nd dummy call is book-image-2's
      // first attempt. Forcing it to rate-limit, with a long (overridden)
      // backoff, sends it into a wait far longer than book-image-1/4 take to
      // finish normally — a deterministic window with some images done and
      // one still retrying, instead of racing same-delay parallel completions.
      (window as any).__bloomDummyRateLimitOnCallNumbers = [2];
      (window as any).__bloomBatchRetryDelaysMsOverride = [5000, 5000, 5000];
    });
    await selectCustomEditToolWithDummyModel(page);

    await batchTickCheckbox(page, "book-image-1").click();
    await batchTickCheckbox(page, "book-image-2").click();
    await batchTickCheckbox(page, "book-image-4").click();
    await page.getByRole("button", { name: "Apply Changes to 3 Images", exact: true }).click();

    await expect(outgoingSlotImage(page, "book-image-1")).toBeVisible({ timeout: 15_000 });
    await expect(outgoingSlotImage(page, "book-image-4")).toBeVisible({ timeout: 15_000 });
    // book-image-2 is deep in its 5s backoff wait — nowhere near done yet.
    await expect(batchTickCheckbox(page, "book-image-2")).toBeChecked();

    // Cancel while book-image-2's retry wait is in flight: the wait must
    // respect the abort signal and reject immediately.
    await page.getByTestId("batch-progress-cancel-button").click();

    // Completed assignments (1 and 4) are kept; the still-retrying image is
    // cancelled — not failed — and stays ticked for a future retry.
    await expect(batchTickCheckbox(page, "book-image-1")).not.toBeChecked();
    await expect(batchTickCheckbox(page, "book-image-4")).not.toBeChecked();
    await expect(batchTickCheckbox(page, "book-image-2")).toBeChecked();
    await expect(page.getByText(/failed/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Apply Changes to 1 Image", exact: true }),
    ).toBeVisible();
  });
});
