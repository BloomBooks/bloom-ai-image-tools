import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";
import {
  buildMeasuredStatKey,
  DEFAULT_MODEL,
  getMaxInputImagesForModel,
  getMeasuredStats,
  getModelInfoById,
  getOpenRouterEndpointForModel,
  getQualityLevelsForModel,
  getReasoningLevelsForModel,
  getRecommendedModelIds,
  getSizeOptionsForModel,
  getToolModelOptions,
  resolveToolModelId,
  resolveToolQuality,
  resolveToolReasoningLevel,
  snapPixelsForModel,
} from "../modelsCatalog";
import type { ToolDefinition } from "../../types";

const GEMINI_FLASH = "google/gemini-3.1-flash-image";
const GEMINI_PRO = "google/gemini-3-pro-image";
const SUNBURST = "openai/gpt-image-2.5-sunburst";

const getTool = (id: string): ToolDefinition => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`missing tool ${id}`);
  return tool;
};

describe("per-tool model resolution", () => {
  it("defaults a tool with no modelIds to the full catalog with the catalog default recommended", () => {
    const tool = getTool("generate_image");
    const optionIds = getToolModelOptions(tool).map((m) => m.id);

    expect(optionIds).toContain(GEMINI_FLASH);
    expect(optionIds).toContain(SUNBURST);
    expect(getRecommendedModelIds(tool)).toEqual([DEFAULT_MODEL?.id]);
    expect(resolveToolModelId(tool, {})).toBe(DEFAULT_MODEL?.id);
    // Default (recommended) model is ordered first.
    expect(optionIds[0]).toBe(DEFAULT_MODEL?.id);
  });

  it("recommends GPT Image 2.5 Sunburst for the break-comic tool", () => {
    const tool = getTool("break_comic_into_images");
    const optionIds = getToolModelOptions(tool).map((m) => m.id);

    expect(getRecommendedModelIds(tool)).toEqual([SUNBURST]);
    expect(resolveToolModelId(tool, {})).toBe(SUNBURST);
    // Default (recommended) model is listed first.
    expect(optionIds[0]).toBe(SUNBURST);
  });

  it("honors a valid persisted choice but falls back when it is no longer an option", () => {
    const tool = getTool("generate_image");
    expect(resolveToolModelId(tool, { generate_image: GEMINI_PRO })).toBe(GEMINI_PRO);
    // Unknown / removed model id -> first recommended.
    expect(resolveToolModelId(tool, { generate_image: "made/up-model" })).toBe(DEFAULT_MODEL?.id);
  });

  it("treats a single-option tool as not editable", () => {
    const tool: ToolDefinition = { ...getTool("generate_image"), modelIds: [GEMINI_FLASH] };
    expect(getToolModelOptions(tool).map((m) => m.id)).toEqual([GEMINI_FLASH]);
  });
});

describe("per-tool reasoning resolution", () => {
  it("prefers the per-tool override above everything else", () => {
    const tool = getTool("break_comic_into_images");
    // Gemini Flash rather than the catalog default: an override can only be
    // shown to win on a model that takes reasoning at all.
    const flash = getModelInfoById(GEMINI_FLASH);
    expect(resolveToolReasoningLevel(tool, flash, { break_comic_into_images: "high" })).toBe(
      "high",
    );
  });

  it("applies the tool's imageReasoningLevel cap over the model's initial level", () => {
    const tool = getTool("break_comic_into_images");
    // Gemini Flash starts at "high", but break-comic caps reasoning at
    // "default". Name the model rather than using DEFAULT_MODEL: the cap can
    // only be shown to win over a model that declares an initial level.
    const flash = getModelInfoById(GEMINI_FLASH);
    expect(flash?.initialReasoningLevel).toBe("high");
    expect(resolveToolReasoningLevel(tool, flash, {})).toBe("default");
  });

  it("falls back to the model's initial reasoning level", () => {
    const tool = getTool("generate_image");
    // Gemini Flash rather than the catalog default, because this checks the
    // initialReasoningLevel step of the chain and only some models declare one.
    const flash = getModelInfoById(GEMINI_FLASH);
    expect(flash?.initialReasoningLevel).toBe("high");
    expect(resolveToolReasoningLevel(tool, flash, {})).toBe("high");
  });

  it('uses "default" for a model that declares no initial reasoning level', () => {
    const tool = getTool("generate_image");
    // Gemini 3 Pro takes reasoning but names no starting level.
    const pro = getModelInfoById(GEMINI_PRO);
    expect(pro?.initialReasoningLevel).toBeUndefined();
    expect(resolveToolReasoningLevel(tool, pro, {})).toBe("default");
  });
});

