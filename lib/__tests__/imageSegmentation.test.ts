import { describe, expect, it } from "vite-plus/test";
import {
  computeGridCellBoundsFromRaster,
  computeGridFrameLayout,
  computeUniformGridCellBoundsFromRaster,
  dropSparseGridCells,
  eraseEdgeIntrudersFromFrameRaster,
  detectMagentaFrameBounds,
  extractOpaqueBoundsFromRaster,
  extractPieceBoundsFromRaster,
  isMagentaishPixel,
} from "../imageSegmentation";

const expectBoundsToContain = (
  actual: { left: number; top: number; right: number; bottom: number },
  expected: { left: number; top: number; right: number; bottom: number },
) => {
  expect(actual.left).toBeLessThanOrEqual(expected.left);
  expect(actual.top).toBeLessThanOrEqual(expected.top);
  expect(actual.right).toBeGreaterThanOrEqual(expected.right);
  expect(actual.bottom).toBeGreaterThanOrEqual(expected.bottom);
};

const createWhiteRaster = (width: number, height: number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const pixelIndex = index * 4;
    data[pixelIndex] = 255;
    data[pixelIndex + 1] = 255;
    data[pixelIndex + 2] = 255;
    data[pixelIndex + 3] = 255;
  }
  return data;
};

const fillRect = (
  data: Uint8ClampedArray,
  width: number,
  bounds: { left: number; top: number; right: number; bottom: number },
  color: { r: number; g: number; b: number },
) => {
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      data[pixelIndex] = color.r;
      data[pixelIndex + 1] = color.g;
      data[pixelIndex + 2] = color.b;
      data[pixelIndex + 3] = 255;
    }
  }
};

