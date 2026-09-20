// The UI states we photograph for Crowdin. Each becomes AiImageEditor/<name>.png there.
// Adding a string to a screen already listed here needs nothing; a string that only shows
// in a new state needs a new entry.
import { expect, Locator, Page } from "@playwright/test";
import {
  connectWithTestKey,
  maskApiKeyField,
  openAllSections,
  openSettingsGear,
  OPENROUTER_TEST_KEY,
  selectTool,
  useDummyModel,
} from "./screenshotHelpers";

export interface Scene {
  name: string;
  route: string;
  viewport?: { width: number; height: number };
  /** Leave the OpenRouter welcome dialog up instead of skipping it. */
  keepWelcomeDialog?: boolean;
  /** What must be visible before setup runs. Default: the Book Images strip. */
  ready?: (page: Page) => Locator;
  setup?: (page: Page) => Promise<void>;
  /** An element to scroll through, taking a screenshot per page (<name>-2, <name>-3, ...). */
  scrollArea?: (page: Page) => Locator;
  /** Extra states of the same scene; call capture(suffix) for each, giving <name>-<suffix>. */
  after?: (page: Page, capture: (suffix: string) => Promise<void>) => Promise<void>;
  /** Default true. Turn off when a Popper legitimately overlaps text we still want. */
  hitTest?: boolean;
  /** Why this scene cannot run on this machine; the runner skips it and says so. */
  skip?: string;
  notes?: string;
}

const HARNESS = "/?mode=bloom-harness";

const TOOL_IDS = [
  "enhance_drawing",
  "custom",
  "improve_drawing",
  "upscale",
  "extract_cast_of_characters",
  "ethnicity",
  "apply_localized_characters",
  "change_text",
  "stylized_title",
  "make_gif",
  "remove_object",
  "remove_background",
  "generate_image",
  // "break_comic_into_images" is disabled in the registry, so it has no card.
  // "pdf_to_images" is left out until its open bug is fixed; selecting it upsets the run.
  "coloring_book",
  "change_style",
  "generate_pallet",
];

