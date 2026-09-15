import type { ModelInfo, ToolDefinition, ToolParams } from "../types";
import { AUTO_ASPECT_RATIO, resolveAspectRatioValue } from "./aspectRatios";
import { getGifSheetAspectRatio, parseGifFrameCount } from "./gifAnimationPrompt";
import { DEFAULT_OUTPUT_GUESS } from "./imageCostEstimate";
import {
  DEFAULT_SIZE_TOKEN,
  type PixelSize,
  pickSizeTokenForLongEdge,
  sizeTokenToImageSizeTier,
} from "./imageSizes";
import { modelTakesPixelSize, resolveImageSizeRequest } from "./modelsCatalog";
import {
  findSizeParam,
  resolveSizeTokenValue,
  resolveSlotTarget,
  type SlotTarget,
} from "./slotTarget";
import { getRequestedAspectRatioValue } from "./toolHelpers";
import { findTargetResolutionParam, resolveUpscaleTarget, type UpscaleHostTarget } from "./upscale";

/**
 * What one run of a tool will ask the model for: the size token, the shape,
 * and the exact pixels when the caller knows them. runToolOnImage builds its
 * request from this, and the tool UI reads the same answer to show the size it
 * will send and to estimate what the run will cost, so the two cannot drift.
 */

export interface ImageRequestPlanInput {
  tool: ToolDefinition;
  params: ToolParams | null | undefined;
  toolModel: ModelInfo | null | undefined;
  requiresEditImage: boolean;
  /** The image being edited, when there is one and its size is known. */
  targetImageResolution: PixelSize | null | undefined;
  /** The pixels the host says the book slot wants (IBloomHostBookImage.suggestedTarget). */
  hostTarget: UpscaleHostTarget | null | undefined;
  /**
   * For a tool that sizes its output from its input (break-comic): the first
   * source image's pixels. The run path reads them from the bytes; the UI
   * passes the target image's resolution.
   */
  autoSizeResolution?: PixelSize | null;
}

export interface ImageRequestPlan {
  /** Upscale's chosen pixels, for the tools with a resolution selector. */
  upscaleTarget: PixelSize | null;
  /** The book slot the run follows, when it does (lib/slotTarget.ts). */
  slotTarget: SlotTarget | null;
  /** The tier the size picker's value stands for once Auto is settled; the prompt's size sentence reads it. */
  settledSizeToken: string | undefined;
  /** ImageConfig.size: the tier token the request carries, if any. */
  requestedSize: string | undefined;
  /** The shape before resolveAspectRatioValue; may be AUTO_ASPECT_RATIO. */
  requestedAspectRatio: string;
  /** Set when the output size was taken from the input (autoSizeFromInput). */
  autoSizeResolution: PixelSize | undefined;
  /** ImageConfig.targetDimensions: the exact pixels to ask a pixel-size model for. */
  targetDimensions: PixelSize | undefined;
  /** The key the measured-stats cache files this run under (requestedSize, or the sentinel). */
  sizeToken: string;
}

export const planImageRequest = (input: ImageRequestPlanInput): ImageRequestPlan => {
  const { tool, params, toolModel, requiresEditImage, targetImageResolution, hostTarget } = input;

  // The Upscale selector persists a tier token ("hd"), so this is the first
  // point that knows the pixels it stands for.
  const targetResolutionParam = findTargetResolutionParam(tool.parameters);
  const upscaleTarget = targetResolutionParam
    ? resolveUpscaleTarget(params?.[targetResolutionParam.name], targetImageResolution, hostTarget)
    : null;

  let requestedAspectRatio = getRequestedAspectRatioValue(tool, params);

  // Inside Bloom, the host says how many pixels the book slot wants, and a
  // result that belongs in the slot is asked for at that size (and, unless the
  // user picked a shape, in that shape). See lib/slotTarget.ts for which tools
  // follow the slot and how an Auto size settles without one.
  const slotTarget = resolveSlotTarget({
    tool,
    params,
    hostTarget,
    requestedAspectRatio,
    supportedAspectRatios: toolModel?.supportedAspectRatios,
  });
  if (slotTarget) {
    requestedAspectRatio = slotTarget.aspectRatio;
  }
  const sizeParam = findSizeParam(tool.parameters);
  const settledSizeToken = resolveSizeTokenValue(sizeParam, params?.size, slotTarget);

  if (tool.derivedResultMode === "animated-gif") {
    // The sheet's canvas shape follows the frame-count's grid layout
    // (16 portrait cells don't fit a 16:9 canvas, so 4x4 goes square).
    requestedAspectRatio = getGifSheetAspectRatio(parseGifFrameCount(params?.frameCount));
  }

  // Tools that decompose a page (break-comic) must not downscale it. Match
  // the output size + aspect ratio to the input so resolution is preserved
  // (a 3508px poster -> 4K), instead of falling back to a square 1K default.
  let requestedSize = settledSizeToken ?? tool.hiddenSizeDefault;
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
  }

  if (upscaleTarget) {
    // Real models accept only tier tokens, so the exact request becomes the
    // smallest tier that isn't a downscale of it. The aspect ratio stays on
    // auto (the source's shape) — upscaling must not reframe the picture.
    requestedSize = pickSizeTokenForLongEdge(Math.max(upscaleTarget.width, upscaleTarget.height));
  }

  // The exact pixels the request should ask for, when the caller knows them.
  // A model that takes pixels (GPT Image 2.5) is asked for these directly; a
  // tier-token model never sees them. Upscale supplies its selector's target,
  // and a run that follows the book slot supplies the slot. Any other edit
  // whose tool set no size and whose shape follows the source gets the
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
    slotTarget,
    settledSizeToken,
    requestedSize,
    requestedAspectRatio,
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