describe("extractPieceBoundsFromRaster", () => {
  it("finds row-major piece bounds from a white grid layout", () => {
    const width = 80;
    const height = 80;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 8, top: 10, right: 20, bottom: 28 }, { r: 220, g: 80, b: 80 });
    fillRect(data, width, { left: 44, top: 9, right: 60, bottom: 30 }, { r: 80, g: 120, b: 220 });
    fillRect(data, width, { left: 10, top: 46, right: 24, bottom: 66 }, { r: 80, g: 180, b: 120 });
    fillRect(data, width, { left: 46, top: 44, right: 62, bottom: 68 }, { r: 200, g: 140, b: 60 });

    const bounds = extractPieceBoundsFromRaster(
      { data, width, height },
      { preferSeparatedSubjects: true },
    );

    expect(bounds).toHaveLength(4);
    expect(bounds[0].top).toBeLessThanOrEqual(bounds[1].top);
    expect(bounds[2].top).toBeGreaterThanOrEqual(bounds[0].top);
    expectBoundsToContain(bounds[0], {
      left: 8,
      top: 10,
      right: 20,
      bottom: 28,
    });
    expectBoundsToContain(bounds[1], {
      left: 44,
      top: 9,
      right: 60,
      bottom: 30,
    });
    expectBoundsToContain(bounds[2], {
      left: 10,
      top: 46,
      right: 24,
      bottom: 66,
    });
    expectBoundsToContain(bounds[3], {
      left: 46,
      top: 44,
      right: 62,
      bottom: 68,
    });
  });

  it("merges hairline gaps inside a panel with preferComponents + margin", () => {
    // Left panel = two blobs separated by a 4px gap; right panel = one blob, far
    // away across a large gutter. Connected components see 3 blobs.
    const width = 120;
    const height = 60;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 8, top: 8, right: 40, bottom: 25 }, { r: 30, g: 30, b: 30 });
    fillRect(data, width, { left: 8, top: 30, right: 40, bottom: 52 }, { r: 30, g: 30, b: 30 });
    fillRect(data, width, { left: 80, top: 8, right: 112, bottom: 52 }, { r: 30, g: 30, b: 30 });

    // Plain connected components see all 3 blobs.
    expect(extractPieceBoundsFromRaster({ data, width, height })).toHaveLength(3);

    // A merge margin absorbs the small intra-panel gap (groups the two left
    // blobs) while the large gutter keeps the right panel separate -> 2 pieces.
    expect(
      extractPieceBoundsFromRaster(
        { data, width, height },
        { preferComponents: true, componentMergeMarginRatio: 0.05 },
      ),
    ).toHaveLength(2);
  });

  it("collapses over-split components onto a known target piece count", () => {
    // Three panels across a wide row; the middle panel is split into two blobs.
    // Connected components see 4; targetPieceCount=3 merges the closest pair
    // (the middle panel's fragments) back to 3.
    const width = 200;
    const height = 60;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 8, top: 10, right: 40, bottom: 50 }, { r: 30, g: 30, b: 30 });
    // Middle panel: two blobs separated by a small gap.
    fillRect(data, width, { left: 88, top: 10, right: 104, bottom: 50 }, { r: 30, g: 30, b: 30 });
    fillRect(data, width, { left: 110, top: 10, right: 126, bottom: 50 }, { r: 30, g: 30, b: 30 });
    fillRect(data, width, { left: 168, top: 10, right: 192, bottom: 50 }, { r: 30, g: 30, b: 30 });

    expect(
      extractPieceBoundsFromRaster({ data, width, height }, { preferComponents: true }),
    ).toHaveLength(4);

    expect(
      extractPieceBoundsFromRaster(
        { data, width, height },
        { preferComponents: true, targetPieceCount: 3 },
      ),
    ).toHaveLength(3);
  });

  it("splits under-split (bridged) panels back up to a known target count", () => {
    // Two panels across a wide row, separated by a clean gutter. A large merge
    // margin bridges them into a single connected component (the real-world
    // under-split: adjacent panels whose content nearly touches). targetPieceCount=2
    // must split that blob back apart at the whitespace gutter.
    const width = 200;
    const height = 60;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 8, top: 10, right: 80, bottom: 50 }, { r: 30, g: 30, b: 30 });
    fillRect(data, width, { left: 120, top: 10, right: 192, bottom: 50 }, { r: 30, g: 30, b: 30 });

    // A large merge margin bridges the gutter -> connected components see 1 blob.
    expect(
      extractPieceBoundsFromRaster(
        { data, width, height },
        { preferComponents: true, componentMergeMarginRatio: 0.25 },
      ),
    ).toHaveLength(1);

    // Knowing the panel count, splitWidestUntil recovers the 2 panels.
    expect(
      extractPieceBoundsFromRaster(
        { data, width, height },
        { preferComponents: true, componentMergeMarginRatio: 0.25, targetPieceCount: 2 },
      ),
    ).toHaveLength(2);
  });

  it("stops short of the target when no clean gutter remains", () => {
    // A single solid panel with no internal whitespace. Even with a higher
    // target, splitWidestUntil must not carve a real picture in two.
    const width = 120;
    const height = 60;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 8, top: 10, right: 112, bottom: 50 }, { r: 30, g: 30, b: 30 });

    expect(
      extractPieceBoundsFromRaster(
        { data, width, height },
        { preferComponents: true, targetPieceCount: 3 },
      ),
    ).toHaveLength(1);
  });

  it("falls back to connected components when there is no clear grid", () => {
    const width = 60;
    const height = 28;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 4, top: 4, right: 14, bottom: 20 }, { r: 40, g: 140, b: 220 });
    fillRect(data, width, { left: 34, top: 6, right: 48, bottom: 22 }, { r: 220, g: 120, b: 60 });

    const bounds = extractPieceBoundsFromRaster(
      { data, width, height },
      { preferSeparatedSubjects: true },
    );

    expect(bounds).toHaveLength(2);
    expectBoundsToContain(bounds[0], {
      left: 4,
      top: 4,
      right: 14,
      bottom: 20,
    });
    expectBoundsToContain(bounds[1], {
      left: 34,
      top: 6,
      right: 48,
      bottom: 22,
    });
  });

  it("prefers separate connected pieces over coarse projection groups", () => {
    const width = 110;
    const height = 36;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 4, top: 8, right: 15, bottom: 28 }, { r: 220, g: 80, b: 80 });
    fillRect(data, width, { left: 20, top: 7, right: 31, bottom: 29 }, { r: 80, g: 120, b: 220 });
    fillRect(data, width, { left: 36, top: 9, right: 47, bottom: 27 }, { r: 80, g: 180, b: 120 });
    fillRect(data, width, { left: 66, top: 11, right: 75, bottom: 23 }, { r: 220, g: 180, b: 70 });
    fillRect(data, width, { left: 82, top: 6, right: 92, bottom: 29 }, { r: 170, g: 90, b: 210 });

    const bounds = extractPieceBoundsFromRaster(
      { data, width, height },
      { preferSeparatedSubjects: true },
    );

    expect(bounds).toHaveLength(5);
    expectBoundsToContain(bounds[0], {
      left: 4,
      top: 8,
      right: 15,
      bottom: 28,
    });
    expectBoundsToContain(bounds[1], {
      left: 20,
      top: 7,
      right: 31,
      bottom: 29,
    });
    expectBoundsToContain(bounds[2], {
      left: 36,
      top: 9,
      right: 47,
      bottom: 27,
    });
    expectBoundsToContain(bounds[3], {
      left: 66,
      top: 11,
      right: 75,
      bottom: 23,
    });
    expectBoundsToContain(bounds[4], {
      left: 82,
      top: 6,
      right: 92,
      bottom: 29,
    });
  });

  it("ignores a thin horizontal bridge when splitting a character sheet", () => {
    const width = 120;
    const height = 64;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 8, top: 10, right: 28, bottom: 49 }, { r: 220, g: 80, b: 80 });
    fillRect(data, width, { left: 48, top: 12, right: 68, bottom: 51 }, { r: 80, g: 120, b: 220 });
    fillRect(data, width, { left: 88, top: 11, right: 108, bottom: 50 }, { r: 80, g: 180, b: 120 });

    fillRect(data, width, { left: 8, top: 52, right: 108, bottom: 53 }, { r: 180, g: 180, b: 180 });

    const bounds = extractPieceBoundsFromRaster(
      { data, width, height },
      { preferSeparatedSubjects: true },
    );

    expect(bounds).toHaveLength(3);
    expectBoundsToContain(bounds[0], {
      left: 8,
      top: 10,
      right: 28,
      bottom: 49,
    });
    expectBoundsToContain(bounds[1], {
      left: 48,
      top: 12,
      right: 68,
      bottom: 51,
    });
    expectBoundsToContain(bounds[2], {
      left: 88,
      top: 11,
      right: 108,
      bottom: 50,
    });
  });

  it("drops a wide lower artifact band while keeping separated subjects", () => {
    const width = 140;
    const height = 110;
    const data = createWhiteRaster(width, height);

    fillRect(data, width, { left: 14, top: 12, right: 34, bottom: 62 }, { r: 220, g: 80, b: 80 });
    fillRect(data, width, { left: 56, top: 18, right: 80, bottom: 67 }, { r: 80, g: 120, b: 220 });
    fillRect(
      data,
      width,
      { left: 100, top: 14, right: 122, bottom: 64 },
      { r: 80, g: 180, b: 120 },
    );
    fillRect(
      data,
      width,
      { left: 10, top: 74, right: 126, bottom: 89 },
      { r: 110, g: 110, b: 110 },
    );

    const bounds = extractPieceBoundsFromRaster(
      { data, width, height },
      { preferSeparatedSubjects: true },
    );

    expect(bounds).toHaveLength(3);
    expectBoundsToContain(bounds[0], {
      left: 14,
      top: 12,
      right: 34,
      bottom: 62,
    });
    expectBoundsToContain(bounds[1], {
      left: 56,
      top: 18,
      right: 80,
      bottom: 67,
    });
    expectBoundsToContain(bounds[2], {
      left: 100,
      top: 14,
      right: 122,
      bottom: 64,
    });
  });
});

