import { test, type Page } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

/**
 * How the history strip and a drag out of it behave as the history grows.
 *
 * Two costs are confounded in the app today and this separates them:
 *   - the number of items in the strip. Nothing is windowed, so every item
 *     mounts a slot and puts a full-size data URL in the DOM.
 *   - the size of the one image handed to the drag overlay. ?dndPreview=lite
 *     swaps it for a badge and changes nothing else.
 *
 * Nothing here asserts. It is a measurement, and the printed table is the
 * output. Run it with: npx playwright test tests/history-scale.spec.ts
 */

const DRAGS_PER_CONFIG = 3;

/**
 * sample.png is 1.4MB once base64'd. Real generated images run to 3.6MB and up,
 * which is where the drag overlay's cost lives, so the matrix carries both. The
 * big one is drawn as noise in a canvas at run time rather than committed to the
 * repo: it has to be incompressible to stay big, and the dev server's file
 * watcher reloads any page that is open when a repo file appears.
 */
const IMAGE_SIZES = ["1.4MB", "6MB"] as const;
type ImageSize = (typeof IMAGE_SIZES)[number];

const CONFIGS: Array<{
  items: number;
  preview: "image" | "lite";
  size: ImageSize;
}> = [
  { items: 0, preview: "image", size: "1.4MB" },
  { items: 40, preview: "image", size: "1.4MB" },
  { items: 40, preview: "lite", size: "1.4MB" },
  { items: 100, preview: "image", size: "1.4MB" },
  { items: 100, preview: "lite", size: "1.4MB" },
  // The preview cost is per-drag, so the big-image arm needs only enough items to
  // have something to drag. Forty of them is 240MB of seeding and times the test
  // out before it measures anything.
  { items: 10, preview: "image", size: "1.4MB" },
  { items: 10, preview: "lite", size: "1.4MB" },
  { items: 10, preview: "image", size: "6MB" },
  { items: 10, preview: "lite", size: "6MB" },
];

type Row = {
  items: number;
  preview: string;
  size: string;
  thumbsInDom: number;
  domImageMb: number;
  tabSwitchMs: number;
  dragStartMs: number | null;
  firstPaintMs: number | null;
  blockedMs: number;
  worstTaskMs: number;
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)]);
};

const installLongTaskProbe = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as Window & { __longTasks?: Array<{ start: number; duration: number }> };
    w.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__longTasks!.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // longtask is Chromium-only; the rest of the run still stands without it.
    }
  });
};

const readLongTasks = (page: Page, sinceMs: number) =>
  page.evaluate((since) => {
    const tasks = ((window as any).__longTasks || []) as Array<{
      start: number;
      duration: number;
    }>;
    const relevant = tasks.filter((task) => task.start >= since);
    return {
      total: Math.round(relevant.reduce((sum, task) => sum + task.duration, 0)),
      worst: Math.round(relevant.reduce((max, task) => Math.max(max, task.duration), 0)),
    };
  }, sinceMs);

/** The app's own drag instrumentation, switched on by ?dndDebug=1. */
const readDragLog = (page: Page) =>
  page.evaluate(() => {
    const logs = ((window as any).__BLOOM_DND_LOGS || []) as Array<{
      t: number;
      args: unknown[];
    }>;
    return logs.map((entry) => ({
      t: entry.t,
      text: entry.args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    }));
  });

const clearDragLog = (page: Page) =>
  page.evaluate(() => {
    (window as any).__BLOOM_DND_LOGS = [];
  });

const activateHistoryTab = (page: Page) =>
  page.evaluate(async () => {
    const tab = document.querySelector('[data-testid="thumbnail-tab-history"]') as HTMLElement;
    const start = performance.now();
    tab.click();
    // Two frames after the click is when the browser has laid out and painted
    // whatever the click produced.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return Math.round(performance.now() - start);
  });

