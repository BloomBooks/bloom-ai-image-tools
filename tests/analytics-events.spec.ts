import { test, expect, Page } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

// The analytics the editor hands its host (lib/analyticsEvents.ts). The harness bridge has
// no analytics service to send to, so it logs each event instead
// (createHarnessBloomHostBridge in services/host/BloomHostBridge.ts); the init script below
// captures those logs, which is the closest a standalone test gets to watching Bloom
// receive them. Runs on the Local Dummy model, so nothing here costs anything.
const HARNESS_ROUTE = "/?mode=bloom-harness";
const EMPTY_SLOT_LAUNCH_ROUTE = "/?mode=bloom-harness&seed=empty-slot";
const LOG_PREFIX = "[BloomHarness] analytics: ";

type CapturedEvent = { event: string; properties: Record<string, string | number | boolean> };

const captureAnalytics = async (page: Page) => {
  await page.addInitScript((prefix: string) => {
    const captured: CapturedEvent[] = [];
    (window as unknown as { __analyticsEvents: CapturedEvent[] }).__analyticsEvents = captured;
    const original = console.info.bind(console);
    console.info = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith(prefix)) {
        captured.push({
          event: args[0].slice(prefix.length),
          properties: (args[1] ?? {}) as Record<string, string | number | boolean>,
        });
      }
      original(...args);
    };
  }, LOG_PREFIX);
};

const analyticsEvents = (page: Page): Promise<CapturedEvent[]> =>
  page.evaluate(
    () => (window as unknown as { __analyticsEvents: CapturedEvent[] }).__analyticsEvents ?? [],
  );

const eventsNamed = async (page: Page, name: string) =>
  (await analyticsEvents(page)).filter((entry) => entry.event === name);

const expectEventCount = async (page: Page, name: string, count: number) => {
  await expect(async () => {
    expect((await eventsNamed(page, name)).length).toBe(count);
  }).toPass({ timeout: 15_000 });
};

const selectCustomEditWithDummyModel = async (page: Page) => {
  await page.getByRole("button", { name: /Enhance/i }).click();
  await page.getByText("Custom Edit", { exact: true }).click();
  await page.getByTestId("tool-model-picker-custom").click();
  await page.getByText("Local Dummy (No AI)").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("input-prompt").fill("Add a dummy banner");
};

const resultPanelImage = (page: Page) => page.getByTestId("result-panel").locator("img").first();

