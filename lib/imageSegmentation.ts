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
  /**
   * Return connected-component pieces directly (skip the grid-vs-component
   * heuristic). Used for clean panel grids where each panel is one illustration.
   */
  preferComponents?: boolean;
  /**
   * Merge components whose bounding boxes are within this fraction of the image
   * long edge of each other. Absorbs hairline gaps inside a single panel (a
   * figure + a nearby prop) without merging panels, which sit far apart thanks
   * to the large white gutters between them.
   */
  componentMergeMarginRatio?: number;
  /**
   * Force exactly this many pieces (used with preferComponents). When more
   * components are found than wanted, the closest pairs are merged first — those
   * are a panel's own fragments, since panels are separated by wide gutters — so
   * the result lands on the known panel count instead of an over-split mess.
   */
  targetPieceCount?: number;
  /**
   * Detect explicit magenta (#FF00FF) frame rectangles the generator was asked
   * to draw around each illustration, and split on those instead of inferring
   * panels from whitespace. Far more reliable when present: the frame count is
   * explicit and magenta never occurs in the artwork. Returns the frames when at
   * least two are found; otherwise yields nothing so the caller can fall back to
   * whitespace/component splitting.
   */
  detectColoredFrames?: boolean;
};

const ALPHA_BACKGROUND_THRESHOLD = 24;
const WHITE_BACKGROUND_THRESHOLD = 242;
const WHITE_SPREAD_THRESHOLD = 20;
const SPLIT_OUTPUT_MARGIN_PX = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

// Detects the pure-magenta (#FF00FF) frame borders the break-comic generator is
// asked to draw. Tolerant of compression/anti-aliasing drift (the rendered line
// is rarely exactly 255/0/255) but tight enough to exclude pink/purple artwork
// such as the germ characters: red and blue must both be high while green stays
// low, with a wide red-to-green and blue-to-green margin.
const isMagentaPixel = (data: Uint8ClampedArray, pixelIndex: number): boolean => {
  if (data[pixelIndex + 3] <= ALPHA_BACKGROUND_THRESHOLD) {
    return false;
  }
  const red = data[pixelIndex];
  const green = data[pixelIndex + 1];
  const blue = data[pixelIndex + 2];
  return red >= 160 && blue >= 160 && green <= 120 && red - green >= 80 && blue - green >= 80;
};

