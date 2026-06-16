import { describe, expect, it, vi } from "vitest";
import {
  ClipboardReadError,
  handleCopy,
  isClipboardReadFallbackError,
  readClipboardImageFile,
} from "../clipboardUtils";

// 1x1 transparent PNG.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("clipboardUtils", () => {
  it("treats browser clipboard permission failures as keyboard fallback cases", () => {
    expect(
      isClipboardReadFallbackError({
        name: "NotAllowedError",
        message: "Read permission denied.",
      }),
    ).toBe(true);
  });

  it("writes both image/png and text/plain when a caption is provided", async () => {
    const capturedItems: Array<Record<string, Blob>> = [];
    class FakeClipboardItem {
      constructor(public readonly data: Record<string, Blob>) {
        capturedItems.push(data);
      }
    }

    const write = vi.fn().mockResolvedValue(undefined);
    const originalNavigator = globalThis.navigator;
    const originalClipboardItem = (globalThis as any).ClipboardItem;
    (globalThis as any).ClipboardItem = FakeClipboardItem;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { write } },
    });

    try {
      const ok = await handleCopy(PNG_DATA_URL, undefined, "Wash your hands with soap.");
      expect(ok).toBe(true);
      expect(write).toHaveBeenCalledTimes(1);
      expect(capturedItems).toHaveLength(1);

      const item = capturedItems[0];
      expect(Object.keys(item).sort()).toEqual(["image/png", "text/plain"]);
      expect(item["image/png"].type).toBe("image/png");
      await expect(item["text/plain"].text()).resolves.toBe("Wash your hands with soap.");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
      (globalThis as any).ClipboardItem = originalClipboardItem;
    }
  });

  it("wraps blocked clipboard reads in a ClipboardReadError", async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          read: vi.fn().mockRejectedValue(
            Object.assign(new Error("Read permission denied."), {
              name: "NotAllowedError",
            }),
          ),
        },
      },
    });

    await expect(readClipboardImageFile()).rejects.toMatchObject({
      name: "ClipboardReadError",
      code: "blocked",
    } satisfies Partial<ClipboardReadError>);

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });
});
