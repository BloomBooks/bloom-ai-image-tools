import { test, expect } from "@playwright/test";
import os from "os";
import path from "path";
import { resetImageToolsPersistence } from "./playwright_helpers";

// The full-screen gallery on the book-images strip: one column per page, in book
// order, and a page whose result has been chosen shows what the book holds today
// above the replacement. Run with the Local Dummy model, so nothing is bought.
//
// Harness data (components/BloomHostHarness.tsx): ticking book-image-3
// ("Page 3") and running the batch of one assigns the result to that page
// straight away, which a single-image run does not do in the Bloom host (there
// "Use this Image" hands the picture to the host instead). book-image-4
// ("Page 4") is left alone, so the no-replacement column is covered too.
const HARNESS_ROUTE = "/?mode=bloom-harness";

// Where the gallery screenshot lands. Kept out of the repo, and overridable so a
// reviewer can ask for it somewhere they will look.
const SCREENSHOT_PATH =
  process.env.GALLERY_SCREENSHOT_PATH ?? path.join(os.tmpdir(), "gallery-columns.png");

const pageColumn = (page: import("@playwright/test").Page, slotId: string) =>
  page.getByTestId(`image-preview-dialog-column-${slotId}`);

test.describe("gallery book pages", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
  });

  test("gives each book page a column, and pairs a chosen result with its page", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 200;
    });

    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Improve Quality", { exact: true }).click();
    await page.getByTestId("tool-model-picker-improve_quality").click();
    await page.getByText("Local Dummy (No AI)").click();
    await page.keyboard.press("Escape");

    await page.getByTestId("batch-tick-book-image-3").click();
    await page.getByRole("button", { name: "Go (1 Image)", exact: true }).click();
    // The batch assigns each result to its page as it lands, so the page's lower
    // strip slot holding a picture is the signal that the replacement is chosen.
    await expect(
      page.getByTestId("book-image-outgoing-slot-book-image-3").locator("img").first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("thumbnail-strip-expand-bookImages").click();
    const dialog = page.getByTestId("image-preview-dialog");
    await expect(dialog).toBeVisible();

    // The page the run was for: the "Replacing" tag, the two captions, and both
    // pictures — the one in the book now and the one that will replace it.
    const replacedColumn = pageColumn(page, "book-image-3");
    await expect(replacedColumn).toHaveAttribute("data-replacing", "true");
    await expect(replacedColumn.getByTestId("image-preview-dialog-page-label")).toHaveText(
      "Page 3",
    );
    await expect(replacedColumn.getByTestId("image-preview-dialog-replacing-pill")).toHaveText(
      "Replacing",
    );
    const captions = replacedColumn.getByTestId("image-preview-dialog-page-caption");
    await expect(captions).toHaveText(["In the book now", "Replacement"]);
    await expect(replacedColumn.locator("img")).toHaveCount(2);
    // No run numbers or prompt in a page column: the two pictures are the point.
    await expect(replacedColumn.getByTestId("image-preview-dialog-facts")).toHaveCount(0);

    // A page with no result: its label and its picture, and nothing else.
    const untouchedColumn = pageColumn(page, "book-image-4");
    await expect(untouchedColumn).toHaveAttribute("data-replacing", "false");
    await expect(untouchedColumn.getByTestId("image-preview-dialog-page-label")).toHaveText(
      "Page 4",
    );
    await expect(untouchedColumn.getByTestId("image-preview-dialog-page-caption")).toHaveCount(0);
    await expect(untouchedColumn.getByTestId("image-preview-dialog-replacing-pill")).toHaveCount(0);
    await expect(untouchedColumn.locator("img")).toHaveCount(1);

    // The gallery's own furniture is still there.
    await expect(dialog.getByText("Gallery", { exact: true })).toBeVisible();
    await expect(page.getByTestId("image-preview-dialog-zoom-hint")).toBeVisible();

    // Ctrl+wheel still resizes the columns rather than the page, and zooming out
    // is how every page fits on screen at once.
    const wideColumn = (await replacedColumn.boundingBox())?.width ?? 0;
    await replacedColumn.hover();
    await page.keyboard.down("Control");
    for (let step = 0; step < 8; step += 1) {
      await page.mouse.wheel(0, 120);
    }
    await page.keyboard.up("Control");
    await expect(async () => {
      const narrowColumn = (await replacedColumn.boundingBox())?.width ?? 0;
      expect(narrowColumn).toBeLessThan(wideColumn);
    }).toPass({ timeout: 5_000 });

    // Back to the first page before the picture is taken: the wheel left the
    // scroller wherever the pointer was.
    await dialog.locator(".MuiDialogContent-root").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForTimeout(500);
    await dialog.screenshot({ path: SCREENSHOT_PATH });

    await page.getByTestId("image-preview-dialog-close").click();
    await expect(dialog).toBeHidden();
  });
});
