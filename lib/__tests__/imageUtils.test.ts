import { describe, expect, it } from "vite-plus/test";
import {
  formatMegabytes,
  formatMimeLabel,
  getDataUrlByteSize,
  getImageFileExtensionFromMimeType,
} from "../imageUtils";

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

describe("getDataUrlByteSize", () => {
  it("counts the decoded bytes of a base64 data URL", () => {
    // "AAECAwQ=" is 5 bytes with one "=" of padding.
    expect(getDataUrlByteSize("data:image/png;base64,AAECAwQ=")).toBe(5);
    expect(getDataUrlByteSize("data:image/png;base64,AAEC")).toBe(3);
    expect(getDataUrlByteSize("data:image/png;base64,")).toBe(0);
  });

  it("returns null for an image it cannot measure", () => {
    // A host-served image (Bloom's history folder) has no bytes here to count.
    expect(getDataUrlByteSize("https://example.org/image.png")).toBeNull();
    expect(getDataUrlByteSize("data:image/svg+xml,<svg/>")).toBeNull();
    expect(getDataUrlByteSize(null)).toBeNull();
  });
});

describe("formatMegabytes", () => {
  it("keeps one decimal above a tenth of a megabyte", () => {
    expect(formatMegabytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatMegabytes(3.14 * 1024 * 1024)).toBe("3.1 MB");
  });

  it("keeps two decimals below that, so a small image does not read as empty", () => {
    expect(formatMegabytes(50 * 1024)).toBe("0.05 MB");
  });

  it("returns null when there is no size to show", () => {
    expect(formatMegabytes(null)).toBeNull();
    expect(formatMegabytes(undefined)).toBeNull();
    expect(formatMegabytes(Number.NaN)).toBeNull();
  });
});
