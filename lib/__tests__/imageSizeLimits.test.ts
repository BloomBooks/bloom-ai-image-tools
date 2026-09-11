import { describe, expect, it } from "vitest";
import {
  clampImageSizeTier,
  IMAGE_SIZE_TIERS,
  OPENAI_IMAGE_SIZE_CONSTRAINTS,
  parseAspectRatio,
  pixelsForTier,
  sizeTokenToImageSizeTier,
  snapToOpenAiImageSize,
} from "../imageSizes";
import {
  getMaxImageSizeForModel,
  getSizeTokenOptionsForModel,
  MODEL_CATALOG,
  resolveImageSizeRequest,
  resolveImageSizeTierForModel,
} from "../modelsCatalog";
import { LOCAL_DUMMY_MODEL_ID } from "../localModels";

// The ceilings measured against OpenRouter on 2026-09-01. A model key resolves
// to a dated snapshot, and the ceiling belongs to that snapshot, so these change
// when OpenRouter republishes a key.
const GEMINI_3_PRO = "google/gemini-3-pro-image";
const GEMINI_FLASH = "google/gemini-3.1-flash-image";
const GEMINI_FLASH_LITE = "google/gemini-3.1-flash-lite-image";

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

  it("gives every google/* entry a valid ceiling", () => {
    const usesImageConfig = MODEL_CATALOG.filter(
      (model) => model.id !== LOCAL_DUMMY_MODEL_ID && model.id.startsWith("google/"),
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

describe("snapToOpenAiImageSize", () => {
  const { maxEdge, edgeMultiple, maxEdgeRatio, minPixels, maxPixels } =
    OPENAI_IMAGE_SIZE_CONSTRAINTS;

  const satisfiesEveryRule = (size: { width: number; height: number }) => {
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    return (
      size.width % edgeMultiple === 0 &&
      size.height % edgeMultiple === 0 &&
      long <= maxEdge &&
      long / short <= maxEdgeRatio &&
      size.width * size.height >= minPixels &&
      size.width * size.height <= maxPixels
    );
  };

  it("leaves a size that already obeys every rule alone", () => {
    expect(snapToOpenAiImageSize({ width: 1536, height: 1024 })).toEqual({
      width: 1536,
      height: 1024,
    });
    expect(snapToOpenAiImageSize({ width: 1024, height: 1024 })).toEqual({
      width: 1024,
      height: 1024,
    });
  });

  it("rounds each edge onto the 16-pixel grid", () => {
    const snapped = snapToOpenAiImageSize({ width: 1500, height: 1001 });
    expect(snapped.width % 16).toBe(0);
    expect(snapped.height % 16).toBe(0);
    // Close to what was asked for, not a different picture.
    expect(Math.abs(snapped.width - 1500)).toBeLessThanOrEqual(16);
  });

  it("pulls a too-thin shape back to 3:1", () => {
    const snapped = snapToOpenAiImageSize({ width: 4000, height: 500 });
    expect(
      Math.max(snapped.width, snapped.height) / Math.min(snapped.width, snapped.height),
    ).toBeLessThanOrEqual(maxEdgeRatio);
    expect(satisfiesEveryRule(snapped)).toBe(true);
  });

  it("grows a picture too small to be accepted", () => {
    // A Bloom thumbnail slot asks for far fewer than 655,360 pixels.
    const snapped = snapToOpenAiImageSize({ width: 320, height: 240 });
    expect(snapped.width * snapped.height).toBeGreaterThanOrEqual(minPixels);
    expect(satisfiesEveryRule(snapped)).toBe(true);
    // The 4:3 shape survives being grown.
    expect(snapped.width / snapped.height).toBeCloseTo(4 / 3, 1);
  });

  it("shrinks a picture too large to be accepted", () => {
    const snapped = snapToOpenAiImageSize({ width: 8000, height: 6000 });
    expect(Math.max(snapped.width, snapped.height)).toBeLessThanOrEqual(maxEdge);
    expect(satisfiesEveryRule(snapped)).toBe(true);
  });

  it("falls back to a square rather than failing on a size it cannot read", () => {
    expect(snapToOpenAiImageSize(null)).toEqual({ width: 1024, height: 1024 });
    expect(snapToOpenAiImageSize({ width: 0, height: 0 })).toEqual({ width: 1024, height: 1024 });
    expect(snapToOpenAiImageSize({ width: Number.NaN, height: 100 })).toEqual({
      width: 1024,
      height: 1024,
    });
  });

  it("produces an acceptable size for every shape a book slot might ask for", () => {
    const shapes = [
      [1920, 1080],
      [1080, 1920],
      [2480, 3508],
      [612, 792],
      [3840, 2160],
      [200, 1400],
      [5000, 5000],
      [1, 1],
    ];
    for (const [width, height] of shapes) {
      const snapped = snapToOpenAiImageSize({ width, height });
      expect(satisfiesEveryRule(snapped), `${width}x${height} -> ${JSON.stringify(snapped)}`).toBe(
        true,
      );
    }
  });
});

describe("resolveImageSizeRequest", () => {
  it("gives a Gemini key its tier token, capped by the model ceiling", () => {
    expect(resolveImageSizeRequest("google/gemini-3.1-flash-image", "4K")).toEqual({
      parameter: "image_config.image_size",
      value: "2K",
    });
    expect(resolveImageSizeRequest("google/gemini-3.1-flash-lite-image", "2K")).toEqual({
      parameter: "image_config.image_size",
      value: "1K",
    });
  });

  it("gives a GPT Image 2.5 key pixels in the shape that was asked for", () => {
    expect(
      resolveImageSizeRequest("openai/gpt-image-2.5-flare", "1K", { aspectRatio: "1:1" }),
    ).toEqual({ parameter: "size", value: "1024x1024" });
    // The tier sets the long edge, as it does for the models taking the token.
    expect(
      resolveImageSizeRequest("openai/gpt-image-2.5-flare", "2K", { aspectRatio: "3:2" }),
    ).toEqual({ parameter: "size", value: "2048x1360" });
  });

  it("honours an exact resolution over the tier when the caller has one", () => {
    // A Bloom book slot knows the pixels it wants. 1000 is not a multiple of
    // 16, so the nearest legal height is 1008.
    expect(
      resolveImageSizeRequest("openai/gpt-image-2.5-flare", "1K", {
        desiredPixels: { width: 1500, height: 1000 },
        aspectRatio: "16:9",
      }),
    ).toEqual({ parameter: "size", value: "1504x1008" });
  });

  it("asks for no size at all when it knows neither pixels nor a shape", () => {
    // An explicit size overrides the source image's shape on an edit, so a
    // square guess here would crop every edit made by a tool with no shape
    // picker. Sending nothing lets the model follow the input.
    expect(resolveImageSizeRequest("openai/gpt-image-2.5-flare", "1K")).toBeNull();
    expect(
      resolveImageSizeRequest("openai/gpt-image-2.5-flare", "1K", { aspectRatio: "auto" }),
    ).toBeNull();
  });

  it("sends no size for a model that takes no size parameter", () => {
    expect(resolveImageSizeRequest("debug/local-dummy-extract-cast", "2K")).toBeNull();
    expect(resolveImageSizeRequest("vendor/not-in-the-catalog", "2K")).toBeNull();
  });
});

describe("pixelsForTier", () => {
  it("puts the tier on the long edge, whichever edge that is", () => {
    expect(pixelsForTier("2K", "16:9")).toEqual({ width: 2048, height: 1152 });
    expect(pixelsForTier("2K", "9:16")).toEqual({ width: 1152, height: 2048 });
    expect(pixelsForTier("1K", "1:1")).toEqual({ width: 1024, height: 1024 });
    expect(pixelsForTier("4K", "1:1")).toEqual({ width: 3840, height: 3840 });
  });

  it("falls back to a square when there is no ratio to read", () => {
    expect(pixelsForTier("1K", "auto")).toEqual({ width: 1024, height: 1024 });
    expect(pixelsForTier("1K", undefined)).toEqual({ width: 1024, height: 1024 });
  });
});

describe("parseAspectRatio", () => {
  it("reads a ratio and rejects everything else", () => {
    expect(parseAspectRatio("21:9")).toEqual({ width: 21, height: 9 });
    expect(parseAspectRatio(" 3:2 ")).toEqual({ width: 3, height: 2 });
    expect(parseAspectRatio("auto")).toBeNull();
    expect(parseAspectRatio("")).toBeNull();
    expect(parseAspectRatio(undefined)).toBeNull();
    expect(parseAspectRatio("4:0")).toBeNull();
  });
});
