import type { ModelInfo, ToolDefinition, ToolParams } from "../types";
import {
  AUTO_ASPECT_RATIO,
  DEFAULT_CREATE_ASPECT_RATIO,
  getSupportedAspectRatioValues,
  isMatchAspectRatio,
  MATCH_CONTAINER_ASPECT_RATIO,
  MATCH_IMAGE_ASPECT_RATIO,
  resolveAspectRatioValue,
} from "./aspectRatios";
import { getGifSheetAspectRatio, parseGifFrameCount } from "./gifAnimationPrompt";
import { DEFAULT_OUTPUT_GUESS } from "./imageCostEstimate";
import {
  DEFAULT_SIZE_TOKEN,
  type PixelSize,
  pickSizeTokenForLongEdge,
  sizeTokenToImageSizeTier,
} from "./imageSizes";
import {
  getPixelSizeLimitsForModel,
  modelTakesPixelSize,
  resolveImageSizeRequest,
} from "./modelsCatalog";
import {
  findSizeParam,
  resolveSizeTokenValue,
  resolveSlotTarget,
  type ShapeSource,
  type SlotTarget,
} from "./slotTarget";
import { getRequestedAspectRatioValue } from "./toolHelpers";
import {
  findTargetResolutionParam,
  planScaleUp,
  resolveUpscaleTarget,
  type ScaleUpPlan,
  type UpscaleHostTarget,
} from "./upscale";

/**
 * What one run of a tool will ask the model for: the size token, the shape,
 * the exact pixels when the caller knows them, and where each came from.
 * runToolOnImage builds its request from this, and the tool UI reads the same
 * answer to show the size and shape it will send and to estimate what the run
 * will cost, so the two cannot drift.
 *
 * Two facts can arrive from Bloom for the slot a run draws for: the image
 * container's wanted pixel size, and the existing image. Bloom always sends the
 * container for a book image; the existing image is absent for an empty slot.
 * Standalone there is no container, and only an edit has an image.
 */

/** Where the pixel count of a request came from. */
export type SizeSource =
  /** The image container's wanted size. */
  | "container"
  /** A tier the user picked, or the standalone default tier. */
  | "tier"
  /** The existing image's own size. */
  | "image"
  /** A size the tool itself fixes (a sheet, or Improve Quality's Size menu). */
  | "tool";

export interface ImageRequestPlanInput {
  tool: ToolDefinition;
  params: ToolParams | null | undefined;
  toolModel: ModelInfo | null | undefined;
  requiresEditImage: boolean;
  /** The image being edited, when there is one and its size is known. */
  targetImageResolution: PixelSize | null | undefined;
  /** The pixels the host says the image container wants (IBloomHostBookImage.suggestedTarget). */
  hostTarget: UpscaleHostTarget | null | undefined;
  /**
   * For a tool that sizes its output from its input (break-comic): the first
   * source image's pixels. The run path reads them from the bytes; the UI
   * passes the target image's resolution.
   */
  autoSizeResolution?: PixelSize | null;
}

export interface ImageRequestPlan {
  /**
   * Scale Up's pixels, for the tools with a resolution selector: the canvas
   * the request asks for. Inside a container this is `scaleUp.request`.
   */
  upscaleTarget: PixelSize | null;
  /**
   * What Scale Up does inside the host's container (lib/upscale.ts), for the
   * tools with a resolution selector; null for every other tool. Its
   * `letterbox` tells the run path to add the padding instruction to the
   * prompt and crop the result.
   */
  scaleUp: ScaleUpPlan | null;
  /** The image container the run follows, when it does (lib/slotTarget.ts). */
  slotTarget: SlotTarget | null;
  /** The tier the size picker's value stands for once settled; the prompt's size sentence reads it. */
  settledSizeToken: string | undefined;
  /** ImageConfig.size: the tier token the request carries, if any. */
  requestedSize: string | undefined;
  /**
   * The shape as the request will carry it: a named ratio, or
   * AUTO_ASPECT_RATIO for an edit that follows its source image. Never one of
   * the shape control's rules; those are resolved here.
   */
  requestedAspectRatio: string;
  /** Which fact the shape follows. */
  shapeSource: ShapeSource;
  /** Where the pixel count came from. */
  sizeSource: SizeSource;
  /** Set when the output size was taken from the input (autoSizeFromInput). */
  autoSizeResolution: PixelSize | undefined;
  /** ImageConfig.targetDimensions: the exact pixels to ask a pixel-size model for. */
  targetDimensions: PixelSize | undefined;
  /** The key the measured-stats cache files this run under (requestedSize, or the sentinel). */
  sizeToken: string;
}

