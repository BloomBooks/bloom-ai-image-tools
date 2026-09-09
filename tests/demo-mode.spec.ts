import { test, expect } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

// A host without a subscription for AI image editing opens the editor in demo mode
// (IBloomHostInitPayload.demoOnly; the harness takes ?demo=on). Everything is on show,
// but no tool that would spend money at OpenRouter can be run.
const DEMO_ROUTE = "/?mode=bloom-harness&demo=on";

test.describe("demo mode", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, DEMO_ROUTE);
    await page.goto(DEMO_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
  });

  test("a tool that would call OpenRouter cannot be run, and says why", async ({ page }) => {
    await page.getByRole("button", { name: /Enhance/i }).click();
    await page.getByText("Custom Edit", { exact: true }).click();
    await page.getByTestId("input-prompt").fill("brighten it");

    const applyButton = page.getByRole("button", { name: "Apply Changes", exact: true });
    await expect(applyButton).toBeDisabled();
    await expect(applyButton).toHaveAttribute("title", "Not available in this demo");
  });

  test("a tool that runs in the browser is still usable", async ({ page }) => {
    await page.getByRole("button", { name: /Games/i }).click();
    await page.getByText("Remove Background", { exact: true }).click();

    await expect(
      page.getByRole("button", { name: /Remove Background|Apply Changes/i }).last(),
    ).toBeEnabled();
  });
});
