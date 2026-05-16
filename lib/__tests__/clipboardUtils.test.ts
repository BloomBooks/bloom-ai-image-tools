import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { handleCopy, readClipboardImageFile } from "../clipboardUtils";
import { applyExifToDataUrl, buildModelExif, extractExifFromBlob } from "../exifMetadata";

const PNG_SAMPLE_BASE64 = readFileSync(
  join(process.cwd(), "assets", "art-styles", "abstract-illustration.png"),
).toString("base64");

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
    return type === "image/png";
  }
}

describe("clipboardUtils metadata behavior", () => {
  const originalNavigator = globalThis.navigator;
  const originalClipboardItem = globalThis.ClipboardItem;
  const clipboardWrites: Blob[] = [];

  afterEach(() => {
    clipboardWrites.length = 0;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    globalThis.ClipboardItem = originalClipboardItem;
    vi.restoreAllMocks();
  });

  it("preserves PNG EXIF on clipboard copy and paste", async () => {
    const exifBytes = buildModelExif("Gemini Flash Image");
    expect(exifBytes).not.toBeNull();

    const imageData = applyExifToDataUrl(`data:image/png;base64,${PNG_SAMPLE_BASE64}`, exifBytes!);

    globalThis.ClipboardItem = ClipboardItemTestDouble as unknown as typeof ClipboardItem;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          write: async (
            items: Array<{ types: string[]; getType: (type: string) => Promise<Blob> }>,
          ) => {
            const blob = await items[0].getType(items[0].types[0]);
            clipboardWrites.push(blob);
          },
          read: async () => [
            {
              types: ["image/png"],
              getType: async () => clipboardWrites[0],
            },
          ],
          writeText: async () => {},
        },
      },
    });

    await expect(handleCopy(imageData)).resolves.toBe(true);
    expect(clipboardWrites).toHaveLength(1);

    const copiedExif = await extractExifFromBlob(clipboardWrites[0]);
    expect(Buffer.from(copiedExif || []).equals(Buffer.from(exifBytes!))).toBe(true);

    const pastedFile = await readClipboardImageFile();
    expect(pastedFile).not.toBeNull();

    const pastedExif = await extractExifFromBlob(pastedFile!);
    expect(Buffer.from(pastedExif || []).equals(Buffer.from(exifBytes!))).toBe(true);
  });
});
