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

export const formatUpscaleDimensions = (dimensions: ImageDimensions): string =>
  `${dimensions.width} x ${dimensions.height}`;

const withDimensions = (baseLabel: string, dimensions: ImageDimensions | null): string =>
  dimensions ? `${baseLabel} (${formatUpscaleDimensions(dimensions)})` : baseLabel;

/**
 * The selector's options, in display order. "Auto" exists only when the host
 * sent a target for this slot, so a source without one simply starts at HD.
 */
export const buildUpscaleOptions = (
  source: ImageDimensions | null | undefined,
  hostTarget?: UpscaleHostTarget | null,
): UpscaleOption[] => {
  const hostDimensions = normalizeHostTarget(hostTarget);
  const options: UpscaleOption[] = [];

  if (hostDimensions) {
    options.push({
      token: "auto",
      label: withDimensions("Auto", hostDimensions),
      dimensions: hostDimensions,
    });
  }

  const hd = fitInBox(source, HD_BOX_LONG_EDGE, HD_BOX_SHORT_EDGE);
  options.push({ token: "hd", label: withDimensions("HD", hd), dimensions: hd });

  (["2k", "4k"] as const).forEach((token) => {
    const dimensions = fitToLongEdge(source, TIER_LONG_EDGES[token]);
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
  const hostDimensions = normalizeHostTarget(hostTarget);

  if (token === "auto" && hostDimensions) {
    return hostDimensions;
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
