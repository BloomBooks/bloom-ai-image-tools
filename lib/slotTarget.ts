import type { ToolDefinition, ToolParameter, ToolParams } from "../types";
import {
  AUTO_ASPECT_RATIO,
  MATCH_CONTAINER_ASPECT_RATIO,
  MATCH_IMAGE_ASPECT_RATIO,
  resolveAspectRatioValue,
} from "./aspectRatios";
import {
  parseAspectRatio,
  pickSizeTokenForLongEdge,
  pixelsForTier,
  sizeTokenToImageSizeTier,
  type PixelSize,
} from "./imageSizes";
import { findTargetResolutionParam, resolveAutoTarget } from "./upscale";

/**
 * When the app runs inside Bloom, the host says how many pixels the image
 * container an image sits in wants (IBloomHostBookImage.suggestedTarget). Bloom
 * always sends this for a book image. That is the size a tool's result should
 * come back at, whatever the tool: a bigger picture is downscaled by Bloom and
 * a smaller one is blurry on the page. This module decides, for one run,
 * whether the request follows the container and what it asks for when it does.
 * The run path and the tool UI both go through it so the picker shows the
 * request that will be made.
 *
 * Two facts arrive from Bloom for a slot, and the shape control lets the user
 * say which the output's shape follows: the container (MATCH_CONTAINER) or the
 * existing image (MATCH_IMAGE). The size control says how many pixels: the
 * container's, or a tier.
 */

/** The size-picker value that means "the image container's size". It is the picker's default inside Bloom. */
export const CONTAINER_SIZE_TOKEN = "container";

/**
 * The size a run has with nothing to size against: standalone, with the size
 * picker on its default. Sent as 1024 pixels on the long edge.
 */
export const DEFAULT_STANDALONE_SIZE_TOKEN = "1k";

/** The tiers the size menus offer. Anything else stored is treated as unset. */
export const SIZE_TIER_TOKENS = ["1k", "2k", "4k"] as const;

/** Where the shape of a request came from. */
export type ShapeSource = "image" | "container" | "fixed";

export interface SlotTarget {
  /** The tier token to request: the user's, or the smallest that covers the container. */
  sizeToken: string;
  /** Whether the pixel count is the container's own or a tier the user picked. */
  sizeSource: "container" | "tier";
  /**
   * The named ratio nearest the shape, which is what a model that takes only
   * named ratios is sent. A pixel model is sent targetDimensions instead.
   */
  aspectRatio: string;
  /** Which fact the shape follows. */
  shapeSource: ShapeSource;
  /** The exact pixels to ask a pixel-size model for. */
  targetDimensions: PixelSize;
}

export const findSizeParam = (parameters: ToolParameter[] | undefined): ToolParameter | undefined =>
  parameters?.find((parameter) => parameter.type === "size");

/** A size-picker value naming one of the tiers the menus offer. */
export const isSizeTierToken = (value: string | null | undefined): boolean =>
  SIZE_TIER_TOKENS.includes(
    (value ?? "").trim().toLowerCase() as (typeof SIZE_TIER_TOKENS)[number],
  );

/** The tier a stored size value names, or null for the container token and anything unknown. */
export const pickedSizeTier = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim().toLowerCase();
  return isSizeTierToken(trimmed) ? trimmed : null;
};

/**
 * Whether a tool's result is the kind of picture that belongs in the container.
 * The exceptions each make something else: a target-resolution parameter has
 * its own Match Container row built on the same host target; break-comic
 * matches the page it is cutting
 * up; the sheet tools (cast, game pieces, GIF frames) make a sheet that is
 * split afterwards; a tool with a fixed shape (the palette strip) has said what
 * shape it needs.
 */
export const toolCanFollowSlot = (tool: ToolDefinition | null | undefined): boolean =>
  !!tool &&
  !tool.autoSizeFromInput &&
  !tool.derivedResultMode &&
  !tool.hiddenAspectRatioDefault &&
  !tool.hiddenSizeDefault &&
  !findTargetResolutionParam(tool.parameters);

const usableDimensions = (
  target: { width: number; height: number } | null | undefined,
): PixelSize | null =>
  target &&
  Number.isFinite(target.width) &&
  Number.isFinite(target.height) &&
  target.width > 0 &&
  target.height > 0
    ? { width: target.width, height: target.height }
    : null;

/** A shape scaled to a long edge, so a chosen shape still gets the container's or a tier's size. */
const fitShapeToLongEdge = (shape: PixelSize, longEdge: number): PixelSize => {
  const scale = longEdge / Math.max(shape.width, shape.height);
  return {
    width: Math.max(1, Math.round(shape.width * scale)),
    height: Math.max(1, Math.round(shape.height * scale)),
  };
};

