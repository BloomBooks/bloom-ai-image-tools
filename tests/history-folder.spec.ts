import { test, expect } from "@playwright/test";
import {
  closeSettingsDialog,
  installMockFileSystemAccess,
  openSettingsDialog,
  resetImageToolsPersistence,
  uploadSampleImageToTarget,
} from "./playwright_helpers";

test.describe("folder-backed history", () => {
  test.beforeEach(async ({ page }) => {
    await installMockFileSystemAccess(page);
    await resetImageToolsPersistence(page);
  });

  test("writes manifest metadata and restores history after reattach", async ({
    page,
  }) => {
    await uploadSampleImageToTarget(page);

    await openSettingsDialog(page);
    await page.getByRole("button", { name: /Choose folder/i }).click();
    await expect(
      page.getByRole("button", { name: /Stop storing history in folder/i })
    ).toBeVisible();
    await closeSettingsDialog(page);

    await page.waitForTimeout(2200);

    const manifestText = await page.evaluate(() => {
      const state = (window as any).__getMockFsState?.();
      return state?.root?.files?.["history-manifest.json"]?.text ?? null;
    });
    expect(manifestText).not.toBeNull();
    const manifest = JSON.parse(manifestText as string);
    expect(manifest.appState.history.length).toBeGreaterThan(0);
    expect(manifest.appState.history[0].promptUsed).toBe("Original Upload");
    expect(manifest.appState.history[0].imageFileName).toBeTruthy();

    await resetImageToolsPersistence(page);

    await openSettingsDialog(page);
    await page.getByRole("button", { name: /Choose folder/i }).click();
    await closeSettingsDialog(page);

    const historyStrip = page.getByTestId("thumbnail-strip-history").first();
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(1);
    await expect(page.getByAltText("Image to Edit")).toBeVisible({
      timeout: 15_000,
    });
  });
});
