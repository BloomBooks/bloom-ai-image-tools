import { expect, test } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";
import {
  IMAGE_TOOLS_DB_NAME,
  IMAGE_TOOLS_STATE_KEY,
  IMAGE_TOOLS_STATE_VERSION,
  IMAGE_TOOLS_STORE_NAME,
} from "../services/persistence/constants";

test("shows Connect history folder button when history references folder bytes but no binding is saved", async ({
  page,
}) => {
  await resetImageToolsPersistence(page);
  await page.goto("/");

  // Wait for the app shell to be ready (use the prototype notice as a beacon).
  await expect(page.getByText(/This is prototype/i)).toBeVisible();

  // Seed IndexedDB with a metadata-only history item that points at a file
  // on disk (imageFileName set, imageData empty). No fs handle is saved, so
  // restoreFileSystemImageBinding will return "none", but
  // hasUnresolvedFolderBackedHistory should be true → button should appear.
  await page.evaluate(
    async ({ dbName, storeName, stateKey, version }) => {
      const metaKey = `${stateKey}:meta`;
      const payload = {
        version,
        appState: {
          targetImageId: null,
          referenceImageIds: [],
          rightPanelImageId: null,
          history: [
            {
              id: "verify-folder-item",
              parentId: null,
              imageData: "",
              imageFileName: "verify-folder-item.png",
              toolId: "unknown",
              parameters: {},
              sourceStyleId: null,
              durationMs: 0,
              cost: 0,
              model: "",
              reasoningLevel: null,
              timestamp: Date.now(),
              promptUsed: "seeded",
              sourceSummary: null,
              resolution: { width: 100, height: 100 },
              isStarred: false,
              origin: "generated",
            },
          ],
        },
      };

      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).put(payload, metaKey);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    {
      dbName: IMAGE_TOOLS_DB_NAME,
      storeName: IMAGE_TOOLS_STORE_NAME,
      stateKey: IMAGE_TOOLS_STATE_KEY,
      version: IMAGE_TOOLS_STATE_VERSION,
    },
  );

  await page.reload();

  const reconnectButton = page.getByTestId("reconnect-history-folder-button");
  await expect(reconnectButton).toBeVisible({ timeout: 8000 });
  await expect(reconnectButton).toHaveText(/Connect history folder/);

  await page.screenshot({
    path: "test-results/reconnect-button-header.png",
    fullPage: false,
  });
});