describe("measured stats lookup", () => {
  it("reads back cost + time stored under the tool/model/reasoning/size key", () => {
    const key = buildMeasuredStatKey("generate_image", SUNBURST, "default", "2k");
    const map = { [key]: { cost: 0.24, durationMs: 12000 } };

    expect(getMeasuredStats("generate_image", SUNBURST, "default", "2k", map)).toEqual({
      cost: 0.24,
      durationMs: 12000,
    });
    // Different size is a separate bucket.
    expect(getMeasuredStats("generate_image", SUNBURST, "default", "4k", map)).toBeNull();
    // Missing size falls back to the "default" token, not "2k".
    expect(getMeasuredStats("generate_image", SUNBURST, "default", undefined, map)).toBeNull();
    expect(getMeasuredStats("generate_image", SUNBURST, "default", "2k", undefined)).toBeNull();
  });
});

describe("OpenRouter endpoint routing", () => {
  it("routes chat-style image models to chat/completions", () => {
    expect(getOpenRouterEndpointForModel(GEMINI_FLASH)).toBe("chat/completions");
    expect(getOpenRouterEndpointForModel(GEMINI_PRO)).toBe("chat/completions");
  });

  it("routes dedicated image models to the images API", () => {
    // chat/completions refuses these outright: "... is an image generation
    // model and cannot be used with the chat/completions endpoint."
    expect(getOpenRouterEndpointForModel("openai/gpt-image-2.5-flare")).toBe("images");
    expect(getOpenRouterEndpointForModel(SUNBURST)).toBe("images");
  });

  it("falls back to chat/completions for an id the catalog does not know", () => {
    expect(getOpenRouterEndpointForModel("vendor/not-in-the-catalog")).toBe("chat/completions");
  });
});

