import { describe, expect, it } from "vitest";
import { buildInputImageRoster } from "../../services/openRouterService";

// The images API takes a bare `input_references` array with nowhere to put a
// label beside a picture, so the roster is the only way a name or a role
// reaches the model on that path.
describe("buildInputImageRoster", () => {
  it("names each input by number and purpose", () => {
    expect(buildInputImageRoster(3, [null, "Maria", null], 1)).toBe(
      [
        "Input images, in order:",
        "1. the image to edit",
        '2. a reference image, showing "Maria"',
        "3. a reference image",
      ].join("\n"),
    );
  });

  it("carries a name the user gave a character", () => {
    expect(buildInputImageRoster(1, ["Maria"], 1)).toContain('the image to edit, showing "Maria"');
  });

  it("says nothing about a lone unlabeled image, which needs no introduction", () => {
    expect(buildInputImageRoster(1, [], 1)).toBe("");
    expect(buildInputImageRoster(1, [null], 0)).toBe("");
    expect(buildInputImageRoster(0, [])).toBe("");
  });

  it("treats every image as a reference when nothing is being edited", () => {
    const roster = buildInputImageRoster(2, [], 0);
    expect(roster).toContain("1. a reference image");
    expect(roster).toContain("2. a reference image");
    expect(roster).not.toContain("the image to edit");
  });
});
