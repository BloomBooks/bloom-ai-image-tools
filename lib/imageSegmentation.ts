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

type ExtractPieceBoundsOptions = {
  preferSeparatedSubjects?: boolean;
};

const ALPHA_BACKGROUND_THRESHOLD = 24;
const WHITE_BACKGROUND_THRESHOLD = 242;
const WHITE_SPREAD_THRESHOLD = 20;
const SPLIT_OUTPUT_MARGIN_PX = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isBackgroundPixel = (data: Uint8ClampedArray, pixelIndex: number): boolean => {
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

const createForegroundMask = ({ data, width, height }: RasterImageData): Uint8Array => {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const pixelIndex = index * 4;
    if (!isBackgroundPixel(data, pixelIndex)) {
      mask[index] = 1;
    }
  }
  return mask;
};

export const extractOpaqueBoundsFromRaster = (
  raster: RasterImageData,
  alphaThreshold = ALPHA_BACKGROUND_THRESHOLD,
): Bounds | null => {
  const { data, width, height } = raster;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      if (data[pixelIndex + 3] <= alphaThreshold) {
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return { left, top, right, bottom };
};

const countForeground = (mask: Uint8Array, width: number, bounds: Bounds): number => {
  let count = 0;
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    const rowOffset = y * width;
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      count += mask[rowOffset + x];
    }
  }
  return count;
};

const collectBoundedAxisCounts = (
  mask: Uint8Array,
  width: number,
  bounds: Bounds,
  axis: "row" | "column",
): number[] => {
  if (axis === "row") {
    const counts = Array.from<number>({ length: bounds.bottom - bounds.top + 1 }).fill(0);
    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      const rowOffset = y * width;
      let count = 0;
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        count += mask[rowOffset + x];
      }
      counts[y - bounds.top] = count;
    }
    return counts;
  }

  const counts = Array.from<number>({ length: bounds.right - bounds.left + 1 }).fill(0);
  for (let x = bounds.left; x <= bounds.right; x += 1) {
    let count = 0;
    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      count += mask[y * width + x];
    }
    counts[x - bounds.left] = count;
  }
  return counts;
};

