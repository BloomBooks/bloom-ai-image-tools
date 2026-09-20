// `pnpm screenshots:capture`: photograph each scene in scenes.ts and record, per screenshot,
// which string ids are visible and where. Output goes to screenshots-out/ for
// dev/uploadCrowdinScreenshots.mjs and dev/screenshotsCoverage.mjs.
//
//   SCREENSHOT_SCENES=settings-dialog,tool-list   capture only those scenes
import { test, expect, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Scene, SCENES } from "./scenes";
import { extractTags } from "./tagExtractor";
import { gotoScene, loadStringTable, settle } from "./screenshotHelpers";

const outDir = join(process.cwd(), "screenshots-out");
const onlyList = (process.env.SCREENSHOT_SCENES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// An empty list means every scene, not none.
const only = onlyList.length ? onlyList : undefined;

let table: Record<string, string>;

test.beforeAll(async ({ browser }) => {
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage();
  table = await loadStringTable(page);
  await page.close();
  expect(Object.keys(table).length).toBeGreaterThan(100);
  writeFileSync(join(outDir, "strings.json"), JSON.stringify(table, null, 2) + "\n");
});

async function capture(page: Page, scene: Scene, name: string) {
  await settle(page);
  const result = await page.evaluate(extractTags, { table, hitTest: scene.hitTest ?? true });
  const png = await page.screenshot({ animations: "disabled", caret: "hide" });
  const viewport = page.viewportSize()!;
  writeFileSync(join(outDir, `${name}.png`), png);
  writeFileSync(
    join(outDir, `${name}.json`),
    JSON.stringify(
      {
        name,
        route: scene.route,
        notes: scene.notes,
        width: viewport.width,
        height: viewport.height,
        tags: result.tags,
        unmatched: result.unmatched,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${name}: ${result.tags.length} tags, ${result.unmatched.length} unmatched`);
  return result.tags.length;
}

for (const scene of SCENES) {
  test(scene.name, async ({ page }) => {
    test.skip(!!only && !only.includes(scene.name), "not in SCREENSHOT_SCENES");
    test.skip(!!scene.skip, scene.skip);
    if (scene.viewport) await page.setViewportSize(scene.viewport);

    await gotoScene(page, scene);
    const ready = scene.ready?.(page) ?? page.getByTestId("thumbnail-strip-bookImages");
    await expect(ready).toBeVisible({ timeout: 15_000 });
    await scene.setup?.(page);

    let tagCount = await capture(page, scene, scene.name);

    // A scrolling area longer than the screen is photographed page by page.
    if (scene.scrollArea) {
      const area = scene.scrollArea(page);
      for (let index = 2; index <= 12; index++) {
        const moved = await area.evaluate((el) => {
          const before = el.scrollTop;
          el.scrollTop = before + el.clientHeight - 40;
          return el.scrollTop > before;
        });
        if (!moved) break;
        tagCount += await capture(page, scene, `${scene.name}-${index}`);
      }
    }
    if (scene.after) {
      await scene.after(page, async (suffix) => {
        tagCount += await capture(page, scene, `${scene.name}-${suffix}`);
      });
    }
    expect(tagCount).toBeGreaterThan(0);
  });
}