describe("computeGridCellBoundsFromRaster", () => {
  // A 2-row × 4-column animation sprite sheet: 30×30 subjects centered at
  // x = 50/150/250/350 and y = 50/150 on a 400×200 white sheet.
  const sheetSubject = (column: number, row: number) => ({
    left: 35 + column * 100,
    top: 35 + row * 100,
    right: 64 + column * 100,
    bottom: 64 + row * 100,
  });
  const INK = { r: 200, g: 60, b: 60 };

  it("returns every full grid cell in reading order, cut mid-gutter", () => {
    const width = 400;
    const height = 200;
    const data = createWhiteRaster(width, height);
    const subjects = [0, 1].flatMap((row) =>
      [0, 1, 2, 3].map((column) => sheetSubject(column, row)),
    );
    subjects.forEach((subject) => fillRect(data, width, subject, INK));

    const cells = computeGridCellBoundsFromRaster({ data, width, height });

    expect(cells).toHaveLength(8);

    // Reading order: first four cells span the top row left to right.
    for (let index = 1; index < 4; index += 1) {
      expect(cells[index].top).toBe(cells[0].top);
      expect(cells[index].left).toBeGreaterThan(cells[index - 1].left);
    }
    expect(cells[4].top).toBeGreaterThan(cells[0].bottom);

    // Each cell contains its whole subject — the cell is NOT trimmed to the
    // subject's bounding box; the cut lands in the middle of the gutter.
    subjects.forEach((subject, index) => {
      expectBoundsToContain(cells[index], subject);
    });
    expect(cells[0].right).toBeGreaterThanOrEqual(90); // gutter spans x=65..134
    expect(cells[0].bottom).toBeGreaterThanOrEqual(90); // gutter spans y=65..134
  });

  it("drops empty grid positions", () => {
    const width = 400;
    const height = 200;
    const data = createWhiteRaster(width, height);
    [0, 1]
      .flatMap((row) => [0, 1, 2, 3].map((column) => sheetSubject(column, row)))
      .slice(0, 7)
      .forEach((subject) => fillRect(data, width, subject, INK));

    expect(computeGridCellBoundsFromRaster({ data, width, height })).toHaveLength(7);
  });

  it("returns a single cell for one solid subject", () => {
    const width = 200;
    const height = 200;
    const data = createWhiteRaster(width, height);
    fillRect(data, width, { left: 40, top: 40, right: 160, bottom: 160 }, INK);

    expect(computeGridCellBoundsFromRaster({ data, width, height })).toHaveLength(1);
  });

  it("returns nothing for a blank raster", () => {
    const width = 100;
    const height = 100;
    expect(
      computeGridCellBoundsFromRaster({ data: createWhiteRaster(width, height), width, height }),
    ).toHaveLength(0);
  });
});