/**
 * A click that lands before React has attached its handler leaves the strip in
 * the DOM but not shown, and querySelectorAll counts hidden nodes perfectly
 * happily, so the count alone will not tell you. Wait for the strip to say it is
 * active, and click again if it does not.
 */
const ensureHistoryActive = async (page: Page) => {
  let firstClickMs: number | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const ms = await activateHistoryTab(page);
    if (firstClickMs == null) firstClickMs = ms;
    try {
      await page.waitForSelector('[data-testid="thumbnail-strip-history"][data-active="true"]', {
        timeout: 3_000,
      });
      return firstClickMs;
    } catch {
      await page.waitForTimeout(250);
    }
  }
  console.log("[scale] history strip never became active");
  return firstClickMs ?? 0;
};

const countThumbs = (page: Page) =>
  page.evaluate(
    () => document.querySelectorAll('[data-testid="thumbnail-strip-item-history"]').length,
  );

/**
 * Seeding races the reset's deleteDatabase, and loses often enough that a single
 * attempt regularly lands on an empty strip. Seed, reload, look, repeat.
 */
const seedAndShow = async (page: Page, url: string, count: number, size: ImageSize) => {
  let tabSwitchMs = await ensureHistoryActive(page);
  if (count === 0) return { tabSwitchMs, thumbs: 0, seededBytes: 0 };

  let seededBytes = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.waitForFunction(() => typeof (window as any).seedHistory === "function");
    const outcome = await page.evaluate(
      async ([n, wantBig]) => {
        // seedHistory fetches whatever URL it is given, and fetch() accepts a
        // data: URL, so a canvas full of noise stands in for a big generated image.
        const makeBigDataUrl = () => {
          const side = 1600;
          const canvas = document.createElement("canvas");
          canvas.width = side;
          canvas.height = side;
          const ctx = canvas.getContext("2d")!;
          const pixels = ctx.createImageData(side, side);
          for (let i = 0; i < pixels.data.length; i += 4) {
            pixels.data[i] = Math.random() * 255;
            pixels.data[i + 1] = Math.random() * 255;
            pixels.data[i + 2] = Math.random() * 255;
            pixels.data[i + 3] = 255;
          }
          ctx.putImageData(pixels, 0, 0);
          return canvas.toDataURL("image/png");
        };
        try {
          const source = wantBig ? makeBigDataUrl() : "/sample.png";
          await (window as any).seedHistory(n, source, { reload: false });
          return { ok: true, error: null, bytes: wantBig ? source.length : 0 };
        } catch (error) {
          return { ok: false, error: String(error), bytes: 0 };
        }
      },
      [count, size === "6MB"] as [number, boolean],
    );
    seededBytes = outcome.bytes;
    if (!outcome.ok) console.log(`[scale] seed(${count}) failed: ${outcome.error}`);

    await page.goto(url);
    await page.waitForSelector('[data-testid="thumbnail-tab-history"]');
    tabSwitchMs = await ensureHistoryActive(page);
    await page.waitForTimeout(600);

    const thumbs = await countThumbs(page);
    if (thumbs > 0) return { tabSwitchMs, thumbs, seededBytes };
    console.log(`[scale] seed(${count}) attempt ${attempt} showed no thumbs; retrying`);
  }
  return { tabSwitchMs, thumbs: 0, seededBytes };
};

