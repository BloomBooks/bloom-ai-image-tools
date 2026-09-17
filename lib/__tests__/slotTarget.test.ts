import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";
import type { ToolDefinition } from "../../types";
import { MATCH_CONTAINER_ASPECT_RATIO, MATCH_IMAGE_ASPECT_RATIO } from "../aspectRatios";
import { getRequestedAspectRatioValue } from "../toolHelpers";
import { resolveAutoTarget } from "../upscale";
import {
  CONTAINER_SIZE_TOKEN,
  DEFAULT_STANDALONE_SIZE_TOKEN,
  findSizeParam,
  pickedSizeTier,
  resolveSizeTokenValue,
  resolveSlotTarget,
  toolCanFollowSlot,
} from "../slotTarget";

const getTool = (id: string): ToolDefinition => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`missing tool ${id}`);
  return tool;
};

// A landscape image container, as Bloom describes one.
const CONTAINER = { width: 1417, height: 945 };
// The 4:3 container from the square-image bug report.
const BLOOM_CONTAINER = { width: 1472, height: 1104 };
// An existing image whose shape is not the container's.
const IMAGE = { width: 800, height: 600 };
const GEMINI_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

const resolveFor = (
  tool: ToolDefinition,
  params: Record<string, string>,
  options: {
    host?: { width: number; height: number } | null;
    image?: { width: number; height: number } | null;
  } = {},
) =>
  resolveSlotTarget({
    tool,
    params,
    hostTarget: options.host === undefined ? CONTAINER : options.host,
    imageResolution: options.image ?? null,
    requestedAspectRatio: getRequestedAspectRatioValue(tool, params),
    supportedAspectRatios: GEMINI_RATIOS,
  });

describe("which tools follow the image container", () => {
  it("includes the edit tools and the generation tools", () => {
    expect(toolCanFollowSlot(getTool("remove_object"))).toBe(true);
    expect(toolCanFollowSlot(getTool("generate_image"))).toBe(true);
    expect(toolCanFollowSlot(getTool("coloring_book"))).toBe(true);
  });

  it("excludes the tools whose result is not the container's picture", () => {
    // Upscale's Target Resolution has its own Match Container row.
    expect(toolCanFollowSlot(getTool("upscale"))).toBe(false);
    // Break-comic matches the page it cuts up.
    expect(toolCanFollowSlot(getTool("break_comic_into_images"))).toBe(false);
    // Sheets that are split afterwards, and a fixed-shape strip.
    expect(toolCanFollowSlot(getTool("extract_cast_of_characters"))).toBe(false);
    expect(toolCanFollowSlot(getTool("generate_pallet"))).toBe(false);
  });
});

describe("resolveSlotTarget: shape", () => {
  it("keeps an edit in its image's shape, covering the container", () => {
    // An edit tool defaults to Match Image. The pixels are the image's shape
    // scaled to cover the container, so Bloom loses nothing fitting it.
    const target = resolveFor(getTool("remove_object"), {}, { image: IMAGE });
    expect(target?.shapeSource).toBe("image");
    expect(target?.aspectRatio).toBe("4:3");
    expect(target?.targetDimensions).toEqual(resolveAutoTarget(IMAGE, CONTAINER));
    expect(target?.targetDimensions.width).toBe(CONTAINER.width);
    expect(target?.targetDimensions.height).toBeGreaterThan(CONTAINER.height);
    expect(target?.sizeSource).toBe("container");
    expect(target?.sizeToken).toBe("2k");
  });

  it("reshapes an edit to the container only when asked", () => {
    const target = resolveFor(
      getTool("coloring_book"),
      { aspectRatio: MATCH_CONTAINER_ASPECT_RATIO },
      { image: IMAGE },
    );
    expect(target?.shapeSource).toBe("container");
    expect(target?.aspectRatio).toBe("3:2");
    expect(target?.targetDimensions).toEqual(CONTAINER);
  });

  it("gives a picture made from nothing the container's own pixels", () => {
    const tool = getTool("generate_image");
    const target = resolveFor(tool, {});
    expect(target?.shapeSource).toBe("container");
    expect(target?.aspectRatio).toBe("3:2");
    expect(target?.targetDimensions).toEqual(CONTAINER);
    expect(target?.sizeSource).toBe("container");
    // The pickers' defaults are the container, so an untouched tool follows it.
    expect(findSizeParam(tool.parameters)?.defaultValue).toBe(CONTAINER_SIZE_TOKEN);
    expect(getRequestedAspectRatioValue(tool, {})).toBe(MATCH_CONTAINER_ASPECT_RATIO);
  });

  it("falls back to the container when Match Image has no image to match", () => {
    const target = resolveFor(getTool("generate_image"), { aspectRatio: MATCH_IMAGE_ASPECT_RATIO });
    expect(target?.shapeSource).toBe("container");
    expect(target?.targetDimensions).toEqual(CONTAINER);
  });

  it("does not reframe an edit whose image size is not known yet", () => {
    // Match Image with nothing measured has no shape to keep, so the run does
    // not follow the container rather than take the container's shape.
    expect(resolveFor(getTool("remove_object"), {}, { image: null })).toBeNull();
  });

  it("picks the tier from the covering pixels, not the container's own", () => {
    // A tall image covering a wide container needs far more than the
    // container's long edge.
    const target = resolveFor(
      getTool("remove_object"),
      {},
      { host: { width: 2048, height: 1024 }, image: { width: 300, height: 900 } },
    );
    expect(target?.targetDimensions).toEqual({ width: 2048, height: 6144 });
    expect(target?.sizeToken).toBe("4k");
  });

  it("keeps a fixed shape the user set, at the container's long edge", () => {
    const target = resolveFor(getTool("change_style"), { aspectRatio: "1:1" }, { image: IMAGE });
    expect(target?.shapeSource).toBe("fixed");
    expect(target?.aspectRatio).toBe("1:1");
    expect(target?.targetDimensions).toEqual({ width: 1417, height: 1417 });
    expect(target?.sizeToken).toBe("2k");
  });

  it("treats a stored shape from an older build as unset", () => {
    const target = resolveFor(getTool("remove_object"), { aspectRatio: "auto" }, { image: IMAGE });
    expect(target?.shapeSource).toBe("image");
  });
});