// Looser test used when ERASING the frame from a crop (not when detecting it).
// A thin magenta line anti-aliases into a magenta→white halo whose pixels are
// too light for the strict detector, leaving a faint ring if only the core is
// removed. In any magenta/white blend red and blue stay high and near-equal
// while green dips below both; real pink/purple artwork (the germ characters)
// has red well above blue, so the |red − blue| ≤ 70 guard spares it.
export const isMagentaishPixel = (data: Uint8ClampedArray, pixelIndex: number): boolean => {
  if (data[pixelIndex + 3] <= ALPHA_BACKGROUND_THRESHOLD) {
    return false;
  }
  const red = data[pixelIndex];
  const green = data[pixelIndex + 1];
  const blue = data[pixelIndex + 2];
  return (
    red >= 150 && blue >= 150 && green <= Math.min(red, blue) - 25 && Math.abs(red - blue) <= 70
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
  const maxColumnCount = columnCounts.reduce((highest, count) => Math.max(highest, count), 0);
  const columnThreshold = Math.max(2, Math.floor(height * 0.008), Math.ceil(maxColumnCount * 0.08));
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

// Build one cell interval per content range along an axis, cutting at the
// midpoint of each whitespace gutter. Outer edges are trimmed to the content
// extent (not the sheet edge) so uneven outer margins don't skew the cells.
const buildCellIntervals = (
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> => {
  const intervals: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < ranges.length; index += 1) {
    const start =
      index === 0
        ? ranges[0].start
        : Math.floor((ranges[index - 1].end + 1 + ranges[index].start) / 2);
    const end =
      index === ranges.length - 1
        ? ranges[index].end
        : Math.floor((ranges[index].end + 1 + ranges[index + 1].start) / 2) - 1;
    intervals.push({ start, end });
  }
  return intervals;
};

// Candidate row/column layouts for a sprite sheet requested with `frameCount`
// frames. Deliberately NOT limited to grids that hold exactly that count: the
// generator sometimes draws a different grid than asked (e.g. 4x4 when told
// 2x6), and cutting the grid it actually drew — verified by the damage check —
// beats failing over to content inference. Capped at 8x8 / twice the requested
// count to keep the search sane.
const gridLayoutCandidates = (frameCount: number): Array<{ rows: number; columns: number }> => {
  const layouts: Array<{ rows: number; columns: number }> = [];
  const maxCells = Math.max(frameCount * 2, 24);
  for (let rows = 1; rows <= 8; rows += 1) {
    for (let columns = 1; columns <= 8; columns += 1) {
      const cells = rows * columns;
      if (cells >= 2 && cells <= maxCells) {
        layouts.push({ rows, columns });
      }
    }
  }
  return layouts;
};

// For one axis, find the global shift of an evenly-pitched set of cut lines
// that crosses the least foreground. A compliant sheet has whitespace gutters
// at the uniform-pitch positions, so the best shift's "damage" is ~zero; a
// non-compliant sheet forces every candidate line through artwork. A line
// whose foreground spans (nearly) the whole perpendicular extent is a DRAWN
// grid divider, not artwork — models sometimes draw the grid despite being
// told not to — and marks exactly where to cut, so it costs nothing.
const bestUniformCuts = (
  counts: number[],
  parts: number,
  perpendicularExtent: number,
): { positions: number[]; damage: number; maxLineDamage: number } => {
  const extent = counts.length;
  const pitch = extent / parts;
  if (parts <= 1) {
    return { positions: [], damage: 0, maxLineDamage: 0 };
  }

  // A divider is a THIN full-length line: near-full perpendicular coverage
  // AND part of a short run of such positions. Without the thickness cap, any
  // solid drawing spanning the sheet would zero out cuts straight through it.
  const dividerThreshold = Math.max(1, Math.floor(perpendicularExtent * 0.9));
  const maxDividerThickness = Math.max(4, Math.round(extent * 0.006));
  const isDivider = new Uint8Array(extent);
  for (let index = 0; index < extent; index += 1) {
    if (counts[index] < dividerThreshold) {
      continue;
    }
    let runEnd = index;
    while (runEnd + 1 < extent && counts[runEnd + 1] >= dividerThreshold) {
      runEnd += 1;
    }
    if (runEnd - index + 1 <= maxDividerThickness) {
      isDivider.fill(1, index, runEnd + 1);
    }
    index = runEnd;
  }
  const sampleAt = (position: number) => (isDivider[position] ? 0 : counts[position]);
  const sampleLine = (position: number) =>
    sampleAt(position - 1) + sampleAt(position) + sampleAt(position + 1);
  const searchRadius = Math.max(2, Math.floor(pitch * 0.1));
  let best: {
    positions: number[];
    damage: number;
    maxLineDamage: number;
    distance: number;
  } | null = null;
  for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
    const positions: number[] = [];
    let damage = 0;
    let maxLineDamage = 0;
    for (let part = 1; part < parts; part += 1) {
      const line = Math.round(offset + part * pitch);
      if (line < 1 || line > extent - 2) {
        damage = Number.POSITIVE_INFINITY;
        break;
      }
      positions.push(line);
      const lineDamage = sampleLine(line);
      damage += lineDamage;
      maxLineDamage = Math.max(maxLineDamage, lineDamage);
    }
    // Among equally clean offsets prefer the one closest to the exact pitch
    // positions: a compliant sheet then cuts on its true grid instead of
    // wherever a wide gutter happens to allow.
    const distance = Math.abs(offset);
    if (
      best === null ||
      damage < best.damage ||
      (damage === best.damage && distance < best.distance)
    ) {
      best = { positions, damage, maxLineDamage, distance };
    }
  }
  return best
    ? { positions: best.positions, damage: best.damage, maxLineDamage: best.maxLineDamage }
    : { positions: [], damage: Number.POSITIVE_INFINITY, maxLineDamage: Number.POSITIVE_INFINITY };
};

// Cut a sprite sheet into `frameCount` equal cells along the uniform grid the
// generation prompt mandates. Unlike content-based inference this is immune to
// subjects that split into several pieces inside one frame (a hat blowing off a
// head created extra whitespace boundaries and shredded the sheet into 15
// "cells"): the cut lines come from the requested layout, and the content is
// only used to (a) nudge the lines onto the gutters and (b) verify the sheet
// really is a compliant grid — when the cheapest cut lines still cross real
// artwork, the sheet doesn't match the layout and [] is returned so the caller
// can fall back. Cells are uniform, so stacked frames stay registered exactly.
export const computeUniformGridCellBoundsFromRaster = (
  raster: RasterImageData,
  frameCount: number,
): Bounds[] => {
  const { width, height } = raster;
  if (!width || !height || frameCount < 2) {
    return [];
  }

  const mask = createForegroundMask(raster);
  const rowCounts = collectAxisCounts(mask, width, height, "row");
  const columnCounts = collectAxisCounts(mask, width, height, "column");
  const totalForeground = rowCounts.reduce((total, count) => total + count, 0);
  if (!totalForeground) {
    return [];
  }

  const minimumCellPixels = Math.max(48, Math.floor(width * height * 0.0004));
  const collectCells = (rowCuts: number[], columnCuts: number[]): Bounds[] => {
    const rowEdges = [0, ...rowCuts, height];
    const columnEdges = [0, ...columnCuts, width];
    const cells: Bounds[] = [];
    for (let row = 0; row < rowEdges.length - 1; row += 1) {
      for (let column = 0; column < columnEdges.length - 1; column += 1) {
        const candidate = {
          left: columnEdges[column],
          top: rowEdges[row],
          right: columnEdges[column + 1] - 1,
          bottom: rowEdges[row + 1] - 1,
        };
        if (countForeground(mask, width, candidate) >= minimumCellPixels) {
          cells.push(candidate);
        }
      }
    }
    return cells;
  };

  // The cut lines sample 3px each; thin stray marks (wind lines) crossing a
  // gutter are tolerable, artwork is not. Above 2% of the sheet's foreground
  // on the cuts, the layout doesn't match the sheet at all. Several layouts
  // can pass (a clean 2x4 sheet also cuts cleanly as 1x8 when subjects and
  // their detached props alternate, and as 2x2 pairs), so rank the passing
  // layouts: genuinely clean cuts beat merely-tolerable ones (never slice
  // artwork just to hit the requested count), then the non-empty cell count
  // closest to the requested frame count, then the FINER grid (so a drawn 4x4
  // isn't halved into stacked pairs when both cut cleanly), then least damage.
  const damageLimit = totalForeground * 0.02;
  const cleanLimit = totalForeground * 0.002;
  // Per-cut ceiling: a genuine gutter cut costs ~nothing (thin stray marks at
  // most), while a cut through the subject costs hundreds of pixels. Without
  // this, a layout with few cuts can slice straight through artwork and still
  // fit under the TOTAL damage budget.
  const perCutLimit = Math.max(6, totalForeground * 0.001);
  let best: {
    cells: Bounds[];
    damage: number;
    cleanRank: number;
    countMiss: number;
  } | null = null;
  for (const layout of gridLayoutCandidates(frameCount)) {
    const rowResult = bestUniformCuts(rowCounts, layout.rows, width);
    const columnResult = bestUniformCuts(columnCounts, layout.columns, height);
    const damage = rowResult.damage + columnResult.damage;
    if (
      damage > damageLimit ||
      Math.max(rowResult.maxLineDamage, columnResult.maxLineDamage) > perCutLimit
    ) {
      continue;
    }
    const cells = collectCells(rowResult.positions, columnResult.positions);
    if (cells.length < 2) {
      continue;
    }
    const cleanRank = damage <= cleanLimit ? 0 : 1;
    const countMiss = Math.abs(cells.length - frameCount);
    const isBetter =
      !best ||
      cleanRank < best.cleanRank ||
      (cleanRank === best.cleanRank &&
        (countMiss < best.countMiss ||
          (countMiss === best.countMiss &&
            (cells.length > best.cells.length ||
              (cells.length === best.cells.length && damage < best.damage)))));
    if (isBetter) {
      best = { cells, damage, cleanRank, countMiss };
    }
  }

  return best?.cells ?? [];
};

// Compute the uniform grid cells of a sprite sheet WITHOUT trimming each cell
// to its content. Animation frames are drawn registered against their cell
// (the GIF prompt anchors the subject inside every frame), so the cell
// rectangle — not the foreground bounding box — is what keeps frames aligned
// when they are stacked into a GIF. Cells are the full spans between gutter
// midpoints; empty grid positions are dropped. Returns cells in reading order.
export const computeGridCellBoundsFromRaster = (raster: RasterImageData): Bounds[] => {
  const { width, height } = raster;
  if (!width || !height) {
    return [];
  }

  const mask = createForegroundMask(raster);
  const rowCounts = collectAxisCounts(mask, width, height, "row");
  const columnCounts = collectAxisCounts(mask, width, height, "column");
  const maxRowCount = rowCounts.reduce((highest, count) => Math.max(highest, count), 0);
  const maxColumnCount = columnCounts.reduce((highest, count) => Math.max(highest, count), 0);
  // The 8%-of-peak term lets a limb poking into a gutter still read as
  // background, so an extended arm doesn't fuse two neighboring frames.
  const rowThreshold = Math.max(2, Math.floor(width * 0.008), Math.ceil(maxRowCount * 0.08));
  const columnThreshold = Math.max(2, Math.floor(height * 0.008), Math.ceil(maxColumnCount * 0.08));
  const rowGap = Math.max(2, Math.floor(height * 0.008));
  const columnGap = Math.max(2, Math.floor(width * 0.008));
  const rowRanges = detectActiveRanges(rowCounts, rowThreshold, rowGap);
  const columnRanges = detectActiveRanges(columnCounts, columnThreshold, columnGap);
  if (!rowRanges.length || !columnRanges.length) {
    return [];
  }

  const rowIntervals = buildCellIntervals(rowRanges);
  const columnIntervals = buildCellIntervals(columnRanges);
  const minimumCellPixels = Math.max(48, Math.floor(width * height * 0.0004));
  const cells: Bounds[] = [];
  rowIntervals.forEach((row) => {
    columnIntervals.forEach((column) => {
      const candidate = {
        left: column.start,
        top: row.start,
        right: column.end,
        bottom: row.end,
      };
      if (countForeground(mask, width, candidate) >= minimumCellPixels) {
        cells.push(candidate);
      }
    });
  });

  return cells;
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
      const averageCount =
        counts.slice(gapStart, gapEnd + 1).reduce((total, count) => total + count, 0) / gapWidth;
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
    (axis === "column" && (firstWidth < minimumChildSpan || secondWidth < minimumChildSpan)) ||
    (axis === "row" && (firstHeight < minimumChildSpan || secondHeight < minimumChildSpan))
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
  mergeMargin = 1,
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
      others.reduce((total, other) => total + (other.bottom - other.top + 1), 0) / others.length;
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

const boundsGap = (a: Bounds, b: Bounds): number => {
  const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return Math.hypot(dx, dy);
};

// Repeatedly merge the two closest bounding boxes until `target` remain. With
// wide gutters between panels, the closest pairs are a panel's own fragments,
// so this collapses an over-split result onto the known panel count.
const mergeNearestUntil = (bounds: Bounds[], target: number): Bounds[] => {
  const items = bounds.map((b) => ({ ...b }));
  while (items.length > target) {
    let bestI = 0;
    let bestJ = 1;
    let bestGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const gap = boundsGap(items[i], items[j]);
        if (gap < bestGap) {
          bestGap = gap;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const a = items[bestI];
    const b = items[bestJ];
    const merged: Bounds = {
      left: Math.min(a.left, b.left),
      top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right),
      bottom: Math.max(a.bottom, b.bottom),
    };
    items.splice(bestJ, 1);
    items.splice(bestI, 1);
    items.push(merged);
  }
  return items;
};

// Repeatedly split the largest splittable box at its cleanest whitespace gutter
// until `target` pieces exist. The mirror of mergeNearestUntil: when connected
// components UNDER-split (two panels bridged across a thin gutter become one
// blob), this recovers the known panel count. Merged panels are the widest
// boxes, so splitting the largest first targets them; trySplitBoundsByWhitespace
// only cuts at a genuine gutter (minimum child span/pixels enforced), so a
// single legitimate panel is left intact and we stop short of `target` rather
// than carve a real picture in two.
const splitWidestUntil = (
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: Bounds[],
  target: number,
): Bounds[] => {
  const items = bounds.map((b) => ({ ...b }));
  while (items.length < target) {
    let bestIndex = -1;
    let bestSplit: Bounds[] | null = null;
    let bestArea = -1;
    for (let i = 0; i < items.length; i += 1) {
      const split =
        trySplitBoundsByWhitespace(mask, width, height, items[i], "column") ??
        trySplitBoundsByWhitespace(mask, width, height, items[i], "row");
      if (!split) {
        continue;
      }
      const area = (items[i].right - items[i].left + 1) * (items[i].bottom - items[i].top + 1);
      if (area > bestArea) {
        bestArea = area;
        bestIndex = i;
        bestSplit = split;
      }
    }
    if (bestIndex < 0 || !bestSplit) {
      // No box has a clean gutter left — stop rather than force a bad cut.
      break;
    }
    items.splice(bestIndex, 1, ...bestSplit);
  }
  return items;
};

// Find the magenta frame rectangles drawn around each illustration. Each frame
// is a (mostly hollow) rectangular outline, so we flood-fill the magenta mask
// into connected components and keep those that look like a frame: spanning a
// real share of the page and hollow (an outline, not a filled magenta blob). The
// returned bounds are the OUTER extent of each frame; cropping strips the
// magenta line and trims to the artwork inside.
export const detectMagentaFrameBounds = (raster: RasterImageData): Bounds[] => {
  const { data, width, height } = raster;
  if (!width || !height) {
    return [];
  }

  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    if (isMagentaPixel(data, index * 4)) {
      mask[index] = 1;
    }
  }

  const visited = new Uint8Array(mask.length);
  const minFrameWidth = Math.max(16, Math.floor(width * 0.05));
  const minFrameHeight = Math.max(16, Math.floor(height * 0.05));
  const minFrameArea = width * height * 0.01;
  const frames: Bounds[] = [];

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

    const frameWidth = right - left + 1;
    const frameHeight = bottom - top + 1;
    const boxArea = frameWidth * frameHeight;
    const fillRatio = pixels / boxArea;
    // Keep substantial, hollow rectangles (a thin outline fills a small
    // fraction of its box); reject small flecks and any solid magenta blob.
    if (
      frameWidth >= minFrameWidth &&
      frameHeight >= minFrameHeight &&
      boxArea >= minFrameArea &&
      fillRatio < 0.5
    ) {
      frames.push({ left, top, right, bottom });
    }
  }

  return sortBoundsInReadingOrder(frames);
};

