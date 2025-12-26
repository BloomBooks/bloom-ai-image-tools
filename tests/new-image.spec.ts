import { test, expect } from "@playwright/test";
import { inexpensive_model_for_testing } from "./playwright_helpers";

const ROBOT_PROMPT = "A friendly robot";

const shouldRunLiveOpenRouter =
  (process.env.E2E_RUN_OPENROUTER || "").trim() === "1" &&
  (process.env.E2E_OPENROUTER_API_KEY || "").trim().length > 0;

test.skip(
  !shouldRunLiveOpenRouter,
  "Set E2E_RUN_OPENROUTER=1 and E2E_OPENROUTER_API_KEY to run live OpenRouter tests"
);

test("creates a new robot image via OpenRouter", async ({ page }) => {
  await page.goto("/");

  // When using env key, we should see the connected status
  // Use text locator as a fallback since the component may take a moment to render
  // Assert that we are in a connected state via the Settings button label.
  await expect(
    page.getByRole("button", { name: /^Settings\s+•/i }).first()
  ).toHaveAttribute(
    "aria-label",
    /OpenRouter API key linked|OpenRouter connected via OAuth|OpenRouter key supplied by environment/i
  );

  await page.getByRole("button", { name: /Create an Image/i }).click();

  const promptBox = page.getByTestId("input-prompt");
  await promptBox.fill(ROBOT_PROMPT);

  const generateButton = page.getByRole("button", { name: /Generate Image/i });
  await generateButton.click();

  const processing = page.getByRole("button", { name: /Processing.../i });
  await expect(processing).toBeDisabled();

  // Race: wait for either success (result image) or failure (error banner)
  // This ensures we fail fast on errors rather than waiting for the long timeout
  const resultImage = page.getByRole("img", { name: "Result" });
  const errorBanner = page.getByTestId("error-banner");

  await expect(async () => {
    // Check for error first - if present, fail immediately
    const errorVisible = await errorBanner.isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await errorBanner.textContent();
      throw new Error(`API error: ${errorText}`);
    }
    // Otherwise check for success
    await expect(resultImage).toHaveAttribute("src", /data:image\//);
  }).toPass({ timeout: 60_000, intervals: [500] });

  await expect(resultImage).toBeVisible();

  // Verify history item displays correct model and cost
  // Hover over the first history card, then open its overflow controls to reach the info icon.
  const historyThumb = page.locator('[draggable="true"]').first();
  await historyThumb.hover();

  const historyCard = page.getByTestId("history-card").first();
  const moreActions = historyCard.getByRole("button", { name: "More actions" });
  await expect(moreActions).toBeVisible();
  await moreActions.hover();

  const infoButton = historyCard.getByTestId("image-info-button");
  await expect(infoButton).toBeVisible();
  await infoButton.hover();

  // Verify the model matches what we expect from the API
  const modelDisplay = page.getByTestId("history-model");
  await expect(modelDisplay).toBeVisible();
  await expect(modelDisplay).toHaveText(inexpensive_model_for_testing);

  // Verify the cost is non-zero (API always returns a cost > 0)
  const costDisplay = page.getByTestId("history-cost");
  await expect(costDisplay).toBeVisible();
  // Cost should be a dollar amount greater than $0.0000
  await expect(costDisplay).not.toHaveText("$0.0000");
  await expect(costDisplay).toHaveText(/^\$\d+\.\d{4}$/);
});