/**
 * What a run of `tool` asks for when it follows the image container, or null
 * when it does not: no host target (standalone), or a tool that makes
 * something other than the container's picture.
 *
 * Shape: MATCH_CONTAINER is the container's own pixels. MATCH_IMAGE is the
 * existing image's shape, scaled up until either edge meets the container's,
 * so the shape is kept exactly. For a picture made from nothing (a tool with no image to edit) it
 * is the container's. For an edit whose image size is not known yet there is
 * no shape to keep, so the run does not follow the container at all (null)
 * rather than reframe the picture to it; the caller falls back to the image's
 * own shape. A fixed ratio is that ratio. The size picker says how many
 * pixels, never what shape: a picked tier gives the same shape at that tier's
 * long edge.
 */
export const resolveSlotTarget = (args: {
  tool: ToolDefinition;
  params: ToolParams | null | undefined;
  hostTarget: { width: number; height: number } | null | undefined;
  /** The existing image's pixels, when there is one and its size is known. */
  imageResolution?: { width: number; height: number } | null;
  /** The shape rule or fixed ratio the tool would request (getRequestedAspectRatioValue). */
  requestedAspectRatio: string;
  supportedAspectRatios?: readonly string[] | null;
}): SlotTarget | null => {
  const { tool, params, requestedAspectRatio, supportedAspectRatios } = args;
  const container = usableDimensions(args.hostTarget);
  if (!container || !toolCanFollowSlot(tool)) return null;
  const image = usableDimensions(args.imageResolution);

  const sizeParam = findSizeParam(tool.parameters);
  const pickedTier = sizeParam ? pickedSizeTier(params?.[sizeParam.name]) : null;

  const fixedShape =
    requestedAspectRatio !== MATCH_IMAGE_ASPECT_RATIO &&
    requestedAspectRatio !== MATCH_CONTAINER_ASPECT_RATIO
      ? parseAspectRatio(requestedAspectRatio)
      : null;
  if (!fixedShape && requestedAspectRatio === MATCH_IMAGE_ASPECT_RATIO && !image) {
    if (tool.editImage !== false) return null;
  }
  const shapeSource: ShapeSource = fixedShape
    ? "fixed"
    : requestedAspectRatio === MATCH_IMAGE_ASPECT_RATIO && image
      ? "image"
      : "container";
  const shape = fixedShape ?? (shapeSource === "image" ? image! : container);
  const aspectRatio = fixedShape
    ? requestedAspectRatio
    : resolveAspectRatioValue(AUTO_ASPECT_RATIO, shape, supportedAspectRatios);

  const containerLongEdge = Math.max(container.width, container.height);
  if (pickedTier) {
    const tierLongEdge = pixelsForTier(sizeTokenToImageSizeTier(pickedTier), "1:1").width;
    return {
      sizeToken: pickedTier,
      sizeSource: "tier",
      aspectRatio,
      shapeSource,
      targetDimensions: fitShapeToLongEdge(shape, tierLongEdge),
    };
  }
  const sizeToken = pickSizeTokenForLongEdge(containerLongEdge);
  if (shapeSource === "container") {
    // The container's own pixels are exact; pass them through rather than
    // reconstructing them from a ratio.
    return {
      sizeToken,
      sizeSource: "container",
      aspectRatio,
      shapeSource,
      targetDimensions: container,
    };
  }
  if (shapeSource === "image") {
    // The image's shape fitted inside the container can have a shorter long
    // edge than the container's own, so the tier is picked from those pixels.
    const targetDimensions = resolveAutoTarget(image, container) ?? container;
    return {
      sizeToken: pickSizeTokenForLongEdge(
        Math.max(targetDimensions.width, targetDimensions.height),
      ),
      sizeSource: "container",
      aspectRatio,
      shapeSource,
      targetDimensions,
    };
  }
  return {
    sizeToken,
    sizeSource: "container",
    aspectRatio,
    shapeSource,
    targetDimensions: fitShapeToLongEdge(shape, containerLongEdge),
  };
};

/**
 * The tier token a size picker's value stands for once settled: a picked tier
 * as it is, else the container's tier when the run follows the container, else
 * the standalone default.
 */
export const resolveSizeTokenValue = (
  sizeParam: ToolParameter | undefined,
  value: string | null | undefined,
  slot: SlotTarget | null,
): string | undefined => {
  if (!sizeParam) return value?.trim() || undefined;
  const tier = pickedSizeTier(value);
  if (tier) return tier;
  if (slot) return slot.sizeToken;
  return DEFAULT_STANDALONE_SIZE_TOKEN;
};
