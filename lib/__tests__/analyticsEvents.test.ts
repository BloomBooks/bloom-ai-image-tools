import { describe, expect, it } from "vitest";
import {
  buildAcceptEventProperties,
  buildBatchRunEventProperties,
  buildGenerateEventProperties,
  collectToolAncestry,
  getAnalyticsStyleId,
  referenceImagesAreOptional,
  resolveTargetPage,
} from "../analyticsEvents";
import { getToolById } from "../toolHelpers";
import { getModelInfoById } from "../modelsCatalog";
import type { ImageRecord, ToolDefinition } from "../../types";

const PROMPT = "a red hen wearing a hat, in the village of Ouagadougou";

const record = (overrides: Partial<ImageRecord> & { id: string }): ImageRecord => ({
  parentId: null,
  imageData: "data:image/png;base64,AAAA",
  toolId: "custom",
  parameters: { prompt: PROMPT },
  sourceStyleId: null,
  durationMs: 1000,
  cost: 0.01,
  model: "google/gemini-3-pro-image",
  timestamp: 1_000_000,
  promptUsed: PROMPT,
  isStarred: false,
  ...overrides,
});

const tool = (id: string): ToolDefinition => {
  const found = getToolById(id);
  if (!found) {
    throw new Error(`No such tool: ${id}`);
  }
  return found;
};

/** Every property value, flattened, so a leak of anything free-text is assertable. */
const valuesOf = (properties: Record<string, string | number | boolean>) =>
  Object.values(properties).map((value) => String(value));

describe("resolveTargetPage", () => {
  const slots = ["book-image-1", "book-image-2"];

  it("is 'current' for the slot the editor was launched on", () => {
    expect(resolveTargetPage("book-image-1", "book-image-1", slots)).toBe("current");
  });

  it("is 'other' for a different slot in the same book", () => {
    expect(resolveTargetPage("book-image-2", "book-image-1", slots)).toBe("other");
  });

  it("is 'none' for an image that is not headed into the book", () => {
    expect(resolveTargetPage(undefined, "book-image-1", slots)).toBe("none");
    expect(resolveTargetPage("some-history-item", "book-image-1", slots)).toBe("none");
  });
});

describe("getAnalyticsStyleId", () => {
  it("reports the chosen style for a tool with the art-style picker", () => {
    expect(getAnalyticsStyleId(tool("change_style"), { styleId: "watercolor" })).toBe("watercolor");
  });

  it("reports 'none' when the user cleared the style", () => {
    expect(getAnalyticsStyleId(tool("generate_image"), { styleId: "none" })).toBe("none");
  });

  it("reports an empty string, not a missing property, for a tool with no style picker", () => {
    expect(getAnalyticsStyleId(tool("improve_quality"), { styleId: "watercolor" })).toBe("");
  });
});

describe("referenceImagesAreOptional", () => {
  it("is false for a tool that takes no references", () => {
    expect(referenceImagesAreOptional(tool("improve_quality"))).toBe(false);
  });

  it("is true for a tool that accepts references without requiring them", () => {
    const optional = ["generate_image", "custom"].map(tool).filter((candidate) => {
      const mode = candidate.referenceImages;
      return mode === "0+";
    });
    // Guards the fixture rather than the code: if no tool is left in this shape the
    // assertion below would pass vacuously.
    expect(optional.length).toBeGreaterThan(0);
    optional.forEach((candidate) => expect(referenceImagesAreOptional(candidate)).toBe(true));
  });
});

