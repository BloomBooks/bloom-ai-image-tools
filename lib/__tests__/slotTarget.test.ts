import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";
import type { ToolDefinition } from "../../types";
import { getRequestedAspectRatioValue } from "../toolHelpers";
import {
  AUTO_SIZE_TOKEN,
  findSizeParam,
  isAutoSizeValue,
  resolveSizeTokenValue,
  resolveSlotTarget,
  toolCanFollowSlot,
} from "../slotTarget";

const getTool = (id: string): ToolDefinition => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`missing tool ${id}`);
  return tool;
};

// A landscape book slot, as Bloom describes one.
const SLOT = { width: 1417, height: 945 };
const GEMINI_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

const resolveFor = (tool: ToolDefinition, params: Record<string, string>, host = SLOT) =>
  resolveSlotTarget({
    tool,
    params,
    hostTarget: host,
    requestedAspectRatio: getRequestedAspectRatioValue(tool, params),
    supportedAspectRatios: GEMINI_RATIOS,
  });

describe("which tools follow the book slot", () => {
  it("includes the edit tools and the generation tools", () => {
    expect(toolCanFollowSlot(getTool("remove_object"))).toBe(true);
    expect(toolCanFollowSlot(getTool("generate_image"))).toBe(true);
    expect(toolCanFollowSlot(getTool("coloring_book"))).toBe(true);
  });

  it("excludes the tools whose result is not the slot's picture", () => {
    // Upscale has its own Auto option on the same host target.
    expect(toolCanFollowSlot(getTool("upscale"))).toBe(false);
    // Break-comic matches the page it cuts up.
    expect(toolCanFollowSlot(getTool("break_comic_into_images"))).toBe(false);
    // Sheets that are split afterwards, and a fixed-shape strip.
    expect(toolCanFollowSlot(getTool("extract_cast_of_characters"))).toBe(false);
    expect(toolCanFollowSlot(getTool("generate_pallet"))).toBe(false);
  });
});

describe("resolveSlotTarget", () => {
  it("asks for the slot itself, in the slot's shape, for an edit tool", () => {
    const target = resolveFor(getTool("remove_object"), {});
    expect(target).toEqual({
      sizeToken: "2k",
      aspectRatio: "3:2",
      targetDimensions: SLOT,
    });
  });

  it("keeps a shape the user set on an edit tool, at the slot's long edge", () => {
    const target = resolveFor(getTool("change_style"), { aspectRatio: "1:1" });
    expect(target?.aspectRatio).toBe("1:1");
    expect(target?.targetDimensions).toEqual({ width: 1417, height: 1417 });
    expect(target?.sizeToken).toBe("2k");
  });

  it("follows the slot's shape too when a size picker is on Auto", () => {
    const tool = getTool("generate_image");
    const target = resolveFor(tool, { size: AUTO_SIZE_TOKEN, aspectRatio: "9:16" });
    // The user's 9:16 is set aside: Auto size means the whole request is the slot.
    expect(target?.aspectRatio).toBe("3:2");
    expect(target?.targetDimensions).toEqual(SLOT);
    // The picker's default is Auto, so an untouched tool follows the slot.
    expect(findSizeParam(tool.parameters)?.defaultValue).toBe(AUTO_SIZE_TOKEN);
    expect(resolveFor(tool, {})).not.toBeNull();
  });

  it("does not follow the slot when the user picked a size", () => {
    expect(resolveFor(getTool("generate_image"), { size: "4k" })).toBeNull();
  });

  it("does nothing without a host target", () => {
    expect(resolveFor(getTool("remove_object"), {}, { width: 0, height: 0 })).toBeNull();
    expect(
      resolveSlotTarget({
        tool: getTool("remove_object"),
        params: {},
        hostTarget: null,
        requestedAspectRatio: "auto",
      }),
    ).toBeNull();
  });

  it("picks the smallest tier that covers the slot's long edge", () => {
    expect(resolveFor(getTool("remove_object"), {}, { width: 1000, height: 700 })?.sizeToken).toBe(
      "1k",
    );
    expect(resolveFor(getTool("remove_object"), {}, { width: 3000, height: 2000 })?.sizeToken).toBe(
      "4k",
    );
  });
});

describe("settling an Auto size", () => {
  const sizeParam = findSizeParam(getTool("generate_image").parameters);

  it("treats empty and auto as Auto", () => {
    expect(isAutoSizeValue("")).toBe(true);
    expect(isAutoSizeValue(undefined)).toBe(true);
    expect(isAutoSizeValue("Auto")).toBe(true);
    expect(isAutoSizeValue("2k")).toBe(false);
  });

  it("uses the slot's tier when following the slot, else the smallest size", () => {
    const slot = resolveFor(getTool("generate_image"), {});
    expect(resolveSizeTokenValue(sizeParam, AUTO_SIZE_TOKEN, slot)).toBe("2k");
    expect(resolveSizeTokenValue(sizeParam, AUTO_SIZE_TOKEN, null)).toBe("512k");
    expect(resolveSizeTokenValue(sizeParam, "4k", slot)).toBe("4k");
  });

  it("passes a value through for a tool with no size picker", () => {
    expect(resolveSizeTokenValue(undefined, undefined, null)).toBeUndefined();
    expect(resolveSizeTokenValue(undefined, "2k", null)).toBe("2k");
  });
});
