import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";
import type { ToolDefinition } from "../../types";
import { AUTO_ASPECT_RATIO } from "../aspectRatios";
import { DEFAULT_SIZE_TOKEN, pixelsForTier, snapToOpenAiImageSize } from "../imageSizes";
import {
  planImageRequest,
  predictOutputPixels,
  type ImageRequestPlanInput,
} from "../imageRequestPlan";
import { getModelInfoById } from "../modelsCatalog";
import { findSizeParam } from "../slotTarget";
import { toolRequiresEditImage } from "../toolHelpers";

const SUNBURST = getModelInfoById("openai/gpt-image-2.5-sunburst");
const GEMINI_FLASH = getModelInfoById("google/gemini-3.1-flash-image");

const getTool = (id: string): ToolDefinition => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`missing tool ${id}`);
  return tool;
};

const planFor = (
  toolId: string,
  overrides: Partial<ImageRequestPlanInput> = {},
): { plan: ReturnType<typeof planImageRequest>; input: ImageRequestPlanInput } => {
  const tool = getTool(toolId);
  const input: ImageRequestPlanInput = {
    tool,
    params: {},
    toolModel: SUNBURST,
    requiresEditImage: toolRequiresEditImage(tool),
    targetImageResolution: null,
    hostTarget: null,
    ...overrides,
  };
  return { plan: planImageRequest(input), input };
};

describe("planImageRequest", () => {
  it("asks for the picked tier and shape on a generation, with no exact pixels", () => {
    const { plan, input } = planFor("generate_image", {
      params: { aspectRatio: "16:9", size: "1k" },
    });
    expect(plan.requestedSize).toBe("1k");
    expect(plan.requestedAspectRatio).toBe("16:9");
    expect(plan.targetDimensions).toBeUndefined();
    expect(plan.sizeToken).toBe("1k");
    expect(predictOutputPixels(plan, input)).toEqual(
      snapToOpenAiImageSize(pixelsForTier("1K", "16:9")),
    );
  });

  it("keeps an edit at its source's own size when the tool sets no size and the shape follows the source", () => {
    const source = { width: 2048, height: 1536 };
    const { plan, input } = planFor("remove_object", { targetImageResolution: source });
    expect(plan.requestedSize).toBeUndefined();
    expect(plan.requestedAspectRatio).toBe(AUTO_ASPECT_RATIO);
    expect(plan.targetDimensions).toEqual(source);
    expect(plan.sizeToken).toBe(DEFAULT_SIZE_TOKEN);
    expect(predictOutputPixels(plan, input)).toEqual(snapToOpenAiImageSize(source));
  });

  it("follows the book slot for an edit when the host supplies one", () => {
    const slot = { width: 1417, height: 945 };
    const { plan, input } = planFor("remove_object", {
      targetImageResolution: { width: 800, height: 533 },
      hostTarget: slot,
    });
    expect(plan.slotTarget).not.toBeNull();
    expect(plan.slotTarget?.sizeToken).toBe("2k");
    expect(plan.targetDimensions).toEqual(slot);
    // A tool with no size picker sends no tier token even when it follows the
    // slot; the slot reaches the request as exact pixels. The run files its
    // measured stats under the sentinel, and so must the lookup.
    expect(plan.requestedSize).toBeUndefined();
    expect(plan.sizeToken).toBe(DEFAULT_SIZE_TOKEN);
    expect(predictOutputPixels(plan, input)).toEqual(snapToOpenAiImageSize(slot));
  });

  it("takes Upscale's selector as the exact pixels and the smallest tier that covers them", () => {
    const hd = planFor("upscale", {
      params: { targetResolution: "hd" },
      targetImageResolution: { width: 1000, height: 1500 },
    });
    expect(hd.plan.upscaleTarget).toEqual({ width: 1080, height: 1620 });
    expect(hd.plan.targetDimensions).toEqual({ width: 1080, height: 1620 });
    expect(hd.plan.requestedSize).toBe("2k");

    const auto = planFor("upscale", {
      params: { targetResolution: "auto" },
      targetImageResolution: { width: 1000, height: 1500 },
      hostTarget: { width: 1200, height: 1800 },
    });
    expect(auto.plan.upscaleTarget).toEqual({ width: 1200, height: 1800 });
    expect(auto.plan.requestedSize).toBe("2k");
  });

  it("sizes break-comic's output from its input so a page is not downscaled", () => {
    const page = { width: 3508, height: 2480 };
    const { plan } = planFor("break_comic_into_images", {
      targetImageResolution: page,
      autoSizeResolution: page,
    });
    expect(plan.requestedSize).toBe("4k");
    expect(plan.autoSizeResolution).toEqual(page);
    expect(plan.requestedAspectRatio).not.toBe(AUTO_ASPECT_RATIO);
    expect(plan.targetDimensions).toBeUndefined();
  });

  it("uses a tool's hidden size default and the GIF sheet's own shape", () => {
    const tool = getTool("make_gif");
    const { plan } = planFor("make_gif", { params: { frameCount: "16" } });
    expect(plan.requestedSize).toBe(tool.hiddenSizeDefault);
    expect(plan.sizeToken).toBe("2k");
    // 16 frames lay out as a 4x4 grid, which is square.
    expect(plan.requestedAspectRatio).toBe("1:1");
  });

  it("predicts no pixels for a model that takes a tier token instead", () => {
    const { plan, input } = planFor("generate_image", {
      toolModel: GEMINI_FLASH,
      params: { aspectRatio: "16:9", size: "1k" },
    });
    expect(predictOutputPixels(plan, input)).toBeNull();
  });

  it("falls back to the model's own default square when a generation sends no size", () => {
    // A tool with a hidden shape (the palette) but a shape the model does not
    // list would send no size; "auto" shape with no pixels is the same case.
    const { plan, input } = planFor("generate_image", { params: { aspectRatio: "auto" } });
    expect(plan.targetDimensions).toBeUndefined();
    const predicted = predictOutputPixels(plan, input);
    expect(predicted).not.toBeNull();
  });

  it("files every tool with no picks and no image under the same size key as before", () => {
    // What the tool card used to work out on its own for the model menu's
    // measured-stats lookup: a tool with a size picker files under its first
    // option, one with a hidden size default under that default, and the rest
    // under the sentinel.
    for (const tool of TOOLS) {
      const { plan } = planFor(tool.id);
      const sizeParam = findSizeParam(tool.parameters);
      const expected = sizeParam
        ? (sizeParam.options?.[0] ?? sizeParam.defaultValue ?? DEFAULT_SIZE_TOKEN)
        : (tool.hiddenSizeDefault ?? DEFAULT_SIZE_TOKEN);
      expect(plan.sizeToken, tool.id).toBe(expected);
    }
  });
});