/**
 * The shape rule or fixed ratio this run follows. A stored fixed ratio the
 * selected model does not offer (picked under another model) is not on the
 * Shape menu any more, and the menu shows the tool's rule in its place, so the
 * run follows that rule too: an edit its image, a picture made from nothing
 * its container.
 */
export const requestedShapeRule = (
  tool: ToolDefinition,
  params: ToolParams | null | undefined,
  toolModel: ModelInfo | null | undefined,
): string => {
  const requested = getRequestedAspectRatioValue(tool, params);
  if (
    isMatchAspectRatio(requested) ||
    getSupportedAspectRatioValues(toolModel?.supportedAspectRatios).includes(requested)
  ) {
    return requested;
  }
  return tool.editImage !== false ? MATCH_IMAGE_ASPECT_RATIO : MATCH_CONTAINER_ASPECT_RATIO;
};

export const planImageRequest = (input: ImageRequestPlanInput): ImageRequestPlan => {
  const { tool, params, toolModel, requiresEditImage, targetImageResolution, hostTarget } = input;

  const requestedRule = requestedShapeRule(tool, params, toolModel);
  const imageResolution = requiresEditImage ? targetImageResolution : null;

  // Scale Up inside a container has nothing to choose: the plan says what to
  // ask for. Without one the selector's persisted tier token ("hd") stands,
  // and this is the first point that knows the pixels it stands for.
  const targetResolutionParam = findTargetResolutionParam(tool.parameters);
  const scaleUp = targetResolutionParam
    ? planScaleUp(targetImageResolution, hostTarget, getPixelSizeLimitsForModel(toolModel?.id))
    : null;
  const upscaleTarget = !targetResolutionParam
    ? null
    : scaleUp?.state !== "no-container"
      ? scaleUp!.request
      : resolveUpscaleTarget(params?.[targetResolutionParam.name], targetImageResolution);

  // Inside Bloom, the host says how many pixels the image container wants, and
  // a result that belongs in the container is asked for at that size, in the
  // shape the shape control says. See lib/slotTarget.ts for which tools follow
  // the container.
  const slotTarget = resolveSlotTarget({
    tool,
    params,
    hostTarget,
    imageResolution,
    requestedAspectRatio: requestedRule,
    supportedAspectRatios: toolModel?.supportedAspectRatios,
  });

  let requestedAspectRatio: string;
  let shapeSource: ShapeSource;
  if (slotTarget) {
    requestedAspectRatio = slotTarget.aspectRatio;
    shapeSource = slotTarget.shapeSource;
  } else if (isMatchAspectRatio(requestedRule)) {
    // No container to follow. An edit follows its image, which the request
    // says as "auto" so the model keeps the source's shape; a picture made
    // from nothing has neither fact and is a square.
    requestedAspectRatio = requiresEditImage ? AUTO_ASPECT_RATIO : DEFAULT_CREATE_ASPECT_RATIO;
    shapeSource = requiresEditImage ? "image" : "fixed";
  } else {
    requestedAspectRatio = requestedRule;
    shapeSource = "fixed";
  }

  const sizeParam = findSizeParam(tool.parameters);
  const settledSizeToken = resolveSizeTokenValue(sizeParam, params?.size, slotTarget);
  let sizeSource: SizeSource = slotTarget ? slotTarget.sizeSource : sizeParam ? "tier" : "image";

  if (tool.derivedResultMode === "animated-gif") {
    // The sheet's canvas shape follows the frame-count's grid layout
    // (16 portrait cells don't fit a 16:9 canvas, so 4x4 goes square).
    requestedAspectRatio = getGifSheetAspectRatio(parseGifFrameCount(params?.frameCount));
    shapeSource = "fixed";
  }

  // Tools that decompose a page (break-comic) must not downscale it. Match
  // the output size + aspect ratio to the input so resolution is preserved
  // (a 3508px poster -> 4K), instead of falling back to a square 1K default.
  let requestedSize = settledSizeToken ?? tool.hiddenSizeDefault;
  if (!settledSizeToken && tool.hiddenSizeDefault) sizeSource = "tool";
  let autoSizeResolution: PixelSize | undefined;
  const inputResolution = input.autoSizeResolution;
  if (tool.autoSizeFromInput && inputResolution?.width && inputResolution?.height) {
    autoSizeResolution = inputResolution;
    requestedSize = pickSizeTokenForLongEdge(
      Math.max(inputResolution.width, inputResolution.height),
    );
    requestedAspectRatio = resolveAspectRatioValue(
      AUTO_ASPECT_RATIO,
      inputResolution,
      toolModel?.supportedAspectRatios,
    );
    shapeSource = "image";
    sizeSource = "image";
  }

  if (upscaleTarget) {
    // Real models accept only tier tokens, so the exact request becomes the
    // smallest tier that isn't a downscale of it. The shape is the image's
    // own: the ratio stays "auto" so the model keeps the source's shape.
    requestedSize = pickSizeTokenForLongEdge(Math.max(upscaleTarget.width, upscaleTarget.height));
    shapeSource = "image";
    requestedAspectRatio = AUTO_ASPECT_RATIO;
    sizeSource = "tool";
  }

  // The exact pixels the request should ask for, when the caller knows them.
  // A model that takes pixels (GPT Image 2.5) is asked for these directly; a
  // tier-token model never sees them. Improve Quality supplies its Size
  // menu's target, and a run that follows the container supplies the
  // container. Any other
  // edit whose tool set no size and whose shape follows the source gets the
  // source's own resolution, because on such a model an explicit size
  // overrides the source's shape: without this every edit would come back in
  // the picker-less default tier (1K) and one of the model's canned shapes,
  // shrinking a 2048x1536 illustration to 1024x768.
  const shapeFollowsSource = requestedAspectRatio === AUTO_ASPECT_RATIO && !autoSizeResolution;
  const targetDimensions =
    upscaleTarget ??
    slotTarget?.targetDimensions ??
    (requiresEditImage && targetImageResolution && shapeFollowsSource && !requestedSize
      ? targetImageResolution
      : undefined);

  return {
    upscaleTarget,
    scaleUp,
    slotTarget,
    settledSizeToken,
    requestedSize,
    requestedAspectRatio,
    shapeSource,
    sizeSource,
    autoSizeResolution,
    targetDimensions,
    sizeToken: (requestedSize || "").trim() || DEFAULT_SIZE_TOKEN,
  };
};

