import { test, expect } from "@playwright/test";
import {
  awaitResetReady,
  installMockFsForHistoryStore,
  resetAllStorage,
} from "./history-store-helpers";

/**
 * E2E tests for the HistoryStore (services/history/*). These drive the store
 * directly via window.__bloomHistory rather than going through the UI, so they
 * are fast, deterministic, and prove correctness independently of how the
 * workspace consumes the store. The UI-level tests live elsewhere.
 *
 * Map to the test plan in docs/history-storage-design.md §7.
 */

const bootStore = async (page: import("@playwright/test").Page) => {
  await page.evaluate(async () => {
    // Vite dev server serves the TS source directly.
    const mod = await import("../services/history/HistoryStore.ts");
    const store = mod.getHistoryStore();
    (window as any).__bloomHistory = store;
    await store.hydrate();
  });
};

const SAMPLE_PNG_B64 =
  // 1x1 transparent PNG
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
const SAMPLE_PNG_DATA_URL = `data:image/png;base64,${SAMPLE_PNG_B64}`;

test.describe("HistoryStore", () => {
  test.use({ navigationTimeout: 20_000, actionTimeout: 10_000 });
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await installMockFsForHistoryStore(page);
    await resetAllStorage(page);
    await page.goto("/");
    await awaitResetReady(page);
    await bootStore(page);
  });

  // ---------- T1: browser-only persistence ----------

  test("T1: adds survive reload in browser-only mode", async ({ page }) => {
    await page.evaluate(async (dataUrl) => {
      const store = (window as any).__bloomHistory;
      for (let i = 0; i < 3; i += 1) {
        await store.add(
          {
            id: `img_${i}`,
            parentId: null,
            toolId: "test",
            parameters: {},
            promptUsed: `prompt ${i}`,
            model: "m",
            timestamp: 1000 + i,
            durationMs: 0,
            cost: 0,
            imageMime: "image/png",
            metaUpdatedAt: 1000 + i,
            isStarred: false,
          },
          dataUrl,
        );
      }
    }, SAMPLE_PNG_DATA_URL);

    await page.reload();
    await bootStore(page);

    const ids = await page.evaluate(() => {
      const snap = (window as any).__bloomHistory.snapshot();
      return snap.entries.map((e: any) => e.id);
    });
    expect(ids).toEqual(["img_0", "img_1", "img_2"]);
  });

  // ---------- T2: attach folder, browser images flow into it ----------

  test("T2: attaching folder writes browser images to disk", async ({ page }) => {
    await page.evaluate(async (dataUrl) => {
      const store = (window as any).__bloomHistory;
      for (let i = 0; i < 2; i += 1) {
        await store.add(
          {
            id: `local_${i}`,
            parentId: null,
            toolId: "test",
            parameters: {},
            promptUsed: `p${i}`,
            model: "m",
            timestamp: 100 + i,
            durationMs: 0,
            cost: 0,
            imageMime: "image/png",
            metaUpdatedAt: 100 + i,
            isStarred: false,
          },
          dataUrl,
        );
      }
      await store.attachFolder();
    }, SAMPLE_PNG_DATA_URL);

    const layout = await page.evaluate(() => {
      const fs = (window as any).__mockFsRead();
      const images = fs?.root?.dirs?.images?.files ?? {};
      return Object.keys(images).sort();
    });

    expect(layout).toContain("local_0.png");
    expect(layout).toContain("local_0.json");
    expect(layout).toContain("local_1.png");
    expect(layout).toContain("local_1.json");
  });

  // ---------- T3: the bug-that-was — pre-existing folder + non-empty browser ----------

  test("T3: attach folder with existing images keeps both sets (union)", async ({
    page,
  }) => {
    // Pre-seed the mock folder with two images written via the store API on a
    // fresh instance, then reset memory, then attach to the same folder with
    // two different browser-only images already present.
    await page.evaluate(async (dataUrl) => {
      const store = (window as any).__bloomHistory;
      for (const id of ["folder_a", "folder_b"]) {
        await store.add(
          {
            id,
            parentId: null,
            toolId: "test",
            parameters: {},
            promptUsed: id,
            model: "m",
            timestamp: 100,
            durationMs: 0,
            cost: 0,
            imageMime: "image/png",
            metaUpdatedAt: 100,
            isStarred: false,
          },
          dataUrl,
        );
      }
      await store.attachFolder();
    }, SAMPLE_PNG_DATA_URL);

    // Now simulate "different machine connecting": wipe the browser store
    // (but keep the mock folder state) and reload.
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("bloom-image-tools-history");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("bloom-image-tools-fs");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });

    await page.reload();
    await bootStore(page);

    // Add two browser-only images BEFORE attaching the folder.
    await page.evaluate(async (dataUrl) => {
      const store = (window as any).__bloomHistory;
      for (const id of ["browser_c", "browser_d"]) {
        await store.add(
          {
            id,
            parentId: null,
            toolId: "test",
            parameters: {},
            promptUsed: id,
            model: "m",
            timestamp: 200,
            durationMs: 0,
            cost: 0,
            imageMime: "image/png",
            metaUpdatedAt: 200,
            isStarred: false,
          },
          dataUrl,
        );
      }
      await store.attachFolder();
    }, SAMPLE_PNG_DATA_URL);

    const ids = await page.evaluate(() =>
      (window as any).__bloomHistory.snapshot().entries.map((e: any) => e.id).sort(),
    );
    expect(ids).toEqual(["browser_c", "browser_d", "folder_a", "folder_b"]);

    // Folder should contain all four.
    const folderFiles = await page.evaluate(() => {
      const fs = (window as any).__mockFsRead();
      return Object.keys(fs?.root?.dirs?.images?.files ?? {}).sort();
    });
    for (const id of ["folder_a", "folder_b", "browser_c", "browser_d"]) {
      expect(folderFiles).toContain(`${id}.png`);
      expect(folderFiles).toContain(`${id}.json`);
    }
  });

  // ---------- T5: deletion writes a tombstone ----------

  test("T5: delete writes tombstone and removes image files", async ({ page }) => {
    await page.evaluate(async (dataUrl) => {
      const store = (window as any).__bloomHistory;
      await store.add(
        {
          id: "doomed",
          parentId: null,
          toolId: "test",
          parameters: {},
          promptUsed: "x",
          model: "m",
          timestamp: 1,
          durationMs: 0,
          cost: 0,
          imageMime: "image/png",
          metaUpdatedAt: 1,
        },
        dataUrl,
      );
      await store.attachFolder();
      await store.delete("doomed");
    }, SAMPLE_PNG_DATA_URL);

    const layout = await page.evaluate(() => {
      const fs = (window as any).__mockFsRead();
      return {
        images: Object.keys(fs?.root?.dirs?.images?.files ?? {}),
        tombstones: Object.keys(fs?.root?.dirs?.tombstones?.files ?? {}),
      };
    });

    expect(layout.images).not.toContain("doomed.png");
    expect(layout.images).not.toContain("doomed.json");
    expect(layout.tombstones).toContain("doomed.json");

    const inMemory = await page.evaluate(() =>
      (window as any).__bloomHistory.snapshot().entries.map((e: any) => e.id),
    );
    expect(inMemory).not.toContain("doomed");
  });

  // ---------- T6/T7: tombstone wins over a stale sidecar on disk ----------

  test("T6/T7: a tombstone prevents resurrection even when the sidecar is still on disk", async ({
    page,
  }) => {
    // Simulate the race: write an image (folder has it), then manually inject
    // a tombstone for it while also keeping the image+sidecar on disk.
    // Reconcile must drop the image from memory and delete its files.
    await page.evaluate(async (dataUrl) => {
      const store = (window as any).__bloomHistory;
      await store.attachFolder();
      await store.add(
        {
          id: "racey",
          parentId: null,
          toolId: "test",
          parameters: {},
          promptUsed: "x",
          model: "m",
          timestamp: 1,
          durationMs: 0,
          cost: 0,
          imageMime: "image/png",
          metaUpdatedAt: 1,
        },
        dataUrl,
      );
    }, SAMPLE_PNG_DATA_URL);

    // Inject a tombstone directly into the mock filesystem, bypassing the store.
    await page.evaluate(() => {
      const fs = (window as any).__mockFsRead();
      const tombstone = JSON.stringify({ id: "racey", deletedAt: Date.now() });
      const b64 = btoa(tombstone);
      if (!fs.root.dirs.tombstones) fs.root.dirs.tombstones = { files: {}, dirs: {} };
      fs.root.dirs.tombstones.files["racey.json"] = {
        type: "application/json",
        lastModified: Date.now(),
        dataB64: b64,
      };
      (window as any).__mockFsWrite(fs);
    });

    // Trigger reconciliation.
    await page.evaluate(async () => {
      const store = (window as any).__bloomHistory;
      await store.reconcileWithFolder();
    });

    const memoryIds = await page.evaluate(() =>
      (window as any).__bloomHistory.snapshot().entries.map((e: any) => e.id),
    );
    expect(memoryIds).not.toContain("racey");

    const images = await page.evaluate(() => {
      const fs = (window as any).__mockFsRead();
      return Object.keys(fs?.root?.dirs?.images?.files ?? {});
    });
    expect(images).not.toContain("racey.png");
    expect(images).not.toContain("racey.json");
  });

  // ---------- T9: Dropbox mid-sync (image bytes temporarily missing) ----------

  test("T9: image disappearing from disk without a tombstone does NOT mark it deleted", async ({
    page,
  }) => {
    await page.evaluate(async (dataUrl) => {
      const store = (window as any).__bloomHistory;
      await store.attachFolder();
      await store.add(
        {
          id: "vanishing",
          parentId: null,
          toolId: "test",
          parameters: {},
          promptUsed: "x",
          model: "m",
          timestamp: 1,
          durationMs: 0,
          cost: 0,
          imageMime: "image/png",
          metaUpdatedAt: 1,
        },
        dataUrl,
      );
    }, SAMPLE_PNG_DATA_URL);

    // Surgically remove the image file (NOT the sidecar) — sim of partial Dropbox sync.
    await page.evaluate(() => {
      const fs = (window as any).__mockFsRead();
      delete fs.root.dirs.images.files["vanishing.png"];
      (window as any).__mockFsWrite(fs);
    });

    // Reconcile.
    await page.evaluate(async () => {
      await (window as any).__bloomHistory.reconcileWithFolder();
    });

    const memoryIds = await page.evaluate(() =>
      (window as any).__bloomHistory.snapshot().entries.map((e: any) => e.id),
    );
    expect(memoryIds).toContain("vanishing");
  });

  // ---------- T12: expired tombstones get GC'd ----------

  test("T12: tombstones older than the TTL are removed on reconcile", async ({ page }) => {
    await page.evaluate(async () => {
      const store = (window as any).__bloomHistory;
      await store.attachFolder();
    });

    // Inject an ancient tombstone directly.
    await page.evaluate(() => {
      const ancient = Date.now() - 1000 * 60 * 60 * 24 * 100; // 100 days ago
      const fs = (window as any).__mockFsRead();
      if (!fs.root.dirs.tombstones) fs.root.dirs.tombstones = { files: {}, dirs: {} };
      const body = JSON.stringify({ id: "ancient", deletedAt: ancient });
      fs.root.dirs.tombstones.files["ancient.json"] = {
        type: "application/json",
        lastModified: ancient,
        dataB64: btoa(body),
      };
      (window as any).__mockFsWrite(fs);
    });

    await page.evaluate(async () => {
      await (window as any).__bloomHistory.reconcileWithFolder();
    });

    const tombstones = await page.evaluate(() => {
      const fs = (window as any).__mockFsRead();
      return Object.keys(fs?.root?.dirs?.tombstones?.files ?? {});
    });
    expect(tombstones).not.toContain("ancient.json");
  });

  // ---------- Migration from legacy manifest ----------

  test("migration: legacy history-manifest.json is converted to sidecars + app-state.json", async ({
    page,
  }) => {
    // Build a legacy manifest with one image embedded as base64.
    await page.evaluate((dataUrl) => {
      const manifest = {
        version: 1,
        appState: {
          targetImageId: null,
          referenceImageIds: [],
          rightPanelImageId: null,
          history: [
            {
              id: "legacy_one",
              parentId: null,
              imageData: dataUrl,
              toolId: "test",
              parameters: {},
              promptUsed: "legacy",
              model: "m",
              timestamp: 42,
              durationMs: 0,
              cost: 0,
              isStarred: false,
            },
          ],
        },
        thumbnailStrips: {
          activeStripId: "history",
          pinnedStripIds: ["history"],
          itemIdsByStrip: {
            history: ["legacy_one"],
            starred: [],
            reference: [],
            environment: [],
          },
        },
      };
      const fs = (window as any).__mockFsRead();
      fs.root.files["history-manifest.json"] = {
        type: "application/json",
        lastModified: Date.now(),
        dataB64: btoa(JSON.stringify(manifest)),
      };
      (window as any).__mockFsWrite(fs);
    }, SAMPLE_PNG_DATA_URL);

    await page.evaluate(async () => {
      await (window as any).__bloomHistory.attachFolder();
    });

    const after = await page.evaluate(() => {
      const fs = (window as any).__mockFsRead();
      return {
        topLevel: Object.keys(fs?.root?.files ?? {}),
        images: Object.keys(fs?.root?.dirs?.images?.files ?? {}),
      };
    });
    expect(after.images).toContain("legacy_one.png");
    expect(after.images).toContain("legacy_one.json");
    expect(after.topLevel).toContain("history-manifest.legacy.json");
    expect(after.topLevel).toContain("app-state.json");
    expect(after.topLevel).not.toContain("history-manifest.json");

    const ids = await page.evaluate(() =>
      (window as any).__bloomHistory.snapshot().entries.map((e: any) => e.id),
    );
    expect(ids).toContain("legacy_one");
  });
});
