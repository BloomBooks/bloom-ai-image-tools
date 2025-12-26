import { test, expect } from "@playwright/test";

test.describe("thumbnail strips", () => {
  test("pinning tabs keeps strips visible", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("thumbnail-strip-history")).toBeVisible();

    await page.getByTestId("thumbnail-tab-reference").click();
    await expect(page.getByTestId("thumbnail-strip-reference")).toBeVisible();

    await page.getByTestId("thumbnail-tab-pin-reference").click();
    await expect(page.getByTestId("thumbnail-strip-reference")).toBeVisible();

    await page.getByTestId("thumbnail-tab-environment").click();
    await expect(page.getByTestId("thumbnail-strip-environment")).toBeVisible();
  });
});
