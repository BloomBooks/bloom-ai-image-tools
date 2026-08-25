import { describe, expect, it } from "vite-plus/test";
import {
  DUMMY_TEXT_LINE_HEIGHT_FACTOR,
  DUMMY_TEXT_MAX_LIGHTNESS_PERCENT,
  DUMMY_TEXT_MAX_SATURATION_PERCENT,
  DUMMY_TEXT_MIN_CONTRAST_ON_WHITE,
  DUMMY_TEXT_MIN_LIGHTNESS_PERCENT,
  DUMMY_TEXT_MIN_SATURATION_PERCENT,
  layoutDummyText,
  pickDummyTextColor,
} from "../dummyImageText";

/** Pulls the three numbers out of an `hsl(h, s%, l%)` string. */
const parseHsl = (color: string) => {
  const match = color.match(/^hsl\((\d+(?:\.\d+)?), (\d+(?:\.\d+)?)%, (\d+(?:\.\d+)?)%\)$/);
  if (!match) {
    throw new Error(`Not an hsl() color: ${color}`);
  }
  return {
    hue: Number(match[1]),
    saturation: Number(match[2]),
    lightness: Number(match[3]),
  };
};

/** HSL to sRGB channels in 0..1, per the CSS Color definition. */
const hslToRgb = (hue: number, saturation: number, lightness: number) => {
  const s = saturation / 100;
  const l = lightness / 100;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
};