describe("computeUniformGridCellBoundsFromRaster", () => {
  const INK = { r: 200, g: 60, b: 60 };

  // 2 rows × 4 columns on a 400×200 sheet: true cell pitch 100×100.
  const drawSubjects = (
    data: Uint8ClampedArray,
    width: number,
    subjects: Array<{ column: number; row: number; detachedProp?: boolean }>,
  ) => {
    subjects.forEach(({ column, row, detachedProp }) => {
      // Main subject blob, off-center within its cell.
      fillRect(
        data,
        width,
        {
          left: 10 + column * 100,
          top: 30 + row * 100,
          right: 45 + column * 100,
          bottom: 90 + row * 100,
        },
        INK,
      );
      if (detachedProp) {
        // A separated prop (hat blowing away): its own blob near the cell's
        // far side, NOT touching the subject.
        fillRect(
          data,
          width,
          {
            left: 70 + column * 100,
            top: 12 + row * 100,
            right: 92 + column * 100,
            bottom: 30 + row * 100,
          },
          INK,
        );
      }
    });
  };

  it("cuts the mandated 2x4 layout even when frames contain detached pieces", () => {
    const width = 400;
    const height = 200;
    const data = createWhiteRaster(width, height);
    drawSubjects(
      data,
      width,
      [0, 1].flatMap((row) =>
        [0, 1, 2, 3].map((column) => ({ column, row, detachedProp: column >= 2 })),
      ),
    );

    const cells = computeUniformGridCellBoundsFromRaster({ data, width, height }, 8);

    expect(cells).toHaveLength(8);
    // Cells sit on the uniform 100px pitch (within the offset search slack),
    // and each cell keeps its subject AND its detached prop together.
    cells.forEach((cell, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      expect(Math.abs(cell.left - column * 100)).toBeLessThanOrEqual(12);
      expect(Math.abs(cell.top - row * 100)).toBeLessThanOrEqual(12);
    });
  });

  it("keeps empty grid positions out of the frame list", () => {
    const width = 400;
    const height = 200;
    const data = createWhiteRaster(width, height);
    drawSubjects(
      data,
      width,
      [0, 1].flatMap((row) => [0, 1, 2, 3].map((column) => ({ column, row }))).slice(0, 7),
    );

    expect(computeUniformGridCellBoundsFromRaster({ data, width, height }, 8)).toHaveLength(7);
  });

  it("cuts along drawn grid borders instead of counting them as artwork", () => {
    // The model sometimes draws the grid it was told to keep invisible. A
    // 4x4 sheet with black divider lines on the cell boundaries: the full-
    // length lines mark the cuts and must not fail the damage check.
    const width = 400;
    const height = 400;
    const data = createWhiteRaster(width, height);
    const BLACK = { r: 20, g: 20, b: 20 };
    for (const line of [100, 200, 300]) {
      fillRect(data, width, { left: line - 1, top: 0, right: line + 1, bottom: height - 1 }, BLACK);
      fillRect(data, width, { left: 0, top: line - 1, right: width - 1, bottom: line + 1 }, BLACK);
    }
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        fillRect(
          data,
          width,
          {
            left: 30 + column * 100,
            top: 25 + row * 100,
            right: 70 + column * 100,
            bottom: 80 + row * 100,
          },
          INK,
        );
      }
    }

    const cells = computeUniformGridCellBoundsFromRaster({ data, width, height }, 16);
    expect(cells).toHaveLength(16);
    expect(Math.abs(cells[1].left - 100)).toBeLessThanOrEqual(4);
  });

  it("accepts the grid the model actually drew when it differs from the requested count", () => {
    // Asked for 12 frames, but the sheet came back as a clean 4x4 (16 cells).
    // Cutting the grid that was drawn beats failing over to content inference.
    const width = 400;
    const height = 400;
    const data = createWhiteRaster(width, height);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        fillRect(
          data,
          width,
          {
            left: 25 + column * 100,
            top: 20 + row * 100,
            right: 75 + column * 100,
            bottom: 85 + row * 100,
          },
          INK,
        );
      }
    }

    expect(computeUniformGridCellBoundsFromRaster({ data, width, height }, 12)).toHaveLength(16);
  });

  it("returns nothing when the sheet is not the requested grid", () => {
    const width = 400;
    const height = 200;
    const data = createWhiteRaster(width, height);
    // One big drawing across the whole canvas: every candidate cut line
    // crosses artwork, so no layout passes the damage check.
    fillRect(data, width, { left: 20, top: 20, right: 380, bottom: 180 }, INK);

    expect(computeUniformGridCellBoundsFromRaster({ data, width, height }, 8)).toHaveLength(0);
  });
});

