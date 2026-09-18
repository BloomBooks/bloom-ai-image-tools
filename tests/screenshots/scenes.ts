// The UI states we photograph for Crowdin. Each becomes AiImageEditor/<name>.png there.
// Adding a string to a screen already listed here needs nothing; a string that only shows
// in a new state needs a new entry.
import { expect, Locator, Page } from "@playwright/test";
import { openAllSections, selectTool } from "./screenshotHelpers";

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

/** One scene per tool: its card open with its description, parameters and action button. */
const toolScenes: Scene[] = [...TOOL_IDS, ...extraToolIds].map((toolId) => ({
  name: `tool-${toolId}`,
  route: HARNESS,
  setup: (page) => selectTool(page, toolId),
  // Each dropdown in the card, opened, so its options show.
  after: async (page, capture) => {
    const card = page.locator(`[data-tool-id="${toolId}"]`).first();
    const dropdowns = card.getByRole("combobox");
    const count = await dropdowns.count();
    for (let i = 0; i < count; i++) {
      await dropdowns.nth(i).click();
      const listbox = page.getByRole("listbox");
      await expect(listbox).toBeVisible();
      await capture(`dropdown-${i + 1}`);
      await page.keyboard.press("Escape");
      await expect(listbox).toBeHidden();
    }
  },
}));

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
  },
  {
    name: "settings-dialog",
    route: HARNESS,
    setup: async (page) => {
      const cta = page.getByTestId("openrouter-connect-cta");
      if (await cta.isVisible()) {
        await cta.click();
      } else {
        await page
          .getByRole("button", { name: /^Settings\s+•/i })
          .first()
          .click();
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
    name: "playground-notice",
    route: `${HARNESS}&playground=on`,
    ready: (page) => page.getByTestId("playground-notice-dialog"),
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
];
