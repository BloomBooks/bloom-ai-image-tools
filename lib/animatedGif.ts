import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { blobToBase64 } from "./imageUtils";

const loadImage = (dataUrl: string): Promise<HTMLImageElement> => {
  if (typeof Image === "undefined") {
    return Promise.reject(new Error("Image element not available for GIF encoding."));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load GIF frame image."));
    image.src = dataUrl;
  });
};

const getTransparentPaletteIndex = (palette: ArrayLike<ArrayLike<number>>) => {
  for (let index = 0; index < palette.length; index += 1) {
    if ((palette[index]?.[3] ?? 255) === 0) {
      return index;
    }
  }

  return -1;
};

export const createAnimatedGif = async (
  frameImageData: string[],
  options: {
    delayMs?: number;
    repeat?: number;
    /**
     * Delay for the final frame only. One-way actions hold their end state
     * here so the endless GIF repeat reads as "…done — again!" instead of an
     * abrupt strobe back to frame 1.
     */
    finalDelayMs?: number;
  } = {},
): Promise<string> => {
  if (!frameImageData.length) {
    throw new Error("At least one frame is required to create a GIF.");
  }

  if (typeof document === "undefined") {
    return frameImageData[0];
  }

  const images = await Promise.all(frameImageData.map((frame) => loadImage(frame)));
  const width = Math.max(1, ...images.map((image) => image.naturalWidth));
  const height = Math.max(1, ...images.map((image) => image.naturalHeight));
  // Uniform grid cells arrive pre-registered on identical canvases — stack
  // them untouched. Re-aligning them by bounding box would reintroduce the
  // very jitter the grid slicing exists to avoid.
  const framesShareCanvasSize = images.every(
    (image) => image.naturalWidth === width && image.naturalHeight === height,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas context unavailable for GIF encoding.");
  }

  const gif = GIFEncoder();
  const delay = Math.max(40, options.delayMs ?? 140);
  const finalDelay = options.finalDelayMs ? Math.max(delay, options.finalDelayMs) : delay;
  const repeat = options.repeat ?? 0;

  for (const [index, image] of images.entries()) {
    context.clearRect(0, 0, width, height);

    // Mixed-size frames are trimmed cutouts with no shared registration; the
    // baseline/centerline alignment is the best heuristic left for those.
    const x = framesShareCanvasSize ? 0 : Math.round((width - image.naturalWidth) / 2);
    const y = framesShareCanvasSize ? 0 : height - image.naturalHeight;
    context.drawImage(image, x, y);

    const frame = context.getImageData(0, 0, width, height);
    const palette = quantize(frame.data, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
    });
    const indexedFrame = applyPalette(frame.data, palette, "rgba4444");
    const transparentIndex = getTransparentPaletteIndex(palette);

    gif.writeFrame(indexedFrame, width, height, {
      palette,
      delay: index === images.length - 1 ? finalDelay : delay,
      repeat,
      dispose: 2,
      transparent: transparentIndex >= 0,
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
    });
  }

  gif.finish();
  const gifBlob = new Blob([gif.bytesView()], { type: "image/gif" });
  return blobToBase64(gifBlob);
};
