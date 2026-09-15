import type { PixelSize } from "./imageSizes";

/**
 * What a GPT Image 2.5 call will cost, from the pixels sent and the pixels
 * asked for. The rules here are the ones measured in MODEL-COSTS.md against
 * openai/gpt-image-2.5-flare on 2026-09-14 (Sunburst, the sibling the app
 * offers, is published at the same rates and matched it to the cent); the tests in
 * lib/__tests__/imageCostEstimate.test.ts pin every measured point, so a
 * change to any rule has to explain the measurements it breaks.
 *
 * The price of a call is dominated by the images it is shown, not the image it
 * draws: one 1024px reference is 490 tokens, the picture it helps draw is 75
 * to 365. Every input image is counted in full; nothing is shared or cached.
 */

/**
 * Per-token rates for a model priced by tokens (ModelInfo.tokenPricing). The
 * prompt's text and the images it is shown are billed at different rates: 127
 * text tokens cost $0.000635 ($5/M) while each step of image tokens cost $8/M.
 */
export interface TokenPricing {
  textInputUsdPerMillion: number;
  imageInputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

/** The vision encoder bills one token per patch of this many pixels square. */
export const INPUT_IMAGE_PATCH_EDGE = 32;
/** Fixed tokens added per input image, over the patch count. */
export const INPUT_IMAGE_TOKEN_OVERHEAD = 10;
/**
 * Above this many patches the provider shrinks the image before counting:
 * 2048x958 and 4096x1916 both bill 1466 tokens, 1536x1536 and 2048x2048 both
 * 1531. Beyond roughly 2048px on the long edge, more pixels cost nothing.
 */
export const INPUT_IMAGE_MAX_PATCHES = 1536;
/**
 * Below this long edge the charge stops falling: 512x239, 768x359 and 1024x479
 * all bill the same 490 tokens. Something upstream scales a small image up
 * before encoding. The measurements fit "scaled to a 1024 long edge, by at
 * most 2x" (a 256x120 reference bills 138, not 490), which is what is encoded
 * here. That is a rule fitted to the measured points, not a documented one.
 */
export const INPUT_IMAGE_FLOOR_LONG_EDGE = 1024;
export const INPUT_IMAGE_FLOOR_MAX_SCALE = 2;

/**
 * Tokens the text of a typical tool prompt costs. Measured at 127 for the
 * palette prompt; a long custom prompt runs a few hundred more, which at $5/M
 * is a couple of thousandths of a dollar and not worth counting characters for.
 */
export const PROMPT_TEXT_TOKEN_ALLOWANCE = 150;

/** The output size to assume when a request carries no `size`: the model's own default. */
export const DEFAULT_OUTPUT_GUESS: PixelSize = { width: 1024, height: 1024 };

const patchesFor = (size: PixelSize): { wide: number; high: number } => {
  let width = Math.max(1, size.width);
  let height = Math.max(1, size.height);

  const longEdge = Math.max(width, height);
  if (longEdge < INPUT_IMAGE_FLOOR_LONG_EDGE) {
    const scale = Math.min(INPUT_IMAGE_FLOOR_MAX_SCALE, INPUT_IMAGE_FLOOR_LONG_EDGE / longEdge);
    width *= scale;
    height *= scale;
  }

  let wide = width / INPUT_IMAGE_PATCH_EDGE;
  let high = height / INPUT_IMAGE_PATCH_EDGE;
  if (wide * high > INPUT_IMAGE_MAX_PATCHES) {
    // Shrink to the patch budget keeping the shape, then pull both edges in by
    // the same factor so the tighter one lands on a whole patch. This is
    // OpenAI's published patch algorithm with a 1536-patch cap, and it
    // reproduces all four measured points above the cap.
    const shrink = Math.sqrt(INPUT_IMAGE_MAX_PATCHES / (wide * high));
    wide *= shrink;
    high *= shrink;
    const settle = Math.min(Math.floor(wide) / wide, Math.floor(high) / high);
    wide *= settle;
    high *= settle;
  }
  return { wide: Math.ceil(wide), high: Math.ceil(high) };
};

/**
 * Tokens one input image bills: `ceil(w/32) * ceil(h/32) + 10` after the
 * provider's floor and ceiling rescales. Exact at every size measured.
 */
export const estimateInputImageTokens = (size: PixelSize): number => {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    return estimateInputImageTokens(DEFAULT_OUTPUT_GUESS);
  }
  const { wide, high } = patchesFor(size);
  return wide * high + INPUT_IMAGE_TOKEN_OVERHEAD;
};

