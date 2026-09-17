import { describe, expect, it } from "vitest";
import {
  buildUpscaleOptions,
  CONTAINER_UPSCALE_TOKEN,
  fitInBox,
  HD_BOX_LONG_EDGE,
  HD_BOX_SHORT_EDGE,
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
  it("offers Container first, captioned with the pixels it asks for, when the host sent a target", () => {
    const options = buildUpscaleOptions(
      { width: 900, height: 600 },
      { width: 1417, height: 945, memo: "for a 120mm x 80mm container" },
    );

    expect(options.map((option) => option.token)).toEqual([
      CONTAINER_UPSCALE_TOKEN,
      "hd",
      "2k",
      "4k",
    ]);
    // A 3:2 image in a container measured at 1.4995:1 is already its shape,
    // so the container's own number stands.
    expect(options[0].label).toBe("Match Container");
    expect(options[0].caption).toBe("1417 x 945");
    expect(options[0].dimensions).toEqual({ width: 1417, height: 945 });
  });

  it("omits Container and starts at HD when the host sent no target", () => {
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
    const options = buildUpscaleOptions({ width: 900, height: 600 }, null, capEdge);

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

  it("ignores a host target with unusable dimensions", () => {
    const options = buildUpscaleOptions({ width: 900, height: 600 }, { width: 0, height: 945 });

    expect(options.map((option) => option.token)).toEqual(["hd", "2k", "4k"]);
  });
});

describe("resolveUpscaleTarget", () => {
  const source = { width: 900, height: 600 };
  const hostTarget = { width: 1417, height: 945 };

  it("returns the container's target for the container token", () => {
    expect(resolveUpscaleTarget(CONTAINER_UPSCALE_TOKEN, source, hostTarget)).toEqual(hostTarget);
  });

  it("falls back to HD for the container token with no host target", () => {
    expect(resolveUpscaleTarget(CONTAINER_UPSCALE_TOKEN, source)).toEqual({
      width: 1620,
      height: 1080,
    });
  });

  it("reads a token this build does not know as the default", () => {
    // The container when the host sent one, else HD.
    for (const stale of ["auto", "8k", "", undefined]) {
      expect(resolveUpscaleTarget(stale, source, hostTarget), String(stale)).toEqual(hostTarget);
      expect(resolveUpscaleTarget(stale, source), String(stale)).toEqual({
        width: 1620,
        height: 1080,
      });
    }
  });

  it("resolves the tier tokens off the image's shape", () => {
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
      CONTAINER_UPSCALE_TOKEN,
      { width: 900, height: 600 },
      {
        width: 1024,
        height: 683,
      },
    )!;

    expect(pickSizeTokenForLongEdge(Math.max(target.width, target.height))).toBe("1k");
  });
});

// BL-16742: a square picture in a 4:3 slot came back stretched into 4:3,
// because the request asked the model for the slot's own dimensions. On Match
// Image the request keeps the picture's shape and scales it until it covers
// the container.
describe("resolveAutoTarget", () => {
  const slot = { width: 1468, height: 1088 };

  it("keeps a square source square, big enough to cover the slot", () => {
    expect(resolveAutoTarget({ width: 1024, height: 1024 }, slot)).toEqual({
      width: 1468,
      height: 1468,
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

  it("covers the slot from a portrait source", () => {
    expect(resolveAutoTarget({ width: 1000, height: 1500 }, slot)).toEqual({
      width: 1468,
      height: 2202,
    });
  });

  it("falls back to the slot when the source dimensions are unknown", () => {
    expect(resolveAutoTarget(null, slot)).toEqual(slot);
  });

  it("is null without a host target", () => {
    expect(resolveAutoTarget({ width: 1024, height: 1024 }, null)).toBeNull();
  });

  it("drives the Container option and the resolved request alike", () => {
    const source = { width: 1024, height: 1024 };
    const options = buildUpscaleOptions(source, { ...slot, memo: "for a 124mm x 92mm container" });

    expect(options[0].caption).toBe("1468 x 1468");
    expect(resolveUpscaleTarget(CONTAINER_UPSCALE_TOKEN, source, slot)).toEqual({
      width: 1468,
      height: 1468,
    });
  });
});
