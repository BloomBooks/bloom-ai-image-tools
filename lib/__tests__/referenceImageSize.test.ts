import { describe, expect, it } from "vitest";
import { MAX_REFERENCE_IMAGE_EDGE, shrinkReferenceImage } from "../imageProcessing";

// The cap itself is measured, not chosen: see the comment on
// MAX_REFERENCE_IMAGE_EDGE and MODEL-COSTS.md. What matters here is that a run
// never fails because a reference could not be shrunk — the whole point is to
// save money, and money is worth less than the user's run.
describe("shrinkReferenceImage", () => {
  it("caps a reference at the measured cheapest edge", () => {
    expect(MAX_REFERENCE_IMAGE_EDGE).toBe(1024);
  });

  it("sends the original when the resize cannot run", async () => {
    // These tests run under node, where resizeImage's `new Image()` throws, so
    // this exercises the real failure path rather than a mocked one.
    const original = "data:image/png;base64,iVBORw0KGgo=";
    await expect(shrinkReferenceImage(original)).resolves.toBe(original);
  });
});
