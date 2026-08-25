/**
 * Helpers the Local Dummy model uses to paint text onto the image it returns,
 * so two dummy results are told apart at a glance. The text is the page label
 * of the book image being worked on ("Page 1 - Image 3"), or the prompt when
 * there is no such label. Everything here is pure (no canvas, no DOM) so it is
 * unit-testable; the caller supplies the text measurement and does the actual
 * drawing. See `createLocalDummyImage` in services/openRouterService.ts.
 */

/**
 * The color is picked at random per image, but only from the part of the HSL
 * space that reads clearly on the white dummy background: any hue, a strong
 * saturation, and a low-to-medium lightness.
 */
export const DUMMY_TEXT_MIN_SATURATION_PERCENT = 70;
export const DUMMY_TEXT_MAX_SATURATION_PERCENT = 100;
export const DUMMY_TEXT_MIN_LIGHTNESS_PERCENT = 20;
export const DUMMY_TEXT_MAX_LIGHTNESS_PERCENT = 42;

/**
 * The contrast ratio the color must reach against white, which is the WCAG AA
 * threshold for readable text. A lightness cap alone does not deliver this: at
 * the same lightness a saturated yellow is far more luminous than a saturated
 * blue, so the yellows and greens have to be darkened further. See
 * `darkenUntilVisibleOnWhite`.
 */
export const DUMMY_TEXT_MIN_CONTRAST_ON_WHITE = 4.5;

/** Converts an HSL color to sRGB channels in 0..1, per the CSS Color definition. */
const hslToRgb = (hue: number, saturationPercent: number, lightnessPercent: number): number[] => {
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
};

/** WCAG relative luminance of sRGB channels given in 0..1. */
const relativeLuminance = (rgb: number[]): number => {
  const [red, green, blue] = rgb.map((value) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** Contrast ratio of an HSL color against pure white. */
const contrastOnWhite = (hue: number, saturation: number, lightness: number): number =>
  1.05 / (relativeLuminance(hslToRgb(hue, saturation, lightness)) + 0.05);

/**
 * Lowers the lightness one percentage point at a time until the color clears
 * `DUMMY_TEXT_MIN_CONTRAST_ON_WHITE`. Every hue reaches the threshold well
 * before black, so this always terminates with a visible color.
 */
const darkenUntilVisibleOnWhite = (hue: number, saturation: number, lightness: number): number => {
  let result = lightness;
  while (
    result > 1 &&
    contrastOnWhite(hue, saturation, result) < DUMMY_TEXT_MIN_CONTRAST_ON_WHITE
  ) {
    result -= 1;
  }
  return result;
};

/**
 * Picks a random dark, saturated color for the text, as an `hsl(...)`
 * string. The result is guaranteed to be clearly visible on white.
 * @param random - Source of randomness; injectable so tests can drive the
 *   extremes of the range deterministically.
 */
export const pickDummyTextColor = (random: () => number = Math.random): string => {
  const hue = Math.floor(random() * 360);
  const saturation = Math.round(
    DUMMY_TEXT_MIN_SATURATION_PERCENT +
      random() * (DUMMY_TEXT_MAX_SATURATION_PERCENT - DUMMY_TEXT_MIN_SATURATION_PERCENT),
  );
  const requestedLightness = Math.round(
    DUMMY_TEXT_MIN_LIGHTNESS_PERCENT +
      random() * (DUMMY_TEXT_MAX_LIGHTNESS_PERCENT - DUMMY_TEXT_MIN_LIGHTNESS_PERCENT),
  );
  const lightness = darkenUntilVisibleOnWhite(hue, saturation, requestedLightness);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/** Measures one run of text at one font size, in pixels. */
export type DummyTextMeasurer = (text: string, fontSize: number) => number;

export type DummyTextLayout = {
  fontSize: number;
  lines: string[];
  lineHeight: number;
};

/** Line spacing as a multiple of the font size. */
export const DUMMY_TEXT_LINE_HEIGHT_FACTOR = 1.15;

/** The smallest font size worth trying; below this the text is unreadable anyway. */
const MIN_FONT_SIZE = 8;

/**
 * Breaks `text` into lines that each measure no wider than `maxWidth` at
 * `fontSize`. A single word too long for the line is left on its own
 * overlong line rather than being split mid-word; the caller's size search
 * rejects that size because the line is too wide.
 */
const wrapText = (
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: DummyTextMeasurer,
): string[] => {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
};

/**
 * Finds the largest font size at which the wrapped text fits inside the given
 * box, and returns the lines to draw at that size. Returns null when the text
 * is empty or the box is too small for even the minimum size.
 * @param measure - Measures a string at a font size (the canvas context does
 *   this in production).
 */
export const layoutDummyText = (
  text: string,
  maxWidth: number,
  maxHeight: number,
  measure: DummyTextMeasurer,
): DummyTextLayout | null => {
  const trimmed = text.trim();
  if (!trimmed || maxWidth <= 0 || maxHeight <= 0) {
    return null;
  }

  const fits = (fontSize: number): DummyTextLayout | null => {
    const lines = wrapText(trimmed, fontSize, maxWidth, measure);
    if (lines.length === 0) {
      return null;
    }
    const lineHeight = fontSize * DUMMY_TEXT_LINE_HEIGHT_FACTOR;
    if (lines.length * lineHeight > maxHeight) {
      return null;
    }
    if (lines.some((line) => measure(line, fontSize) > maxWidth)) {
      return null;
    }
    return { fontSize, lines, lineHeight };
  };

  // Binary search over the font size. The upper bound is the tallest a single
  // line could ever be, so the answer is always inside the range.
  let low = MIN_FONT_SIZE;
  let high = Math.floor(maxHeight);
  let best = fits(low);
  if (!best) {
    return null;
  }

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const layout = fits(middle);
    if (layout) {
      best = layout;
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return best;
};
