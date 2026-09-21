import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";
import type { ToolDefinition } from "../../types";
import { DETAILED_EDIT_OUTPUT_TOKENS, estimateInputImageTokens } from "../imageCostEstimate";
import { MAX_REFERENCE_IMAGE_EDGE } from "../imageProcessing";
import { LOCAL_DUMMY_MODEL } from "../localModels";
import { getModelInfoById } from "../modelsCatalog";
import {
  DEFAULT_UNKNOWN_INPUT_RESOLUTION,
  estimateToolRunCostUsd,
  referenceResolutionAsSent,
  type ToolRunCostInput,
} from "../toolRunCostEstimate";

const SUNBURST = getModelInfoById("openai/gpt-image-2.5-sunburst");
const GEMINI_PRO = getModelInfoById("google/gemini-3-pro-image");

const getTool = (id: string): ToolDefinition => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`missing tool ${id}`);
  return tool;
};

const estimate = (toolId: string, overrides: Partial<ToolRunCostInput> = {}) =>
  estimateToolRunCostUsd({
    tool: getTool(toolId),
    toolModel: SUNBURST,
    params: {},
    target: null,
    referenceResolutions: [],
    ...overrides,
  });

const usd = (toolId: string, overrides: Partial<ToolRunCostInput> = {}): number => {
  const result = estimate(toolId, overrides);
  if (!result) throw new Error("expected an estimate");
  return result.usd;
};

describe("estimateToolRunCostUsd", () => {
  it("prices a redraw of the whole picture by its detail, not the size table", () => {
    // A 488x544 page image improved to 1466x1700 billed about $0.06 on
    // 2026-09-20; the size table alone said $0.01.
    const result = estimate("improve_quality", {
      target: {
        resolution: { width: 488, height: 544 },
        suggestedTarget: { width: 1466, height: 1700 },
      },
    });
    expect(result?.kind).toBe("token");
    if (result?.kind !== "token") return;
    expect(result.detail.outputTokens).toBe(DETAILED_EDIT_OUTPUT_TOKENS);
    expect(result.usd).toBeGreaterThan(0.05);
    // A tool that draws something new keeps the size table's figure.
    const created = estimate("generate_image", { target: null });
    if (created?.kind === "token") {
      expect(created.detail.outputTokens).toBeLessThan(DETAILED_EDIT_OUTPUT_TOKENS);
    }
  });

  it("has no price for a run that never reaches a paid model", () => {
    expect(estimate("remove_background")).toBeNull();
    expect(estimate("pdf_to_images")).toBeNull();
    expect(estimate("generate_image", { toolModel: LOCAL_DUMMY_MODEL })).toBeNull();
    expect(estimate("generate_image", { toolModel: null })).toBeNull();
  });

  it("answers a fixed-price model's price whatever the images", () => {
    const bare = estimate("generate_image", { toolModel: GEMINI_PRO });
    const loaded = estimate("remove_object", {
      toolModel: GEMINI_PRO,
      target: { resolution: { width: 4000, height: 3000 }, suggestedTarget: null },
      referenceResolutions: [{ width: 1024, height: 1024 }, null],
    });
    expect(bare).toEqual({ kind: "fixed", usd: GEMINI_PRO?.pricePerImageUsd });
    expect(loaded).toEqual(bare);
  });

  it("prices a token model from the images sent and the size drawn", () => {
    const result = estimate("remove_object", {
      target: { resolution: { width: 1024, height: 1024 }, suggestedTarget: null },
    });
    expect(result?.kind).toBe("token");
    if (result?.kind !== "token") return;
    expect(result.detail.inputImageTokens).toBe(1034);
    expect(result.outputPixels).toEqual({ width: 1024, height: 1024 });
    expect(result.usd).toBeCloseTo(result.detail.totalUsd, 12);
  });

  it("charges more to edit a bigger image", () => {
    const small = usd("remove_object", {
      target: { resolution: { width: 1024, height: 1024 }, suggestedTarget: null },
    });
    const large = usd("remove_object", {
      target: { resolution: { width: 2048, height: 2048 }, suggestedTarget: null },
    });
    expect(large).toBeGreaterThan(small);
  });

  it("charges for every reference", () => {
    const reference = { width: 1024, height: 479 };
    const none = usd("generate_image", { params: { aspectRatio: "1:1", size: "1k" } });
    const one = usd("generate_image", {
      params: { aspectRatio: "1:1", size: "1k" },
      referenceResolutions: [reference],
    });
    const two = usd("generate_image", {
      params: { aspectRatio: "1:1", size: "1k" },
      referenceResolutions: [reference, reference],
    });
    expect(one - none).toBeCloseTo((estimateInputImageTokens(reference) * 8) / 1e6, 9);
    expect(two - one).toBeCloseTo(one - none, 9);
  });

  it("bills a reference at the size it is sent, shrunk to the reference cap", () => {
    expect(referenceResolutionAsSent({ width: 4096, height: 1916 })).toEqual({
      width: MAX_REFERENCE_IMAGE_EDGE,
      height: 479,
    });
    expect(referenceResolutionAsSent({ width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
    expect(referenceResolutionAsSent(null)).toEqual(DEFAULT_UNKNOWN_INPUT_RESOLUTION);

    const huge = usd("generate_image", {
      params: { aspectRatio: "1:1", size: "1k" },
      referenceResolutions: [{ width: 4096, height: 1916 }],
    });
    const capped = usd("generate_image", {
      params: { aspectRatio: "1:1", size: "1k" },
      referenceResolutions: [{ width: 1024, height: 479 }],
    });
    expect(huge).toBeCloseTo(capped, 12);
  });

  it("assumes a 1024 square for an image whose size is not known", () => {
    const unknown = usd("remove_object", {
      target: { resolution: null, suggestedTarget: null },
    });
    const square = usd("remove_object", {
      target: { resolution: { width: 1024, height: 1024 }, suggestedTarget: null },
    });
    expect(unknown).toBeCloseTo(square, 12);
  });

  it("ignores a loaded image for a tool that does not edit one", () => {
    const withImage = usd("generate_image", {
      params: { aspectRatio: "1:1", size: "1k" },
      target: { resolution: { width: 3000, height: 3000 }, suggestedTarget: null },
    });
    const without = usd("generate_image", { params: { aspectRatio: "1:1", size: "1k" } });
    expect(withImage).toBeCloseTo(without, 12);
  });

  it("sums a batch of different sizes image by image, not by a fixed price", () => {
    const targets = [
      { resolution: { width: 1024, height: 1024 }, suggestedTarget: null },
      {
        resolution: { width: 2048, height: 1536 },
        suggestedTarget: { width: 2048, height: 1536 },
      },
    ];
    const each = targets.map((target) => usd("coloring_book", { target }));
    const sum = each.reduce((total, value) => total + value, 0);
    expect(sum).not.toBeCloseTo(each[0] * 2, 6);
    expect(sum).not.toBeCloseTo(each[1] * 2, 6);
  });
});
