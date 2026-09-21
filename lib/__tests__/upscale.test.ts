import { describe, expect, it } from "vitest";
import {
  buildUpscaleOptions,
  CONTAINER_UPSCALE_TOKEN,
  fitInBox,
  HD_BOX_LONG_EDGE,
  HD_BOX_SHORT_EDGE,
  letterboxPromptInstruction,
  planScaleUp,
  resolveAutoTarget,
  resolveUpscaleTarget,
} from "../upscale";
import { pickSizeTokenForLongEdge } from "../imageSizes";

const fitHd = (source: { width: number; height: number } | null) =>
  fitInBox(source, HD_BOX_LONG_EDGE, HD_BOX_SHORT_EDGE);

describe("fitInBox", () => {
  it("orients the HD box to match a landscape source", () => {
    expect(fitHd({ width: 3000, height: 2000 })).toEqual({ width: 1620, height: 1080 });
  });

  it("orients the HD box to match a portrait source", () => {
    expect(fitHd({ width: 2000, height: 3000 })).toEqual({ width: 1080, height: 1620 });
  });

  it("fills the box exactly for a 16:9 source", () => {
    expect(fitHd({ width: 3840, height: 2160 })).toEqual({ width: 1920, height: 1080 });
  });

  it("treats a square source as landscape", () => {
    expect(fitHd({ width: 800, height: 800 })).toEqual({ width: 1080, height: 1080 });
  });

  it("rounds to whole pixels", () => {
    expect(fitHd({ width: 1000, height: 333 })).toEqual({ width: 1920, height: 639 });
  });

  it("returns null when the source dimensions are unknown", () => {
    expect(fitHd(null)).toBeNull();
    expect(fitHd({ width: 0, height: 0 })).toBeNull();
  });
});

describe("buildUpscaleOptions", () => {
  it("starts at HD", () => {
    const options = buildUpscaleOptions({ width: 900, height: 600 });

    expect(options.map((option) => option.token)).toEqual(["hd", "2k", "4k"]);
    expect(options[0].label).toBe("HD");
    expect(options[0].caption).toBe("1620 x 1080");
  });

  it("keeps the image's shape in the 2K and 4K captions", () => {
    const options = buildUpscaleOptions({ width: 900, height: 600 });

    expect(options[1].caption).toBe("2048 x 1365");
    expect(options[2].caption).toBe("4096 x 2731");
  });

  it("captions with the snapped size when the model changes the pixels it is sent", () => {
    // The caller passes how the selected model snaps a request (GPT Image 2.5
    // caps an edge at 3840); the caption then says what will actually be sent.
    const capEdge = (d: { width: number; height: number } | null) =>
      d && d.width > 3840 ? { width: 3840, height: Math.round((3840 * d.height) / d.width) } : d;
    const options = buildUpscaleOptions({ width: 900, height: 600 }, capEdge);

    expect(options[1].caption).toBe("2048 x 1365");
    expect(options[2].caption).toBe("3840 x 2560");
    expect(options[2].dimensions).toEqual({ width: 3840, height: 2560 });
  });

  it("puts the long edge on the tall side for a portrait source", () => {
    const options = buildUpscaleOptions({ width: 600, height: 900 });

    expect(options[1].dimensions).toEqual({ width: 1365, height: 2048 });
    expect(options[2].dimensions).toEqual({ width: 2731, height: 4096 });
  });

  it("leaves the captions off when the source dimensions are unknown", () => {
    const options = buildUpscaleOptions(null);

    expect(options.map((option) => option.label)).toEqual(["HD", "2K", "4K"]);
    expect(options.every((option) => option.caption === undefined)).toBe(true);
    expect(options.every((option) => option.dimensions === null)).toBe(true);
  });

  it("never captions a tier below the picture's own size", () => {
    const options = buildUpscaleOptions({ width: 2400, height: 1800 });

    expect(options[0].caption).toBe("2400 x 1800");
    expect(options[1].caption).toBe("2400 x 1800");
    expect(options[2].caption).toBe("4096 x 3072");
  });
});