export const extractPieceBoundsFromRaster = (
  raster: RasterImageData,
  options: ExtractPieceBoundsOptions = {},
): Bounds[] => {
  if (options.detectColoredFrames) {
    // Dedicated "frames or nothing" mode: explicit magenta frames are
    // authoritative when the generator drew them; fewer than two means it
    // didn't cooperate, so we return nothing and let the caller fall back to
    // whitespace/component inference on the background-removed sheet.
    const frames = detectMagentaFrameBounds(raster);
    return frames.length >= 2 ? frames : [];
  }

  const { width, height } = raster;
  if (!width || !height) {
    return [];
  }

  const mask = createForegroundMask(raster);
  const componentMergeMargin = options.componentMergeMarginRatio
    ? Math.max(1, Math.round(Math.max(width, height) * options.componentMergeMarginRatio))
    : 1;
  const gridBounds = detectGridBounds(mask, width, height);
  const componentBounds = detectConnectedComponentBounds(mask, width, height, componentMergeMargin);

  if (options.preferComponents) {
    // Each panel is one illustration; large white gutters keep panels apart
    // while the merge margin absorbs hairline gaps inside a panel. If we know
    // the panel count, reconcile the components onto it in BOTH directions:
    // collapse over-split fragments down, and split under-split (bridged) panels
    // back up along their whitespace gutters. The component count varies run to
    // run, so this is what makes the piece count match the caption count.
    const target = options.targetPieceCount;
    let reconciled = componentBounds;
    if (target && componentBounds.length > target) {
      reconciled = mergeNearestUntil(componentBounds, target);
    } else if (target && componentBounds.length < target) {
      reconciled = splitWidestUntil(mask, width, height, componentBounds, target);
    }
    return sortBoundsInReadingOrder(reconciled);
  }

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

const createMarginCanvas = (sourceCanvas: HTMLCanvasElement, margin: number): HTMLCanvasElement => {
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

const cropBoundsToDataUrl = async (image: HTMLImageElement, bounds: Bounds): Promise<string> => {
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
    // Drop the white/transparent background AND any magenta frame border
    // (including its anti-aliased halo, hence the looser test), so a bordered
    // panel trims down to just its artwork. Magenta never appears in the
    // artwork itself, so this is safe for every tool.
    if (
      isBackgroundPixel(imageData.data, pixelIndex) ||
      isMagentaishPixel(imageData.data, pixelIndex)
    ) {
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

// Drop grid cells whose frame the generator failed to draw. A cell holding
// only a stray prop or fragment (e.g. the sheet where the boy simply vanished
// for three frames, leaving just the hat) makes the subject blink out of the
// animation. The median cell is subject-sized even when several frames
// failed, so anything far below it is a failed frame, not a smaller pose.
export const dropSparseGridCells = (raster: RasterImageData, cellBounds: Bounds[]): Bounds[] => {
  if (cellBounds.length < 3) {
    return cellBounds;
  }
  const mask = createForegroundMask(raster);
  const areas = cellBounds.map((bounds) => countForeground(mask, raster.width, bounds));
  const sorted = [...areas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const kept = cellBounds.filter((_, index) => areas[index] >= median * 0.25);
  return kept.length >= 2 ? kept : cellBounds;
};

// Find DRAWN grid divider lines on the whole sheet: thin runs whose coverage
// approaches the full perpendicular extent. At sheet level this is unambiguous
// (a divider crosses every row band; artwork never does), unlike per-frame
// detection where projections of subject, bleed, and line all overlap. The
// isolation check guards single-row sheets, where a standing subject's torso
// can also reach high coverage — but its neighbors do too, while a divider
// stands alone.
const findSheetDividerRuns = (
  counts: number[],
  perpendicularExtent: number,
): Array<{ start: number; end: number }> => {
  const extent = counts.length;
  const threshold = Math.max(8, Math.floor(perpendicularExtent * 0.7));
  const maxThickness = Math.max(8, Math.round(extent * 0.01));
  const runs: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < extent; index += 1) {
    if (counts[index] < threshold) {
      continue;
    }
    let runEnd = index;
    let peak = counts[index];
    while (runEnd + 1 < extent && counts[runEnd + 1] >= threshold) {
      runEnd += 1;
      peak = Math.max(peak, counts[runEnd]);
    }
    const thin = runEnd - index + 1 <= maxThickness;
    const beforeCount = counts[Math.max(0, index - 4)];
    const afterCount = counts[Math.min(extent - 1, runEnd + 4)];
    const isolated = beforeCount <= peak * 0.3 && afterCount <= peak * 0.3;
    if (thin && isolated) {
      runs.push({ start: index, end: runEnd });
    }
    index = runEnd;
  }
  return runs;
};

// Erase fragments of NEIGHBORING frames that ride along inside a cell crop.
// The cut line sits in the gutter, but a subject leaning toward it can end a
// few pixels past it — the neighbor's shoulder/arm then shows as a narrow
// strip hugging the frame's left or right edge and flashes in the animation.
// Signature: a connected foreground component that touches a vertical edge,
// stays within a narrow edge band, and is far smaller than the frame's main
// subject. (An object exiting the frame mid-action matches too and vanishes
// one frame early — harmless next to a foreign body part flashing.) Mutates
// the raster in place; returns how many components were erased.
export const eraseEdgeIntrudersFromFrameRaster = (raster: RasterImageData): number => {
  const { data, width, height } = raster;
  const mask = createForegroundMask(raster);
  const visited = new Uint8Array(mask.length);
  type Component = { pixels: number[]; left: number; right: number };
  const components: Component[] = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue;
    }
    visited[index] = 1;
    const queue = [index];
    const pixels: number[] = [];
    let left = index % width;
    let right = left;
    while (queue.length) {
      const current = queue.pop() as number;
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
            continue;
          }
          const nextIndex = nextY * width + nextX;
          if (mask[nextIndex] && !visited[nextIndex]) {
            visited[nextIndex] = 1;
            queue.push(nextIndex);
          }
        }
      }
    }
    components.push({ pixels, left, right });
  }

  const largestArea = components.reduce((largest, c) => Math.max(largest, c.pixels.length), 0);
  const maxBandWidth = Math.max(4, Math.floor(width * 0.18));
  // "Touching" needs slack: the edge inset and anti-aliasing shave the
  // outermost pixels off a bleed fragment, leaving it a few px shy of the
  // frame edge.
  const edgeSlack = Math.max(5, Math.round(width * 0.02));
  let erasedCount = 0;
  for (const component of components) {
    const touchesEdge = component.left <= edgeSlack || component.right >= width - 1 - edgeSlack;
    const bandWidth = component.right - component.left + 1;
    if (!touchesEdge || bandWidth > maxBandWidth || component.pixels.length > largestArea * 0.25) {
      continue;
    }
    for (const pixel of component.pixels) {
      data[pixel * 4 + 3] = 0;
    }
    erasedCount += 1;
  }
  return erasedCount;
};