/** WCAG relative luminance of an sRGB color given as channels in 0..1. */
const relativeLuminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((value) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Contrast ratio of a color against pure white. */
const contrastAgainstWhite = (color: string) => {
  const { hue, saturation, lightness } = parseHsl(color);
  return 1.05 / (relativeLuminance(hslToRgb(hue, saturation, lightness)) + 0.05);
};

// A crude fixed-width measurer: enough to exercise the wrap and size search
// without a canvas (the unit tests run in node, with no DOM).
const CHAR_WIDTH_FACTOR = 0.6;
const measure = (text: string, fontSize: number) => text.length * fontSize * CHAR_WIDTH_FACTOR;

describe("pickDummyTextColor", () => {
  it("stays inside the dark, saturated range at both extremes of the randomness", () => {
    // Both extremes land on a red hue, which is dark enough at the requested
    // lightness that the contrast rule leaves it alone.
    const lowest = parseHsl(pickDummyTextColor(() => 0));
    expect(lowest.hue).toBe(0);
    expect(lowest.saturation).toBe(DUMMY_TEXT_MIN_SATURATION_PERCENT);
    expect(lowest.lightness).toBe(DUMMY_TEXT_MIN_LIGHTNESS_PERCENT);

    // 0.999... is the largest value Math.random can return.
    const highest = parseHsl(pickDummyTextColor(() => 0.9999999));
    expect(highest.hue).toBe(359);
    expect(highest.saturation).toBe(DUMMY_TEXT_MAX_SATURATION_PERCENT);
    expect(highest.lightness).toBe(DUMMY_TEXT_MAX_LIGHTNESS_PERCENT);
  });

  it("darkens a hue that would otherwise be too luminous, such as yellow", () => {
    // Hue 60 (yellow) at the top of the requested lightness range fails the
    // contrast rule, so the color it returns must be darker than that.
    const yellowAtMaxLightness = `hsl(60, 100%, ${DUMMY_TEXT_MAX_LIGHTNESS_PERCENT}%)`;
    expect(contrastAgainstWhite(yellowAtMaxLightness)).toBeLessThan(
      DUMMY_TEXT_MIN_CONTRAST_ON_WHITE,
    );

    // 60/360 gives hue 60; 1 gives the top of both the saturation and the
    // lightness range.
    const values = [60 / 360, 1, 1];
    const yellow = parseHsl(pickDummyTextColor(() => values.shift() ?? 1));
    expect(yellow.hue).toBe(60);
    expect(yellow.lightness).toBeLessThan(DUMMY_TEXT_MAX_LIGHTNESS_PERCENT);
    expect(
      contrastAgainstWhite(`hsl(60, ${yellow.saturation}%, ${yellow.lightness}%)`),
    ).toBeGreaterThanOrEqual(DUMMY_TEXT_MIN_CONTRAST_ON_WHITE);
  });

  it("is always clearly visible against a white background", () => {
    // Sanity check the measuring apparatus first: white on white must fail the
    // same test, so a passing result below means something.
    expect(contrastAgainstWhite("hsl(0, 0%, 100%)")).toBeLessThan(DUMMY_TEXT_MIN_CONTRAST_ON_WHITE);

    for (let i = 0; i < 500; i++) {
      const color = pickDummyTextColor();
      const { saturation, lightness } = parseHsl(color);
      expect(saturation).toBeGreaterThanOrEqual(DUMMY_TEXT_MIN_SATURATION_PERCENT);
      expect(lightness).toBeLessThanOrEqual(DUMMY_TEXT_MAX_LIGHTNESS_PERCENT);
      expect(contrastAgainstWhite(color)).toBeGreaterThanOrEqual(DUMMY_TEXT_MIN_CONTRAST_ON_WHITE);
    }
  });

  it("varies from one image to the next", () => {
    const colors = new Set(Array.from({ length: 50 }, () => pickDummyTextColor()));
    expect(colors.size).toBeGreaterThan(1);
  });
});

// The label Bloom sends as pageLabel, which is what the dummy normally draws.
const PAGE_LABEL = "Page 1 - Image 3";

describe("layoutDummyText", () => {
  it("returns nothing for empty text", () => {
    expect(layoutDummyText("   ", 1000, 1000, measure)).toBeNull();
  });

  it("wraps a page label onto separate lines and fills a square image", () => {
    const layout = layoutDummyText(PAGE_LABEL, 1024, 1024, measure);
    if (!layout) {
      throw new Error("Expected a layout for a page label that plainly fits.");
    }

    expect(layout.lines.join(" ")).toBe(PAGE_LABEL);
    for (const line of layout.lines) {
      expect(measure(line, layout.fontSize)).toBeLessThanOrEqual(1024);
    }
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(1024);
    expect(layout.lineHeight).toBeCloseTo(layout.fontSize * DUMMY_TEXT_LINE_HEIGHT_FACTOR);
  });

  it("keeps a short label on one line when the box is wide and short", () => {
    const layout = layoutDummyText("Page 1", 1000, 120, measure);
    if (!layout) {
      throw new Error("Expected a layout for text that plainly fits.");
    }
    expect(layout.lines).toEqual(["Page 1"]);
    expect(measure(layout.lines[0], layout.fontSize)).toBeLessThanOrEqual(1000);
    expect(layout.lineHeight).toBeLessThanOrEqual(120);
  });

  it("prefers a bigger font over fewer lines, since the text should be as large as fits", () => {
    // In a square box, "Page 1" set on two lines can use a much bigger font
    // than it could on one, so that is what the search should pick.
    const layout = layoutDummyText("Page 1", 1000, 1000, measure);
    if (!layout) {
      throw new Error("Expected a layout for text that plainly fits.");
    }
    const oneLine = layoutDummyText("Page 1", 1000, 120, measure);
    if (!oneLine) {
      throw new Error("Expected a layout for the single-line comparison.");
    }
    expect(layout.lines).toEqual(["Page", "1"]);
    expect(layout.fontSize).toBeGreaterThan(oneLine.fontSize);
  });

  it("wraps a long fallback prompt and keeps every line inside the box", () => {
    // With no page label the dummy falls back to the prompt, which is far
    // longer than any label and must still fit.
    const prompt = "a cheerful village scene with children playing under a very large mango tree";
    const layout = layoutDummyText(prompt, 800, 600, measure);
    if (!layout) {
      throw new Error("Expected a layout for a prompt that plainly fits.");
    }

    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.join(" ")).toBe(prompt);
    for (const line of layout.lines) {
      expect(measure(line, layout.fontSize)).toBeLessThanOrEqual(800);
    }
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(600);
  });

  it("picks a smaller font for a narrower box", () => {
    const wide = layoutDummyText(PAGE_LABEL, 1600, 1200, measure);
    const narrow = layoutDummyText(PAGE_LABEL, 400, 300, measure);
    if (!wide || !narrow) {
      throw new Error("Expected a layout for both boxes.");
    }
    expect(narrow.fontSize).toBeLessThan(wide.fontSize);
  });

  it("gives up when the box is too small for even the smallest text", () => {
    expect(layoutDummyText(PAGE_LABEL, 4, 4, measure)).toBeNull();
  });
});
