import { describe, expect, it } from "vite-plus/test";
import { getImageFileExtensionFromMimeType } from "../imageUtils";

describe("getImageFileExtensionFromMimeType", () => {
  it("returns gif for gif images", () => {
    expect(getImageFileExtensionFromMimeType("image/gif")).toBe("gif");
  });

  it("falls back to png when mime type is missing", () => {
    expect(getImageFileExtensionFromMimeType(null)).toBe("png");
  });
});