export type GridFrameLayout = {
  frameWidth: number;
  frameHeight: number;
  windows: Array<{
    left: number;
    top: number;
    right: number;
    bottom: number;
    destX: number;
    destY: number;
  }>;
};

// Turn grid cells into per-frame crop windows with row-baseline registration.
// Some generators anchor their rows to the canvas (uniform cells), others
// center a block of content bands inside arbitrary margins — cutting those on
// the uniform grid leaves each row's subject at a different height inside its
// cell, and the GIF bounces at every row change. The one vertical invariant
// the generation prompt guarantees is the ground line, and within a row it is
// pixel-exact (all cells share the row's cut), so: find each row's foreground
// baseline and anchor every frame's crop window a fixed distance above it.
// Horizontal stays grid-anchored (there is no horizontal invariant), inset a
// little against cut-line residue; the frame height shrinks to the tallest
// row's content instead of inheriting the cells' empty margins.
export const computeGridFrameLayout = (
  raster: RasterImageData,
  cellBounds: Bounds[],
): GridFrameLayout | null => {
  if (!cellBounds.length) {
    return null;
  }

  const { data, width, height } = raster;
  const rowForeground = (y: number, left: number, right: number): boolean => {
    for (let x = left; x <= right; x += 1) {
      if (!isBackgroundPixel(data, (y * width + x) * 4)) {
        return true;
      }
    }
    return false;
  };

  // Drawn dividers on the sheet: when the generator drew its grid unevenly,
  // the uniform cut can land a little beside a divider, leaving the line AND a
  // strip of the neighboring frame inside a cell. Each window is clipped at
  // any divider that falls inside it (keeping the side holding the cell's own
  // subject), so line, halo, and neighbor bleed all fall away. Content that
  // genuinely straddles a divider is cut at the boundary — it reads as normal
  // frame clipping.
  const sheetMask = createForegroundMask(raster);
  const columnDividers = findSheetDividerRuns(
    collectAxisCounts(sheetMask, width, height, "column"),
    height,
  );
  const rowDividers = findSheetDividerRuns(
    collectAxisCounts(sheetMask, width, height, "row"),
    width,
  );
  const DIVIDER_HALO = 4;

  // Group cells into grid rows. Uniform cuts give identical tops; cells from
  // detected drawn boxes wobble by a few pixels, so cluster tops within a
  // fraction of the cell height instead of requiring exact equality.
  const sortedHeights = cellBounds
    .map((bounds) => bounds.bottom - bounds.top + 1)
    .sort((a, b) => a - b);
  const medianCellHeight = sortedHeights[Math.floor(sortedHeights.length / 2)];
  const rowTolerance = Math.max(4, Math.floor(medianCellHeight * 0.25));
  const sortedTops = [...new Set(cellBounds.map((bounds) => bounds.top))].sort((a, b) => a - b);
  const topClusters: number[][] = [];
  for (const top of sortedTops) {
    const cluster = topClusters[topClusters.length - 1];
    if (cluster && top - cluster[0] <= rowTolerance) {
      cluster.push(top);
    } else {
      topClusters.push([top]);
    }
  }
  const rowByTop = new Map<number, ReturnType<typeof buildRow>>();
  function buildRow(cluster: number[]) {
    const cells = cellBounds.filter((bounds) => cluster.includes(bounds.top));
    const left = Math.min(...cells.map((bounds) => bounds.left));
    const right = Math.max(...cells.map((bounds) => bounds.right));
    const top = Math.min(...cluster);
    const bottom = Math.max(...cells.map((bounds) => bounds.bottom));
    let baseline = top;
    for (let y = bottom; y >= top; y -= 1) {
      if (rowForeground(y, left, right)) {
        baseline = y;
        break;
      }
    }
    let contentTop = baseline;
    for (let y = top; y <= baseline; y += 1) {
      if (rowForeground(y, left, right)) {
        contentTop = y;
        break;
      }
    }
    return { top, bottom, baseline, contentTop };
  }
  const rows = topClusters.map((cluster) => {
    const row = buildRow(cluster);
    cluster.forEach((top) => rowByTop.set(top, row));
    return row;
  });

  const widestCell = cellBounds.reduce(
    (widest, bounds) => Math.max(widest, bounds.right - bounds.left + 1),
    1,
  );
  const tallestCell = cellBounds.reduce(
    (tallest, bounds) => Math.max(tallest, bounds.bottom - bounds.top + 1),
    1,
  );
  const edgeInset = Math.max(2, Math.round(Math.min(widestCell, tallestCell) * 0.01));
  const pad = Math.max(6, Math.round(tallestCell * 0.02));
  const frameWidth = Math.max(1, widestCell - edgeInset * 2);
  const tallestContent = rows.reduce(
    (tallest, row) => Math.max(tallest, row.baseline - row.contentTop + 1),
    1,
  );
  const frameHeight = Math.min(tallestCell, tallestContent + pad * 2);

  const windows = cellBounds.map((bounds) => {
    const row = rowByTop.get(bounds.top);
    const insetLeft = bounds.left + edgeInset;
    const insetRight = Math.max(bounds.right - edgeInset, insetLeft);

    // Clip at dividers inside the window, keeping the subject's side. The
    // dest offset shifts with a left/top clip so registration is unaffected.
    let clippedLeft = insetLeft;
    let clippedRight = insetRight;
    const centerX = (bounds.left + bounds.right) / 2;
    for (const divider of columnDividers) {
      if (divider.start > clippedLeft + 2 && divider.end < clippedRight - 2) {
        if ((divider.start + divider.end) / 2 <= centerX) {
          clippedLeft = Math.min(divider.end + DIVIDER_HALO, clippedRight);
        } else {
          clippedRight = Math.max(divider.start - DIVIDER_HALO, clippedLeft);
        }
      }
    }
    const insetWidth = insetRight - insetLeft + 1;
    const destX = Math.floor((frameWidth - insetWidth) / 2) + (clippedLeft - insetLeft);

    // Anchor from the row baseline: the window bottom sits `pad` below it,
    // clamped inside the cell so cut-line residue stays out; the top is
    // whatever the frame height reaches, clipped at the cell's inset edge
    // (content above that belongs to the row above). Clipping shifts destY,
    // never the baseline anchor, so alignment survives clamping.
    const idealBottom = Math.min((row?.baseline ?? bounds.bottom) + pad, bounds.bottom - edgeInset);
    const idealTop = idealBottom - frameHeight + 1;
    const visibleTop = Math.max(idealTop, bounds.top + edgeInset, 0);
    let clippedTop = visibleTop;
    let clippedBottom = Math.max(idealBottom, visibleTop);
    const centerY = (bounds.top + bounds.bottom) / 2;
    for (const divider of rowDividers) {
      if (divider.start > clippedTop + 2 && divider.end < clippedBottom - 2) {
        if ((divider.start + divider.end) / 2 <= centerY) {
          clippedTop = Math.min(divider.end + DIVIDER_HALO, clippedBottom);
        } else {
          clippedBottom = Math.max(divider.start - DIVIDER_HALO, clippedTop);
        }
      }
    }
    const destY = visibleTop - idealTop + (clippedTop - visibleTop);

    return {
      left: clippedLeft,
      top: clippedTop,
      right: clippedRight,
      bottom: clippedBottom,
      destX,
      destY,
    };
  });

  return { frameWidth, frameHeight, windows };
};

