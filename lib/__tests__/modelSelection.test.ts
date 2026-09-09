import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";
import {
  buildMeasuredStatKey,
  DEFAULT_MODEL,
  getMeasuredStats,
  getRecommendedModelIds,
  getToolModelOptions,
  resolveToolModelId,
  resolveToolReasoningLevel,
} from "../modelsCatalog";
import type { ToolDefinition } from "../../types";

const GEMINI_FLASH = "google/gemini-3.1-flash-image";
const GPT5_IMAGE = "openai/gpt-5-image";
const GPT54_IMAGE_2 = "openai/gpt-5.4-image-2";

const getTool = (id: string): ToolDefinition => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`missing tool ${id}`);
  return tool;
};

describe("per-tool model resolution", () => {
  it("defaults a tool with no modelIds to the full catalog with Gemini Flash recommended", () => {
    const tool = getTool("generate_image");
    const optionIds = getToolModelOptions(tool).map((m) => m.id);

    expect(optionIds).toContain(GEMINI_FLASH);
    expect(optionIds).toContain(GPT5_IMAGE);
    expect(getRecommendedModelIds(tool)).toEqual([DEFAULT_MODEL?.id]);
    expect(resolveToolModelId(tool, {})).toBe(DEFAULT_MODEL?.id);
    // Default (recommended) model is ordered first.
    expect(optionIds[0]).toBe(DEFAULT_MODEL?.id);
  });

  it("recommends GPT-5.4 Image 2 for the break-comic tool and never offers plain GPT-5 Image", () => {
    const tool = getTool("break_comic_into_images");
    const optionIds = getToolModelOptions(tool).map((m) => m.id);

    expect(getRecommendedModelIds(tool)).toEqual([GPT54_IMAGE_2]);
    expect(resolveToolModelId(tool, {})).toBe(GPT54_IMAGE_2);
    // Disallowed model is absent entirely.
    expect(optionIds).not.toContain(GPT5_IMAGE);
    // Default (recommended) model is listed first.
    expect(optionIds[0]).toBe(GPT54_IMAGE_2);
  });

  it("honors a valid persisted choice but falls back when it is no longer an option", () => {
    const tool = getTool("generate_image");
    expect(resolveToolModelId(tool, { generate_image: GPT5_IMAGE })).toBe(GPT5_IMAGE);
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
    expect(
      resolveToolReasoningLevel(tool, DEFAULT_MODEL, { break_comic_into_images: "high" }),
    ).toBe("high");
  });

  it("applies the tool's imageReasoningLevel cap over the model's initial level", () => {
    const tool = getTool("break_comic_into_images");
    // Gemini Flash starts at "medium", but break-comic caps reasoning at "default".
    expect(resolveToolReasoningLevel(tool, DEFAULT_MODEL, {})).toBe("default");
  });

  it("falls back to the model's initial reasoning level", () => {
    const tool = getTool("generate_image");
    expect(resolveToolReasoningLevel(tool, DEFAULT_MODEL, {})).toBe(
      DEFAULT_MODEL?.initialReasoningLevel,
    );
  });
});

describe("measured stats lookup", () => {
  it("reads back cost + time stored under the tool/model/reasoning/size key", () => {
    const key = buildMeasuredStatKey("generate_image", GPT54_IMAGE_2, "default", "2k");
    const map = { [key]: { cost: 0.24, durationMs: 12000 } };

    expect(getMeasuredStats("generate_image", GPT54_IMAGE_2, "default", "2k", map)).toEqual({
      cost: 0.24,
      durationMs: 12000,
    });
    // Different size is a separate bucket.
    expect(getMeasuredStats("generate_image", GPT54_IMAGE_2, "default", "4k", map)).toBeNull();
    // Missing size falls back to the "default" token, not "2k".
    expect(getMeasuredStats("generate_image", GPT54_IMAGE_2, "default", undefined, map)).toBeNull();
    expect(
      getMeasuredStats("generate_image", GPT54_IMAGE_2, "default", "2k", undefined),
    ).toBeNull();
  });
});
