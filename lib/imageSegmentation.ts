import { cropWhitespace } from "./imageProcessing";

type RasterImageData = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const ALPHA_BACKGROUND_THRESHOLD = 24;
const WHITE_BACKGROUND_THRESHOLD = 242;
const WHITE_SPREAD_THRESHOLD = 20;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isBackgroundPixel = (
  data: Uint8ClampedArray,
  pixelIndex: number,
): boolean => {
  const alpha = data[pixelIndex + 3];
  if (alpha <= ALPHA_BACKGROUND_THRESHOLD) {
    return true;
  }

  const red = data[pixelIndex];
  const green = data[pixelIndex + 1];
  const blue = data[pixelIndex + 2];
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);

  return (
    red >= WHITE_BACKGROUND_THRESHOLD &&
    green >= WHITE_BACKGROUND_THRESHOLD &&
    blue >= WHITE_BACKGROUND_THRESHOLD &&
    spread <= WHITE_SPREAD_THRESHOLD
  );
};

const createForegroundMask = ({
  data,
  width,
  height,
}: RasterImageData): Uint8Array => {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const pixelIndex = index * 4;
    if (!isBackgroundPixel(data, pixelIndex)) {
      mask[index] = 1;
    }
  }
  return mask;
};

const countForeground = (
  mask: Uint8Array,
  width: number,
  bounds: Bounds,
): number => {
  let count = 0;
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    const rowOffset = y * width;
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      count += mask[rowOffset + x];
    }
  }
  return count;
};

const collectAxisCounts = (
  mask: Uint8Array,
  width: number,
  height: number,
  axis: "row" | "column",
): number[] => {
  if (axis === "row") {
    const counts = new Array<number>(height).fill(0);
    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      let count = 0;
      for (let x = 0; x < width; x += 1) {
        count += mask[rowOffset + x];
      }
      counts[y] = count;
    }
    return counts;
  }

  const counts = new Array<number>(width).fill(0);
  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y < height; y += 1) {
      count += mask[y * width + x];
    }
    counts[x] = count;
  }
  return counts;
};

const detectActiveRanges = (
  counts: number[],
  threshold: number,
  maxGap: number,
): Array<{ start: number; end: number }> => {
  const ranges: Array<{ start: number; end: number }> = [];
  let activeStart = -1;
  let gap = 0;

  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= threshold) {
      if (activeStart < 0) {
        activeStart = index;
      }
      gap = 0;
      continue;
    }

    if (activeStart < 0) {
      continue;
    }

    gap += 1;
    if (gap > maxGap) {
      ranges.push({ start: activeStart, end: index - gap });
      activeStart = -1;
      gap = 0;
    }
  }

  if (activeStart >= 0) {
    ranges.push({ start: activeStart, end: counts.length - 1 - gap });
  }

  return ranges.filter((range) => range.end >= range.start);
};

const detectGridBounds = (
  mask: Uint8Array,
  width: number,
  height: number,
): Bounds[] => {
  const rowCounts = collectAxisCounts(mask, width, height, "row");
  const columnCounts = collectAxisCounts(mask, width, height, "column");
  const rowThreshold = Math.max(2, Math.floor(width * 0.008));
  const columnThreshold = Math.max(2, Math.floor(height * 0.008));
  const rowGap = Math.max(2, Math.floor(height * 0.008));
  const columnGap = Math.max(2, Math.floor(width * 0.008));
  const rows = detectActiveRanges(rowCounts, rowThreshold, rowGap);
  const columns = detectActiveRanges(columnCounts, columnThreshold, columnGap);

  if (!rows.length || !columns.length) {
    return [];
  }

  const minimumCellPixels = Math.max(32, Math.floor(width * height * 0.0005));
  const bounds: Bounds[] = [];
  rows.forEach((row) => {
    columns.forEach((column) => {
      const candidate = {
        left: column.start,
        top: row.start,
        right: column.end,
        bottom: row.end,
      };
      if (countForeground(mask, width, candidate) >= minimumCellPixels) {
        bounds.push(candidate);
      }
    });
  });

  return bounds;
};

const rangesOverlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  margin: number,
) => aStart <= bEnd + margin && bStart <= aEnd + margin;