describe("resolveUpscaleTarget", () => {
  const source = { width: 900, height: 600 };

  it("resolves the stored default to HD", () => {
    expect(resolveUpscaleTarget(CONTAINER_UPSCALE_TOKEN, source)).toEqual({
      width: 1620,
      height: 1080,
    });
  });

  it("reads a token this build does not know as the default", () => {
    for (const stale of ["auto", "8k", "", undefined]) {
      expect(resolveUpscaleTarget(stale, source), String(stale)).toEqual({
        width: 1620,
        height: 1080,
      });
    }
  });

  it("resolves the tier tokens off the image's shape", () => {
    expect(resolveUpscaleTarget("2k", source)).toEqual({ width: 2048, height: 1365 });
    expect(resolveUpscaleTarget("4K", source)).toEqual({ width: 4096, height: 2731 });
  });

  it("never asks for fewer pixels than the picture already has", () => {
    // Inside Bloom with no container sent, the menu does not show and the
    // stored default is all there is; HD would shrink this picture.
    const big = { width: 2400, height: 1800 };
    expect(resolveUpscaleTarget(CONTAINER_UPSCALE_TOKEN, big)).toEqual(big);
    expect(resolveUpscaleTarget("hd", big)).toEqual(big);
    expect(resolveUpscaleTarget("2k", big)).toEqual(big);
    expect(resolveUpscaleTarget("4k", big)).toEqual({ width: 4096, height: 3072 });
  });

  it("returns null when there is nothing to scale", () => {
    expect(resolveUpscaleTarget("hd", null)).toBeNull();
  });
});

describe("size tier the request maps to", () => {
  // The model only ever sees a tier token, so check the boundaries the
  // selector's targets land on.
  it("maps HD and the tiers to the smallest tier at or above them", () => {
    const source = { width: 900, height: 600 };

    const hd = resolveUpscaleTarget("hd", source)!;
    expect(pickSizeTokenForLongEdge(Math.max(hd.width, hd.height))).toBe("2k");

    const twoK = resolveUpscaleTarget("2k", source)!;
    expect(pickSizeTokenForLongEdge(Math.max(twoK.width, twoK.height))).toBe("2k");

    const fourK = resolveUpscaleTarget("4k", source)!;
    expect(pickSizeTokenForLongEdge(Math.max(fourK.width, fourK.height))).toBe("4k");
  });

  it("maps a small picture's default target up to the 2k tier", () => {
    const target = resolveUpscaleTarget(CONTAINER_UPSCALE_TOKEN, { width: 512, height: 341 })!;

    expect(pickSizeTokenForLongEdge(Math.max(target.width, target.height))).toBe("2k");
  });
});

// BL-16742: a square picture in a 4:3 slot came back stretched into 4:3,
// because the request asked the model for the slot's own dimensions. On Match
// Image the request keeps the picture's shape and scales it up until either
// edge meets the container's.
describe("resolveAutoTarget", () => {
  const slot = { width: 1468, height: 1088 };

  it("keeps a square source square, stopping at the slot's shorter edge", () => {
    expect(resolveAutoTarget({ width: 1024, height: 1024 }, slot)).toEqual({
      width: 1088,
      height: 1088,
    });
  });

  it("returns the slot itself when the shapes already agree", () => {
    expect(resolveAutoTarget({ width: 734, height: 544 }, slot)).toEqual(slot);
  });

  it("returns the slot itself for a shape that differs only by measurement noise", () => {
    // 3:2 source, slot measured at 1.4995:1 — a picture already the shape of
    // its slot must not be nudged off the host's own number.
    expect(resolveAutoTarget({ width: 900, height: 600 }, { width: 1417, height: 945 })).toEqual({
      width: 1417,
      height: 945,
    });
  });

  it("fits a portrait source inside a landscape slot by height", () => {
    expect(resolveAutoTarget({ width: 1000, height: 1500 }, slot)).toEqual({
      width: 725,
      height: 1088,
    });
  });

  it("falls back to the slot when the source dimensions are unknown", () => {
    expect(resolveAutoTarget(null, slot)).toEqual(slot);
  });

  it("is null without a host target", () => {
    expect(resolveAutoTarget({ width: 1024, height: 1024 }, null)).toBeNull();
  });
});

