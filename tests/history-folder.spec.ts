import { test, expect } from "@playwright/test";
import {
  ALT_SAMPLE_IMAGE_PATH,
  closeSettingsDialog,
  installMockFileSystemAccess,
  openSettingsDialog,
  resetImageToolsPersistence,
  uploadSampleImageToTarget,
  uploadImageToTarget,
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
    expect(
      manifest.appState.history.some(
        (item: { promptUsed?: string }) => item.promptUsed === "Original Upload"
      )
    ).toBeTruthy();
    expect(
      manifest.appState.history.some(
        (item: { imageFileName?: string | null }) => !!item.imageFileName
      )
    ).toBeTruthy();

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

  test("reconnecting folder keeps visible browser history and restores hidden folder history", async ({
    page,
  }) => {
    await openSettingsDialog(page);
    await page.getByRole("button", { name: /Choose folder/i }).click();
    await expect(
      page.getByRole("button", { name: /Stop storing history in folder/i })
    ).toBeVisible();
    await closeSettingsDialog(page);

    for (let index = 0; index < 7; index += 1) {
      await uploadImageToTarget(
        page,
        index % 2 === 0 ? ALT_SAMPLE_IMAGE_PATH : ALT_SAMPLE_IMAGE_PATH
      );
    }

    await page.waitForTimeout(2200);

    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("bloom-image-tools-fs");
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    });

    await page.reload();

    const historyStrip = page.getByTestId("thumbnail-strip-history").first();
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(6);
    await expect(
      historyStrip.getByRole("button", { name: /Reconnect folder/i })
    ).toBeVisible();

    await uploadSampleImageToTarget(page);
    await expect(historyStrip.getByTestId("history-card")).toHaveCount(7);

    await historyStrip.getByRole("button", { name: /Reconnect folder/i }).click();

    await expect(historyStrip.getByTestId("history-card")).toHaveCount(8, {
      timeout: 15_000,
    });
  });
});
