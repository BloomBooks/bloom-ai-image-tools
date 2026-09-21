import { describe, expect, it } from "vitest";
import {
  classifyImageKind,
  IMAGE_KIND_ILLUSTRATION,
  IMAGE_KIND_LINE_DRAWING,
  IMAGE_KIND_PHOTO,
  imageKindOption,
  imageKindStats,
  majorityImageKind,
  pickedImageKind,
  resolveImageKind,
} from "../imageKind";

type Rgb = [number, number, number];

/** A raster painted from a function of (x, y) to a colour. */
const raster = (width: number, height: number, paint: (x: number, y: number) => Rgb) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
};

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [10, 10, 10];
const YELLOWED: Rgb = [236, 222, 186];
const FADED_INK: Rgb = [150, 140, 120];

describe("classifyImageKind", () => {
  it("calls black lines on white paper a line drawing", () => {
    const image = raster(100, 100, (x, y) => (x % 10 === 0 || y % 10 === 0 ? BLACK : WHITE));
    expect(classifyImageKind(image)).toBe("line-art");
  });

  it("still calls it a line drawing when the paper has yellowed and the ink faded", () => {
    const image = raster(100, 100, (x, y) => (x % 10 === 0 || y % 10 === 0 ? FADED_INK : YELLOWED));
    const stats = imageKindStats(image);
    expect(stats.neutral).toBeGreaterThan(0.9);
    expect(classifyImageKind(image)).toBe("line-art");
  });

  it("calls a coloured painting something else", () => {
    const image = raster(100, 100, (x, y) => [80 + x, 160, 60 + y]);
    expect(classifyImageKind(image)).toBe("other");
  });

  it("calls a watercolour on white paper, low in contrast but painted, something else", () => {
    // Washes of blue and orange between white: mostly paper, but the marks on
    // it are paint, not ink.
    const image = raster(100, 100, (x, y) =>
      (x + y) % 5 < 3 ? WHITE : y < 50 ? [120, 150, 220] : [220, 140, 90],
    );
    const stats = imageKindStats(image);
    expect(stats.light).toBeGreaterThan(0.5);
    expect(stats.neutralInk).toBeLessThan(0.5);
    expect(classifyImageKind(image)).toBe("other");
  });

  it("calls a greyscale photograph, all midtones, something else", () => {
    const image = raster(100, 100, (x, y) => {
      const v = 125 + ((x + y) % 40);
      return [v, v, v];
    });
    expect(imageKindStats(image).midtone).toBeGreaterThan(0.5);
    expect(classifyImageKind(image)).toBe("other");
  });

  it("calls a mostly black picture something else, even with no hue", () => {
    const image = raster(100, 100, (x) => (x < 80 ? BLACK : WHITE));
    expect(classifyImageKind(image)).toBe("other");
  });
});

describe("pickedImageKind", () => {
  it("reads the three choices, with Illustration and Photo alike for now", () => {
    expect(pickedImageKind(IMAGE_KIND_LINE_DRAWING)).toBe("line-art");
    expect(pickedImageKind(IMAGE_KIND_ILLUSTRATION)).toBe("other");
    expect(pickedImageKind(IMAGE_KIND_PHOTO)).toBe("other");
    expect(pickedImageKind("")).toBeNull();
    expect(pickedImageKind(undefined)).toBeNull();
  });

  it("maps the detector's verdict to a choice", () => {
    expect(imageKindOption("line-art")).toBe(IMAGE_KIND_LINE_DRAWING);
    expect(imageKindOption("other")).toBe(IMAGE_KIND_ILLUSTRATION);
  });
});

describe("majorityImageKind", () => {
  it("takes the kind most of the images are", () => {
    expect(majorityImageKind(["line-art", "line-art", "other"])).toBe("line-art");
    expect(majorityImageKind(["other", "other", "line-art"])).toBe("other");
  });

  it("gives a tie, and an empty set, to the kind whose prompt is safe on a drawing", () => {
    expect(majorityImageKind(["line-art", "other"])).toBe("other");
    expect(majorityImageKind([])).toBe("other");
  });
});

describe("resolveImageKind", () => {
  it("uses the user's pick for every image of a run", () => {
    expect(resolveImageKind({ picked: "line-art", fromUser: true, detected: "other" })).toBe(
      "line-art",
    );
    expect(resolveImageKind({ picked: null, fromUser: true, detected: "line-art" })).toBe("other");
  });

  it("judges each image on its own pixels when the choice is only a guess", () => {
    expect(resolveImageKind({ picked: "line-art", fromUser: false, detected: "other" })).toBe(
      "other",
    );
    expect(resolveImageKind({ picked: "line-art", fromUser: false, detected: null })).toBe(
      "line-art",
    );
    expect(resolveImageKind({ picked: null, fromUser: false, detected: null })).toBe("other");
  });
});