/**
 * Output tokens measured per requested size, with no reference attached. Not
 * monotonic in pixels: a 1024x1024 bills more than a 1536x1024 with half again
 * as many pixels. Square output is disproportionately expensive. The same
 * request also sometimes bills more (75 became 177, 158 became 343), so an
 * estimate from this table can be under by up to about $0.005.
 */
export const OUTPUT_TOKENS_BY_SIZE: ReadonlyArray<{ size: PixelSize; tokens: number }> = [
  { size: { width: 1232, height: 544 }, tokens: 75 },
  { size: { width: 1024, height: 1024 }, tokens: 196 },
  { size: { width: 1536, height: 1024 }, tokens: 158 },
  { size: { width: 2048, height: 1536 }, tokens: 247 },
  { size: { width: 3072, height: 2048 }, tokens: 365 },
];

const sameShape = (a: PixelSize, b: PixelSize): boolean =>
  (a.width === b.width && a.height === b.height) || (a.width === b.height && a.height === b.width);

const OUTPUT_TABLE_BY_PIXELS = [...OUTPUT_TOKENS_BY_SIZE]
  .map((entry) => ({ pixels: entry.size.width * entry.size.height, tokens: entry.tokens }))
  .sort((left, right) => left.pixels - right.pixels);

/**
 * Output tokens for a requested size: the measured figure for a measured size
 * (either orientation), otherwise a straight-line reading between the two
 * measured sizes nearest in pixel count, held flat beyond the ends.
 */
export const estimateOutputImageTokens = (size: PixelSize): number => {
  const exact = OUTPUT_TOKENS_BY_SIZE.find((entry) => sameShape(entry.size, size));
  if (exact) return exact.tokens;

  const pixels = Math.max(1, size.width * size.height);
  const first = OUTPUT_TABLE_BY_PIXELS[0];
  const last = OUTPUT_TABLE_BY_PIXELS[OUTPUT_TABLE_BY_PIXELS.length - 1];
  if (pixels <= first.pixels) return first.tokens;
  if (pixels >= last.pixels) return last.tokens;

  for (let i = 1; i < OUTPUT_TABLE_BY_PIXELS.length; i += 1) {
    const lower = OUTPUT_TABLE_BY_PIXELS[i - 1];
    const upper = OUTPUT_TABLE_BY_PIXELS[i];
    if (pixels <= upper.pixels) {
      const t = (pixels - lower.pixels) / (upper.pixels - lower.pixels);
      return Math.round(lower.tokens + t * (upper.tokens - lower.tokens));
    }
  }
  return last.tokens;
};

export interface ImageRunCostEstimate {
  inputImageTokens: number;
  promptTextTokens: number;
  outputTokens: number;
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
}

/**
 * The cost of one call: every input image counted in full, the prompt's text,
 * and the image drawn at `outputSize` (the model default when null).
 */
export const estimateImageRunCostUsd = (
  pricing: TokenPricing,
  inputImages: readonly PixelSize[],
  outputSize: PixelSize | null | undefined,
  options?: { promptTextTokens?: number },
): ImageRunCostEstimate => {
  const inputImageTokens = inputImages.reduce(
    (sum, image) => sum + estimateInputImageTokens(image),
    0,
  );
  const promptTextTokens = options?.promptTextTokens ?? PROMPT_TEXT_TOKEN_ALLOWANCE;
  const outputTokens = estimateOutputImageTokens(outputSize ?? DEFAULT_OUTPUT_GUESS);
  const inputUsd =
    (inputImageTokens * pricing.imageInputUsdPerMillion +
      promptTextTokens * pricing.textInputUsdPerMillion) /
    1e6;
  const outputUsd = (outputTokens * pricing.outputUsdPerMillion) / 1e6;
  return {
    inputImageTokens,
    promptTextTokens,
    outputTokens,
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
  };
};
