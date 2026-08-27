import { describe, expect, it } from "vite-plus/test";
import { formatMimeLabel, getImageFileExtensionFromMimeType } from "../imageUtils";

describe("getImageFileExtensionFromMimeType", () => {
  it("returns gif for gif images", () => {
    expect(getImageFileExtensionFromMimeType("image/gif")).toBe("gif");
  });

  it("falls back to png when mime type is missing", () => {
    expect(getImageFileExtensionFromMimeType(null)).toBe("png");
  });
});

describe("formatMimeLabel", () => {
  it("names the formats a book image actually arrives as", () => {
    expect(formatMimeLabel("image/jpeg")).toBe("JPEG");
    expect(formatMimeLabel("image/jpg")).toBe("JPEG");
    expect(formatMimeLabel("image/png")).toBe("PNG");
    expect(formatMimeLabel("image/webp")).toBe("WebP");
    expect(formatMimeLabel("image/gif")).toBe("GIF");
    expect(formatMimeLabel("image/svg+xml")).toBe("SVG");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(formatMimeLabel("  IMAGE/JPEG ")).toBe("JPEG");
  });

  it("shows an unrecognized type as its subtype rather than hiding it", () => {
    expect(formatMimeLabel("image/heic")).toBe("HEIC");
  });

  it("returns null when the format was never determined", () => {
    expect(formatMimeLabel(null)).toBeNull();
    expect(formatMimeLabel(undefined)).toBeNull();
    expect(formatMimeLabel("   ")).toBeNull();
  });
});