describe("resolveSlotTarget: size", () => {
  it("keeps the shape when the user picks a tier", () => {
    // The reported bug: picking a tier handed the shape back to the tool's own
    // default, so a 4:3 container got a prompt asking for a 1:1 square.
    const target = resolveFor(getTool("generate_image"), { size: "1k" }, { host: BLOOM_CONTAINER });
    expect(target?.shapeSource).toBe("container");
    expect(target?.aspectRatio).toBe("4:3");
    expect(target?.targetDimensions).toEqual({ width: 1024, height: 768 });
    expect(target?.sizeToken).toBe("1k");
    expect(target?.sizeSource).toBe("tier");
  });

  it("asks for the picked tier's pixels rather than the container's", () => {
    const target = resolveFor(getTool("generate_image"), { size: "4k" });
    expect(target?.sizeToken).toBe("4k");
    expect(target?.aspectRatio).toBe("3:2");
    // The container's real shape (1417:945), not the named ratio nearest it,
    // scaled to the tier's long edge; the model's own snapping comes later.
    expect(target?.targetDimensions).toEqual({ width: 3840, height: 2561 });
  });

  it("scales an image's shape to a picked tier too", () => {
    const target = resolveFor(getTool("coloring_book"), { size: "2k" }, { image: IMAGE });
    expect(target?.shapeSource).toBe("image");
    expect(target?.targetDimensions).toEqual({ width: 2048, height: 1536 });
  });

  it("lets a fixed shape and a picked tier combine", () => {
    const target = resolveFor(getTool("generate_image"), { size: "1k", aspectRatio: "9:16" });
    expect(target?.aspectRatio).toBe("9:16");
    expect(target?.targetDimensions).toEqual({ width: 576, height: 1024 });
  });

  it("treats a stored size from an older build as the container", () => {
    for (const stale of ["auto", "512k", "Auto"]) {
      const target = resolveFor(getTool("generate_image"), { size: stale });
      expect(target?.sizeSource, stale).toBe("container");
      expect(target?.targetDimensions, stale).toEqual(CONTAINER);
    }
  });

  it("does nothing without a container", () => {
    expect(resolveFor(getTool("remove_object"), {}, { host: { width: 0, height: 0 } })).toBeNull();
    expect(resolveFor(getTool("remove_object"), {}, { host: null })).toBeNull();
  });

  it("picks the smallest tier that covers the container's long edge", () => {
    expect(
      resolveFor(getTool("generate_image"), {}, { host: { width: 1000, height: 700 } })?.sizeToken,
    ).toBe("1k");
    expect(
      resolveFor(getTool("generate_image"), {}, { host: { width: 3000, height: 2000 } })?.sizeToken,
    ).toBe("4k");
  });
});

describe("reading a stored size", () => {
  const sizeParam = findSizeParam(getTool("generate_image").parameters);

  it("knows the tiers, and nothing else", () => {
    expect(pickedSizeTier("2K")).toBe("2k");
    expect(pickedSizeTier("512k")).toBeNull();
    expect(pickedSizeTier("auto")).toBeNull();
    expect(pickedSizeTier(CONTAINER_SIZE_TOKEN)).toBeNull();
  });

  it("settles to the container's tier inside Bloom and to 1k standalone", () => {
    const slot = resolveFor(getTool("generate_image"), {});
    expect(resolveSizeTokenValue(sizeParam, CONTAINER_SIZE_TOKEN, slot)).toBe("2k");
    expect(resolveSizeTokenValue(sizeParam, CONTAINER_SIZE_TOKEN, null)).toBe(
      DEFAULT_STANDALONE_SIZE_TOKEN,
    );
    expect(resolveSizeTokenValue(sizeParam, "512k", null)).toBe(DEFAULT_STANDALONE_SIZE_TOKEN);
    expect(resolveSizeTokenValue(sizeParam, "4k", slot)).toBe("4k");
  });

  it("passes a value through for a tool with no size picker", () => {
    expect(resolveSizeTokenValue(undefined, undefined, null)).toBeUndefined();
    expect(resolveSizeTokenValue(undefined, "2k", null)).toBe("2k");
  });
});
