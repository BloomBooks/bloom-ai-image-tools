import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

// A host without a subscription for AI image editing, or with a Playground book, opens the
// editor in look-around mode (IBloomHostInitPayload.playgroundMode; the harness takes
// ?playground=on). Everything is on show, but no tool can be run, costly or not.
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
      'This tool is in "look-around" mode. To actually edit or create images, you will need a subscription and a book that is not based on the "Playground" template.',
    );

    await page.getByTestId("playground-notice-dismiss").click();
    await expect(notice).toBeHidden();
    await expect(page.getByTestId("openrouter-connect-cta")).toHaveCount(0);
  });

  test("an AI tool cannot be run, and says why", async ({ page }) => {
    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Custom Edit", { exact: true }).click();
    await page.getByTestId("input-prompt").fill("brighten it");

    const applyButton = page.getByRole("button", { name: "Apply Changes", exact: true });
    await expect(applyButton).toBeDisabled();
    await expect(applyButton).toHaveAttribute("title", "Not available in look-around mode");
  });

  test("a tool that runs in the browser cannot be run either", async ({ page }) => {
    await page.getByRole("button", { name: /Games/i }).click();
    await page.getByText("Remove Background", { exact: true }).click();

    const runButton = page.getByRole("button", { name: /Remove Background|Apply Changes/i }).last();
    await expect(runButton).toBeDisabled();
    await expect(runButton).toHaveAttribute("title", "Not available in look-around mode");
  });

  test("PDF to Images, which needs no AI at all, cannot be run either", async ({ page }) => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByText("PDF to Images", { exact: true }).click();

    const chooseButton = page.getByRole("button", { name: /Choose PDF/i }).last();
    await expect(chooseButton).toBeDisabled();
    await expect(chooseButton).toHaveAttribute("title", "Not available in look-around mode");
  });
});
