import { test, expect } from "@playwright/test";
import {
  resetImageToolsPersistence,
  uploadSampleImageToTarget,
} from "./playwright_helpers";

test.describe("image info icon", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page);
    await page.goto("/");
  });

  test("does not show info on image hover; shows tooltip on info hover; shows dialog on click", async ({
    page,
  }) => {
    test.setTimeout(20_000);
    await uploadSampleImageToTarget(page);

    const targetPanel = page.getByTestId("target-panel");

    await expect(
      targetPanel.getByRole("img", { name: "Image to Edit" })
    ).toBeVisible();

    // The info icon should not be visible until hovering the image holder.
    await expect(targetPanel.getByTestId("image-info-button")).toHaveCount(0);

    // Hovering the image itself should not show the info UI.
    await targetPanel.getByRole("img", { name: "Image to Edit" }).hover();
    await expect(page.getByTestId("image-info-tooltip")).toHaveCount(0);
    await expect(page.getByTestId("image-info-dialog")).toHaveCount(0);

    const infoButton = targetPanel.getByTestId("image-info-button");
    await expect(infoButton).toBeVisible();

    // Hovering the icon shows a tooltip with info.
    await infoButton.hover();
    const tooltip = page.getByTestId("image-info-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Tool:");

    // Clicking the icon opens a dialog with a close button.
    await infoButton.click();
    const dialog = page.getByTestId("image-info-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Full Prompt:");

    await page.getByTestId("image-info-dialog-close").click();
    await expect(dialog).toBeHidden();
  });
});
