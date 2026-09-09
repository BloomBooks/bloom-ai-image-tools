import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

// A host without a subscription for AI image editing opens the editor in playground mode
// (IBloomHostInitPayload.playgroundMode; the harness takes ?playground=on). Everything is
// on show, but no tool that would spend money at OpenRouter can be run.
const PLAYGROUND_ROUTE = "/?mode=bloom-harness&playground=on";

test.describe("playground mode", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, PLAYGROUND_ROUTE);
    await page.goto(PLAYGROUND_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await expect(page.getByTestId("playground-notice-dialog")).toBeVisible();
    await page.getByTestId("playground-notice-dismiss").click();
  });

  test("says on opening that the generators cannot be used, and offers no way to connect", async ({
    page,
  }) => {
    await page.reload();
    const notice = page.getByTestId("playground-notice-dialog");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      "In the playground mode you can look around but you can't yet use the AI image generators.",
    );

    await page.getByTestId("playground-notice-dismiss").click();
    await expect(notice).toBeHidden();
    await expect(page.getByTestId("openrouter-connect-cta")).toHaveCount(0);
  });

  test("a tool that would call OpenRouter cannot be run, and says why", async ({ page }) => {
    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Custom Edit", { exact: true }).click();
    await page.getByTestId("input-prompt").fill("brighten it");

    const applyButton = page.getByRole("button", { name: "Apply Changes", exact: true });
    await expect(applyButton).toBeDisabled();
    await expect(applyButton).toHaveAttribute("title", "Not available in playground mode");
  });

  test("a tool that runs in the browser is still usable", async ({ page }) => {
    await page.getByRole("button", { name: /Games/i }).click();
    await page.getByText("Remove Background", { exact: true }).click();

    await expect(
      page.getByRole("button", { name: /Remove Background|Apply Changes/i }).last(),
    ).toBeEnabled();
  });
});
