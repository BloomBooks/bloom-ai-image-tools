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
