import { describe, expect, it, vi } from "vitest";
import {
  ClipboardReadError,
  isClipboardReadFallbackError,
  readClipboardImageFile,
} from "../clipboardUtils";

describe("clipboardUtils", () => {
  it("treats browser clipboard permission failures as keyboard fallback cases", () => {
    expect(
      isClipboardReadFallbackError({
        name: "NotAllowedError",
        message: "Read permission denied.",
      }),
    ).toBe(true);
  });

  it("wraps blocked clipboard reads in a ClipboardReadError", async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          read: vi
            .fn()
            .mockRejectedValue(
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