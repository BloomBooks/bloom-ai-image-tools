import { describe, expect, it } from "vitest";
import {
  captionLeadingNumber,
  normalizeCaptionText,
  parseCaptionArray,
  stripLeadingTitle,
} from "../captionExtraction";

describe("normalizeCaptionText", () => {
  it("joins layout-wrapped lines into continuous text", () => {
    const wrapped =
      "9. Young children with\ndiarrhoea need every day tasty,\nmashed food and soups.";
    expect(normalizeCaptionText(wrapped)).toBe(
      "9. Young children with diarrhoea need every day tasty, mashed food and soups.",
    );
  });

  it("preserves genuine paragraph breaks (blank line)", () => {
    const text = "First line\nwrapped.\n\nSecond\nparagraph.";
    expect(normalizeCaptionText(text)).toBe("First line wrapped.\n\nSecond paragraph.");
  });

  it("collapses redundant whitespace and trims", () => {
    expect(normalizeCaptionText("  hello   world \n  again  ")).toBe("hello world again");
  });

  it("handles CRLF newlines", () => {
    expect(normalizeCaptionText("line one\r\nline two")).toBe("line one line two");
  });
});

describe("parseCaptionArray", () => {
  it("parses a plain JSON array of strings", () => {
    expect(parseCaptionArray('["one", "two", "three"]')).toEqual(["one", "two", "three"]);
  });

  it("tolerates markdown code fences and surrounding prose", () => {
    const channel = 'Here you go:\n```json\n["a", "b"]\n```\nThanks!';
    expect(parseCaptionArray(channel)).toEqual(["a", "b"]);
  });

  it("normalizes line wraps inside entries", () => {
    expect(parseCaptionArray('["first\\nsecond"]')).toEqual(["first second"]);
  });

  it("returns null when there is no array or it is unparseable", () => {
    expect(parseCaptionArray("no array here")).toBeNull();
    expect(parseCaptionArray("")).toBeNull();
    expect(parseCaptionArray(null)).toBeNull();
    expect(parseCaptionArray("[not, valid, json]")).toBeNull();
  });
});

describe("stripLeadingTitle", () => {
  it("drops a leading title ahead of a numbered list", () => {
    const captions = [
      "Coughs, colds and pneumonia 10 messages for children to learn & share",
      "1. Lungs help us breathe.",
      "2. Everyone gets coughs and colds.",
      "3. Handwashing with soap and water.",
    ];
    expect(stripLeadingTitle(captions)).toEqual([
      "1. Lungs help us breathe.",
      "2. Everyone gets coughs and colds.",
      "3. Handwashing with soap and water.",
    ]);
  });

  it("supports ')' style numbering", () => {
    expect(stripLeadingTitle(["My Title", "1) first", "2) second"])).toEqual([
      "1) first",
      "2) second",
    ]);
  });

  it("leaves an already-numbered first entry untouched", () => {
    const captions = ["1. first", "2. second", "3. third"];
    expect(stripLeadingTitle(captions)).toEqual(captions);
  });

  it("leaves an unnumbered list untouched", () => {
    const captions = ["alpha", "beta", "gamma"];
    expect(stripLeadingTitle(captions)).toEqual(captions);
  });

  it("does not strip when a numbered entry precedes the '1.' entry (out of order)", () => {
    const captions = ["2. second", "1. first", "3. third"];
    expect(stripLeadingTitle(captions)).toEqual(captions);
  });

  it("returns short lists unchanged", () => {
    expect(stripLeadingTitle(["only one"])).toEqual(["only one"]);
    expect(stripLeadingTitle([])).toEqual([]);
  });
});

describe("captionLeadingNumber", () => {
  it("reads the leading panel number", () => {
    expect(captionLeadingNumber("1. Lungs help us breathe.")).toBe(1);
    expect(captionLeadingNumber("10. Stop coughs spreading.")).toBe(10);
    expect(captionLeadingNumber("2) second style")).toBe(2);
  });

  it("returns null when there is no leading number", () => {
    expect(captionLeadingNumber("Lungs help us breathe.")).toBeNull();
    expect(captionLeadingNumber("")).toBeNull();
    expect(captionLeadingNumber(null)).toBeNull();
    expect(captionLeadingNumber(undefined)).toBeNull();
  });

  it("does not read a number from mid-caption text", () => {
    expect(captionLeadingNumber("Wait 20 seconds")).toBeNull();
  });
});
