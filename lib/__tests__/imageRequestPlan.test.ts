import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";
import type { ToolDefinition } from "../../types";
import {
  AUTO_ASPECT_RATIO,
  MATCH_CONTAINER_ASPECT_RATIO,
  MATCH_IMAGE_ASPECT_RATIO,
} from "../aspectRatios";
import { DEFAULT_SIZE_TOKEN, pixelsForTier, snapToOpenAiImageSize } from "../imageSizes";
import {
  describeShapeRequest,
  planImageRequest,
  predictOutputPixels,
  requestedShapeRule,
  type ImageRequestPlanInput,
} from "../imageRequestPlan";
import { getModelInfoById } from "../modelsCatalog";
import { DEFAULT_STANDALONE_SIZE_TOKEN, findSizeParam } from "../slotTarget";
import { toolRequiresEditImage } from "../toolHelpers";
import { resolveAutoTarget } from "../upscale";

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

describe("requestedShapeRule", () => {
  it("keeps a rule and a ratio the model offers", () => {
    const tool = getTool("generate_image");
    expect(requestedShapeRule(tool, { aspectRatio: MATCH_IMAGE_ASPECT_RATIO }, GEMINI_FLASH)).toBe(
      MATCH_IMAGE_ASPECT_RATIO,
    );
    expect(requestedShapeRule(tool, { aspectRatio: "16:9" }, GEMINI_FLASH)).toBe("16:9");
  });

  it("falls back to the tool's rule for a stored ratio the model does not offer", () => {
    // Picked under a model with a wider menu; this model's Shape menu shows
    // the rule instead, so the run follows the rule too.
    const unsupported = { aspectRatio: "16:9" };
    const narrowModel = { ...GEMINI_FLASH!, supportedAspectRatios: ["1:1", "3:2", "2:3"] };
    expect(requestedShapeRule(getTool("generate_image"), unsupported, narrowModel)).toBe(
      MATCH_CONTAINER_ASPECT_RATIO,
    );
    expect(requestedShapeRule(getTool("remove_object"), unsupported, narrowModel)).toBe(
      MATCH_IMAGE_ASPECT_RATIO,
    );
    const { plan } = planFor("generate_image", {
      params: unsupported,
      toolModel: narrowModel,
      hostTarget: { width: 1466, height: 879 },
    });
    expect(plan.shapeSource).toBe("container");
  });
});

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

  it("sizes an edit for its container but keeps its image's shape", () => {
    const container = { width: 1417, height: 945 };
    const image = { width: 800, height: 600 };
    const { plan, input } = planFor("remove_object", {
      targetImageResolution: image,
      hostTarget: container,
    });
    expect(plan.slotTarget).not.toBeNull();
    expect(plan.slotTarget?.sizeToken).toBe("2k");
    expect(plan.shapeSource).toBe("image");
    expect(plan.sizeSource).toBe("container");
    expect(plan.requestedAspectRatio).toBe("4:3");
    const expected = resolveAutoTarget(image, container)!;
    expect(plan.targetDimensions).toEqual(expected);
    // A tool with no size picker sends no tier token even when it follows the
    // container; the pixels reach the request directly. The run files its
    // measured stats under the sentinel, and so must the lookup.
    expect(plan.requestedSize).toBeUndefined();
    expect(plan.sizeToken).toBe(DEFAULT_SIZE_TOKEN);
    expect(predictOutputPixels(plan, input)).toEqual(snapToOpenAiImageSize(expected));
  });

  it("reshapes an edit to its container when the user picks Match Container", () => {
    const container = { width: 1417, height: 945 };
    const { plan } = planFor("remove_object", {
      params: { aspectRatio: MATCH_CONTAINER_ASPECT_RATIO },
      targetImageResolution: { width: 800, height: 600 },
      hostTarget: container,
    });
    expect(plan.shapeSource).toBe("container");
    expect(plan.targetDimensions).toEqual(container);
    expect(plan.requestedAspectRatio).toBe("3:2");
  });

  it("draws a new picture in the container's shape and size", () => {
    const container = { width: 1466, height: 879 };
    const { plan } = planFor("generate_image", { hostTarget: container });
    expect(plan.shapeSource).toBe("container");
    expect(plan.sizeSource).toBe("container");
    expect(plan.targetDimensions).toEqual(container);
    expect(plan.requestedSize).toBe("2k");
    expect(plan.requestedAspectRatio).toBe("16:9");
  });

  it("makes a new picture standalone a 1k square, whatever rule is stored", () => {
    for (const aspectRatio of [MATCH_CONTAINER_ASPECT_RATIO, MATCH_IMAGE_ASPECT_RATIO, "auto"]) {
      const { plan } = planFor("generate_image", { params: { aspectRatio } });
      expect(plan.requestedAspectRatio, aspectRatio).toBe("1:1");
      expect(plan.shapeSource, aspectRatio).toBe("fixed");
      expect(plan.requestedSize, aspectRatio).toBe(DEFAULT_STANDALONE_SIZE_TOKEN);
      expect(plan.sizeSource, aspectRatio).toBe("tier");
      expect(plan.targetDimensions, aspectRatio).toBeUndefined();
    }
  });

  it("captions a shape only with the named ratio a ratio model will get", () => {
    const container = { width: 1466, height: 879 };
    // A pixel model is sent the container's shape exactly: nothing to add,
    // and no pixels here (they belong to the Size row).
    const pixel = planFor("generate_image", { hostTarget: container });
    expect(describeShapeRequest(pixel.plan, pixel.input)).toBeNull();
    // A ratio model is sent the nearest named ratio, and the caption says so.
    const ratio = planFor("generate_image", { hostTarget: container, toolModel: GEMINI_FLASH });
    expect(describeShapeRequest(ratio.plan, ratio.input)).toBe("nearest: 16:9");
    const image = planFor("remove_object", {
      targetImageResolution: { width: 1024, height: 819 },
      toolModel: GEMINI_FLASH,
    });
    expect(describeShapeRequest(image.plan, image.input)).toBe("nearest: 5:4");
    // A fixed ratio is its own name.
    const fixed = planFor("generate_image", {
      params: { aspectRatio: "3:2", size: "1k" },
      toolModel: GEMINI_FLASH,
    });
    expect(describeShapeRequest(fixed.plan, fixed.input)).toBeNull();
    // An edit whose image has not loaded has nothing to say yet.
    const unknown = planFor("remove_object", { toolModel: GEMINI_FLASH });
    expect(describeShapeRequest(unknown.plan, unknown.input)).toBeNull();
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

  it("predicts a size for a generation that sends no exact pixels", () => {
    // Standalone, a new picture is a 1k square; the prediction comes from the
    // tier and the ratio rather than from pixels the caller supplied.
    const { plan, input } = planFor("generate_image");
    expect(plan.targetDimensions).toBeUndefined();
    expect(predictOutputPixels(plan, input)).toEqual(
      snapToOpenAiImageSize(pixelsForTier("1K", "1:1")),
    );
  });

  it("files every tool with no picks and no image under the same size key as before", () => {
    // The model menu's measured-stats lookup: a tool with a size picker files
    // under the standalone default tier, one with a hidden size default under
    // that default, and the rest under the sentinel.
    for (const tool of TOOLS) {
      const { plan } = planFor(tool.id);
      const sizeParam = findSizeParam(tool.parameters);
      const expected = sizeParam
        ? DEFAULT_STANDALONE_SIZE_TOKEN
        : (tool.hiddenSizeDefault ?? DEFAULT_SIZE_TOKEN);
      expect(plan.sizeToken, tool.id).toBe(expected);
    }
  });
});
