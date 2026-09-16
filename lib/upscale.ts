import type { ImageDimensions } from "./imageUtils";

/**
 * The math behind the Upscale tool's resolution selector. Kept out of the
 * component so the UI (which labels the options), the run path (which turns the
 * chosen option into a request) and the tests all compute the same numbers.
 *
 * Note that the numbers are a REQUEST, not a promise: image models accept only
 * coarse tiers (1K/2K/4K), so the run path maps whatever comes out of here to
 * the nearest tier at or above it. Only the local dummy model reproduces the
 * exact dimensions.
 */

/** Stable values persisted as the `targetResolution` parameter. */
export type UpscaleTargetToken = "auto" | "hd" | "2k" | "4k";

/** The resolution Bloom computed for the page slot this image sits in. */
export interface UpscaleHostTarget {
  width: number;
  height: number;
  /** Free text from the host, shown verbatim under the selector. */
  memo?: string | null;
}

export interface UpscaleOption {
  token: UpscaleTargetToken;
  label: string;
  /** Null when the source image's dimensions aren't known yet. */
  dimensions: ImageDimensions | null;
}

/** HD is this box, oriented to match the source image (portrait: 1080x1920). */
export const HD_BOX_LONG_EDGE = 1920;
export const HD_BOX_SHORT_EDGE = 1080;

const TIER_LONG_EDGES: Record<"2k" | "4k", number> = {
  "2k": 2048,
  "4k": 4096,
};

/**
 * Param key the run path fills with the resolved pixel target ("1620 x 1080")
 * just before calling the prompt template. The selector itself persists only a
 * tier token, which the template cannot turn into pixels on its own. Not a
 * declared tool parameter, so it never reaches the stored record or the info
 * panel's parameter list.
 */
export const RESOLVED_TARGET_PIXELS_PARAM = "resolvedTargetPixels";

const isUsableDimensions = (
  dimensions: ImageDimensions | null | undefined,
): dimensions is ImageDimensions =>
  !!dimensions &&
  Number.isFinite(dimensions.width) &&
  Number.isFinite(dimensions.height) &&
  dimensions.width > 0 &&
  dimensions.height > 0;

/**
 * Largest size with the source's aspect ratio that fits inside the given box,
 * with the box oriented to match the source (a portrait image is fitted into a
 * portrait box). Returns null when the source dimensions aren't known.
 */
export const fitInBox = (
  source: ImageDimensions | null | undefined,
  boxLongEdge: number,
  boxShortEdge: number,
): ImageDimensions | null => {
  if (!isUsableDimensions(source)) {
    return null;
  }

  const isPortrait = source.height > source.width;
  const boxWidth = isPortrait ? boxShortEdge : boxLongEdge;
  const boxHeight = isPortrait ? boxLongEdge : boxShortEdge;
  const scale = Math.min(boxWidth / source.width, boxHeight / source.height);

  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
};

/** The source's aspect ratio scaled so its long edge is exactly `longEdge`. */
const fitToLongEdge = (
  source: ImageDimensions | null | undefined,
  longEdge: number,
): ImageDimensions | null => {
  if (!isUsableDimensions(source)) {
    return null;
  }

  if (source.width >= source.height) {
    return {
      width: longEdge,
      height: Math.max(1, Math.round((longEdge * source.height) / source.width)),
    };
  }
  return {
    width: Math.max(1, Math.round((longEdge * source.width) / source.height)),
    height: longEdge,
  };
};

const normalizeHostTarget = (
  hostTarget: UpscaleHostTarget | null | undefined,
): ImageDimensions | null =>
  isUsableDimensions(hostTarget) ? { width: hostTarget.width, height: hostTarget.height } : null;

/**
 * Smallest size with the source's aspect ratio that covers the given box on
 * both edges. Null when the source dimensions aren't known.
 */
