import { expect, test } from "@playwright/test";
import {
  resetImageToolsPersistence,
  uploadSampleImageToTarget,
} from "./playwright_helpers";

test.describe("history drag-and-drop", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page);
  });

  test("history items can populate target and result panels", async ({
    page,
  }) => {
    await uploadSampleImageToTarget(page);

    const historyStrip = page.getByTestId("thumbnail-strip-history").first();
    const historyThumb = historyStrip.getByTestId("history-card").first();
    await expect(historyThumb).toBeVisible();
    const initialHistoryThumbCount = await historyStrip
      .getByTestId("history-card")
      .count();
    expect(initialHistoryThumbCount).toBeGreaterThan(0);

    const targetPanel = page.getByTestId("target-panel");
    await targetPanel.hover();
    await targetPanel.getByRole("button", { name: "Clear Image" }).click();
    await expect(
      targetPanel.getByRole("img", { name: "Image to Edit" })
    ).toHaveCount(0);

    await historyThumb.dragTo(targetPanel, {
      sourcePosition: { x: 56, y: 70 },
    });
    await expect(
      targetPanel.getByRole("img", { name: "Image to Edit" })
    ).toHaveCount(1);

    const resultPanel = page.getByTestId("result-panel");
    await page.getByTestId("history-card").first().dragTo(resultPanel, {
      sourcePosition: { x: 56, y: 70 },
    });
    await expect(
      page.getByRole("img", { name: "Result" })
    ).toBeVisible();
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(
      initialHistoryThumbCount
    );
  });
});
