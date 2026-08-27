import { describe, expect, it } from "vitest";
import {
  buildUpscaleOptions,
  fitInBox,
  HD_BOX_LONG_EDGE,
  HD_BOX_SHORT_EDGE,
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
  it("offers Auto first, labeled with the host's dimensions, when the host sent a target", () => {
    const options = buildUpscaleOptions(
      { width: 900, height: 600 },
      { width: 1417, height: 945, memo: "for a 120mm x 80mm container" },
    );

    expect(options.map((option) => option.token)).toEqual(["auto", "hd", "2k", "4k"]);
    expect(options[0].label).toBe("Auto (1417 x 945)");
    expect(options[0].dimensions).toEqual({ width: 1417, height: 945 });
  });

  it("omits Auto and starts at HD when the host sent no target", () => {
    const options = buildUpscaleOptions({ width: 900, height: 600 });

    expect(options.map((option) => option.token)).toEqual(["hd", "2k", "4k"]);
    expect(options[0].label).toBe("HD (1620 x 1080)");
  });

  it("keeps the source aspect ratio in the 2K and 4K labels", () => {
    const options = buildUpscaleOptions({ width: 900, height: 600 });

    expect(options[1].label).toBe("2K (2048 x 1365)");
    expect(options[2].label).toBe("4K (4096 x 2731)");
  });

  it("puts the long edge on the tall side for a portrait source", () => {
    const options = buildUpscaleOptions({ width: 600, height: 900 });

    expect(options[1].dimensions).toEqual({ width: 1365, height: 2048 });
    expect(options[2].dimensions).toEqual({ width: 2731, height: 4096 });
  });

  it("falls back to bare labels when the source dimensions are unknown", () => {
    const options = buildUpscaleOptions(null);

    expect(options.map((option) => option.label)).toEqual(["HD", "2K", "4K"]);
    expect(options.every((option) => option.dimensions === null)).toBe(true);
  });

  it("ignores a host target with unusable dimensions", () => {
    const options = buildUpscaleOptions({ width: 900, height: 600 }, { width: 0, height: 945 });

    expect(options.map((option) => option.token)).toEqual(["hd", "2k", "4k"]);
  });
});

describe("resolveUpscaleTarget", () => {
  const source = { width: 900, height: 600 };
  const hostTarget = { width: 1417, height: 945 };

  it("returns the host's target for auto", () => {
    expect(resolveUpscaleTarget("auto", source, hostTarget)).toEqual(hostTarget);
  });

  it("falls back to HD for auto with no host target", () => {
    expect(resolveUpscaleTarget("auto", source)).toEqual({ width: 1620, height: 1080 });
  });

  it("falls back to HD for a token this build does not know", () => {
    expect(resolveUpscaleTarget("8k", source, hostTarget)).toEqual({ width: 1620, height: 1080 });
    expect(resolveUpscaleTarget("", source, hostTarget)).toEqual({ width: 1620, height: 1080 });
    expect(resolveUpscaleTarget(undefined, source, hostTarget)).toEqual({
      width: 1620,
      height: 1080,
    });
  });

  it("resolves the tier tokens off the source aspect ratio", () => {
    expect(resolveUpscaleTarget("2k", source, hostTarget)).toEqual({ width: 2048, height: 1365 });
    expect(resolveUpscaleTarget("4K", source, hostTarget)).toEqual({ width: 4096, height: 2731 });
  });

  it("returns null when there is nothing to scale and no host target", () => {
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

  it("maps a small host target down to the 1k tier", () => {
    const target = resolveUpscaleTarget(
      "auto",
      { width: 900, height: 600 },
      {
        width: 1024,
        height: 683,
      },
    )!;

    expect(pickSizeTokenForLongEdge(Math.max(target.width, target.height))).toBe("1k");
  });
});
