import { describe, expect, it } from "vitest";
import { clampImageSizeTier, IMAGE_SIZE_TIERS, sizeTokenToImageSizeTier } from "../imageSizes";
import {
  getMaxImageSizeForModel,
  getSizeTokenOptionsForModel,
  MODEL_CATALOG,
  resolveImageSizeTierForModel,
} from "../modelsCatalog";
import { LOCAL_DUMMY_MODEL_ID } from "../localModels";

// The ceilings measured against OpenRouter on 2026-09-01. A model key resolves
// to a dated snapshot, and the ceiling belongs to that snapshot, so these change
// when OpenRouter republishes a key.
const GEMINI_3_PRO = "google/gemini-3-pro-image";
const GEMINI_FLASH = "google/gemini-3.1-flash-image";
const GEMINI_FLASH_LITE = "google/gemini-3.1-flash-lite-image";
const GPT54_IMAGE_2 = "openai/gpt-5.4-image-2";

const TOOL_SIZE_OPTIONS = ["512k", "1k", "2k", "4k"];

describe("size tokens map to request tiers", () => {
  it("treats the 512k preset as the smallest tier", () => {
    expect(sizeTokenToImageSizeTier("512k")).toBe("1K");
  });

  it("maps each named token to its own tier", () => {
    expect(sizeTokenToImageSizeTier("1k")).toBe("1K");
    expect(sizeTokenToImageSizeTier("2k")).toBe("2K");
    expect(sizeTokenToImageSizeTier("4k")).toBe("4K");
  });

  it("falls back to the smallest tier for an unknown or missing token", () => {
    expect(sizeTokenToImageSizeTier("8k")).toBe("1K");
    expect(sizeTokenToImageSizeTier(undefined)).toBe("1K");
  });
});

describe("clampImageSizeTier", () => {
  it("leaves a request at or below the ceiling alone", () => {
    expect(clampImageSizeTier("1K", "2K")).toBe("1K");
    expect(clampImageSizeTier("2K", "2K")).toBe("2K");
  });

  it("reduces a request above the ceiling", () => {
    expect(clampImageSizeTier("4K", "2K")).toBe("2K");
    expect(clampImageSizeTier("2K", "1K")).toBe("1K");
  });

  it("does not clamp when no ceiling is known", () => {
    expect(clampImageSizeTier("4K", null)).toBe("4K");
    expect(clampImageSizeTier("4K", undefined)).toBe("4K");
  });
});

describe("the catalog records a ceiling for every image_config model", () => {
  it("caps the stable Gemini keys at 2K", () => {
    expect(getMaxImageSizeForModel(GEMINI_3_PRO)).toBe("2K");
    expect(getMaxImageSizeForModel(GEMINI_FLASH)).toBe("2K");
  });

  it("caps Gemini 3.1 Flash Lite at 1K", () => {
    expect(getMaxImageSizeForModel(GEMINI_FLASH_LITE)).toBe("1K");
  });

  it("caps GPT-5.4 Image 2 at 2K", () => {
    expect(getMaxImageSizeForModel(GPT54_IMAGE_2)).toBe("2K");
  });

  it("gives every google/* and gpt-5.4-image* entry a valid ceiling", () => {
    const usesImageConfig = MODEL_CATALOG.filter(
      (model) =>
        model.id !== LOCAL_DUMMY_MODEL_ID &&
        (model.id.startsWith("google/") || model.id.startsWith("openai/gpt-5.4-image")),
    );
    // Sanity check: the catalog really does contain such models, so a passing
    // test below is not an empty loop.
    expect(usesImageConfig.length).toBeGreaterThan(0);
    usesImageConfig.forEach((model) => {
      expect(IMAGE_SIZE_TIERS).toContain(model.maxImageSize);
    });
  });
});

describe("resolveImageSizeTierForModel", () => {
  it("reduces a 4K request on a stable Gemini key to 2K", () => {
    expect(resolveImageSizeTierForModel(GEMINI_3_PRO, "4K")).toBe("2K");
    expect(resolveImageSizeTierForModel(GEMINI_FLASH, "4K")).toBe("2K");
  });

  it("reduces a 2K request on Flash Lite to 1K", () => {
    expect(resolveImageSizeTierForModel(GEMINI_FLASH_LITE, "2K")).toBe("1K");
  });

  it("passes a request the model accepts through unchanged", () => {
    expect(resolveImageSizeTierForModel(GEMINI_FLASH, "2K")).toBe("2K");
    expect(resolveImageSizeTierForModel(GEMINI_FLASH_LITE, "1K")).toBe("1K");
  });

  it("sends an unknown model id exactly what was asked for", () => {
    expect(resolveImageSizeTierForModel("some/unlisted-model", "4K")).toBe("4K");
  });
});

describe("getSizeTokenOptionsForModel", () => {
  it("drops 4k for the stable Gemini keys", () => {
    // Sanity check: 4k is on offer before the model narrows the list.
    expect(TOOL_SIZE_OPTIONS).toContain("4k");
    expect(getSizeTokenOptionsForModel(TOOL_SIZE_OPTIONS, GEMINI_FLASH)).toEqual([
      "512k",
      "1k",
      "2k",
    ]);
  });

  it("leaves Flash Lite with the 1K tokens only", () => {
    expect(getSizeTokenOptionsForModel(TOOL_SIZE_OPTIONS, GEMINI_FLASH_LITE)).toEqual([
      "512k",
      "1k",
    ]);
  });

  it("keeps every option for a model with no recorded ceiling", () => {
    expect(getSizeTokenOptionsForModel(TOOL_SIZE_OPTIONS, "some/unlisted-model")).toEqual(
      TOOL_SIZE_OPTIONS,
    );
  });

  it("keeps one option when every declared size is above the ceiling", () => {
    expect(getSizeTokenOptionsForModel(["2k", "4k"], GEMINI_FLASH_LITE)).toEqual(["2k"]);
  });
});