test.describe("analytics events", () => {
  test.beforeEach(async ({ page }) => {
    await captureAnalytics(page);
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await page.evaluate(() => {
      (window as any).__bloomDummyDelayMs = 100;
    });
  });

  test("reports the editor opening, and reports no session end of its own", async ({ page }) => {
    await expectEventCount(page, "AI Editor Open", 1);
    const [opened] = await eventsNamed(page, "AI Editor Open");
    expect(opened.properties.bookImageCount).toBe(6);
    expect(opened.properties.launchedOnEmptySlot).toBe(false);
    expect(typeof opened.properties.initialTool).toBe("string");

    // The host reports the end of the session, because only it knows whether anything
    // reached the book. Cancelling must not make the editor report one too.
    await page.getByTestId("bloom-host-cancel").click();
    await expect(async () => {
      expect((await analyticsEvents(page)).map((entry) => entry.event)).toEqual(["AI Editor Open"]);
    }).toPass({ timeout: 5_000 });
  });

  test("credits every tool in the chain when a chained result is used", async ({ page }) => {
    test.setTimeout(60_000);
    await selectCustomEditWithDummyModel(page);
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await expect(resultPanelImage(page)).toBeVisible({ timeout: 15_000 });

    await expectEventCount(page, "AI Editor Generate", 1);
    const [firstRun] = await eventsNamed(page, "AI Editor Generate");
    expect(firstRun.properties.tool).toBe("custom");
    expect(firstRun.properties.result).toBe("success");
    expect(firstRun.properties.batch).toBe(false);
    expect(firstRun.properties.batchSize).toBe(1);
    // The harness launches on book-image-3, which is the slot this run is for.
    expect(firstRun.properties.targetPage).toBe("current");
    expect(firstRun.properties.targetSlotEmpty).toBe(false);
    expect(firstRun.properties.styleId).toBe("");
    // A tool with no style picker still sends the property, and no property is free text.
    expect(Object.values(firstRun.properties).join(" ")).not.toContain("dummy banner");

    // Chain a second run on top of the first result: drag the result into the "Image to
    // Edit" panel, so the next result's parent is the first result.
    const targetPanel = page.getByTestId("target-panel");
    const from = await page.getByTestId("result-panel").boundingBox();
    const to = await targetPanel.boundingBox();
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    if (!from || !to) return;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();

    await page.getByRole("button", { name: "Go", exact: true }).click();
    await expectEventCount(page, "AI Editor Generate", 2);

    await page.getByTestId("bloom-host-commit-current-result").click();

    // Two tool steps contributed to the committed image, so two accept events, and only
    // the last is the final tool.
    await expectEventCount(page, "AI Editor Accept", 2);
    const accepts = await eventsNamed(page, "AI Editor Accept");
    expect(accepts.map((entry) => entry.properties.chainPosition)).toEqual([1, 2]);
    expect(accepts.every((entry) => entry.properties.chainLength === 2)).toBe(true);
    expect(accepts.map((entry) => entry.properties.isFinalTool)).toEqual([false, true]);
    expect(accepts.every((entry) => entry.properties.tool === "custom")).toBe(true);
    expect(accepts.every((entry) => entry.properties.acceptedCount === 1)).toBe(true);
    expect(accepts.every((entry) => entry.properties.targetPage === "current")).toBe(true);
    accepts.forEach((entry) => {
      expect(Object.values(entry.properties).join(" ")).not.toContain("dummy banner");
    });

    // Committing ends the session, but Bloom is what reports that, not us.
    expect(await eventsNamed(page, "AI Editor Close")).toEqual([]);
  });

  test("reports a batch run once, its images individually, and each replacement accepted", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await selectCustomEditWithDummyModel(page);
    await page.getByTestId("batch-tick-book-image-1").click();
    await page.getByTestId("batch-tick-book-image-2").click();
    await page.getByRole("button", { name: "Go (2 Images)", exact: true }).click();

    for (const id of ["book-image-1", "book-image-2"]) {
      await expect(
        page.getByTestId(`book-image-outgoing-slot-${id}`).locator("img").first(),
      ).toBeVisible({ timeout: 20_000 });
    }

    // One event as the run starts and one as it ends, both with the same property set.
    await expectEventCount(page, "AI Editor Batch Run", 2);
    const [started, finished] = await eventsNamed(page, "AI Editor Batch Run");
    expect(started.properties.phase).toBe("started");
    expect(started.properties.imageCount).toBe(2);
    expect(started.properties.tool).toBe("custom");
    expect(finished.properties.phase).toBe("finished");
    expect(finished.properties.succeeded).toBe(2);
    expect(finished.properties.failed).toBe(0);
    expect(finished.properties.cancelled).toBe(0);
    expect(Object.keys(started.properties).sort()).toEqual(Object.keys(finished.properties).sort());

    // Still one generate event per image, now saying which batch they belonged to.
    await expectEventCount(page, "AI Editor Generate", 2);
    const generates = await eventsNamed(page, "AI Editor Generate");
    expect(generates.every((entry) => entry.properties.batch === true)).toBe(true);
    expect(generates.every((entry) => entry.properties.batchSize === 2)).toBe(true);
    // Neither ticked slot is the one the editor was launched on (book-image-3).
    expect(generates.every((entry) => entry.properties.targetPage === "other")).toBe(true);

    await page.getByTestId("bloom-host-commit-book-images").click();

    await expectEventCount(page, "AI Editor Accept", 2);
    const accepts = await eventsNamed(page, "AI Editor Accept");
    // Both pictures went in on the one Replace click, so both events say so.
    expect(accepts.every((entry) => entry.properties.acceptedCount === 2)).toBe(true);
    expect(accepts.every((entry) => entry.properties.isFinalTool === true)).toBe(true);
    expect(accepts.every((entry) => entry.properties.chainLength === 1)).toBe(true);
    expect(accepts.every((entry) => entry.properties.targetPage === "other")).toBe(true);
  });
});

test.describe("analytics events, launched on an empty slot", () => {
  test("says the editor opened on an empty slot, and on which tool", async ({ page }) => {
    await captureAnalytics(page);
    await resetImageToolsPersistence(page, EMPTY_SLOT_LAUNCH_ROUTE);
    await page.goto(EMPTY_SLOT_LAUNCH_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();

    await expectEventCount(page, "AI Editor Open", 1);
    const [opened] = await eventsNamed(page, "AI Editor Open");
    expect(opened.properties.launchedOnEmptySlot).toBe(true);
    expect(opened.properties.initialTool).toBe("generate_image");
  });
});
