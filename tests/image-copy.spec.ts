import { expect, test, type Page } from "@playwright/test";
import {
  resetImageToolsPersistence,
  uploadSampleImageToTarget,
} from "./playwright_helpers";
const isVerbose = !!process.env.E2E_VERBOSE;

const setupClipboardHarness = async (page: Page) => {
  await page.addInitScript(() => {
    const unsupportedTypes = new Set<string>();
    window.__clipboardWrites = [];
    window.__setUnsupportedClipboardTypes = (types: string[]) => {
      unsupportedTypes.clear();
      types.forEach((type) => unsupportedTypes.add(type));
    };

    class ClipboardItemTestDouble {
      public readonly types: string[];
      private readonly items: Record<string, Blob>;

      constructor(items: Record<string, Blob>) {
        this.items = items;
        this.types = Object.keys(items);
      }

      async getType(type: string) {
        return this.items[type];
      }

      static supports(type: string) {
        return !unsupportedTypes.has(type);
      }
    }

    // @ts-ignore - override ClipboardItem with test double
    window.ClipboardItem = ClipboardItemTestDouble;

    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {},
      });
    }

    navigator.clipboard.write = async (items) => {
      const entry = items.map((item) => ({ type: item.types[0] }));
      window.__clipboardWrites?.push(entry);
      return Promise.resolve();
    };
  });
};

const copyResultImage = async (page: Page) => {
  // Put an image into the Result panel by dragging the newest history item.
  const historyStrip = page.getByTestId("thumbnail-strip-history").first();
  const historyThumb = historyStrip
    .getByTestId("thumbnail-strip-item-history")
    .first();
  await expect(historyThumb).toBeVisible();

  const resultPanel = page.getByTestId("result-panel");
  {
    const from = await historyThumb.boundingBox();
    const to = await resultPanel.boundingBox();
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    if (!from || !to) return;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
  }

  const resultImage = page.getByRole("img", { name: "Result" });
  await expect(resultImage).toBeVisible();
  await resultImage.hover();

  const copyButton = resultPanel.getByRole("button", {
    name: "Copy to Clipboard",
  });
  await expect(copyButton).toBeVisible();
  await copyButton.click();
};

const waitForClipboardWrites = async (page: Page) => {
  await expect
    .poll(async () =>
      page.evaluate(() => window.__clipboardWrites?.length ?? 0)
    )
    .toBeGreaterThan(0);

  return page.evaluate(() => window.__clipboardWrites ?? []);
};

test.describe("Image copy clipboard behavior", () => {
  test.beforeEach(async ({ page }) => {
    if (isVerbose) {
      page.on("console", (msg) =>
        console.log(`[browser:${msg.type()}] ${msg.text()}`)
      );
      page.on("pageerror", (error) =>
        console.log(`[pageerror] ${error?.message ?? error}`)
      );
      page.on("requestfailed", (request) =>
        console.log(
          `[requestfailed] ${request.method()} ${request.url()} :: ${request.failure()?.errorText}`
        )
      );
    }

    await setupClipboardHarness(page);
    await resetImageToolsPersistence(page);
    await page.evaluate(() => {
      window.__clipboardWrites = [];
      window.__setUnsupportedClipboardTypes?.([]);
    });
  });

  test("falls back to PNG when clipboard rejects PNG", async ({ page }) => {
    await page.evaluate(() => {
      window.__setUnsupportedClipboardTypes?.(["image/png"]);
    });

    await uploadSampleImageToTarget(page);
    if (isVerbose) {
      const dims = await page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>(
          'img[alt="Image to Edit"]'
        );
        return img
          ? {
              width: img.naturalWidth,
              height: img.naturalHeight,
              complete: img.complete,
              src: img.src.slice(0, 32),
            }
          : null;
      });
      console.log("[diagnostics] target dims", dims);
    }
    await copyResultImage(page);

    const writes = await waitForClipboardWrites(page);
    expect(writes[writes.length - 1]?.[0]?.type).toBe("image/png");
  });

  test("preserves PNG when clipboard supports it", async ({ page }) => {
    await uploadSampleImageToTarget(page);
    if (isVerbose) {
      const dims = await page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>(
          'img[alt="Image to Edit"]'
        );
        return img
          ? {
              width: img.naturalWidth,
              height: img.naturalHeight,
              complete: img.complete,
              src: img.src.slice(0, 32),
            }
          : null;
      });
      console.log("[diagnostics] target dims", dims);
    }
    await copyResultImage(page);

    const writes = await waitForClipboardWrites(page);
    expect(writes[writes.length - 1]?.[0]?.type).toBe("image/png");
  });
});

declare global {
  interface Window {
    __clipboardWrites?: Array<Array<{ type: string }>>;
    __setUnsupportedClipboardTypes?: (types: string[]) => void;
  }
}

export {};