const parsePixelSize = (value: string): PixelSize | null => {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
};

/**
 * The pixels a pixel-size model (GPT Image 2.5) will draw for this plan: the
 * `size` the request will carry, worked out the same way editImageViaImagesApi
 * does, or the model's own choice when no size is sent (the source's size for
 * an edit, a 1024 square for a generation). Null for a model that takes no
 * pixel size, whose price does not depend on it.
 */
export const predictOutputPixels = (
  plan: ImageRequestPlan,
  input: ImageRequestPlanInput,
): PixelSize | null => {
  const modelId = input.toolModel?.id;
  if (!modelTakesPixelSize(modelId)) return null;

  const supported = input.toolModel?.supportedAspectRatios ?? [];
  const resolvedAspectRatio = resolveAspectRatioValue(
    plan.requestedAspectRatio,
    plan.autoSizeResolution ?? input.targetImageResolution,
    supported,
  );
  const apiAspectRatio =
    resolvedAspectRatio !== AUTO_ASPECT_RATIO && supported.includes(resolvedAspectRatio)
      ? resolvedAspectRatio
      : "auto";
  const request = resolveImageSizeRequest(modelId, sizeTokenToImageSizeTier(plan.requestedSize), {
    desiredPixels: plan.targetDimensions,
    aspectRatio: apiAspectRatio,
  });
  if (request?.parameter === "size") {
    const parsed = parsePixelSize(request.value);
    if (parsed) return parsed;
  }
  if (input.requiresEditImage && input.targetImageResolution) {
    return input.targetImageResolution;
  }
  return DEFAULT_OUTPUT_GUESS;
};

/**
 * What a Shape row's caption adds to its name, if anything. A pixel-size
 * model is sent the matched shape exactly, so a rule needs no caption, and a
 * fixed ratio is already its own name. A ratio model is sent only a named
 * ratio, so a rule's caption says which one it will get ("nearest: 5:4").
 * Pixels never appear here; they belong to the Size row. Null when there is
 * nothing to add, or nothing is known yet (an edit whose image has not
 * loaded).
 */
export const describeShapeRequest = (
  plan: ImageRequestPlan,
  input: ImageRequestPlanInput,
): string | null => {
  if (plan.shapeSource === "fixed") return null;
  if (modelTakesPixelSize(input.toolModel?.id)) return null;
  const matched =
    plan.shapeSource === "container"
      ? input.hostTarget
      : plan.shapeSource === "image"
        ? input.targetImageResolution
        : null;
  if (!matched || !(matched.width > 0 && matched.height > 0)) return null;
  const ratio = resolveAspectRatioValue(
    plan.requestedAspectRatio,
    plan.autoSizeResolution ?? input.targetImageResolution,
    input.toolModel?.supportedAspectRatios,
  );
  return `nearest: ${ratio}`;
};
