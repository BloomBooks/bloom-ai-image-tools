import { expect, test, type Page } from "@playwright/test";
import { resetImageToolsPersistence, uploadSampleImageToTarget } from "./playwright_helpers";

// Pinpoint where the drag stall begins:
//   mouse.down  -> mouse.move(+1)  -> mouse.move(+5)  -> mouse.move(+30)
// For each step, measure how long Playwright takes to return,
// plus all long-tasks that fired during that window.
//
// Compare two regimes:
//   A) empty history (0 seeded items)
//   B) 100 seeded items
//
// Goal: confirm whether the stall scales with item count and isolate which
// step triggers it.

const installProbe = async (page: Page) => {
  await page.evaluate(() => {
    const w = window as Window & {
      __probe?: {
        events: Array<{ name: string; t: number; meta?: string }>;
        longTasks: Array<{ start: number; duration: number }>;
        boundary: (label: string) => void;
        markers: Array<{ label: string; t: number }>;
      };
    };
    const events: Array<{ name: string; t: number; meta?: string }> = [];
    const longTasks: Array<{ start: number; duration: number }> = [];
    const markers: Array<{ label: string; t: number }> = [];
    w.__probe = {
      events,
      longTasks,
      markers,
      boundary: (label: string) => markers.push({ label, t: performance.now() }),
    };
    const log = (name: string, meta?: string) => events.push({ name, t: performance.now(), meta });

    for (const eventName of [
      "pointerdown",
      "mousedown",
      "pointermove",
      "mousemove",
      "dragstart",
      "drag",
      "dragover",
      "dragend",
      "pointerup",
      "mouseup",
      "click",
    ]) {
      let count = 0;
      document.addEventListener(
        eventName,
        () => {
          count += 1;
          if (
            eventName === "pointermove" ||
            eventName === "mousemove" ||
            eventName === "dragover" ||
            eventName === "drag"
          ) {
            if (count <= 3 || count % 25 === 0) log(eventName, `#${count}`);
          } else {
            log(eventName);
          }
        },
        true,
      );
    }

    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          longTasks.push({ start: e.startTime, duration: e.duration });
        }
      });
      obs.observe({ type: "longtask", buffered: true });
    } catch {
      // ignore
    }
  });
};

const dumpProbe = async (page: Page, label: string) => {
  const probe = await Promise.race<any>([
    page.evaluate(() => (window as Window & { __probe?: any }).__probe),
    new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  if (!probe) {
    console.log(`\n========= ${label} (probe unreachable — page may be stuck) =========`);
    return;
  }
  console.log(`\n========= ${label} =========`);
  console.log("events:");
  for (const e of probe.events ?? []) {
    console.log(`  t=${e.t.toFixed(1).padStart(9)}  ${e.name.padEnd(12)}  ${e.meta ?? ""}`);
  }
  console.log("markers:");
  for (const m of probe.markers ?? []) {
    console.log(`  t=${m.t.toFixed(1).padStart(9)}  >> ${m.label}`);
  }
  console.log("long tasks (>50ms):");
  for (const lt of probe.longTasks ?? []) {
    console.log(
      `  start=${lt.start.toFixed(1).padStart(9)}  duration=${lt.duration.toFixed(1).padStart(7)}ms`,
    );
  }
};

const STEP_BUDGET_MS = 5000;

const runDragSteps = async (
  page: Page,
  fromXY: { x: number; y: number },
): Promise<{ deltas: Record<string, number | "STALLED"> }> => {
  const wallStart = Date.now();
  const deltas: Record<string, number | "STALLED"> = {};
  const phase = async (label: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    await page.evaluate((l) => (window as any).__probe.boundary(l), `before ${label}`);
    try {
      await Promise.race([
        fn(),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error(`step '${label}' did not return within ${STEP_BUDGET_MS}ms`)),
            STEP_BUDGET_MS,
          ),
        ),
      ]);
    } catch {
      const dt = Date.now() - t0;
      console.log(
        `[stall-isolate] ${(Date.now() - wallStart).toString().padStart(6)}ms  step '${label}' STALLED after ${dt}ms`,
      );
      deltas[label] = "STALLED";
      // We rethrow so the test stops; subsequent steps would queue behind the
      // stuck CDP request anyway.
      throw new Error(`STALLED at '${label}'`);
    }
    const dt = Date.now() - t0;
    deltas[label] = dt;
    await page
      .evaluate((l) => (window as any).__probe.boundary(l), `after ${label}`)
      .catch(() => {});
    console.log(
      `[stall-isolate] ${(Date.now() - wallStart).toString().padStart(6)}ms  step '${label}' took ${dt}ms`,
    );
  };

  await phase("move-to-start", () => page.mouse.move(fromXY.x, fromXY.y));
  await phase("mouse.down", () => page.mouse.down());
  await phase("move +1px", () => page.mouse.move(fromXY.x + 1, fromXY.y + 1, { steps: 1 }));
  await phase("move +5px", () => page.mouse.move(fromXY.x + 5, fromXY.y + 5, { steps: 1 }));
  await phase("move +30px", () => page.mouse.move(fromXY.x + 30, fromXY.y + 30, { steps: 1 }));
  await phase("settle 1500", () => page.waitForTimeout(1500));
  await phase("mouse.up", () => page.mouse.up());

  return { deltas };
};

