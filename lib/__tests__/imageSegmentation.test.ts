import { describe, expect, it } from "vite-plus/test";
import { extractOpaqueBoundsFromRaster, extractPieceBoundsFromRaster } from "../imageSegmentation";

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
    fillRect(data, width, { left: 100, top: 14, right: 122, bottom: 64 }, { r: 80, g: 180, b: 120 });
    fillRect(data, width, { left: 10, top: 74, right: 126, bottom: 89 }, { r: 110, g: 110, b: 110 });

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
