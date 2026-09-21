/**
 * What kind of picture the Improve Quality tool is looking at, which decides
 * the prompt it sends. Two kinds only: a black-and-white line drawing, which
 * gets restored (paper whitened, lines brought back to solid ink, specks
 * removed), and everything else, which is only scaled up and cleaned of
 * compression damage, because on a painting or a photo a cream background
 * and soft edges cannot be told from damage.
 *
 * The check is a histogram over a small copy of the pixels: a line drawing is
 * nearly all near-neutral in hue, mostly light, with few midtones. It runs in
 * the browser in a few milliseconds and is shown on the card, where the user
 * can overrule it.
 */

export type ImageKind = "line-art" | "other";

/**
 * The Image Kind parameter's name and its values (English, as the registry
 * keeps them). The detector sets the value when a new target image arrives;
 * the user's own choice stands until they switch images. Illustration and
 * Photo are treated alike for now; they are kept apart so that can change
 * without anyone re-choosing.
 */
export const IMAGE_KIND_PARAM = "imageKind";
export const IMAGE_KIND_LINE_DRAWING = "Line Drawing";
export const IMAGE_KIND_ILLUSTRATION = "Illustration";
export const IMAGE_KIND_PHOTO = "Photo";
export const IMAGE_KIND_OPTIONS = [
  IMAGE_KIND_LINE_DRAWING,
  IMAGE_KIND_ILLUSTRATION,
  IMAGE_KIND_PHOTO,
] as const;
export const DEFAULT_IMAGE_KIND_OPTION = IMAGE_KIND_ILLUSTRATION;

/** The choice the detector makes for a kind. */
export const imageKindOption = (kind: ImageKind): string =>
  kind === "line-art" ? IMAGE_KIND_LINE_DRAWING : IMAGE_KIND_ILLUSTRATION;

/**
 * Param key the run path fills with the kind it settled on ("line-art" or
 * "other"), after detection when the parameter is on automatic. Not a declared
 * parameter, so it never reaches the stored record.
 */
export const RESOLVED_IMAGE_KIND_PARAM = "resolvedImageKind";

/**
 * Param key carrying "true" when the Image Kind choice is the user's own
 * rather than a guess. Not a declared parameter, so it never reaches the
 * stored record.
 */
export const IMAGE_KIND_FROM_USER_PARAM = "imageKindFromUser";

/**
 * The kind to show for a set of images the tool will run over: what most of
 * them are, with a tie going to "other", whose prompt is the safe one to apply
 * to a drawing.
 */
export const majorityImageKind = (kinds: ImageKind[]): ImageKind => {
  const lineArt = kinds.filter((kind) => kind === "line-art").length;
  return lineArt > kinds.length - lineArt ? "line-art" : "other";
};

/**
 * The kind one run goes with. A choice the user made covers every image of the
 * run, since they made it knowing what they ticked; a guess is only a starting
 * point, so each image is judged on its own pixels.
 */
export const resolveImageKind = ({
  picked,
  fromUser,
  detected,
}: {
  picked: ImageKind | null;
  fromUser: boolean;
  detected: ImageKind | null;
}): ImageKind => (fromUser ? (picked ?? "other") : (detected ?? picked ?? "other"));

/** The kind a stored parameter value names, or null for an empty or unknown value. */
export const pickedImageKind = (value: string | null | undefined): ImageKind | null => {
  const trimmed = (value ?? "").trim();
  if (trimmed === IMAGE_KIND_LINE_DRAWING) return "line-art";
  if (trimmed === IMAGE_KIND_ILLUSTRATION || trimmed === IMAGE_KIND_PHOTO) return "other";
  return null;
};

export interface RasterLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImageKindStats {
  /** Share of pixels whose channels differ by no more than PAPER_SPREAD. */
  neutral: number;
  /**
   * Share of the pixels darker than paper whose channels differ by no more
   * than INK_SPREAD: ink rather than paint. 1 when nothing is darker than paper.
   */
  neutralInk: number;
  /** Share of pixels lighter than LIGHT_LEVEL: paper. */
  light: number;
  /** Share of pixels between the light and dark levels: tone a drawing mostly lacks. */
  midtone: number;
}

/**
 * How far apart a pixel's channels may be and still count as neutral. Paper
 * gets a wide allowance, since yellowed paper is about 50 apart; the marks on
 * it get a narrow one, since faded brownish ink is about 30 apart and a pale
 * watercolour wash, which is also light and low in contrast, is not.
 */
const PAPER_SPREAD = 72;
const INK_SPREAD = 40;
const LIGHT_LEVEL = 170;
const DARK_LEVEL = 120;

/** The Improve Quality kind test's thresholds, exported for the tests. */
export const LINE_ART_RULE = {
  /** Nearly everything neutral. */
  minNeutral: 0.9,
  /** The marks are ink, not paint. */
  minNeutralInk: 0.85,
  /** Mostly paper. */
  minLight: 0.5,
  /** Little midtone: a halftone photograph or a wash drawing has a lot. */
  maxMidtone: 0.3,
} as const;

export const imageKindStats = (raster: RasterLike): ImageKindStats => {
  const { data, width, height } = raster;
  const count = width * height;
  if (count === 0) return { neutral: 0, neutralInk: 0, light: 0, midtone: 0 };
  let neutral = 0;
  let light = 0;
  let midtone = 0;
  let marks = 0;
  let neutralMarks = 0;
  for (let i = 0; i < count; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const alpha = data[i * 4 + 3];
    // Transparent pixels are paper as far as a drawing is concerned.
    if (alpha < 128) {
      neutral += 1;
      light += 1;
      continue;
    }
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread <= PAPER_SPREAD) neutral += 1;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum >= LIGHT_LEVEL) {
      light += 1;
    } else {
      marks += 1;
      if (spread <= INK_SPREAD) neutralMarks += 1;
      if (lum > DARK_LEVEL) midtone += 1;
    }
  }
  return {
    neutral: neutral / count,
    neutralInk: marks === 0 ? 1 : neutralMarks / marks,
    light: light / count,
    midtone: midtone / count,
  };
};

export const classifyImageKind = (raster: RasterLike): ImageKind => {
  const stats = imageKindStats(raster);
  return stats.neutral >= LINE_ART_RULE.minNeutral &&
    stats.neutralInk >= LINE_ART_RULE.minNeutralInk &&
    stats.light >= LINE_ART_RULE.minLight &&
    stats.midtone <= LINE_ART_RULE.maxMidtone
    ? "line-art"
    : "other";
};

/** Longest edge of the copy the check runs on. */
const SAMPLE_EDGE = 200;

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load the image to classify it."));
    image.src = dataUrl;
  });

/**
 * The kind of picture in a data URL, or null where there is no DOM to read
 * pixels with. The picture is drawn at SAMPLE_EDGE pixels on its long edge,
 * so the check costs the same whatever the source's size.
 */
export const detectImageKind = async (dataUrl: string): Promise<ImageKind | null> => {
  if (typeof document === "undefined") return null;
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const raster = context.getImageData(0, 0, canvas.width, canvas.height);
  const kind = classifyImageKind(raster);
  console.log("[improve-quality] image kind", { kind, ...imageKindStats(raster) });
  return kind;
};