const collectAxisCounts = (
  mask: Uint8Array,
  width: number,
  height: number,
  axis: "row" | "column",
): number[] => {
  if (axis === "row") {
    const counts = Array.from<number>({ length: height }).fill(0);
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

  const counts = Array.from<number>({ length: width }).fill(0);
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

const detectGridBounds = (mask: Uint8Array, width: number, height: number): Bounds[] => {
  const rowCounts = collectAxisCounts(mask, width, height, "row");
  const columnCounts = collectAxisCounts(mask, width, height, "column");
  const rowThreshold = Math.max(2, Math.floor(width * 0.008));
  const maxColumnCount = columnCounts.reduce(
    (highest, count) => Math.max(highest, count),
    0,
  );
  const columnThreshold = Math.max(
    2,
    Math.floor(height * 0.008),
    Math.ceil(maxColumnCount * 0.08),
  );
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

const trimBoundsToForeground = (
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Bounds,
): Bounds | null => {
  let left = bounds.right + 1;
  let top = bounds.bottom + 1;
  let right = bounds.left - 1;
  let bottom = bounds.top - 1;

  const clampedLeft = clamp(bounds.left, 0, width - 1);
  const clampedTop = clamp(bounds.top, 0, height - 1);
  const clampedRight = clamp(bounds.right, 0, width - 1);
  const clampedBottom = clamp(bounds.bottom, 0, height - 1);

  for (let y = clampedTop; y <= clampedBottom; y += 1) {
    const rowOffset = y * width;
    for (let x = clampedLeft; x <= clampedRight; x += 1) {
      if (!mask[rowOffset + x]) {
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return { left, top, right, bottom };
};

const findBestGapRange = (counts: number[]): { start: number; end: number } | null => {
  if (counts.length < 6) {
    return null;
  }

  const maxCount = counts.reduce((highest, count) => Math.max(highest, count), 0);
  if (maxCount <= 0) {
    return null;
  }

  const lowCountThreshold = Math.max(1, Math.ceil(maxCount * 0.16));
  const minimumGap = Math.max(2, Math.floor(counts.length * 0.04));
  let best: { start: number; end: number; score: number } | null = null;
  let gapStart = -1;

  for (let index = 0; index <= counts.length; index += 1) {
    const isLow = index < counts.length && counts[index] <= lowCountThreshold;
    if (isLow) {
      if (gapStart < 0) {
        gapStart = index;
      }
      continue;
    }

    if (gapStart < 0) {
      continue;
    }

    const gapEnd = index - 1;
    const gapWidth = gapEnd - gapStart + 1;
    const touchesEdge = gapStart === 0 || gapEnd === counts.length - 1;
    if (!touchesEdge && gapWidth >= minimumGap) {
      const averageCount = counts
        .slice(gapStart, gapEnd + 1)
        .reduce((total, count) => total + count, 0) / gapWidth;
      const score = gapWidth * (lowCountThreshold + 1) - averageCount;
      if (!best || score > best.score) {
        best = { start: gapStart, end: gapEnd, score };
      }
    }

    gapStart = -1;
  }

  return best ? { start: best.start, end: best.end } : null;
};

const trySplitBoundsByWhitespace = (
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Bounds,
  axis: "row" | "column",
): Bounds[] | null => {
  const counts = collectBoundedAxisCounts(mask, width, bounds, axis);
  const gap = findBestGapRange(counts);
  if (!gap) {
    return null;
  }

  const totalForeground = countForeground(mask, width, bounds);
  const minimumChildPixels = Math.max(48, Math.floor(totalForeground * 0.18));

  const firstCandidate =
    axis === "column"
      ? {
          left: bounds.left,
          top: bounds.top,
          right: bounds.left + gap.start - 1,
          bottom: bounds.bottom,
        }
      : {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.top + gap.start - 1,
        };
  const secondCandidate =
    axis === "column"
      ? {
          left: bounds.left + gap.end + 1,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
        }
      : {
          left: bounds.left,
          top: bounds.top + gap.end + 1,
          right: bounds.right,
          bottom: bounds.bottom,
        };

  const first = trimBoundsToForeground(mask, width, height, firstCandidate);
  const second = trimBoundsToForeground(mask, width, height, secondCandidate);
  if (!first || !second) {
    return null;
  }

  const firstWidth = first.right - first.left + 1;
  const firstHeight = first.bottom - first.top + 1;
  const secondWidth = second.right - second.left + 1;
  const secondHeight = second.bottom - second.top + 1;
  const minimumChildSpan =
    axis === "column"
      ? Math.max(8, Math.floor((bounds.right - bounds.left + 1) * 0.14))
      : Math.max(8, Math.floor((bounds.bottom - bounds.top + 1) * 0.18));

  if (
    (axis === "column" &&
      (firstWidth < minimumChildSpan || secondWidth < minimumChildSpan)) ||
    (axis === "row" &&
      (firstHeight < minimumChildSpan || secondHeight < minimumChildSpan))
  ) {
    return null;
  }

  if (
    countForeground(mask, width, first) < minimumChildPixels ||
    countForeground(mask, width, second) < minimumChildPixels
  ) {
    return null;
  }

  return [first, second];
};

const recursivelySplitBounds = (
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Bounds,
  depth = 0,
): Bounds[] => {
  if (depth >= 8) {
    return [bounds];
  }

  const verticalSplit = trySplitBoundsByWhitespace(mask, width, height, bounds, "column");
  if (verticalSplit) {
    return verticalSplit.flatMap((candidate) =>
      recursivelySplitBounds(mask, width, height, candidate, depth + 1),
    );
  }

  const horizontalSplit = trySplitBoundsByWhitespace(mask, width, height, bounds, "row");
  if (horizontalSplit) {
    return horizontalSplit.flatMap((candidate) =>
      recursivelySplitBounds(mask, width, height, candidate, depth + 1),
    );
  }

  return [bounds];
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
    visited[index] = 1;
    const queue = [index];
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

const sortBoundsInReadingOrder = (bounds: Bounds[]): Bounds[] =>
  [...bounds].sort((a, b) => {
    const aHeight = a.bottom - a.top + 1;
    const bHeight = b.bottom - b.top + 1;
    const rowTolerance = Math.max(8, Math.floor(Math.min(aHeight, bHeight) * 0.25));
    if (Math.abs(a.top - b.top) <= rowTolerance) {
      return a.left - b.left;
    }
    if (a.top !== b.top) {
      return a.top - b.top;
    }
    return a.left - b.left;
  });

const filterThinArtifactBounds = (bounds: Bounds[]): Bounds[] => {
  if (bounds.length < 2) {
    return bounds;
  }

  const largestArea = bounds.reduce((largest, bound) => {
    const area = (bound.right - bound.left + 1) * (bound.bottom - bound.top + 1);
    return Math.max(largest, area);
  }, 0);

  const filtered = bounds.filter((bound) => {
    const width = bound.right - bound.left + 1;
    const height = bound.bottom - bound.top + 1;
    const shorterSide = Math.min(width, height);
    const longerSide = Math.max(width, height);
    const area = width * height;
    const isThinStrip = shorterSide <= Math.max(6, Math.floor(longerSide * 0.08));
    return !(isThinStrip && area < largestArea * 0.35);
  });

  const withoutWideLowerBands = filtered.filter((bound, index, allBounds) => {
    const others = allBounds.filter((_, otherIndex) => otherIndex !== index);
    if (others.length < 2) {
      return true;
    }

    const width = bound.right - bound.left + 1;
    const height = bound.bottom - bound.top + 1;
    const maxOtherWidth = others.reduce(
      (largest, other) => Math.max(largest, other.right - other.left + 1),
      0,
    );
    const averageOtherHeight =
      others.reduce((total, other) => total + (other.bottom - other.top + 1), 0) /
      others.length;
    const overlapCount = others.filter((other) =>
      rangesOverlap(bound.left, bound.right, other.left, other.right, 0),
    ).length;
    const lowestComparableBottom = others.reduce(
      (lowest, other) => Math.min(lowest, other.bottom),
      Number.POSITIVE_INFINITY,
    );
    const isWideLowerBand =
      width >= maxOtherWidth * 2.5 &&
      height <= averageOtherHeight * 2.2 &&
      overlapCount >= 2 &&
      bound.top >= lowestComparableBottom - Math.max(12, Math.floor(averageOtherHeight * 0.2));

    return !isWideLowerBand;
  });

  return withoutWideLowerBands.length ? withoutWideLowerBands : filtered.length ? filtered : bounds;
};

export const extractPieceBoundsFromRaster = (
  raster: RasterImageData,
  options: ExtractPieceBoundsOptions = {},
): Bounds[] => {
  const { width, height } = raster;
  if (!width || !height) {
    return [];
  }

  const mask = createForegroundMask(raster);
  const gridBounds = detectGridBounds(mask, width, height);
  const componentBounds = detectConnectedComponentBounds(mask, width, height);

  if (options.preferSeparatedSubjects) {
    const overallBounds = trimBoundsToForeground(mask, width, height, {
      left: 0,
      top: 0,
      right: width - 1,
      bottom: height - 1,
    });
    const recursiveBounds = overallBounds
      ? recursivelySplitBounds(mask, width, height, overallBounds)
      : [];
    const preferredBounds =
      recursiveBounds.length > componentBounds.length
        ? recursiveBounds
        : componentBounds.length > gridBounds.length
          ? componentBounds
          : gridBounds.length > 1
            ? gridBounds
            : componentBounds;
    return sortBoundsInReadingOrder(filterThinArtifactBounds(preferredBounds));
  }

  if (componentBounds.length > gridBounds.length) {
    return sortBoundsInReadingOrder(componentBounds);
  }

  if (gridBounds.length > 1) {
    return sortBoundsInReadingOrder(gridBounds);
  }

  return sortBoundsInReadingOrder(componentBounds);
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for segmentation."));
    image.src = dataUrl;
  });

const createMarginCanvas = (
  sourceCanvas: HTMLCanvasElement,
  margin: number,
): HTMLCanvasElement => {
  if (margin <= 0) {
    return sourceCanvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width + margin * 2;
  canvas.height = sourceCanvas.height + margin * 2;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable for segmentation margin.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, margin, margin);
  return canvas;
};

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

  const opaqueBounds = extractOpaqueBoundsFromRaster({
    data: imageData.data,
    width: cropWidth,
    height: cropHeight,
  });

  if (!opaqueBounds) {
    return canvas.toDataURL("image/png");
  }

  const trimmedWidth = opaqueBounds.right - opaqueBounds.left + 1;
  const trimmedHeight = opaqueBounds.bottom - opaqueBounds.top + 1;
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedContext = trimmedCanvas.getContext("2d");
  if (!trimmedContext) {
    throw new Error("Canvas context unavailable for segmentation trim.");
  }

  trimmedContext.drawImage(
    canvas,
    opaqueBounds.left,
    opaqueBounds.top,
    trimmedWidth,
    trimmedHeight,
    0,
    0,
    trimmedWidth,
    trimmedHeight,
  );

  return createMarginCanvas(trimmedCanvas, SPLIT_OUTPUT_MARGIN_PX).toDataURL("image/png");
};

export const segmentImageIntoPieces = async (
  imageData: string,
  options: ExtractPieceBoundsOptions = {},
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
  }, options);

  if (!bounds.length) {
    return [];
  }

  return Promise.all(bounds.map((bound) => cropBoundsToDataUrl(image, bound)));
};