describe("dropSparseGridCells", () => {
  it("drops cells where the subject is missing (only a stray prop)", () => {
    const INK = { r: 200, g: 60, b: 60 };
    const width = 600;
    const height = 100;
    const data = createWhiteRaster(width, height);
    const cells = [0, 1, 2, 3, 4, 5].map((column) => ({
      left: column * 100,
      top: 0,
      right: column * 100 + 99,
      bottom: 99,
    }));
    // Four cells hold the subject; cells 2 and 4 hold only a small prop.
    for (const column of [0, 1, 3, 5]) {
      fillRect(
        data,
        width,
        { left: 20 + column * 100, top: 10, right: 80 + column * 100, bottom: 90 },
        INK,
      );
    }
    for (const column of [2, 4]) {
      fillRect(
        data,
        width,
        { left: 40 + column * 100, top: 20, right: 55 + column * 100, bottom: 32 },
        INK,
      );
    }

    const kept = dropSparseGridCells({ data, width, height }, cells);
    expect(kept).toHaveLength(4);
    expect(kept.map((cell) => cell.left)).toEqual([0, 100, 300, 500]);
  });
});

describe("computeGridFrameLayout divider clipping", () => {
  const INK = { r: 200, g: 60, b: 60 };
  const LINE = { r: 30, g: 30, b: 30 };

  it("clips frame windows at drawn dividers that fall inside them", () => {
    // Sheet with a full-height drawn divider at x=190..193, but the cut
    // landed at x=210 (uneven grid): cell 1's window would contain the line
    // plus a strip of cell 2's subject. The window must stop at the divider.
    const width = 400;
    const height = 200;
    const data = createWhiteRaster(width, height);
    fillRect(data, width, { left: 190, top: 0, right: 193, bottom: 199 }, LINE);
    fillRect(data, width, { left: 40, top: 40, right: 150, bottom: 180 }, INK); // subject 1
    fillRect(data, width, { left: 240, top: 40, right: 350, bottom: 180 }, INK); // subject 2
    const cells = [
      { left: 0, top: 0, right: 210, bottom: 199 },
      { left: 211, top: 0, right: 399, bottom: 199 },
    ];

    const layout = computeGridFrameLayout({ data, width, height }, cells);

    expect(layout).not.toBeNull();
    // Cell 1's window ends before the divider; cell 2's is untouched (the
    // divider is outside it).
    expect(layout!.windows[0].right).toBeLessThan(190);
    expect(layout!.windows[1].left).toBe(211 + 2); // its edge inset only
  });
});

