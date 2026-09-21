import type { ImageDimensions } from "./imageUtils";
import { snapToOpenAiImageSize, type PixelSize } from "./imageSizes";

/**
 * The math behind the size Improve Quality asks for. Kept out of the
 * component so the UI (which labels the options), the run path (which turns the
 * chosen option into a request) and the tests all compute the same numbers.
 *
 * Note that the numbers are a REQUEST, not a promise: image models accept only
 * coarse tiers (1K/2K/4K), so the run path maps whatever comes out of here to
 * the nearest tier at or above it. Only the local dummy model reproduces the
 * exact dimensions.
 */

/** Stable values persisted as the `targetResolution` parameter. */
export type UpscaleTargetToken = "container" | "hd" | "2k" | "4k";

/** The Target Resolution value that means "enough pixels to fill the image container". */
export const CONTAINER_UPSCALE_TOKEN: UpscaleTargetToken = "container";

/** The resolution Bloom computed for the page slot this image sits in. */
export interface UpscaleHostTarget {
  width: number;
  height: number;
  /** Free text from the host, shown in the model-limit line's tooltip. */
  memo?: string | null;
}

export interface UpscaleOption {
  token: UpscaleTargetToken;
  /** "Match Container", "HD", "2K", "4K": the row's name, with no pixels in it. */
  label: string;
  /** The pixels this row asks for, shown as a second line under the label. */
  caption?: string;
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
 * Largest size with the source's aspect ratio that fits inside the given box,
 * keeping the box as it is (unlike fitInBox, which turns the box to match the
 * source). Scaling stops as soon as either edge meets the box's. Null when the
 * source dimensions aren't known.
 */
const fitInsideBox = (
  source: ImageDimensions | null | undefined,
  box: ImageDimensions,
): ImageDimensions | null => {
  if (!isUsableDimensions(source)) {
    return null;
  }

  const scale = Math.min(box.width / source.width, box.height / source.height);
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
 * What Match Container asks for: the image container's pixels, in the
 * SOURCE's shape rather than the container's.
 *
 * Upscaling must not reframe the picture, and asking a model for the slot's
 * own dimensions does exactly that whenever the two shapes differ. A 1024 x
 * 1024 source in a 1468 x 1088 slot came back stretched into 4:3 — flatter
 * mountains, a wider bird (BL-16742) — because the model was handed a canvas
 * of a different shape and had to fill it somehow. So Auto keeps the source's
 * shape and scales it up until either edge meets the slot's, which is what
 * the HD/2K/4K options have always done with their own boxes.
 *
 * Stopping at the first edge rather than covering both is deliberate: a
 * picture whose shape differs a lot from its slot (a panorama in a page-shaped
 * slot) would otherwise be asked for at many times the slot's pixels along
 * the other edge, which the model's ratio and pixel limits then squash into a
 * different shape.
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

  return fitInsideBox(source, slot) ?? slot;
};

export const formatUpscaleDimensions = (dimensions: ImageDimensions): string =>
  `${dimensions.width} x ${dimensions.height}`;

const captionFor = (dimensions: ImageDimensions | null): string | undefined =>
  dimensions ? formatUpscaleDimensions(dimensions) : undefined;

/**
 * What the Match Container row asks for: the container's pixels, in the
 * image's shape. Null without a host target.
 */
const containerTarget = resolveAutoTarget;

/**
 * The selector's options, in display order. Each row carries, under its name,
 * the pixels it will ask for, in the image's own shape. "Match Container" exists
 * only when the host sent a target for this slot, so a source without one
 * simply starts at HD.
 *
 * `snap` is how the selected model would change the pixels before sending them
 * (see snapPixelsForModel): GPT Image 2.5 caps an edge at 3840 and the total
 * at 8,294,400 pixels, so its "4K" option reads the size it will be sent (for
 * a 3:2 source, 3520 x 2352) rather than 4096. Without it the captions carry the
 * tier's own numbers, which the Gemini keys take as is.
 */
export const buildUpscaleOptions = (
  source: ImageDimensions | null | undefined,
  hostTarget?: UpscaleHostTarget | null,
  snap: (dimensions: ImageDimensions | null) => ImageDimensions | null = (d) => d,
): UpscaleOption[] => {
  const container = snap(containerTarget(source, hostTarget));
  const options: UpscaleOption[] = [];

  if (container) {
    options.push({
      token: CONTAINER_UPSCALE_TOKEN,
      label: "Match Container",
      caption: captionFor(container),
      dimensions: container,
    });
  }

  const hd = snap(fitInBox(source, HD_BOX_LONG_EDGE, HD_BOX_SHORT_EDGE));
  options.push({ token: "hd", label: "HD", caption: captionFor(hd), dimensions: hd });

  (["2k", "4k"] as const).forEach((token) => {
    const dimensions = snap(fitToLongEdge(source, TIER_LONG_EDGES[token]));
    options.push({
      token,
      label: token.toUpperCase(),
      caption: captionFor(dimensions),
      dimensions,
    });
  });

  return options;
};

/**
 * The pixel target for a stored token, in the image's own shape. A token this
 * build does not know (a value persisted by an older one, or an empty one)
 * means the default: the container when the host sent one, else HD.
 */
export const resolveUpscaleTarget = (
  paramValue: string | null | undefined,
  source: ImageDimensions | null | undefined,
  hostTarget?: UpscaleHostTarget | null,
): ImageDimensions | null => {
  const token = (paramValue || "").trim().toLowerCase();

  if (token === "2k" || token === "4k") {
    return fitToLongEdge(source, TIER_LONG_EDGES[token]);
  }
  if (token === "hd") {
    return fitInBox(source, HD_BOX_LONG_EDGE, HD_BOX_SHORT_EDGE);
  }
  return (
    containerTarget(source, hostTarget) ?? fitInBox(source, HD_BOX_LONG_EDGE, HD_BOX_SHORT_EDGE)
  );
};

/** The tool's resolution parameter, or undefined for every other tool. */
export const findTargetResolutionParam = <T extends { type: string }>(
  parameters: T[] | undefined,
): T | undefined => parameters?.find((parameter) => parameter.type === "target-resolution");

/**
 * A pixel-size model's hard limits, as far as scaling up cares: the longest
 * edge it will make and the widest shape (long edge over short edge) it
 * accepts. Null for a model that takes a tier token, which has neither.
 */
export interface PixelSizeLimits {
  maxEdge: number;
  maxEdgeRatio: number;
}

/** The four things the Scale Up card can say when the host sent a container. */
export type ScaleUpState = "no-container" | "to-page" | "model-limit" | "already-enough";

/**
 * A picture asked for inside a larger canvas because the model will not make
 * its shape directly. The prompt tells the model to keep the picture's
 * proportions, center it along the axis it does not fill, and paint solid
 * black bars on either side; the run crops `content` back out afterwards.
 */
export interface Letterbox {
  /** The canvas edge the picture fills. The bars lie along the other one. */
  fills: "width" | "height";
  /** Where the picture sits in the canvas, in canvas pixels. */
  content: { x: number; y: number; width: number; height: number };
}

export interface ScaleUpPlan {
  state: ScaleUpState;
  /** The pixels the page wants the picture to have, in the picture's shape. */
  target: ImageDimensions | null;
  /** The pixels the picture will have once the model's limits are applied. */
  achievable: ImageDimensions | null;
  /** The canvas to ask the model for: `achievable`, or a letterbox around it. */
  request: ImageDimensions | null;
  letterbox: Letterbox | null;
  /**
   * How much of the page's size the model can reach, as its long edge over
   * the target's, floored to a multiple of ten. The linear ratio equals the
   * ratio of achieved to wanted DPI, so the card can quote it without
   * knowing either DPI. 100 when the model is not the limit.
   */
  percent: number;
}

/**
 * Below this share of the target's long edge the card says the model is the
 * limit. The grid rounding a pixel-size model applies can take a few pixels
 * off any request, which is not worth a sentence.
 */
const MODEL_LIMIT_THRESHOLD = 0.98;

const longEdge = (d: ImageDimensions): number => Math.max(d.width, d.height);

const NO_CONTAINER: ScaleUpPlan = {
  state: "no-container",
  target: null,
  achievable: null,
  request: null,
  letterbox: null,
  percent: 100,
};

/**
 * What Scale Up does for a picture inside a page container. With a container
 * from the host there is nothing to choose: the picture keeps its shape and
 * gets as many pixels as the container asks for (resolveAutoTarget), or as
 * many as the model can give if that is fewer.
 *
 * A pixel-size model will not make a shape wider than `maxEdgeRatio`, so a
 * picture beyond that is asked for as a letterboxed canvas of the widest
 * legal shape, with the picture filling the canvas's long edge; the run crops
 * it back out. A picture inside the ratio is asked for directly, and the
 * model's grid and edge cap are applied to that (snapToOpenAiImageSize).
 *
 * A picture that already has the container's pixels is not made smaller: the
 * request is its own size, so a run only does the tool's other work.
 */
export const planScaleUp = (
  source: ImageDimensions | null | undefined,
  hostTarget: UpscaleHostTarget | null | undefined,
  limits: PixelSizeLimits | null | undefined,
): ScaleUpPlan => {
  const slot = normalizeHostTarget(hostTarget);
  if (!slot) return NO_CONTAINER;

  const fitted = resolveAutoTarget(source, slot) ?? slot;
  const alreadyEnough =
    isUsableDimensions(source) && source.width >= fitted.width && source.height >= fitted.height;
  const target = alreadyEnough ? { width: source.width, height: source.height } : fitted;
  const state: ScaleUpState = alreadyEnough ? "already-enough" : "to-page";

  if (!limits) {
    return { state, target, achievable: target, request: target, letterbox: null, percent: 100 };
  }

  const ratio = target.width / target.height;
  const tooWide = ratio > limits.maxEdgeRatio;
  const tooTall = 1 / ratio > limits.maxEdgeRatio;

  let request: PixelSize;
  let achievable: ImageDimensions;
  let letterbox: Letterbox | null = null;
  if (!tooWide && !tooTall) {
    request = snapToOpenAiImageSize(target);
    achievable = request;
  } else {
    const contentLongEdge = Math.min(longEdge(target), limits.maxEdge);
    const canvas = tooWide
      ? { width: contentLongEdge, height: Math.ceil(contentLongEdge / limits.maxEdgeRatio) }
      : { width: Math.ceil(contentLongEdge / limits.maxEdgeRatio), height: contentLongEdge };
    request = snapToOpenAiImageSize(canvas);
    achievable = fitInsideBox(target, request) ?? request;
    letterbox = {
      fills: tooWide ? "width" : "height",
      content: {
        x: Math.floor((request.width - achievable.width) / 2),
        y: Math.floor((request.height - achievable.height) / 2),
        width: achievable.width,
        height: achievable.height,
      },
    };
  }

  const share = longEdge(achievable) / longEdge(target);
  if (state === "to-page" && share < MODEL_LIMIT_THRESHOLD) {
    return {
      state: "model-limit",
      target,
      achievable,
      request,
      letterbox,
      percent: Math.max(10, Math.floor(share * 10) * 10),
    };
  }
  return { state, target, achievable, request, letterbox, percent: 100 };
};

/**
 * The prompt paragraph that asks for a letterboxed canvas. Worded from a
 * measured run: GPT Image 2.5 follows it to within a few pixels, with clean
 * bars and the picture's proportions kept.
 */
export const letterboxPromptInstruction = (canvas: PixelSize, letterbox: Letterbox): string => {
  const bars = letterbox.fills === "width" ? "above and below" : "left and right of";
  return (
    `The output canvas is ${canvas.width} x ${canvas.height} pixels, which is a different shape from this picture. ` +
    `Do not stretch, crop, or extend the picture. Scale the whole picture up, keeping its exact proportions, ` +
    `until it fills the full ${letterbox.fills} of the canvas, and center it. ` +
    `Fill ALL of the remaining canvas ${bars} the picture with solid, pure black (#000000) bars with hard straight edges. ` +
    `The bars are empty padding, not part of the picture: paint nothing in them.`
  );
};

/**
 * Param key the run path fills with letterboxPromptInstruction when the plan
 * letterboxes. Like RESOLVED_TARGET_PIXELS_PARAM, not a declared parameter.
 */
export const LETTERBOX_INSTRUCTION_PARAM = "letterboxInstruction";