describe("reasoning levels per model", () => {
  it("offers the levels the model declares", () => {
    // The 3.1 Flash keys have two thinking levels (Google's "minimal" and
    // "high"); measured 2026-09-12, "low", "medium" and "high" all bought the
    // same ~480 reasoning tokens and "none" bought what omitting the parameter
    // buys. So the picker offers the two positions that differ.
    expect(getReasoningLevelsForModel(GEMINI_FLASH)).toEqual(["default", "high"]);
    // Google documents "low" and "high" for Gemini 3 Pro; "medium" is accepted
    // but coerced, so it is not offered.
    expect(getReasoningLevelsForModel(GEMINI_PRO)).toEqual(["default", "low", "high"]);
  });

  it("offers quality only for the models that take it, starting at auto", () => {
    const tool = getTool("generate_image");
    expect(getQualityLevelsForModel(SUNBURST)).toEqual([
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(getQualityLevelsForModel(GEMINI_FLASH)).toEqual([]);
    expect(resolveToolQuality(tool, getModelInfoById(SUNBURST)!, {})).toBe("auto");
    expect(resolveToolQuality(tool, getModelInfoById(SUNBURST)!, { generate_image: "low" })).toBe(
      "low",
    );
    // A quality remembered under GPT Image 2.5 is not sent to a Gemini key.
    expect(
      resolveToolQuality(tool, getModelInfoById(GEMINI_FLASH)!, { generate_image: "low" }),
    ).toBeNull();
  });

  it("labels size options with the pixels a pixel-size model will be sent", () => {
    // GPT Image 2.5 caps the pixel budget, so "4k" square is 2880x2880, and
    // "512k" and "1k" both land on 1024x1024 and collapse into one option.
    expect(getSizeOptionsForModel(["512k", "1k", "2k", "4k"], SUNBURST, "1:1")).toEqual([
      { token: "512k", label: "1024x1024" },
      { token: "2k", label: "2048x2048" },
      { token: "4k", label: "2880x2880" },
    ]);
    // A tier-token model shows the tokens as they are.
    expect(getSizeOptionsForModel(["512k", "1k", "2k", "4k"], GEMINI_FLASH, "1:1")).toEqual([
      { token: "512k", label: "512k" },
      { token: "1k", label: "1k" },
      { token: "2k", label: "2k" },
    ]);
  });

  it("snaps pixels for a pixel-size model and leaves them alone otherwise", () => {
    // A 3:2 "4K" request hits GPT Image 2.5's pixel budget (8,294,400) before
    // its 3840 edge cap, so it lands well under both.
    expect(snapPixelsForModel(SUNBURST, { width: 4096, height: 2731 })).toEqual({
      width: 3520,
      height: 2352,
    });
    // A 16:9 one fits the budget exactly at the edge cap.
    expect(snapPixelsForModel(SUNBURST, { width: 4096, height: 2304 })).toEqual({
      width: 3840,
      height: 2160,
    });
    expect(snapPixelsForModel(GEMINI_FLASH, { width: 4096, height: 2731 })).toEqual({
      width: 4096,
      height: 2731,
    });
    expect(snapPixelsForModel(SUNBURST, null)).toBeNull();
  });

  it("caps input images at what the model's endpoint takes", () => {
    // From OpenRouter's GET /api/v1/images/models input_references ranges.
    expect(getMaxInputImagesForModel(GEMINI_FLASH)).toBe(14);
    expect(getMaxInputImagesForModel(GEMINI_PRO)).toBe(14);
    expect(getMaxInputImagesForModel(SUNBURST)).toBe(16);
    // An id the catalog does not know gets no cap, and so no check.
    expect(getMaxInputImagesForModel("vendor/unknown-model")).toBeNull();
  });

  it("leaves out a level the model rejects", () => {
    // Gemini 3 Pro makes thinking mandatory: effort "none" comes back a 400.
    expect(getReasoningLevelsForModel(GEMINI_PRO)).not.toContain("none");
    expect(getReasoningLevelsForModel(GEMINI_PRO)).toContain("high");
  });

  it("offers nothing for a model that takes no reasoning parameter", () => {
    expect(getReasoningLevelsForModel("openai/gpt-image-2.5-flare")).toEqual([]);
    expect(getReasoningLevelsForModel(SUNBURST)).toEqual([]);
  });

  it("does not confuse the levels a model takes with the level it starts at", () => {
    expect(getModelInfoById(GEMINI_PRO)?.initialReasoningLevel).toBeUndefined();
    expect(getReasoningLevelsForModel(GEMINI_PRO).length).toBeGreaterThan(0);
  });

  it("falls back to a level a model rejects being asked for", () => {
    const tool = getTool("generate_image");
    const pro = getModelInfoById(GEMINI_PRO);
    // A "none" remembered from Gemini Flash must not follow the user to Pro.
    expect(resolveToolReasoningLevel(tool, pro, { generate_image: "none" })).toBe("default");
    expect(resolveToolReasoningLevel(tool, pro, { generate_image: "high" })).toBe("high");
  });

  it("ignores a stored level entirely for a model with no reasoning", () => {
    const tool = getTool("generate_image");
    const sunburst = getModelInfoById(SUNBURST);
    expect(resolveToolReasoningLevel(tool, sunburst, { generate_image: "high" })).toBe("default");
  });
});
