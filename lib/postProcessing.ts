type RGB = { r: number; g: number; b: number };

type PostProcessingFn = (imageData: string) => Promise<string>;

const DEFAULT_CHROMA_KEY: RGB = { r: 0, g: 255, b: 102 }; // Hex #00FF66
const HARD_DISTANCE_THRESHOLD = 115;
const SOFT_DISTANCE_FALLOFF = 60;
const GREEN_DOMINANCE_THRESHOLD = 40;
const GREEN_TINT_TOLERANCE = 18;
const MIN_GREEN_VALUE = 110;

const clamp01 = (value: number): number => {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const colorDistance = (a: RGB, b: RGB): number => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> => {
  if (typeof Image === "undefined") {
    return Promise.reject(
      new Error("Image element not available in this environment.")
    );
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Failed to load image for post-processing."));
    img.src = dataUrl;
  });
};

const sampleEdgeColor = (imageData: ImageData): RGB | null => {
  const { data, width, height } = imageData;
  const samples: RGB[] = [];
  const stepX = Math.max(1, Math.floor(width / 60));
  const stepY = Math.max(1, Math.floor(height / 60));

  const readPixel = (x: number, y: number): RGB => {
    const idx = (y * width + x) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  };

  for (let x = 0; x < width; x += stepX) {
    samples.push(readPixel(x, 0));
    samples.push(readPixel(x, height - 1));
  }

  for (let y = 0; y < height; y += stepY) {
    samples.push(readPixel(0, y));
    samples.push(readPixel(width - 1, y));
  }

  const greenish = samples.filter((sample) => {
    const dominance = sample.g - Math.max(sample.r, sample.b);
    return sample.g > 120 && dominance > 25;
  });

  if (!greenish.length) {
    return null;
  }

  const total = greenish.reduce(
    (acc, sample) => {
      acc.r += sample.r;
      acc.g += sample.g;
      acc.b += sample.b;
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );

  return {
    r: Math.round(total.r / greenish.length),
    g: Math.round(total.g / greenish.length),
    b: Math.round(total.b / greenish.length),
  };
};

const runChromaKey = (imageData: ImageData, keyColor: RGB): ImageData => {
  const { data } = imageData;
  const hardCutoff = HARD_DISTANCE_THRESHOLD - SOFT_DISTANCE_FALLOFF;

  for (let i = 0; i < data.length; i += 4) {
    const pixel: RGB = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const alpha = data[i + 3];
    if (alpha === 0) {
      continue;
    }

    const dist = colorDistance(pixel, keyColor);
    const dominance = pixel.g - Math.max(pixel.r, pixel.b);
    const isGreenish =
      pixel.g > MIN_GREEN_VALUE && dominance > GREEN_TINT_TOLERANCE;
    const inHardBand = dist <= hardCutoff;
    const inSoftBand = dist <= HARD_DISTANCE_THRESHOLD;

    if (
      (inHardBand && isGreenish) ||
      dominance > GREEN_DOMINANCE_THRESHOLD + 20
    ) {
      data[i + 3] = 0;
      continue;
    }

    if ((isGreenish && inSoftBand) || dominance > GREEN_DOMINANCE_THRESHOLD) {
      const distanceBlend = clamp01(
        (dist - hardCutoff) / SOFT_DISTANCE_FALLOFF
      );
      const dominanceBlend = clamp01(
        (dominance - GREEN_DOMINANCE_THRESHOLD) /
          Math.max(1, GREEN_DOMINANCE_THRESHOLD)
      );
      const fade = Math.max(distanceBlend, dominanceBlend);
      data[i + 3] = Math.round(alpha * fade);

      // Slightly reduce green spill when we partially fade pixels.
      data[i] = Math.min(255, data[i] + 8);
      data[i + 2] = Math.min(255, data[i + 2] + 8);
    }
  }

  return imageData;
};

const chromaKeyToAlpha: PostProcessingFn = async (dataUrl: string) => {
  if (typeof document === "undefined") {
    return dataUrl;
  }

  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context for post-processing.");
  }

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const keyColor = sampleEdgeColor(baseImageData) ?? DEFAULT_CHROMA_KEY;
  const processed = runChromaKey(baseImageData, keyColor);
  ctx.putImageData(processed, 0, 0);

  return canvas.toDataURL("image/png");
};

const REGISTRY: Record<string, PostProcessingFn> = {
  "green-screen-to-alpha": chromaKeyToAlpha,
};

export const applyPostProcessingPipeline = async (
  imageData: string,
  pipeline: string[] | undefined
): Promise<string> => {
  if (!pipeline?.length) {
    return imageData;
  }

  let result = imageData;
  for (const step of pipeline) {
    const fn = REGISTRY[step];
    if (!fn) {
      console.warn(`Unknown post-processing function: ${step}`);
      continue;
    }
    try {
      result = await fn(result);
    } catch (error) {
      console.error(`Post-processing step "${step}" failed`, error);
    }
  }

  return result;
};
