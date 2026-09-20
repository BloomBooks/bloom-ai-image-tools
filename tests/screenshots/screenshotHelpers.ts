import { expect, Page } from "@playwright/test";
import { IMAGE_TOOLS_DB_NAME } from "../../services/persistence/constants";
import { ENV_KEY_SKIP_FLAG } from "../../lib/authFlags";
import { resetImageToolsPersistence, setOpenRouterApiKey } from "../playwright_helpers";
import type { Scene } from "./scenes";

/** The editor's whole English string table, read from the running dev server so the
 *  capture never has to import library code (art-styles.json5 etc. only load through Vite). */
export async function loadStringTable(page: Page): Promise<Record<string, string>> {
  await page.goto("/");
  return page.evaluate(async () => {
    // The dev server serves the TypeScript module itself; the path is a URL, not a Node
    // module, so it is kept out of the import() literal that TypeScript would try to resolve.
    const url = "/lib/allStrings.ts";
    const module = (await import(url)) as { ALL_IMAGE_EDITOR_STRINGS: Record<string, string> };
    return module.ALL_IMAGE_EDITOR_STRINGS;
  });
}

/** Like resetImageToolsPersistence, but leaves the welcome dialog showing. */
async function gotoKeepingWelcomeDialog(page: Page, route: string) {
  await page.addInitScript(
    ({ flag, dbName }: { flag: string; dbName: string }) => {
      window.sessionStorage?.setItem(flag, "1");
      (window as any).__imageToolsResetPromise = new Promise<void>((resolve) => {
        try {
          const request = indexedDB.deleteDatabase(dbName);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        } catch {
          resolve();
        }
      });
    },
    { flag: ENV_KEY_SKIP_FLAG, dbName: IMAGE_TOOLS_DB_NAME },
  );
  await page.goto(route);
  await page.evaluate(() => (window as any).__imageToolsResetPromise);
  await page.reload();
}

export async function gotoScene(page: Page, scene: Scene) {
  if (scene.keepWelcomeDialog) {
    await gotoKeepingWelcomeDialog(page, scene.route);
  } else {
    await resetImageToolsPersistence(page, scene.route);
  }
  await hideHarnessChrome(page);
}

/** The fake-Bloom chip and its hidden readouts are not part of the editor. */
export async function hideHarnessChrome(page: Page) {
  await page.addStyleTag({
    content: `
      div:has(> [data-testid="bloom-harness-panel-toggle"]) { display: none !important; }
    `,
  });
}

/** Wait for fonts and for every finite CSS/Web animation (MUI transitions) to finish. */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () =>
        !document.getAnimations().some((a) => {
          const timing = a.effect?.getTiming();
          return a.playState === "running" && timing?.iterations !== Infinity;
        }),
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => undefined);
}

export const TOOL_SECTIONS = ["Enhance", "Localize", "Text", "Games", "More"];

/** Open a tool section (Enhance, Localize, Text, Games, More) if its cards are not showing. */
export async function ensureSectionOpen(page: Page, name: string) {
  const header = page.getByRole("button", { name, exact: true }).first();
  const cards = page.locator("[data-tool-id]");
  const before = await cards.count();
  await header.click();
  await expect
    .poll(async () => cards.count(), { timeout: 3_000 })
    .not.toBe(before)
    .catch(() => undefined);
  if ((await cards.count()) < before) {
    // It was open and we shut it; open it again.
    await header.click();
    await expect.poll(async () => cards.count()).toBeGreaterThan(before - 1);
  }
}

export async function openAllSections(page: Page) {
  for (const section of TOOL_SECTIONS) await ensureSectionOpen(page, section);
}

/** Make a tool the active one, whichever section it is in. */
export async function selectTool(page: Page, toolId: string) {
  const card = page.locator(`[data-tool-id="${toolId}"]`).first();
  if (!(await card.isVisible().catch(() => false))) await openAllSections(page);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  // An open card shows its model picker or its parameters; PDF to Images has neither AI
  // model nor parameters, so do not fail when nothing more appears.
  await expect(card.locator('[data-testid^="tool-model-picker-"], [data-testid^="input-"]').first())
    .toBeVisible({ timeout: 3_000 })
    .catch(() => undefined);
}

/** Point a tool at the Local Dummy model, which draws its result in the browser: no key,
 *  no network, no cost. `delayMs` is how long each pretend generation takes. */
export async function useDummyModel(page: Page, toolId: string, delayMs: number) {
  await page.evaluate((ms) => {
    (window as any).__bloomDummyDelayMs = ms;
  }, delayMs);
  await page.getByTestId(`tool-model-picker-${toolId}`).click();
  await page.getByText("Local Dummy (No AI)").click();
  await page.keyboard.press("Escape");
}

/** The OpenRouter key the e2e suite uses. Scenes that need a live connection are skipped
 *  without it. Only the key check and the balance fetch are made; nothing is generated. */
export const OPENROUTER_TEST_KEY = process.env.BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS ?? "";

export async function connectWithTestKey(page: Page) {
  await setOpenRouterApiKey(page, OPENROUTER_TEST_KEY);
  // The header's credits meter appears once the balance has been fetched.
  await expect(page.getByText("AI image generator credits")).toBeVisible({ timeout: 20_000 });
}

/** Show the key field as dots: the screenshot goes to Crowdin, and the key is a secret. */
export async function maskApiKeyField(page: Page) {
  await page.addStyleTag({
    content: `[data-testid="openrouter-api-key-input"] input { -webkit-text-security: disc; }`,
  });
}

export async function openSettingsGear(page: Page) {
  await page
    .getByRole("button", { name: /^Settings/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
