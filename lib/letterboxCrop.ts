import type { Letterbox } from "./upscale";

/**
 * Cropping a letterboxed Scale Up result back to the picture.
 *
 * The plan says where the picture should sit (lib/upscale.ts, Letterbox). The
 * model lands it within a few pixels of that, so the crop uses the bar edges
 * it actually drew when they are where the plan put them, and the plan's own
 * numbers when they are not: a model that ignored the bars altogether would
 * otherwise be cropped by whatever dark stripe happened to be near the edge.
 */

/** A channel value at or below this is black enough to be a bar. */
const BAR_LEVEL = 24;

/**
 * How far, as a share of the canvas edge, a measured bar may sit from the
 * planned one and still be believed. GPT Image 2.5 measured under one percent.
 */
const BAR_TOLERANCE = 0.05;

export interface RasterLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * The run of black lines at the start and end of the raster along an axis:
 * rows when `axis` is "rows", columns when it is "columns". A line is black
 * when its brightest channel is at or below BAR_LEVEL.
 */
export const measureBars = (
  raster: RasterLike,
  axis: "rows" | "columns",
): { leading: number; trailing: number } => {
  const { data, width, height } = raster;
  const count = axis === "rows" ? height : width;
  const isBlack = (line: number): boolean => {
    const span = axis === "rows" ? width : height;
    for (let i = 0; i < span; i += 1) {
      const x = axis === "rows" ? i : line;
      const y = axis === "rows" ? line : i;
      const offset = (y * width + x) * 4;
      if (
        data[offset] > BAR_LEVEL ||
        data[offset + 1] > BAR_LEVEL ||
        data[offset + 2] > BAR_LEVEL
      ) {
        return false;
      }
    }
    return true;
  };

  let leading = 0;
  while (leading < count && isBlack(leading)) leading += 1;
  let trailing = 0;
  while (trailing < count - leading && isBlack(count - 1 - trailing)) trailing += 1;
  return { leading, trailing };
};

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The rectangle to cut out of a result of `actual` pixels. The plan's content
 * rectangle is scaled to the actual canvas first (a model may return a size a
 * few pixels off the request), then, along the letterboxed axis, replaced by
 * the bars the model drew when both bar edges lie within BAR_TOLERANCE of it.
 */
export const resolveLetterboxCrop = (
  raster: RasterLike,
  requested: { width: number; height: number },
  letterbox: Letterbox,
): CropRect => {
  const scaleX = raster.width / requested.width;
  const scaleY = raster.height / requested.height;
  const planned: CropRect = {
    x: Math.round(letterbox.content.x * scaleX),
    y: Math.round(letterbox.content.y * scaleY),
    width: Math.round(letterbox.content.width * scaleX),
    height: Math.round(letterbox.content.height * scaleY),
  };

  const barsAlongRows = letterbox.fills === "width";
  const extent = barsAlongRows ? raster.height : raster.width;
  const { leading, trailing } = measureBars(raster, barsAlongRows ? "rows" : "columns");
  const plannedLeading = barsAlongRows ? planned.y : planned.x;
  const plannedTrailing =
    extent - plannedLeading - (barsAlongRows ? planned.height : planned.width);
  const tolerance = extent * BAR_TOLERANCE;
  const barsAsPlanned =
    Math.abs(leading - plannedLeading) <= tolerance &&
    Math.abs(trailing - plannedTrailing) <= tolerance &&
    extent - leading - trailing > 0;
  if (!barsAsPlanned) {
    console.warn("[scale-up] letterbox bars not where planned; cropping by the plan", {
      planned: { leading: plannedLeading, trailing: plannedTrailing },
      measured: { leading, trailing },
    });
    return planned;
  }
  return barsAlongRows
    ? { x: 0, y: leading, width: raster.width, height: extent - leading - trailing }
    : { x: leading, y: 0, width: extent - leading - trailing, height: raster.height };
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load the scaled-up image for cropping."));
    image.src = dataUrl;
  });

/**
 * The picture cut out of a letterboxed result, as a PNG data URL. Returns the
 * input unchanged where there is no DOM to draw with.
 */
export const cropLetterboxedResult = async (
  imageData: string,
  requested: { width: number; height: number },
  letterbox: Letterbox,
): Promise<string> => {
  if (typeof document === "undefined") return imageData;
  const image = await loadImage(imageData);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable for letterbox cropping.");
  context.drawImage(image, 0, 0);
  const raster = context.getImageData(0, 0, canvas.width, canvas.height);
  const crop = resolveLetterboxCrop(raster, requested, letterbox);

  const out = document.createElement("canvas");
  out.width = crop.width;
  out.height = crop.height;
  const outContext = out.getContext("2d");
  if (!outContext) throw new Error("Canvas context unavailable for letterbox cropping.");
  outContext.drawImage(
    canvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );
  return out.toDataURL("image/png");
};
