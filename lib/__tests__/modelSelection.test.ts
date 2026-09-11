import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";
import {
  buildMeasuredStatKey,
  DEFAULT_MODEL,
  getMeasuredStats,
  getModelInfoById,
  getOpenRouterEndpointForModel,
  getReasoningLevelsForModel,
  getRecommendedModelIds,
  getToolModelOptions,
  resolveToolModelId,
  resolveToolReasoningLevel,
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
    // Gemini Flash starts at "medium", but break-comic caps reasoning at
    // "default". Name the model rather than using DEFAULT_MODEL: the cap can
    // only be shown to win over a model that declares an initial level.
    const flash = getModelInfoById(GEMINI_FLASH);
    expect(flash?.initialReasoningLevel).toBe("medium");
    expect(resolveToolReasoningLevel(tool, flash, {})).toBe("default");
  });

  it("falls back to the model's initial reasoning level", () => {
    const tool = getTool("generate_image");
    // Gemini Flash rather than the catalog default, because this checks the
    // initialReasoningLevel step of the chain and only some models declare one.
    const flash = getModelInfoById(GEMINI_FLASH);
    expect(flash?.initialReasoningLevel).toBe("medium");
    expect(resolveToolReasoningLevel(tool, flash, {})).toBe("medium");
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
    // All three Gemini keys list "reasoning" in supported_parameters on
    // OpenRouter (checked 2026-09-11).
    expect(getReasoningLevelsForModel(GEMINI_FLASH)).toEqual([
      "default",
      "none",
      "low",
      "medium",
      "high",
    ]);
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