// SCREENSHOT_EXTRA_TOOLS=pdf_to_images adds tools left out above, e.g. to reproduce a problem.
const extraToolIds = (process.env.SCREENSHOT_EXTRA_TOOLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Open every dropdown inside `root`, one screenshot each, so the options show. */
async function captureDropdowns(
  page: Page,
  root: Locator,
  capture: (suffix: string) => Promise<void>,
  prefix = "dropdown",
) {
  const dropdowns = root.getByRole("combobox");
  const count = await dropdowns.count();
  for (let i = 0; i < count; i++) {
    await dropdowns.nth(i).click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await capture(`${prefix}-${i + 1}`);
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
  }
}

/** One scene per tool: its card open with its description, parameters and action button. */
const toolScenes: Scene[] = [...TOOL_IDS, ...extraToolIds].map((toolId) => ({
  name: `tool-${toolId}`,
  route: HARNESS,
  // Tall enough for a long card's action button to be on screen.
  viewport: { width: 1280, height: 1000 },
  setup: (page) => selectTool(page, toolId),
  after: (page, capture) =>
    captureDropdowns(page, page.locator(`[data-tool-id="${toolId}"]`).first(), capture),
}));

const PROMPT = "Make the colors brighter";

const resultImage = (page: Page) => page.getByTestId("result-panel").locator("img").first();

const needsKey = OPENROUTER_TEST_KEY
  ? undefined
  : "BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS is not set";

export const SCENES: Scene[] = [
  {
    name: "workspace-harness",
    route: HARNESS,
    notes: "Main window as Bloom opens it: header, tool list, three panels, Book Images strip.",
  },
  {
    name: "tool-list",
    route: HARNESS,
    viewport: { width: 1280, height: 2200 },
    setup: openAllSections,
    notes: "Every tool section open so all tool titles show.",
  },
  ...toolScenes,
  {
    name: "art-style-chooser",
    route: `${HARNESS}&seed=empty-slot`,
    viewport: { width: 1280, height: 1000 },
    ready: (page) => page.getByTestId("input-styleId"),
    setup: async (page) => {
      await page.getByTestId("input-styleId").click();
      await expect(page.getByTestId("art-style-chooser-scroll")).toBeVisible();
    },
    scrollArea: (page) => page.getByTestId("art-style-chooser-scroll"),
  },
  {
    name: "model-picker-menu",
    route: HARNESS,
    setup: async (page) => {
      await selectTool(page, "custom");
      await page.getByTestId("tool-model-picker-custom").click();
      await expect(page.getByText("Local Dummy (No AI)")).toBeVisible();
    },
    // The quality levels live in a dropdown inside the menu.
    after: (page, capture) =>
      captureDropdowns(page, page.locator('[role="presentation"], [role="menu"]'), capture),
  },
  {
    name: "settings-dialog",
    route: HARNESS,
    setup: async (page) => {
      const cta = page.getByTestId("openrouter-connect-cta");
      if (await cta.isVisible()) {
        await cta.click();
      } else {
        await openSettingsGear(page);
      }
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "welcome-dialog",
    route: "/",
    keepWelcomeDialog: true,
    ready: (page) => page.getByRole("button", { name: "I just want to look around" }),
  },
  {
    name: "standalone-empty",
    route: "/",
    ready: (page) => page.getByTestId("target-panel"),
    // With a tool chosen and no image, the action button explains what is missing.
    after: async (page, capture) => {
      await selectTool(page, "custom");
      await capture("tool");
    },
    notes: "The standalone editor with nothing loaded: the empty slots' invitations.",
  },
  {
    name: "playground-notice",
    route: `${HARNESS}&playground=on`,
    ready: (page) => page.getByTestId("playground-notice-dialog"),
    // Past the notice, a tool's action button says it cannot run in this mode.
    after: async (page, capture) => {
      await page.getByTestId("playground-notice-dismiss").click();
      await expect(page.getByTestId("playground-notice-dialog")).toBeHidden();
      await selectTool(page, "custom");
      await capture("tool");
    },
  },
  {
    name: "book-image-actions",
    route: HARNESS,
    setup: async (page) => {
      // The actions are icon buttons whose labels are aria-labels; More reveals the rest.
      const slot = page.getByTestId("book-image-current-slot-book-image-1");
      await slot.hover();
      const more = slot.getByRole("button", { name: "More actions" }).first();
      await expect(more).toBeVisible();
      await more.click();
      await expect(page.getByRole("button", { name: "Download" }).first())
        .toBeVisible()
        .catch(() => undefined);
    },
    hitTest: false,
    notes: "Hovering a Book Images thumbnail shows its action buttons; More actions is open.",
  },
  {
    name: "preview-dialog",
    route: HARNESS,
    setup: async (page) => {
      await page.getByTestId("thumbnail-strip-expand-bookImages").click();
      await expect(page.getByTestId("image-preview-dialog")).toBeVisible();
    },
  },
  {
    name: "slot-context-menu",
    route: HARNESS,
    setup: async (page) => {
      await page.getByTestId("target-panel").locator("img").first().click({ button: "right" });
      await expect(page.getByTestId("image-slot-context-menu")).toBeVisible();
    },
  },
  {
    name: "text-context-menu",
    route: HARNESS,
    setup: async (page) => {
      await selectTool(page, "custom");
      await page.getByTestId("input-prompt").click({ button: "right" });
      await expect(page.getByTestId("text-field-context-menu")).toBeVisible();
    },
  },
  {
    name: "history-tab",
    route: HARNESS,
    setup: async (page) => {
      await page.getByTestId("thumbnail-tab-history").click();
      await expect(page.getByTestId("thumbnail-strip-history")).toBeVisible();
    },
  },
  {
    name: "characters-tab",
    route: HARNESS,
    setup: async (page) => {
      await page.getByTestId("thumbnail-tab-characters").click();
      await expect(page.getByTestId("thumbnail-strip-characters")).toBeVisible();
    },
  },

  // States around a run, using the Local Dummy model so nothing is spent.
  {
    name: "create-image-ready",
    route: `${HARNESS}&seed=empty-slot`,
    viewport: { width: 1280, height: 1000 },
    ready: (page) => page.getByTestId("input-styleId"),
    setup: async (page) => {
      await page.locator('[data-tool-id="generate_image"] textarea').first().fill("A red hen");
      await expect(page.getByRole("button", { name: "Generate Image" })).toBeVisible();
    },
    notes: "Create an Image with a description typed, so the Generate button is live.",
  },
  {
    name: "run-in-progress",
    route: HARNESS,
    setup: async (page) => {
      await selectTool(page, "custom");
      await useDummyModel(page, "custom", 120_000);
      await page.getByTestId("input-prompt").fill(PROMPT);
      await page.getByRole("button", { name: "Apply Changes", exact: true }).click();
      await expect(page.getByRole("button", { name: "Click to Cancel" })).toBeVisible();
    },
    notes: "A Custom Edit running: the cancel button and the busy result pane.",
  },
  {
    name: "run-finished",
    route: HARNESS,
    setup: async (page) => {
      await selectTool(page, "custom");
      await useDummyModel(page, "custom", 100);
      await page.getByTestId("input-prompt").fill(PROMPT);
      await page.getByRole("button", { name: "Apply Changes", exact: true }).click();
      await expect(resultImage(page)).toBeVisible({ timeout: 20_000 });
    },
    after: async (page, capture) => {
      await resultImage(page).hover();
      await expect(page.getByRole("button", { name: "More actions" }).first()).toBeVisible();
      await page.getByRole("button", { name: "More actions" }).first().click();
      await capture("actions");
    },
    hitTest: false,
    notes: "A Custom Edit finished: the result with its Use this button, then its action buttons.",
  },
  {
    name: "batch-selected",
    route: HARNESS,
    setup: async (page) => {
      await selectTool(page, "custom");
      await useDummyModel(page, "custom", 4_000);
      await page.getByTestId("input-prompt").fill(PROMPT);
      for (const id of ["book-image-1", "book-image-2", "book-image-4"]) {
        await page.getByTestId(`batch-tick-${id}`).click();
      }
      await expect(
        page.getByRole("button", { name: "Apply Changes to 3 Images", exact: true }),
      ).toBeVisible();
    },
    after: async (page, capture) => {
      await page.getByRole("button", { name: "Apply Changes to 3 Images", exact: true }).click();
      await expect(page.getByTestId("batch-progress-label")).toBeVisible();
      await capture("running");
      await expect(page.getByTestId("batch-progress-label")).toBeHidden({ timeout: 60_000 });
      await capture("done");
    },
    notes: "Three book images ticked for a batch; then the batch running; then finished.",
  },

  // States that need a real OpenRouter connection. Only the key check and the balance
  // fetch happen; no image is generated with the key.
  {
    name: "connected",
    route: HARNESS,
    skip: needsKey,
    setup: connectWithTestKey,
    after: async (page, capture) => {
      // The meter's figures live in its tooltip.
      await page.getByText("AI image generator credits").hover();
      await expect(page.locator("[data-role='credits-tooltip']")).toHaveCSS("opacity", "1");
      await capture("credits-tooltip");
      await page.mouse.move(640, 400);
      await maskApiKeyField(page);
      await openSettingsGear(page);
      const testKey = page.getByTestId("openrouter-test-key");
      await expect(testKey).toBeVisible();
      await capture("settings");
      // The check ends with "Key verified, $x available" or an error line; either is worth a
      // picture, so wait for the button to stop saying Testing rather than for one outcome.
      await testKey.click();
      await expect(testKey).toHaveText("Test Key", { timeout: 20_000 });
      await capture("key-checked");
    },
    notes:
      "Connected with an API key: the credits meter, then the settings dialog and a key check.",
  },
];