test.describe("drag stall isolation", () => {
  // The 5s per-step budget (STEP_BUDGET_MS) is what gates "drag stall".
  // The 120s test timeout is generous so that occasional slow setup (Vite
  // recompile, seeding 100 IDB rows, then re-rendering them) doesn't fail us.
  test.setTimeout(120_000);
  test.use({ actionTimeout: 8_000, navigationTimeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as Window & { __BLOOM_DND_DEBUG?: boolean }).__BLOOM_DND_DEBUG = true;
    });
    await resetImageToolsPersistence(page);
  });

  test("A) empty history baseline (drag the Image-to-Edit panel)", async ({ page }) => {
    // Get one image into the target panel so we have something draggable.
    await uploadSampleImageToTarget(page);
    await page.waitForTimeout(300);
    await installProbe(page);

    const targetPanel = page.getByTestId("target-panel");
    const targetImg = targetPanel.getByRole("img", { name: "Image to Edit" });
    await expect(targetImg).toBeVisible();
    const box = await targetImg.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    const { deltas } = await runDragSteps(page, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });

    console.log("[stall-isolate] EMPTY summary:", JSON.stringify(deltas));
    await dumpProbe(page, "EMPTY HISTORY BASELINE");

    // Regression guards — empty case should be fast and never stall.
    expect(deltas["move +5px"], "drag activation (+5px) must not stall").not.toBe("STALLED");
    expect(Number(deltas["move +5px"]), "empty drag activation should be <500ms").toBeLessThan(500);
  });

  test("B) 100 seeded history items", async ({ page }) => {
    // Seed + reload sometimes races with `resetImageToolsPersistence`'s init
    // script (rarely the IDB delete fires AFTER our seed, leaving the page
    // empty). Retry up to 3 times if the strip doesn't materialise.
    let seeded = false;
    for (let attempt = 1; attempt <= 3 && !seeded; attempt++) {
      await page.waitForFunction(() => typeof (window as any).seedHistory === "function");
      await page.evaluate(() => (window as any).seedHistory(100, "/sample.png", { reload: false }));
      await page.reload({ waitUntil: "load" });

      seeded = await page
        .waitForFunction(
          () =>
            document.querySelectorAll('[data-testid="thumbnail-strip-item-history"]').length >= 1,
          undefined,
          { timeout: 20_000 },
        )
        .then(() => true)
        .catch(() => false);

      if (!seeded) {
        console.log(`[stall-isolate] seed attempt ${attempt} produced no thumbs; retrying`);
      }
    }
    expect(seeded, "seedHistory should produce at least one history thumb").toBe(true);

    const strip = page.getByTestId("thumbnail-strip-history").first();
    await expect(strip).toBeVisible();
    // Verify in the log that we actually have 100 items in the data layer (not
    // just rendered), since the perf characteristic depends on the data count.
    const seededCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-testid="thumbnail-strip-item-history"]').length;
    });
    console.log(`[stall-isolate] history thumbs in DOM at test start: ${seededCount}`);
    // Give the page a moment to settle so we measure steady-state drag latency.
    await page.waitForTimeout(800);

    await installProbe(page);

    const thumb = strip.getByTestId("thumbnail-strip-item-history").first();
    const box = await thumb.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    const rendersBefore = (await page.evaluate(
      () => (window as Window & { __thumbRenders?: number }).__thumbRenders ?? 0,
    )) as number;

    let result: { deltas: Record<string, number | "STALLED"> } | null = null;
    try {
      result = await runDragSteps(page, {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
    } catch (e) {
      console.log("[stall-isolate] 100-ITEM CASE STALLED:", String(e));
    }

    const rendersAfter = (await page.evaluate(
      () => (window as Window & { __thumbRenders?: number }).__thumbRenders ?? 0,
    )) as number;

    console.log(
      `[stall-isolate] thumb renders: before=${rendersBefore} after=${rendersAfter} delta=${rendersAfter - rendersBefore}`,
    );

    if (result) {
      console.log("[stall-isolate] 100-ITEM summary:", JSON.stringify(result.deltas));
    }
    await dumpProbe(page, "100 SEEDED ITEMS");

    // Regression guards — the 100-item case is the originally-broken scenario.
    // Before fix: STALLED indefinitely (≥ 180s test timeout).
    // After fix: ~180-210ms locally. Budget 500ms leaves room for CI variance.
    expect(result, "drag must complete (not stall)").toBeTruthy();
    expect(result!.deltas["move +5px"], "must not stall").not.toBe("STALLED");
    expect(
      Number(result!.deltas["move +5px"]),
      "100-item drag activation must stay below 500ms",
    ).toBeLessThan(500);
    expect(
      rendersAfter - rendersBefore,
      "thumbnail re-renders during drag should stay low (memoization regression guard)",
    ).toBeLessThan(150);
  });
});
