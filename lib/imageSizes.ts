/** Sentinel size token for tools that don't request a specific output size. */
export const DEFAULT_SIZE_TOKEN = "default";

/**
 * Pick the smallest Gemini image-size tier whose long edge is >= the input's,
 * so decomposing a high-res page (then splitting it) doesn't downscale it.
 * Shared by the generation path (which records cost per size) and the model
 * picker (which looks up the remembered cost for the size it would request).
 */
export const pickSizeTokenForLongEdge = (longEdge: number): string => {
  if (longEdge <= 1024) return "1k";
  if (longEdge <= 2048) return "2k";
  return "4k";
};

/**
 * The coarse output-size tiers the image endpoints accept, smallest first.
 * These are the literal `image_config.image_size` values OpenRouter expects
 * (uppercase K is required).
 */
export const IMAGE_SIZE_TIERS = ["1K", "2K", "4K"] as const;

export type ImageSizeTier = (typeof IMAGE_SIZE_TIERS)[number];

export const isImageSizeTier = (value: unknown): value is ImageSizeTier =>
  typeof value === "string" && (IMAGE_SIZE_TIERS as readonly string[]).includes(value);

/**
 * Reduce a requested tier to the highest tier a model actually accepts.
 * A request above the model's ceiling is a 400 from OpenRouter, not a
 * downscaled image, so the caller must clamp before it sends the request.
 */
export const clampImageSizeTier = (
  requested: ImageSizeTier,
  maximum: ImageSizeTier | null | undefined,
): ImageSizeTier => {
  if (!maximum) return requested;
  return IMAGE_SIZE_TIERS.indexOf(requested) <= IMAGE_SIZE_TIERS.indexOf(maximum)
    ? requested
    : maximum;
};

/**
 * What GPT Image 2.5 accepts in its `size` parameter, from OpenAI's image
 * prompting guide. These belong to that model family alone: a Gemini key takes
 * a tier token instead and has no such rules, so nothing here may be applied
 * to a model that did not declare it.
 */
export const OPENAI_IMAGE_SIZE_CONSTRAINTS = {
  maxEdge: 3840,
  edgeMultiple: 16,
  maxEdgeRatio: 3,
  minPixels: 655360,
  maxPixels: 8294400,
} as const;

export interface PixelSize {
  width: number;
  height: number;
}

const roundToMultiple = (value: number, multiple: number): number =>
  Math.max(multiple, Math.round(value / multiple) * multiple);

/**
 * The nearest size GPT Image 2.5 will accept to the one asked for, keeping the
 * shape as close as the rules allow. Every constraint is a hard 400 from the
 * model, so a desired size has to come through here before it is sent.
 *
 * A size that cannot be read at all falls back to 1024x1024, the model's own
 * square default, rather than throwing: a bad number upstream should cost the
 * user a differently-shaped image, not a failed run.
 */
export const snapToOpenAiImageSize = (desired: PixelSize | null | undefined): PixelSize => {
  const { maxEdge, edgeMultiple, maxEdgeRatio, minPixels, maxPixels } =
    OPENAI_IMAGE_SIZE_CONSTRAINTS;

  let width = desired?.width ?? 0;
  let height = desired?.height ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    width = 1024;
    height = 1024;
  }

  // Bring the shape inside 3:1 first, by pulling the long edge in. Pushing the
  // short edge out instead would inflate the pixel count for a panorama.
  if (width / height > maxEdgeRatio) width = height * maxEdgeRatio;
  if (height / width > maxEdgeRatio) height = width * maxEdgeRatio;

  // Then scale the whole thing into the pixel budget and under the edge cap,
  // which preserves the shape we just fixed.
  const pixels = width * height;
  const budgetScale =
    pixels < minPixels
      ? Math.sqrt(minPixels / pixels)
      : pixels > maxPixels
        ? Math.sqrt(maxPixels / pixels)
        : 1;
  width *= budgetScale;
  height *= budgetScale;

  const edgeScale = Math.min(1, maxEdge / Math.max(width, height));
  width *= edgeScale;
  height *= edgeScale;

  width = Math.min(maxEdge, roundToMultiple(width, edgeMultiple));
  height = Math.min(maxEdge, roundToMultiple(height, edgeMultiple));

  // Rounding to the grid can nudge either rule back out: 1500x500 is exactly
  // 3:1, but rounds to 1504x496, which is not. Settle both on the grid itself.
  // Each step moves a whole multiple and both edges are capped, so these
  // always terminate; taking from the longer edge and adding to the shorter
  // means the budget passes can only improve the ratio, never undo it.
  const steps = maxEdge / edgeMultiple;
  for (
    let i = 0;
    i < steps &&
    Math.max(width, height) / Math.min(width, height) > maxEdgeRatio &&
    Math.max(width, height) > edgeMultiple;
    i += 1
  ) {
    if (width >= height) width -= edgeMultiple;
    else height -= edgeMultiple;
  }
  for (let i = 0; i < steps && width * height > maxPixels; i += 1) {
    if (width >= height) width -= edgeMultiple;
    else height -= edgeMultiple;
  }
  for (let i = 0; i < steps && width * height < minPixels; i += 1) {
    if (width <= height && width + edgeMultiple <= maxEdge) width += edgeMultiple;
    else if (height + edgeMultiple <= maxEdge) height += edgeMultiple;
    else break;
  }

  return { width, height };
};

/** A size as the `size` parameter spells it, e.g. "1536x1024". */
export const formatPixelSize = (size: PixelSize): string => `${size.width}x${size.height}`;

/** The two numbers in an aspect ratio like "16:9", or null for "auto" and junk. */
export const parseAspectRatio = (value: string | null | undefined): PixelSize | null => {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
};

const TIER_LONG_EDGE: Record<ImageSizeTier, number> = { "1K": 1024, "2K": 2048, "4K": 3840 };

/**
 * The pixel size a tier asks for in a given shape, for the models that take
 * pixels instead of a tier token. The tier sets the LONG edge, so "2K" at 16:9
 * is 2048 wide, matching what the tier means to the models that take the token.
 * The result still has to go through `snapToOpenAiImageSize`, which is where
 * the grid and the pixel budget are applied.
 */
export const pixelsForTier = (tier: ImageSizeTier, aspectRatio?: string | null): PixelSize => {
  const longEdge = TIER_LONG_EDGE[tier] ?? TIER_LONG_EDGE["1K"];
  const ratio = parseAspectRatio(aspectRatio);
  if (!ratio) return { width: longEdge, height: longEdge };
  const scale = longEdge / Math.max(ratio.width, ratio.height);
  return { width: Math.round(ratio.width * scale), height: Math.round(ratio.height * scale) };
};

/**
 * The tier a UI size token asks for. The token set the tools offer ("512k",
 * "1k", "2k", "4k") is coarser than it looks: "512k" is a request for the
 * smallest tier, which is 1K.
 */
export const sizeTokenToImageSizeTier = (token: string | null | undefined): ImageSizeTier => {
  switch (token?.toLowerCase()) {
    case "2k":
      return "2K";
    case "4k":
      return "4K";
    case "512k":
    case "1k":
    default:
      return "1K";
  }
};
