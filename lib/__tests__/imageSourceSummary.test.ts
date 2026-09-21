import { describe, expect, it } from "vitest";
import {
  describeImageSource,
  readImageSourceSummary,
  type ImageSourceSummary,
} from "../imageSourceSummary";
import type { L10nFunc } from "../localization";

const l10n: L10nFunc = (_id, english, p0, p1) =>
  english.replace("{0}", p0 ?? "").replace("{1}", p1 ?? "");

describe("readImageSourceSummary", () => {
  it("wraps a legacy sentence as a text summary", () => {
    expect(readImageSourceSummary("Images to edit: 2")).toEqual({
      kind: "text",
      text: "Images to edit: 2",
    });
  });

  it("drops an empty or unusable value", () => {
    expect(readImageSourceSummary("   ")).toBeNull();
    expect(readImageSourceSummary(undefined)).toBeNull();
    expect(readImageSourceSummary(42)).toBeNull();
    expect(readImageSourceSummary({ text: "no kind" })).toBeNull();
  });

  it("passes a structured summary through", () => {
    expect(readImageSourceSummary({ kind: "bookImage" })).toEqual({ kind: "bookImage" });
  });
});

describe("describeImageSource", () => {
  it("returns an array for a legacy string value", () => {
    // Old metadata stored a finished sentence where a structured summary now lives, and
    // both the info panel and the preview dialog index into the result.
    const legacy = "A picture from this book" as unknown as ImageSourceSummary;
    expect(describeImageSource(l10n, legacy)).toEqual([]);
    expect(describeImageSource(l10n, readImageSourceSummary(legacy))).toEqual([
      "A picture from this book",
    ]);
  });

  it("returns an array for an unknown kind", () => {
    const unknown = { kind: "somethingNewer" } as unknown as ImageSourceSummary;
    expect(describeImageSource(l10n, unknown)).toEqual([]);
  });

  it("describes a tool run", () => {
    expect(
      describeImageSource(l10n, { kind: "toolRun", editImageCount: 2, referenceImageCount: 0 }),
    ).toEqual(["Images to edit: 2"]);
  });
});