// Detect the magenta frame boxes on a sheet image (DOM wrapper around
// detectMagentaFrameBounds). Run this on the PRISTINE generator output: the
// neural background remover erodes the thin lines (same lesson as break-comic).
export const detectMagentaFrameBoundsFromImage = async (imageData: string): Promise<Bounds[]> => {
  if (typeof document === "undefined") {
    return [];
  }
  const image = await loadImage(imageData);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable for magenta box detection.");
  }
  context.drawImage(image, 0, 0);
  const raster = context.getImageData(0, 0, canvas.width, canvas.height);
  return detectMagentaFrameBounds({
    data: raster.data,
    width: raster.width,
    height: raster.height,
  });
};

// Slice a sprite sheet into its uniform grid cells for animation frames. Every
// returned frame has the SAME canvas size, with frame content registered by
// grid position horizontally and by row baseline vertically (see
// computeGridFrameLayout), so the encoder can stack frames as-is and the
// subject stays wherever the generator drew it. Deliberately no per-cell
// trimming: the trim-and-realign path (cropBoundsToDataUrl + bbox alignment)
// discards that registration and makes the subject jump whenever its
// silhouette changes. Returns [] when no plausible multi-cell grid is found,
// so the caller can fall back to whitespace/component segmentation.
export const sliceSheetIntoGridCells = async (
  imageData: string,
  options: {
    expectedFrameCount?: number;
    minimumCellCount?: number;
    /**
     * Cell rectangles already known from detected magenta frame boxes (outer
     * bounds, from the pristine sheet — coordinates match the background-
     * removed image). These beat any grid inference: the generator registered
     * each frame to the box it drew. Insetting past the line happens here.
     */
    presetCellBounds?: Array<{ left: number; top: number; right: number; bottom: number }>;
  } = {},
): Promise<string[]> => {
  if (typeof document === "undefined") {
    return [];
  }

  const image = await loadImage(imageData);
  const sheetCanvas = document.createElement("canvas");
  sheetCanvas.width = image.naturalWidth;
  sheetCanvas.height = image.naturalHeight;
  const sheetContext = sheetCanvas.getContext("2d");
  if (!sheetContext) {
    throw new Error("Canvas context unavailable for grid slicing.");
  }
  sheetContext.drawImage(image, 0, 0);
  const raster = sheetContext.getImageData(0, 0, sheetCanvas.width, sheetCanvas.height);
  const rasterData = {
    data: raster.data,
    width: raster.width,
    height: raster.height,
  };

  // Preference order: detected magenta boxes (exact, model-registered), then
  // the uniform layout-driven cut (immune to subjects that separate into
  // several pieces within one frame), then content-inferred grid as fallback
  // for sheets that ignored the requested layout.
  const boxes = options.presetCellBounds ?? [];
  const boxInset = boxes.length
    ? Math.max(
        8,
        Math.round(
          Math.min(...boxes.map((box) => Math.min(box.right - box.left, box.bottom - box.top))) *
            0.02,
        ),
      )
    : 0;
  const presetBounds: Bounds[] = boxes.map((box) => ({
    left: box.left + boxInset,
    top: box.top + boxInset,
    right: Math.max(box.right - boxInset, box.left + boxInset),
    bottom: Math.max(box.bottom - boxInset, box.top + boxInset),
  }));
  const uniformBounds =
    !presetBounds.length && options.expectedFrameCount
      ? computeUniformGridCellBoundsFromRaster(rasterData, options.expectedFrameCount)
      : [];
  let cellBounds = presetBounds.length ? presetBounds : uniformBounds;
  if (!cellBounds.length) {
    const inferredBounds = computeGridCellBoundsFromRaster(rasterData);
    // A content-inferred cell count far from the requested frame count means
    // the inference latched onto sub-pieces (e.g. a hat separated from its
    // character), which animates as garbage — better to bail out entirely.
    const plausible =
      !options.expectedFrameCount ||
      Math.abs(inferredBounds.length - options.expectedFrameCount) <= 1;
    cellBounds = plausible ? inferredBounds : [];
  }
  const minimumCellCount = options.minimumCellCount ?? 4;
  if (cellBounds.length < minimumCellCount) {
    return [];
  }

  const layout = computeGridFrameLayout(rasterData, dropSparseGridCells(rasterData, cellBounds));
  if (!layout) {
    return [];
  }

  return layout.windows.map((window) => {
    const cropWidth = window.right - window.left + 1;
    const cropHeight = window.bottom - window.top + 1;
    const canvas = document.createElement("canvas");
    canvas.width = layout.frameWidth;
    canvas.height = layout.frameHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context unavailable for grid slicing.");
    }
    context.drawImage(
      image,
      window.left,
      window.top,
      cropWidth,
      cropHeight,
      window.destX,
      window.destY,
      cropWidth,
      cropHeight,
    );
    const frameData = context.getImageData(0, 0, canvas.width, canvas.height);
    const erased = eraseEdgeIntrudersFromFrameRaster({
      data: frameData.data,
      width: frameData.width,
      height: frameData.height,
    });
    if (erased > 0) {
      context.putImageData(frameData, 0, 0);
    }
    return canvas.toDataURL("image/png");
  });
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
  const bounds = extractPieceBoundsFromRaster(
    {
      data: raster.data,
      width: raster.width,
      height: raster.height,
    },
    options,
  );

  if (!bounds.length) {
    return [];
  }

  console.log("[ExtractCast/debug] segmentImageIntoPieces", {
    width: raster.width,
    height: raster.height,
    boundsCount: bounds.length,
    preferSeparatedSubjects: options.preferSeparatedSubjects,
  });

  return Promise.all(bounds.map((bound) => cropBoundsToDataUrl(image, bound)));
};
