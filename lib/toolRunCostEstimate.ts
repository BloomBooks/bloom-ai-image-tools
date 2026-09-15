import type { ModelInfo, ToolDefinition, ToolParams } from "../types";
import { estimateImageRunCostUsd, type ImageRunCostEstimate } from "./imageCostEstimate";
import { MAX_REFERENCE_IMAGE_EDGE } from "./imageProcessing";
import { planImageRequest, predictOutputPixels } from "./imageRequestPlan";
import type { PixelSize } from "./imageSizes";
import { canUseLocalDummyModelWithoutApiKey } from "./localModels";
import { getTokenPricingForModel } from "./modelsCatalog";
import { toolRequiresEditImage } from "./toolHelpers";
import type { UpscaleHostTarget } from "./upscale";

/**
 * What a run of a tool on a model is expected to cost, before it is made. A
 * model with a fixed per-image price answers that price; a model priced by
 * tokens gets an estimate from the images this run will send and the size it
 * will ask for (lib/imageCostEstimate.ts, lib/imageRequestPlan.ts).
 */

/** The image a run edits, as much as the estimate needs to know about it. */
export interface RunCostTarget {
  resolution: PixelSize | null;
  suggestedTarget: UpscaleHostTarget | null;
}

export interface ToolRunCostInput {
  tool: ToolDefinition;
  toolModel: ModelInfo | null | undefined;
  params: ToolParams | null | undefined;
  /** Null when there is no image to edit. */
  target: RunCostTarget | null;
  /** One entry per reference the run will send, already limited to the tool's cap; null for an unknown size. */
  referenceResolutions: readonly (PixelSize | null)[];
}

export type ToolRunCostEstimate =
  | { kind: "token"; usd: number; detail: ImageRunCostEstimate; outputPixels: PixelSize }
  | { kind: "fixed"; usd: number };

/**
 * The size assumed for an image whose pixels are not known yet. A 1024 square
 * is the smallest bill the floor allows (see INPUT_IMAGE_FLOOR_LONG_EDGE) and
 * the largest a shrunk reference can have, so it is the floor for an unknown
 * edit image and the ceiling for an unknown reference.
 */
export const DEFAULT_UNKNOWN_INPUT_RESOLUTION: PixelSize = { width: 1024, height: 1024 };

/** A reference's pixels as sent: shrunk to MAX_REFERENCE_IMAGE_EDGE on the long edge (shrinkReferenceImage). */
export const referenceResolutionAsSent = (resolution: PixelSize | null | undefined): PixelSize => {
  if (!resolution || resolution.width <= 0 || resolution.height <= 0) {
    return DEFAULT_UNKNOWN_INPUT_RESOLUTION;
  }
  const longEdge = Math.max(resolution.width, resolution.height);
  if (longEdge <= MAX_REFERENCE_IMAGE_EDGE) return resolution;
  const scale = MAX_REFERENCE_IMAGE_EDGE / longEdge;
  return {
    width: Math.max(1, Math.round(resolution.width * scale)),
    height: Math.max(1, Math.round(resolution.height * scale)),
  };
};

/**
 * Null when the run costs nothing we can price: a tool that runs in the
 * browser (remove_background, the local-only tools), the localhost dummy
 * model, or a catalog entry with neither kind of price.
 */
export const estimateToolRunCostUsd = (input: ToolRunCostInput): ToolRunCostEstimate | null => {
  const { tool, toolModel, params, target, referenceResolutions } = input;
  if (tool.id === "remove_background" || tool.localOnly) return null;
  const modelId = toolModel?.id;
  if (!modelId || canUseLocalDummyModelWithoutApiKey(modelId)) return null;

  const tokenPricing = getTokenPricingForModel(modelId);
  if (!tokenPricing) {
    const price = toolModel?.pricePerImageUsd;
    return typeof price === "number" && price > 0 ? { kind: "fixed", usd: price } : null;
  }

  const requiresEditImage = toolRequiresEditImage(tool);
  const targetImageResolution = requiresEditImage ? (target?.resolution ?? null) : null;
  const planInput = {
    tool,
    params,
    toolModel,
    requiresEditImage,
    targetImageResolution,
    hostTarget: target?.suggestedTarget ?? null,
    autoSizeResolution: tool.autoSizeFromInput ? targetImageResolution : null,
  };
  const plan = planImageRequest(planInput);
  const outputPixels = predictOutputPixels(plan, planInput) ?? DEFAULT_UNKNOWN_INPUT_RESOLUTION;

  const inputImages: PixelSize[] = [
    ...(requiresEditImage ? [targetImageResolution ?? DEFAULT_UNKNOWN_INPUT_RESOLUTION] : []),
    ...referenceResolutions.map(referenceResolutionAsSent),
  ];
  const detail = estimateImageRunCostUsd(tokenPricing, inputImages, outputPixels);
  return { kind: "token", usd: detail.totalUsd, detail, outputPixels };
};
