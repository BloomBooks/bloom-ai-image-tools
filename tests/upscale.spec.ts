import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { resetImageToolsPersistence, uploadImageToTarget } from "./playwright_helpers";

// The Upscale tool on the Bloom host harness, run with the Local Dummy model
// (localhost-only, never calls OpenRouter) so these specs cost nothing. The
// dummy is the only engine that reproduces the requested pixel size exactly —
// real models take coarse tier tokens — which is what makes the selector's
// arithmetic assertable end to end.
//
// Harness data (components/BloomHostHarness.tsx):
//   book-image-1 / book-image-3 carry a suggestedTarget + memo, as Bloom will;
//   book-image-2 / book-image-4 deliberately carry none, so the no-Auto path is
//   testable too. The harness launches on book-image-3 (1063 x 1417).
const HARNESS_ROUTE = "/?mode=bloom-harness";
const LAUNCH_SLOT_TARGET = "1063 x 1417";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// The repo's only JPEG. Its subject is irrelevant here; what matters is that
// the bytes really are JPEG, which is what drives the Format row and the
// "Remove fuzziness" default.
const JPEG_IMAGE_PATH = path.resolve(
  currentDir,
  "fixtures",
  "gif-sheets",
  "sheet-2x6-bordered-subject-missing.jpeg",
);
const PNG_IMAGE_PATH = path.resolve(currentDir, "..", "assets", "art-styles", "clean-line-art.png");

const upscaleCard = (page: import("@playwright/test").Page) =>
  page.locator('[data-tool-id="upscale"]');

const targetResolutionSelect = (page: import("@playwright/test").Page) =>
  upscaleCard(page).getByRole("combobox");

const selectUpscaleToolWithDummyModel = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: /Enhance/i }).click();
  await page.getByText("Upscale", { exact: true }).click();
  await page.getByTestId("tool-model-picker-upscale").click();
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

test.describe("upscale tool", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
  });

  test("a slot with a host target offers Auto, shows its memo, and the dummy honors it exactly", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 200;
    });
    await selectUpscaleToolWithDummyModel(page);

    // The launched slot's host target, verbatim from the harness payload.
    await expect(targetResolutionSelect(page)).toHaveText(`Auto (${LAUNCH_SLOT_TARGET})`);
    await expect(page.getByTestId("upscale-target-memo")).toContainText("300 dpi");

    // Upscale has no Shape picker: the output always follows the source.
    await expect(upscaleCard(page).getByText("Shape", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Apply Changes", exact: true }).click();
    await expect(resultPanelImage(page)).toBeVisible({ timeout: 15_000 });

    // The dummy built its canvas at exactly the requested size, so the result's
    // own pixels prove the selector's number reached the model call.
    await expect(async () => {
      const naturalSize = await resultPanelImage(page).evaluate((image) => ({
        width: (image as HTMLImageElement).naturalWidth,
        height: (image as HTMLImageElement).naturalHeight,
      }));
      expect(naturalSize).toEqual({ width: 1063, height: 1417 });
    }).toPass({ timeout: 10_000 });

    await openInfoDialogFor(page, "result-panel");
    await expect(page.getByTestId("history-resolution")).toHaveText(LAUNCH_SLOT_TARGET);
    await closeInfoDialog(page);
  });

  test("a slot with no host target has no Auto option and starts at HD", async ({ page }) => {
    await selectUpscaleToolWithDummyModel(page);

    // book-image-2 carries no suggestedTarget.
    await page.getByTestId("book-image-current-slot-book-image-2").click();
    await expect(page.getByTestId("upscale-target-memo")).toHaveCount(0);

    // HD is the oriented 1920x1080 fit of the source, so the label carries real
    // dimensions rather than a bare tier name.
    await expect(targetResolutionSelect(page)).toHaveText(/^HD \(\d+ x \d+\)$/);

    await targetResolutionSelect(page).click();
    await expect(page.getByRole("option")).toHaveCount(3);
    const optionLabels = await page.getByRole("option").allTextContents();
    expect(optionLabels.some((label) => label.startsWith("Auto"))).toBe(false);
    expect(optionLabels[0]).toMatch(/^HD \(/);
    expect(optionLabels[1]).toMatch(/^2K \(/);
    expect(optionLabels[2]).toMatch(/^4K \(/);
    await page.keyboard.press("Escape");
  });

  test("remove fuzziness defaults on for a JPEG source and off for a PNG one", async ({ page }) => {
    test.setTimeout(30_000);
    await selectUpscaleToolWithDummyModel(page);

    await uploadImageToTarget(page, JPEG_IMAGE_PATH);
    await expect(page.getByTestId("input-removeFuzziness")).toBeChecked();
    await openInfoDialogFor(page, "target-panel");
    await expect(page.getByTestId("history-format")).toHaveText("JPEG");
    await closeInfoDialog(page);

    await uploadImageToTarget(page, PNG_IMAGE_PATH);
    await expect(page.getByTestId("input-removeFuzziness")).not.toBeChecked();
    await openInfoDialogFor(page, "target-panel");
    await expect(page.getByTestId("history-format")).toHaveText("PNG");
    await closeInfoDialog(page);
  });
});
