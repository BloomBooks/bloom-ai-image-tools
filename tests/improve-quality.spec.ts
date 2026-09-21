import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { resetImageToolsPersistence, uploadImageToTarget } from "./playwright_helpers";

// The Improve Quality tool on the Bloom host harness: the detector
// (lib/imageKind.ts) sets its Image Kind choice from the target image, and a
// choice the user makes stands.
const HARNESS_ROUTE = "/?mode=bloom-harness";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const LINE_ART_PATH = path.resolve(currentDir, "..", "assets", "art-styles", "clean-line-art.png");
const PAINTING_PATH = path.resolve(
  currentDir,
  "..",
  "assets",
  "art-styles",
  "watercolor-dream.png",
);

const card = (page: import("@playwright/test").Page) =>
  page.locator('[data-tool-id="improve_quality"]');
const kindSelect = (page: import("@playwright/test").Page) =>
  card(page).locator('div:has(> input[data-testid="input-imageKind"])').getByRole("combobox");

test.describe("improve quality tool", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
  });

  test("picks the kind from the picture, and keeps the user's own pick", async ({ page }) => {
    test.setTimeout(30_000);
    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Improve Quality", { exact: true }).click();

    await uploadImageToTarget(page, LINE_ART_PATH);
    await expect(kindSelect(page)).toHaveText("Line Drawing");

    await uploadImageToTarget(page, PAINTING_PATH);
    await expect(kindSelect(page)).toHaveText("Illustration");

    // The user's own choice stands for this image.
    await kindSelect(page).click();
    await page.getByRole("option", { name: "Photo" }).click();
    await expect(kindSelect(page)).toHaveText("Photo");
    // The detector's line under the control is gone with the automatic option.
    await expect(card(page).getByText(/Looks like/)).toHaveCount(0);
  });

  // Harness book images: 1 and 2 are colour illustrations, 4 is a black-and-white
  // line drawing.
  test("takes the kind from the ticked images, and keeps the user's own pick", async ({ page }) => {
    test.setTimeout(30_000);
    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Improve Quality", { exact: true }).click();

    await page.getByTestId("batch-tick-book-image-4").click();
    await expect(kindSelect(page)).toHaveText("Line Drawing");

    // One drawing and one illustration: a tie goes to Illustration.
    await page.getByTestId("batch-tick-book-image-1").click();
    await expect(kindSelect(page)).toHaveText("Illustration");

    // The user's own pick stands as more images are ticked.
    await kindSelect(page).click();
    await page.getByRole("option", { name: "Photo" }).click();
    await expect(kindSelect(page)).toHaveText("Photo");
    await page.getByTestId("batch-tick-book-image-2").click();
    await expect(page.getByRole("button", { name: "Go (3 Images)", exact: true })).toBeVisible();
    await expect(kindSelect(page)).toHaveText("Photo");
  });
});