describe("eraseEdgeIntrudersFromFrameRaster", () => {
  const INK = { r: 200, g: 60, b: 60 };
  const alphaAt = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
    data[(y * width + x) * 4 + 3];

  it("erases a narrow neighbor fragment hugging the edge, keeps subject and props", () => {
    const width = 200;
    const height = 200;
    const data = new Uint8ClampedArray(width * height * 4); // transparent frame
    // Main subject in the middle, with an arm reaching to the right edge.
    fillRect(data, width, { left: 60, top: 40, right: 140, bottom: 180 }, INK);
    fillRect(data, width, { left: 140, top: 60, right: 199, bottom: 70 }, INK); // own arm at edge
    // A floating prop (hat) not touching any edge.
    fillRect(data, width, { left: 90, top: 5, right: 115, bottom: 20 }, INK);
    // Neighbor bleed: narrow strip hugging the left edge, disconnected.
    fillRect(data, width, { left: 0, top: 80, right: 14, bottom: 160 }, INK);

    const erased = eraseEdgeIntrudersFromFrameRaster({ data, width, height });

    expect(erased).toBe(1);
    expect(alphaAt(data, width, 5, 100)).toBe(0); // bleed gone
    expect(alphaAt(data, width, 100, 100)).toBe(255); // subject intact
    expect(alphaAt(data, width, 195, 65)).toBe(255); // own arm at edge intact
    expect(alphaAt(data, width, 100, 10)).toBe(255); // floating prop intact
  });
});

describe("computeGridFrameLayout", () => {
  const INK = { r: 200, g: 60, b: 60 };

  it("aligns rows by their baselines when the sheet has uneven margins", () => {
    // The generator centered two content bands inside arbitrary canvas margins
    // (top 80, bottom 100) instead of filling uniform cells. Canvas-anchored
    // cells then hold their subjects at different heights; baseline
    // registration must land both rows' feet at the same output y.
    const width = 400;
    const height = 400;
    const data = createWhiteRaster(width, height);
    const feetRow1 = 160;
    const feetRow2 = 300;
    for (const column of [0, 1]) {
      fillRect(
        data,
        width,
        { left: 40 + column * 200, top: 80, right: 120 + column * 200, bottom: feetRow1 },
        INK,
      );
      fillRect(
        data,
        width,
        { left: 40 + column * 200, top: 220, right: 120 + column * 200, bottom: feetRow2 },
        INK,
      );
    }

    const cells = computeUniformGridCellBoundsFromRaster({ data, width, height }, 4);
    expect(cells).toHaveLength(4);

    const layout = computeGridFrameLayout({ data, width, height }, cells);
    expect(layout).not.toBeNull();
    const outputFeet = layout!.windows.map((window, index) => {
      const baseline = cells[index].top < 200 ? feetRow1 : feetRow2;
      return window.destY + (baseline - window.top);
    });
    outputFeet.forEach((feetY) => {
      expect(Math.abs(feetY - outputFeet[0])).toBeLessThanOrEqual(1);
    });
    // Frames shrink to content instead of inheriting the giant margins.
    expect(layout!.frameHeight).toBeLessThan(150);
  });
});

const strokeRect = (
  data: Uint8ClampedArray,
  width: number,
  bounds: { left: number; top: number; right: number; bottom: number },
  color: { r: number; g: number; b: number },
  thickness = 3,
) => {
  for (let t = 0; t < thickness; t += 1) {
    fillRect(data, width, { ...bounds, bottom: bounds.top + t }, color); // top edge
    fillRect(data, width, { ...bounds, top: bounds.bottom - t }, color); // bottom edge
    fillRect(data, width, { ...bounds, right: bounds.left + t }, color); // left edge
    fillRect(data, width, { ...bounds, left: bounds.right - t }, color); // right edge
  }
};

const MAGENTA = { r: 255, g: 0, b: 255 };

