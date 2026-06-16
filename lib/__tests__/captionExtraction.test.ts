import { describe, expect, it } from "vitest";
import { normalizeCaptionText, parseCaptionArray } from "../captionExtraction";

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