// Inside a container there is nothing to choose; the plan says what the run
// asks for and what the card says. A pixel-size model's limits (3:1, 3840)
// are those of GPT Image 2.5.
describe("planScaleUp", () => {
  const limits = { maxEdge: 3840, maxEdgeRatio: 3 };
  const slot = { width: 1468, height: 1088 };

  it("has no container to plan for without a host target", () => {
    expect(planScaleUp({ width: 1024, height: 1024 }, null, limits).state).toBe("no-container");
  });

  it("asks a tier-token model for the fitted target as it is", () => {
    const plan = planScaleUp({ width: 400, height: 400 }, slot, null);
    expect(plan.state).toBe("to-page");
    expect(plan.target).toEqual({ width: 1088, height: 1088 });
    expect(plan.request).toEqual({ width: 1088, height: 1088 });
    expect(plan.letterbox).toBeNull();
    expect(plan.percent).toBe(100);
  });

  it("snaps a pixel-size model's request to its grid without calling that a limit", () => {
    const plan = planScaleUp({ width: 400, height: 400 }, slot, limits);
    expect(plan.state).toBe("to-page");
    expect(plan.request).toEqual({ width: 1088, height: 1088 });
  });

  it("letterboxes a strip wider than the model allows, filling the width", () => {
    // 16:1 in a slot 3840 wide: the picture can have 3840 x 240, and the
    // canvas is the widest legal shape around it.
    const plan = planScaleUp({ width: 960, height: 60 }, { width: 3840, height: 1000 }, limits);
    expect(plan.request).toEqual({ width: 3840, height: 1280 });
    expect(plan.achievable).toEqual({ width: 3840, height: 240 });
    expect(plan.letterbox).toEqual({
      fills: "width",
      content: { x: 0, y: 520, width: 3840, height: 240 },
    });
    expect(plan.state).toBe("to-page");
  });

  it("letterboxes a tall strip, filling the height", () => {
    const plan = planScaleUp({ width: 60, height: 480 }, { width: 1000, height: 3840 }, limits);
    expect(plan.request).toEqual({ width: 1280, height: 3840 });
    expect(plan.achievable).toEqual({ width: 480, height: 3840 });
    expect(plan.letterbox?.fills).toBe("height");
    expect(plan.letterbox?.content).toEqual({ x: 400, y: 0, width: 480, height: 3840 });
  });

  it("says the model is the limit, as a share of the page's size in tens", () => {
    // The page wants 4800 on the long edge; the model stops at 3840, which is
    // 80% of it.
    const plan = planScaleUp({ width: 960, height: 60 }, { width: 4800, height: 1000 }, limits);
    expect(plan.state).toBe("model-limit");
    expect(plan.percent).toBe(80);
    expect(plan.achievable).toEqual({ width: 3840, height: 240 });
  });

  it("keeps a picture that already has the page's pixels at its own size", () => {
    const plan = planScaleUp({ width: 3000, height: 2000 }, { width: 1417, height: 945 }, limits);
    expect(plan.state).toBe("already-enough");
    expect(plan.target).toEqual({ width: 3000, height: 2000 });
    expect(plan.request).toEqual({ width: 3008, height: 2000 });
    expect(plan.percent).toBe(100);
  });

  it("words the padding instruction for the axis the picture fills", () => {
    const wide = letterboxPromptInstruction(
      { width: 3840, height: 1280 },
      { fills: "width", content: { x: 0, y: 520, width: 3840, height: 240 } },
    );
    expect(wide).toContain("3840 x 1280 pixels");
    expect(wide).toContain("fills the full width");
    expect(wide).toContain("above and below");
    const tall = letterboxPromptInstruction(
      { width: 1280, height: 3840 },
      { fills: "height", content: { x: 400, y: 0, width: 480, height: 3840 } },
    );
    expect(tall).toContain("fills the full height");
    expect(tall).toContain("left and right of");
  });
});