describe("detectMagentaFrameBounds", () => {
  it("finds each magenta frame rectangle in reading order", () => {
    const width = 400;
    const height = 300;
    const data = createWhiteRaster(width, height);
    const frames = [
      { left: 20, top: 20, right: 170, bottom: 140 },
      { left: 220, top: 20, right: 370, bottom: 140 },
      { left: 20, top: 160, right: 170, bottom: 280 },
      { left: 220, top: 160, right: 370, bottom: 280 },
    ];
    for (const frame of frames) {
      strokeRect(data, width, frame, MAGENTA);
      // Some artwork inside each frame (must not affect frame detection).
      fillRect(
        data,
        width,
        {
          left: frame.left + 30,
          top: frame.top + 30,
          right: frame.right - 30,
          bottom: frame.bottom - 30,
        },
        { r: 80, g: 140, b: 220 },
      );
    }

    const bounds = detectMagentaFrameBounds({ data, width, height });
    expect(bounds).toHaveLength(4);
    bounds.forEach((bound, index) => {
      expectBoundsToContain(frames[index], bound); // detected box ~ the drawn frame
      expect(bound.left).toBeGreaterThanOrEqual(frames[index].left - 1);
      expect(bound.right).toBeLessThanOrEqual(frames[index].right + 1);
    });
  });

  it("ignores pink/purple artwork (e.g. germ characters)", () => {
    const width = 200;
    const height = 160;
    const data = createWhiteRaster(width, height);
    // A pink blob: green too high / blue-green margin too small to be magenta.
    fillRect(
      data,
      width,
      { left: 40, top: 40, right: 120, bottom: 120 },
      { r: 240, g: 100, b: 160 },
    );
    expect(detectMagentaFrameBounds({ data, width, height })).toHaveLength(0);
  });

  it("ignores a solid magenta blob (not a hollow frame)", () => {
    const width = 200;
    const height = 160;
    const data = createWhiteRaster(width, height);
    fillRect(data, width, { left: 40, top: 40, right: 140, bottom: 130 }, MAGENTA);
    expect(detectMagentaFrameBounds({ data, width, height })).toHaveLength(0);
  });

  it("drives extractPieceBoundsFromRaster when detectColoredFrames is set", () => {
    const width = 400;
    const height = 200;
    const data = createWhiteRaster(width, height);
    strokeRect(data, width, { left: 20, top: 20, right: 180, bottom: 180 }, MAGENTA);
    strokeRect(data, width, { left: 220, top: 20, right: 380, bottom: 180 }, MAGENTA);

    expect(
      extractPieceBoundsFromRaster({ data, width, height }, { detectColoredFrames: true }),
    ).toHaveLength(2);
  });

  it("yields nothing (for caller fallback) when fewer than two frames exist", () => {
    const width = 300;
    const height = 200;
    const data = createWhiteRaster(width, height);
    strokeRect(data, width, { left: 20, top: 20, right: 280, bottom: 180 }, MAGENTA);

    expect(
      extractPieceBoundsFromRaster({ data, width, height }, { detectColoredFrames: true }),
    ).toHaveLength(0);
  });
});

describe("isMagentaishPixel (frame-erase test)", () => {
  const px = (r: number, g: number, b: number, a = 255) =>
    isMagentaishPixel(new Uint8ClampedArray([r, g, b, a]), 0);

  it("erases solid and anti-aliased (halo) magenta", () => {
    expect(px(255, 0, 255)).toBe(true); // solid border
    expect(px(255, 120, 255)).toBe(true); // mid halo
    expect(px(255, 210, 255)).toBe(true); // light halo toward white
  });

  it("keeps pink/purple-ish artwork (germ characters)", () => {
    expect(px(240, 100, 160)).toBe(false); // pink: red well above blue
    expect(px(235, 90, 150)).toBe(false);
  });

  it("keeps clearly non-magenta colors and transparent pixels", () => {
    expect(px(80, 120, 220)).toBe(false); // blue
    expect(px(220, 180, 70)).toBe(false); // skin/orange
    expect(px(255, 0, 255, 0)).toBe(false); // transparent
  });
});

describe("extractOpaqueBoundsFromRaster", () => {
  it("trims transparent padding from all sides", () => {
    const width = 20;
    const height = 16;
    const data = new Uint8ClampedArray(width * height * 4);

    fillRect(data, width, { left: 6, top: 4, right: 12, bottom: 10 }, { r: 90, g: 140, b: 220 });

    const bounds = extractOpaqueBoundsFromRaster({ data, width, height });

    expect(bounds).toEqual({ left: 6, top: 4, right: 12, bottom: 10 });
  });
});