describe("collectToolAncestry", () => {
  it("returns the tool steps oldest first and stops at the book original", () => {
    const original = record({ id: "orig", toolId: "bookImages", parentId: null });
    const first = record({ id: "first", toolId: "change_style", parentId: "orig" });
    const second = record({ id: "second", toolId: "improve_quality", parentId: "first" });
    const byId = { orig: original, first, second };

    expect(collectToolAncestry(second, byId).map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("ignores uploads and unknown records, which name no tool", () => {
    const upload = record({ id: "upload", toolId: "original", parentId: null });
    const edited = record({ id: "edited", toolId: "custom", parentId: "upload" });

    expect(collectToolAncestry(edited, { upload, edited }).map((item) => item.id)).toEqual([
      "edited",
    ]);
  });

  it("survives a parentId that points at a missing or looping record", () => {
    const orphan = record({ id: "orphan", toolId: "custom", parentId: "gone" });
    expect(collectToolAncestry(orphan, { orphan }).map((item) => item.id)).toEqual(["orphan"]);

    const a = record({ id: "a", toolId: "custom", parentId: "b" });
    const b = record({ id: "b", toolId: "custom", parentId: "a" });
    expect(collectToolAncestry(a, { a, b })).toHaveLength(2);
  });
});

describe("buildAcceptEventProperties", () => {
  const original = record({ id: "orig", toolId: "bookImages", parentId: null });
  const styled = record({
    id: "styled",
    toolId: "change_style",
    parentId: "orig",
    sourceStyleId: "watercolor",
    reasoningLevel: "high",
    cost: 0.0123456,
    timestamp: 1_000_000,
  });
  const improvedQuality = record({
    id: "improvedQuality",
    toolId: "improve_quality",
    parentId: "styled",
    cost: 0.02,
    timestamp: 1_030_000,
  });
  const byId = { orig: original, styled, improvedQuality };

  const built = buildAcceptEventProperties({
    committed: improvedQuality,
    itemsById: byId,
    slotId: "book-image-2",
    launchedBookImageId: "book-image-1",
    bookImageSlotIds: ["book-image-1", "book-image-2"],
    acceptedCount: 2,
    targetSlotEmpty: false,
    nowMs: 1_060_000,
  });

  it("fires one event per tool in the chain, in the order they were applied", () => {
    expect(built.map((properties) => properties.tool)).toEqual(["change_style", "improve_quality"]);
    expect(built.map((properties) => properties.chainPosition)).toEqual([1, 2]);
    expect(built.every((properties) => properties.chainLength === 2)).toBe(true);
  });

  it("marks only the committed record as the final tool", () => {
    expect(built.map((properties) => properties.isFinalTool)).toEqual([false, true]);
  });

  it("carries each step's own style, reasoning, cost and age", () => {
    expect(built[0].styleId).toBe("watercolor");
    expect(built[0].reasoningLevel).toBe("high");
    expect(built[0].costUSD).toBe(0.0123);
    expect(built[0].secondsSinceGenerated).toBe(60);
    expect(built[1].styleId).toBe("");
    expect(built[1].secondsSinceGenerated).toBe(30);
  });

  it("says which page the image went to and how many went in with it", () => {
    expect(built.every((properties) => properties.targetPage === "other")).toBe(true);
    expect(built.every((properties) => properties.acceptedCount === 2)).toBe(true);
    expect(built.every((properties) => properties.targetSlotEmpty === false)).toBe(true);
  });

  it("reports nothing for an image no tool contributed to", () => {
    expect(
      buildAcceptEventProperties({
        committed: original,
        itemsById: byId,
        slotId: "book-image-1",
        launchedBookImageId: "book-image-1",
        bookImageSlotIds: ["book-image-1"],
        acceptedCount: 1,
        targetSlotEmpty: false,
        nowMs: 1_060_000,
      }),
    ).toEqual([]);
  });

  it("never sends the prompt or any other free text", () => {
    built.forEach((properties) => {
      expect(valuesOf(properties).join(" ")).not.toContain("Ouagadougou");
      expect(valuesOf(properties).join(" ")).not.toContain(PROMPT);
    });
  });
});

describe("buildGenerateEventProperties", () => {
  const properties = buildGenerateEventProperties({
    tool: tool("change_style"),
    params: { styleId: "watercolor", prompt: PROMPT },
    toolModel: getModelInfoById("google/gemini-3-pro-image") ?? null,
    reasoningByTool: {},
    qualityByTool: {},
    referenceCount: 2,
    hasTargetImage: true,
    runsLocally: false,
    batch: true,
    batchSize: 3,
    slotId: "book-image-1",
    launchedBookImageId: "book-image-1",
    bookImageSlotIds: ["book-image-1"],
    targetSlotEmpty: false,
  });

  it("keeps every property the host already knows about", () => {
    expect(properties.tool).toBe("change_style");
    expect(properties.model).toBe("google/gemini-3-pro-image");
    expect(properties.sourceKind).toBe("existing image");
    expect(properties.referenceCount).toBe(2);
    expect(properties.batch).toBe(true);
    expect(properties.runsLocally).toBe(false);
  });

  it("adds the style, the page and the batch size", () => {
    expect(properties.styleId).toBe("watercolor");
    expect(properties.targetPage).toBe("current");
    expect(properties.targetSlotEmpty).toBe(false);
    expect(properties.batchSize).toBe(3);
  });

  it("always sends every property, even when it has no value", () => {
    const forATargetlessCreate = buildGenerateEventProperties({
      tool: tool("improve_quality"),
      params: { prompt: PROMPT },
      toolModel: null,
      referenceCount: 0,
      hasTargetImage: false,
      runsLocally: true,
      batch: false,
      batchSize: 1,
      slotId: null,
      launchedBookImageId: null,
      bookImageSlotIds: [],
      targetSlotEmpty: false,
    });
    expect(Object.keys(forATargetlessCreate).sort()).toEqual(Object.keys(properties).sort());
    expect(forATargetlessCreate.styleId).toBe("");
    expect(forATargetlessCreate.model).toBe("");
    expect(forATargetlessCreate.sourceKind).toBe("blank");
    expect(forATargetlessCreate.targetPage).toBe("none");
  });

  it("never sends the prompt or any other free text", () => {
    expect(valuesOf(properties).join(" ")).not.toContain("Ouagadougou");
    expect(valuesOf(properties).join(" ")).not.toContain(PROMPT);
  });
});

describe("buildBatchRunEventProperties", () => {
  const common = {
    tool: tool("custom"),
    toolModel: getModelInfoById("google/gemini-3-pro-image") ?? null,
    params: { prompt: PROMPT },
    imageCount: 3,
  };

  it("has the same shape at the start and at the end of a run", () => {
    const started = buildBatchRunEventProperties({
      ...common,
      phase: "started",
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    });
    const finished = buildBatchRunEventProperties({
      ...common,
      phase: "finished",
      succeeded: 2,
      failed: 1,
      cancelled: 0,
    });

    expect(Object.keys(started).sort()).toEqual(Object.keys(finished).sort());
    expect(started.phase).toBe("started");
    expect(finished.succeeded).toBe(2);
    expect(finished.failed).toBe(1);
    expect(finished.imageCount).toBe(3);
  });

  it("never sends the prompt or any other free text", () => {
    const properties = buildBatchRunEventProperties({
      ...common,
      phase: "started",
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    });
    expect(valuesOf(properties).join(" ")).not.toContain("Ouagadougou");
  });
});