const dragFirstThumb = async (page: Page) => {
  const thumb = page.locator('[data-testid="thumbnail-strip-item-history"]').first();
  await thumb.scrollIntoViewIfNeeded().catch(() => {});
  const box = await thumb.boundingBox();
  if (!box) {
    console.log("[scale] first history thumb has no box; skipping this drag");
    return null;
  }

  await clearDragLog(page);
  const probeStart = await page.evaluate(() => performance.now());
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.waitForTimeout(250); // Settle the hover before pressing.
  await page.mouse.down();
  // Past dnd-kit's 2px activation distance, then far enough to be a real drag.
  for (const offset of [3, 12, 40, 90]) {
    await page.mouse.move(x + offset, y - offset);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(200);

  const entries = await readDragLog(page);
  const find = (needle: string) => entries.find((entry) => entry.text.includes(needle));
  const down = find("pointerDown");
  const dragStart = find("dragStart dt=");
  const firstPaint = find("dragPreview-first-raf");
  const tasks = await readLongTasks(page, probeStart);
  if (!down || !dragStart) {
    console.log(`[scale] drag produced no timings; log had ${entries.length} entries`);
  }

  return {
    dragStartMs: down && dragStart ? Math.round(dragStart.t - down.t) : null,
    firstPaintMs: down && firstPaint ? Math.round(firstPaint.t - down.t) : null,
    blockedMs: tasks.total,
    worstTaskMs: tasks.worst,
  };
};

const measure = async (
  page: Page,
  items: number,
  preview: string,
  size: ImageSize,
): Promise<Row> => {
  const url = `/?bloomFeatures=1&dndDebug=1&dndPreview=${preview}`;
  await installLongTaskProbe(page);
  await resetImageToolsPersistence(page, url);
  await page.goto(url);
  await page.waitForSelector('[data-testid="thumbnail-tab-history"]');

  const { tabSwitchMs, thumbs } = await seedAndShow(page, url, items, size);

  const domImageMb = await page.evaluate(() => {
    const bytes = Array.from(document.querySelectorAll("img")).reduce(
      (sum, img) => sum + (img.getAttribute("src")?.length ?? 0),
      0,
    );
    return Math.round((bytes / 1024 / 1024) * 10) / 10;
  });

  const dragStarts: number[] = [];
  const firstPaints: number[] = [];
  const blocked: number[] = [];
  const worst: number[] = [];
  if (thumbs > 0) {
    for (let run = 0; run < DRAGS_PER_CONFIG; run++) {
      const result = await dragFirstThumb(page);
      if (!result) continue;
      if (result.dragStartMs != null) dragStarts.push(result.dragStartMs);
      if (result.firstPaintMs != null) firstPaints.push(result.firstPaintMs);
      blocked.push(result.blockedMs);
      worst.push(result.worstTaskMs);
    }
  }

  return {
    items,
    preview,
    size,
    thumbsInDom: thumbs,
    domImageMb,
    tabSwitchMs,
    dragStartMs: median(dragStarts),
    firstPaintMs: median(firstPaints),
    blockedMs: median(blocked) ?? 0,
    worstTaskMs: median(worst) ?? 0,
  };
};

// Headless so a run needs nobody at the keyboard; the repo config is headed.
test.use({ headless: true });

test.describe("history strip scaling", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(600_000);

  const rows: Row[] = [];

  for (const { items, preview, size } of CONFIGS) {
    test(`${items} items at ${size}, preview=${preview}`, async ({ page }) => {
      const row = await measure(page, items, preview, size);
      rows.push(row);
      console.log(`[scale] ${JSON.stringify(row)}`);
    });
  }

  test.afterAll(() => {
    const columns: Array<[string, (row: Row) => string | number | null]> = [
      ["items", (row) => row.items],
      ["preview", (row) => row.preview],
      ["size", (row) => row.size],
      ["thumbs", (row) => row.thumbsInDom],
      ["img MB", (row) => row.domImageMb],
      ["tab ms", (row) => row.tabSwitchMs],
      ["drag ms", (row) => row.dragStartMs],
      ["paint ms", (row) => row.firstPaintMs],
      ["blocked", (row) => row.blockedMs],
      ["worst", (row) => row.worstTaskMs],
    ];
    const pad = (value: string | number | null, width: number) =>
      String(value ?? "-").padStart(width);
    const widths = columns.map(([label]) => Math.max(label.length, 7));

    console.log("\n=== history strip scaling (medians of 3 drags) ===");
    console.log(columns.map(([label], i) => pad(label, widths[i])).join(" "));
    for (const row of rows) {
      console.log(columns.map(([, read], i) => pad(read(row), widths[i])).join(" "));
    }
  });
});
