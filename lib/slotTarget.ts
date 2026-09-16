import type { ToolDefinition, ToolParameter, ToolParams } from "../types";
import { AUTO_ASPECT_RATIO, resolveAspectRatioValue } from "./aspectRatios";
import {
  parseAspectRatio,
  pickSizeTokenForLongEdge,
  pixelsForTier,
  sizeTokenToImageSizeTier,
  type PixelSize,
} from "./imageSizes";
import { findTargetResolutionParam } from "./upscale";

/**
 * When the app runs inside Bloom, the host says how many pixels the book slot
 * an image sits in actually wants (IBloomHostBookImage.suggestedTarget). That
 * is the size a tool's result should come back at, whatever the tool: a bigger
 * picture is downscaled by Bloom and a smaller one is blurry on the page. This
 * module decides, for one run, whether the request follows the slot and what
 * it asks for when it does. The run path and the tool UI both go through it so
 * the picker shows the request that will be made.
 */

/**
 * The size-picker value that means "the book slot's size". It is the picker's
 * default; without a host target it stands for the tool's smallest size, so a
 * standalone user sees the same picker as before.
 */
export const AUTO_SIZE_TOKEN = "auto";

export interface SlotTarget {
  /** The tier token to request: the user's, or the smallest that covers the slot. */
  sizeToken: string;
  /** The shape to request: the slot's own unless the user picked one. */
  aspectRatio: string;
  /**
   * The exact pixels to ask a pixel-size model for: the slot itself, or the
   * slot's long edge in the shape the user picked.
   */
  targetDimensions: PixelSize;
}

export const findSizeParam = (parameters: ToolParameter[] | undefined): ToolParameter | undefined =>
  parameters?.find((parameter) => parameter.type === "size");

/** A size-picker value that means "follow the slot" rather than a tier. */
export const isAutoSizeValue = (value: string | null | undefined): boolean => {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed === "" || trimmed === AUTO_SIZE_TOKEN;
};

/**
 * Whether a tool's result is the kind of picture that belongs in the slot.
 * The exceptions each make something else: Upscale has its own Auto option
 * built on the same host target; break-comic matches the page it is cutting
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

/** The slot's long edge in a chosen shape, so a user's shape still gets the slot's size. */
const fitShapeToLongEdge = (shape: PixelSize, longEdge: number): PixelSize => {
  const scale = longEdge / Math.max(shape.width, shape.height);
  return {
    width: Math.max(1, Math.round(shape.width * scale)),
    height: Math.max(1, Math.round(shape.height * scale)),
  };
};

/**
 * What a run of `tool` asks for when it follows the book slot, or null when it
 * does not: no host target, or a tool that makes something other than the
 * slot's picture.
 *
 * The size picker says how many pixels, never what shape. A picture drawn for
 * the slot has to fit the slot whatever size it is asked for, so a hand-picked
 * tier comes back in the slot's shape at that tier's long edge: 512k in a
 * 1472x1104 slot is 1024x768, which is what the size menu says it will be. The
 * shape changes only when the user picks one, which the shape control lets
 * them do once they have picked a tier; while the size is Auto the whole
 * request follows the slot and that control is disabled.
 */
export const resolveSlotTarget = (args: {
  tool: ToolDefinition;
  params: ToolParams | null | undefined;
  hostTarget: { width: number; height: number } | null | undefined;
  /** The shape the tool would request on its own (getRequestedAspectRatioValue). */
  requestedAspectRatio: string;
  supportedAspectRatios?: readonly string[] | null;
}): SlotTarget | null => {
  const { tool, params, requestedAspectRatio, supportedAspectRatios } = args;
  const slot = usableDimensions(args.hostTarget);
  if (!slot || !toolCanFollowSlot(tool)) return null;

  const sizeParam = findSizeParam(tool.parameters);
  const sizeValue = sizeParam ? params?.[sizeParam.name]?.trim() : undefined;
  const pickedTier = sizeValue && !isAutoSizeValue(sizeValue) ? sizeValue : null;

  const slotShape = resolveAspectRatioValue(AUTO_ASPECT_RATIO, slot, supportedAspectRatios);
  const longEdge = Math.max(slot.width, slot.height);
  const sizeToken = pickedTier ?? pickSizeTokenForLongEdge(longEdge);

  // A tool with a size picker follows the slot's shape while its size is Auto;
  // the picker disables the shape control and shows that. A tool without one,
  // and a tool whose user has picked a tier, keeps a shape the user set.
  const shapeIsTheUsers = !sizeParam || !!pickedTier;
  const chosenShape =
    shapeIsTheUsers && requestedAspectRatio !== AUTO_ASPECT_RATIO
      ? parseAspectRatio(requestedAspectRatio)
      : null;
  const aspectRatio = chosenShape ? requestedAspectRatio : slotShape;

  // The tier sets the long edge; without one the slot's own pixels are exact,
  // so pass them through rather than reconstructing them from the ratio.
  if (pickedTier) {
    return {
      sizeToken,
      aspectRatio,
      targetDimensions: pixelsForTier(sizeTokenToImageSizeTier(pickedTier), aspectRatio),
    };
  }
  if (chosenShape) {
    return {
      sizeToken,
      aspectRatio,
      targetDimensions: fitShapeToLongEdge(chosenShape, longEdge),
    };
  }
  return { sizeToken, aspectRatio, targetDimensions: slot };
};

/**
 * The tier token a size picker's value stands for once Auto is settled: the
 * slot's tier when the run follows the slot, else the tool's smallest size for
 * an Auto with nothing to follow, else the value itself.
 */
export const resolveSizeTokenValue = (
  sizeParam: ToolParameter | undefined,
  value: string | null | undefined,
  slot: SlotTarget | null,
): string | undefined => {
  if (!sizeParam) return value?.trim() || undefined;
  if (!isAutoSizeValue(value)) return value!.trim();
  if (slot) return slot.sizeToken;
  return sizeParam.options?.[0] ?? sizeParam.defaultValue;
};
