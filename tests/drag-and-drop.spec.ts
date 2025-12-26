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
    const historyThumb = historyStrip
      .getByTestId("thumbnail-strip-item-history")
      .first();
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

    {
      const from = await historyThumb.boundingBox();
      const to = await targetPanel.boundingBox();
      expect(from).toBeTruthy();
      expect(to).toBeTruthy();
      if (!from || !to) return;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
    }
    await expect(
      targetPanel.getByRole("img", { name: "Image to Edit" })
    ).toHaveCount(1);

    const resultPanel = page.getByTestId("result-panel");
    {
      const from = await historyStrip
        .getByTestId("thumbnail-strip-item-history")
        .first()
        .boundingBox();
      const to = await resultPanel.boundingBox();
      expect(from).toBeTruthy();
      expect(to).toBeTruthy();
      if (!from || !to) return;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
    }
    await expect(
      page.getByRole("img", { name: "Result" })
    ).toBeVisible();
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(
      initialHistoryThumbCount
    );
  });
});
