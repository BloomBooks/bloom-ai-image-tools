import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  applyExifToDataUrl,
  applyModelExifToImageData,
  buildModelExif,
  extractExifFromBytes,
} from "../exifMetadata";

const PNG_SAMPLE_BASE64 = readFileSync(
  join(process.cwd(), "assets", "art-styles", "abstract-illustration.png"),
).toString("base64");

const toBytes = (base64: string): Uint8Array => {
  const binary = Buffer.from(base64, "base64");
  return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
};

describe("exifMetadata", () => {
  it("builds EXIF for a generated image model", () => {
    const exifBytes = buildModelExif("Gemini Flash Image");
    expect(exifBytes).not.toBeNull();
    expect(exifBytes?.[0]).toBe(0x4d);
    expect(exifBytes?.[1]).toBe(0x4d);
  });

  it("writes EXIF into PNG image data", () => {
    const exifBytes = buildModelExif("Gemini Flash Image");
    expect(exifBytes).not.toBeNull();

    const imageData = `data:image/png;base64,${PNG_SAMPLE_BASE64}`;
    const updated = applyExifToDataUrl(imageData, exifBytes!);
    const extracted = extractExifFromBytes(toBytes(updated.split(",")[1]), "image/png");

    expect(Buffer.from(extracted || []).equals(Buffer.from(exifBytes!))).toBe(true);
  });

  it("applies model EXIF directly to generated image data", () => {
    const imageData = `data:image/png;base64,${PNG_SAMPLE_BASE64}`;
    const updated = applyModelExifToImageData(imageData, "Gemini Flash Image");
    const extracted = extractExifFromBytes(toBytes(updated.split(",")[1]), "image/png");

    expect(extracted).not.toBeNull();
  });
});
