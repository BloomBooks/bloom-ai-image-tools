import { describe, expect, it, vi } from "vitest";
import { measureBars, resolveLetterboxCrop } from "../letterboxCrop";
import type { Letterbox } from "../upscale";

// A raster of `width` x `height` with black bars and a mid-grey picture
// between them. `bars` are [leading, trailing] along the given axis.
const raster = (
  width: number,
  height: number,
  axis: "rows" | "columns",
  bars: [number, number],
  barLevel = 0,
) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const line = axis === "rows" ? y : x;
      const extent = axis === "rows" ? height : width;
      const inBar = line < bars[0] || line >= extent - bars[1];
      const value = inBar ? barLevel : 128;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
};

const wide: Letterbox = { fills: "width", content: { x: 0, y: 30, width: 200, height: 40 } };

describe("measureBars", () => {
  it("counts the black rows at the top and bottom", () => {
    expect(measureBars(raster(200, 100, "rows", [30, 30]), "rows")).toEqual({
      leading: 30,
      trailing: 30,
    });
  });

  it("counts black columns, and takes a dark grey bar as black", () => {
    expect(measureBars(raster(100, 50, "columns", [10, 12], 20), "columns")).toEqual({
      leading: 10,
      trailing: 12,
    });
  });

  it("finds no bars where the edges are not black", () => {
    expect(measureBars(raster(100, 50, "rows", [0, 0]), "rows")).toEqual({
      leading: 0,
      trailing: 0,
    });
  });
});

describe("resolveLetterboxCrop", () => {
  it("cuts at the bars the model drew when they sit where the plan put them", () => {
    // Planned 30/30; drawn 28/33, both within 5% of a 100-row canvas.
    const crop = resolveLetterboxCrop(
      raster(200, 100, "rows", [28, 33]),
      { width: 200, height: 100 },
      wide,
    );
    expect(crop).toEqual({ x: 0, y: 28, width: 200, height: 39 });
  });

  it("falls back to the plan when the bars are not where it put them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const crop = resolveLetterboxCrop(
      raster(200, 100, "rows", [0, 0]),
      { width: 200, height: 100 },
      wide,
    );
    expect(crop).toEqual({ x: 0, y: 30, width: 200, height: 40 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("scales the plan to a result of a different size before comparing", () => {
    // The model returned the canvas at half size; the plan's 30-row bars are
    // 15 rows there, and the bars drawn match that.
    const crop = resolveLetterboxCrop(
      raster(100, 50, "rows", [15, 15]),
      { width: 200, height: 100 },
      wide,
    );
    expect(crop).toEqual({ x: 0, y: 15, width: 100, height: 20 });
  });

  it("works along columns for a picture that fills the height", () => {
    const tall: Letterbox = { fills: "height", content: { x: 40, y: 0, width: 20, height: 100 } };
    const crop = resolveLetterboxCrop(
      raster(100, 100, "columns", [41, 39]),
      { width: 100, height: 100 },
      tall,
    );
    expect(crop).toEqual({ x: 41, y: 0, width: 20, height: 100 });
  });
});