const coverBox = (
  source: ImageDimensions | null | undefined,
  box: ImageDimensions,
): ImageDimensions | null => {
  if (!isUsableDimensions(source)) {
    return null;
  }

  const scale = Math.max(box.width / source.width, box.height / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
};

/**
 * How far the source's shape may sit from the slot's before Auto stops asking
 * for the slot's own dimensions. Two percent is below what anyone can see in a
 * picture, and below what the 16-pixel grid GPT Image 2.5 rounds to moves the
 * shape by anyway, so reshaping for less than this would trade the host's
 * exact number for nothing.
 */
const SHAPE_MATCH_TOLERANCE = 0.02;

/**
 * What Auto asks for: enough pixels to fill the book slot, in the SOURCE's
 * shape rather than the slot's.
 *
 * Upscaling must not reframe the picture, and asking a model for the slot's
 * own dimensions does exactly that whenever the two shapes differ. A 1024 x
 * 1024 source in a 1468 x 1088 slot came back stretched into 4:3 — flatter
 * mountains, a wider bird (BL-16742) — because the model was handed a canvas
 * of a different shape and had to fill it somehow. So Auto keeps the source's
 * shape and scales it until it covers the slot on both edges, which is what
 * the HD/2K/4K options have always done with their own boxes.
 *
 * Covering rather than fitting inside is deliberate: a slot shows its image
 * either whole, where covering costs a few pixels nobody sees, or cropped to
 * fill, as a canvas background is, where fitting inside would leave the
 * picture short of 300 DPI along the edge that gets cropped. The pixel budget
 * in snapToOpenAiImageSize caps whatever a wild mismatch of shapes produces.
 *
 * With no source dimensions there is no shape to keep, so the slot's own size
 * stands.
 */
export const resolveAutoTarget = (
  source: ImageDimensions | null | undefined,
  hostTarget: UpscaleHostTarget | null | undefined,
): ImageDimensions | null => {
  const slot = normalizeHostTarget(hostTarget);
  if (!slot) return null;
  if (!isUsableDimensions(source)) return slot;

  // A slot is measured from a laid-out page, so its shape is never exactly a
  // picture's even when the two are meant to match; asking for the slot itself
  // in that case keeps the request the same number the host's memo quotes.
  const shapeRatio = source.width / source.height / (slot.width / slot.height);
  if (Math.abs(shapeRatio - 1) <= SHAPE_MATCH_TOLERANCE) return slot;

  return coverBox(source, slot) ?? slot;
};

export const formatUpscaleDimensions = (dimensions: ImageDimensions): string =>
  `${dimensions.width} x ${dimensions.height}`;

/**
 * The extra sentence shown under the host's memo when Auto is asking for
 * something other than the size the memo names, so that two numbers on the
 * same screen never silently disagree. Pass the Auto option's dimensions (the
 * snapped ones the user is reading). Null when they match, the ordinary case
 * of an image already the shape of its slot.
 */
export const describeAutoShapeChange = (
  autoDimensions: ImageDimensions | null | undefined,
  hostTarget: UpscaleHostTarget | null | undefined,
): string | null => {
  const slot = normalizeHostTarget(hostTarget);
  if (!slot || !isUsableDimensions(autoDimensions)) return null;
  if (autoDimensions.width === slot.width && autoDimensions.height === slot.height) return null;
  return (
    `Asking for ${formatUpscaleDimensions(autoDimensions)} instead, which is that much ` +
    `detail in this image's own shape. Upscaling never re-crops or stretches the picture, ` +
    `so Bloom fits the result to the container as it does now.`
  );
};

const withDimensions = (baseLabel: string, dimensions: ImageDimensions | null): string =>
  dimensions ? `${baseLabel} (${formatUpscaleDimensions(dimensions)})` : baseLabel;

/**
 * The selector's options, in display order. "Auto" exists only when the host
 * sent a target for this slot, so a source without one simply starts at HD.
 *
 * `snap` is how the selected model would change the pixels before sending them
 * (see snapPixelsForModel): GPT Image 2.5 caps an edge at 3840 and the total
 * at 8,294,400 pixels, so its "4K" option reads the size it will be sent (for
 * a 3:2 source, 3520 x 2352) rather than 4096. Without it the labels carry the
 * tier's own numbers, which the Gemini keys take as is.
 */
export const buildUpscaleOptions = (
  source: ImageDimensions | null | undefined,
  hostTarget?: UpscaleHostTarget | null,
  snap: (dimensions: ImageDimensions | null) => ImageDimensions | null = (d) => d,
): UpscaleOption[] => {
  const hostDimensions = snap(resolveAutoTarget(source, hostTarget));
  const options: UpscaleOption[] = [];

  if (hostDimensions) {
    options.push({
      token: "auto",
      label: withDimensions("Auto", hostDimensions),
      dimensions: hostDimensions,
    });
  }

  const hd = snap(fitInBox(source, HD_BOX_LONG_EDGE, HD_BOX_SHORT_EDGE));
  options.push({ token: "hd", label: withDimensions("HD", hd), dimensions: hd });

  (["2k", "4k"] as const).forEach((token) => {
    const dimensions = snap(fitToLongEdge(source, TIER_LONG_EDGES[token]));
    options.push({
      token,
      label: withDimensions(token.toUpperCase(), dimensions),
      dimensions,
    });
  });

  return options;
};

/**
 * The pixel target for a stored token. "auto" without a host target — and any
 * token this build doesn't know (a value persisted by an older one) — falls
 * back to HD.
 */
export const resolveUpscaleTarget = (
  paramValue: string | null | undefined,
  source: ImageDimensions | null | undefined,
  hostTarget?: UpscaleHostTarget | null,
): ImageDimensions | null => {
  const token = (paramValue || "").trim().toLowerCase();
  const autoDimensions = resolveAutoTarget(source, hostTarget);

  if (token === "auto" && autoDimensions) {
    return autoDimensions;
  }
  if (token === "2k" || token === "4k") {
    return fitToLongEdge(source, TIER_LONG_EDGES[token]);
  }
  return fitInBox(source, HD_BOX_LONG_EDGE, HD_BOX_SHORT_EDGE);
};

/** The tool's resolution parameter, or undefined for every other tool. */
export const findTargetResolutionParam = <T extends { type: string }>(
  parameters: T[] | undefined,
): T | undefined => parameters?.find((parameter) => parameter.type === "target-resolution");
