import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { resetImageToolsPersistence, uploadImageToTarget } from "./playwright_helpers";

// Improve Quality's size machinery on the Bloom host harness, run with the
// Local Dummy model (localhost-only, never calls OpenRouter) so these specs
// cost nothing. The dummy is the only engine that reproduces the requested
// pixel size exactly — real models take coarse tier tokens — which is what
// makes the size arithmetic assertable end to end.
//
// Harness data (components/BloomHostHarness.tsx):
//   book-image-1 / book-image-3 carry a suggestedTarget + memo, as Bloom will;
//   book-image-2 / book-image-4 deliberately carry none, so the no-container
//   path is testable too. The harness launches on book-image-3, a 400 x 400 picture in
//   a 1063 x 1417 slot — the mismatch BL-16742 was about, so Auto asks for the
//   square that fits inside the slot rather than the slot's own shape.
const HARNESS_ROUTE = "/?mode=bloom-harness";
const LAUNCH_SLOT_TARGET = "1063 x 1417";
const LAUNCH_AUTO_TARGET = "1063 x 1063";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// The repo's only JPEG. Its subject is irrelevant here; what matters is that
// the bytes really are JPEG, which is what drives the Format row.
const JPEG_IMAGE_PATH = path.resolve(
  currentDir,
  "fixtures",
  "gif-sheets",
  "sheet-2x6-bordered-subject-missing.jpeg",
);
const PNG_IMAGE_PATH = path.resolve(currentDir, "..", "assets", "art-styles", "clean-line-art.png");

const improveQualityCard = (page: import("@playwright/test").Page) =>
  page.locator('[data-tool-id="improve_quality"]');

// The Size select, which must never appear; found through its hidden input.
const targetResolutionSelect = (page: import("@playwright/test").Page) =>
  improveQualityCard(page)
    .locator('div:has(> input[data-testid="input-targetResolution"])')
    .getByRole("combobox");

const selectImproveQualityWithDummyModel = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: /Enhance/i }).click();
  await page.getByText("Improve Quality", { exact: true }).click();
  await page.getByTestId("tool-model-picker-improve_quality").click();
  await page.getByText("Local Dummy (No AI)").click();
  await page.keyboard.press("Escape");
};

const resultPanelImage = (page: import("@playwright/test").Page) =>
  page.getByTestId("result-panel").locator("img").first();

const openInfoDialogFor = async (
  page: import("@playwright/test").Page,
  panelTestId: "result-panel" | "target-panel",
) => {
  const panel = page.getByTestId(panelTestId);
  await panel.locator("img").first().hover();
  await panel.getByTestId("image-info-button").click();
  await expect(page.getByTestId("image-info-dialog")).toBeVisible();
};

const closeInfoDialog = async (page: import("@playwright/test").Page) => {
  await page.getByTestId("image-info-dialog-close").click();
  await expect(page.getByTestId("image-info-dialog")).toBeHidden();
};

test.describe("improve quality size", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
  });

  test("a slot with a host target shows the page-size line, and the dummy honors it exactly", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 200;
    });
    await selectImproveQualityWithDummyModel(page);

    // Scaling up keeps the picture's own shape, so there is no Shape menu.
    // Inside a container there is nothing to choose either: no selector and
    // no sentence, and the run asks for the container's pixels in the
    // picture's shape.
    await expect(improveQualityCard(page).getByTestId("input-aspectRatio")).toHaveCount(0);
    await expect(targetResolutionSelect(page)).toHaveCount(0);
    await expect(improveQualityCard(page).getByTestId("scale-up-status")).toHaveCount(0);
    await expect(improveQualityCard(page).getByText(LAUNCH_SLOT_TARGET)).toHaveCount(0);
    await expect(improveQualityCard(page).getByText(/300 dpi/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Go", exact: true }).click();
    await expect(resultPanelImage(page)).toBeVisible({ timeout: 15_000 });

    // The dummy built its canvas at exactly the requested size, so the result's
    // own pixels prove the planned number reached the model call.
    await expect(async () => {
      const naturalSize = await resultPanelImage(page).evaluate((image) => ({
        width: (image as HTMLImageElement).naturalWidth,
        height: (image as HTMLImageElement).naturalHeight,
      }));
      // Square in, square out: the dummy reproduces the requested size
      // exactly, so this is the assertion that scaling up did not reshape the
      // picture to its slot.
      expect(naturalSize).toEqual({ width: 1063, height: 1063 });
    }).toPass({ timeout: 10_000 });

    await openInfoDialogFor(page, "result-panel");
    await expect(page.getByTestId("history-resolution")).toHaveText(LAUNCH_AUTO_TARGET);
    await closeInfoDialog(page);
  });

  test("a slot with no host target shows no size control either, and the run asks for HD", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 200;
    });
    await selectImproveQualityWithDummyModel(page);

    // book-image-2 carries no suggestedTarget.
    await page.getByTestId("book-image-current-slot-book-image-2").click();
    await expect(targetResolutionSelect(page)).toHaveCount(0);
    await expect(improveQualityCard(page).getByTestId("scale-up-status")).toHaveCount(0);
    await expect(improveQualityCard(page).getByText("Size", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Go", exact: true }).click();
    await expect(resultPanelImage(page)).toBeVisible({ timeout: 15_000 });

    // HD is the oriented 1920 x 1080 box the picture is fitted into, so one
    // edge of the dummy's result lands on the box.
    await expect(async () => {
      const naturalSize = await resultPanelImage(page).evaluate((image) => ({
        width: (image as HTMLImageElement).naturalWidth,
        height: (image as HTMLImageElement).naturalHeight,
      }));
      expect(Math.max(naturalSize.width, naturalSize.height)).toBeLessThanOrEqual(1920);
      expect(Math.min(naturalSize.width, naturalSize.height)).toBeLessThanOrEqual(1080);
      expect(
        Math.max(naturalSize.width, naturalSize.height) === 1920 ||
          Math.min(naturalSize.width, naturalSize.height) === 1080,
      ).toBe(true);
    }).toPass({ timeout: 10_000 });
  });

  test("the info dialog names the format an uploaded source arrived in", async ({ page }) => {
    test.setTimeout(30_000);
    await selectImproveQualityWithDummyModel(page);

    await uploadImageToTarget(page, JPEG_IMAGE_PATH);
    await openInfoDialogFor(page, "target-panel");
    await expect(page.getByTestId("history-format")).toHaveText("JPEG");
    await closeInfoDialog(page);

    await uploadImageToTarget(page, PNG_IMAGE_PATH);
    await openInfoDialogFor(page, "target-panel");
    await expect(page.getByTestId("history-format")).toHaveText("PNG");
    await closeInfoDialog(page);
  });
});
