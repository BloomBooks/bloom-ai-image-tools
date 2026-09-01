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