const mergeBounds = (bounds: Bounds[], margin: number): Bounds[] => {
  const pending = [...bounds];
  const merged: Bounds[] = [];

  while (pending.length) {
    let current = pending.shift() as Bounds;
    let changed = true;

    while (changed) {
      changed = false;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const candidate = pending[index];
        const overlapsHorizontally = rangesOverlap(
          current.left,
          current.right,
          candidate.left,
          candidate.right,
          margin,
        );
        const overlapsVertically = rangesOverlap(
          current.top,
          current.bottom,
          candidate.top,
          candidate.bottom,
          margin,
        );

        if (!overlapsHorizontally || !overlapsVertically) {
          continue;
        }

        current = {
          left: Math.min(current.left, candidate.left),
          top: Math.min(current.top, candidate.top),
          right: Math.max(current.right, candidate.right),
          bottom: Math.max(current.bottom, candidate.bottom),
        };
        pending.splice(index, 1);
        changed = true;
      }
    }

    merged.push(current);
  }

  return merged;
};

const detectConnectedComponentBounds = (
  mask: Uint8Array,
  width: number,
  height: number,
): Bounds[] => {
  const visited = new Uint8Array(mask.length);
  const minimumComponentPixels = Math.max(48, Math.floor(width * height * 0.0004));
  const components: Bounds[] = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue;
    }

    const queue = [index];
    visited[index] = 1;
    let pixels = 0;
    let left = index % width;
    let right = left;
    let top = Math.floor(index / width);
    let bottom = top;

    while (queue.length) {
      const current = queue.pop() as number;
      const x = current % width;
      const y = Math.floor(current / width);
      pixels += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
            continue;
          }
          const nextIndex = nextY * width + nextX;
          if (!mask[nextIndex] || visited[nextIndex]) {
            continue;
          }
          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }

    if (pixels >= minimumComponentPixels) {
      components.push({ left, top, right, bottom });
    }
  }

  const mergeMargin = 1;
  return mergeBounds(components, mergeMargin).sort((a, b) => {
    if (a.top !== b.top) {
      return a.top - b.top;
    }
    return a.left - b.left;
  });
};

export const extractPieceBoundsFromRaster = (
  raster: RasterImageData,
): Bounds[] => {
  const { width, height } = raster;
  if (!width || !height) {
    return [];
  }

  const mask = createForegroundMask(raster);
  const gridBounds = detectGridBounds(mask, width, height);
  const componentBounds = detectConnectedComponentBounds(mask, width, height);

  if (componentBounds.length > gridBounds.length) {
    return componentBounds;
  }

  if (gridBounds.length > 1) {
    return gridBounds;
  }

  return componentBounds;
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for segmentation."));
    image.src = dataUrl;
  });

const cropBoundsToDataUrl = async (
  image: HTMLImageElement,
  bounds: Bounds,
): Promise<string> => {
  const paddingX = Math.max(8, Math.floor((bounds.right - bounds.left + 1) * 0.04));
  const paddingY = Math.max(8, Math.floor((bounds.bottom - bounds.top + 1) * 0.04));
  const sourceLeft = clamp(bounds.left - paddingX, 0, image.naturalWidth - 1);
  const sourceTop = clamp(bounds.top - paddingY, 0, image.naturalHeight - 1);
  const sourceRight = clamp(bounds.right + paddingX, 0, image.naturalWidth - 1);
  const sourceBottom = clamp(bounds.bottom + paddingY, 0, image.naturalHeight - 1);
  const cropWidth = sourceRight - sourceLeft + 1;
  const cropHeight = sourceBottom - sourceTop + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable for segmentation.");
  }

  context.drawImage(
    image,
    sourceLeft,
    sourceTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  const imageData = context.getImageData(0, 0, cropWidth, cropHeight);
  for (let pixelIndex = 0; pixelIndex < imageData.data.length; pixelIndex += 4) {
    if (isBackgroundPixel(imageData.data, pixelIndex)) {
      imageData.data[pixelIndex + 3] = 0;
    }
  }
  context.putImageData(imageData, 0, 0);

  return cropWhitespace(canvas.toDataURL("image/png"));
};

export const segmentImageIntoPieces = async (
  imageData: string,
): Promise<string[]> => {
  if (typeof document === "undefined") {
    return [imageData];
  }

  const image = await loadImage(imageData);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable for segmentation.");
  }

  context.drawImage(image, 0, 0);
  const raster = context.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = extractPieceBoundsFromRaster({
    data: raster.data,
    width: raster.width,
    height: raster.height,
  });

  if (!bounds.length) {
    return [];
  }

  return Promise.all(bounds.map((bound) => cropBoundsToDataUrl(image, bound)));
};