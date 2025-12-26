import { describe, expect, it } from "vitest";
import {
  addItemToStrip,
  createDefaultThumbnailStripsSnapshot,
  hydrateThumbnailStripsSnapshot,
  removeItemFromStrip,
  reorderItemInStrip,
} from "../thumbnailStrips";
import { HistoryItem } from "../../types";

const makeEntry = (id: string, overrides: Partial<HistoryItem> = {}): HistoryItem => ({
  id,
  parentId: null,
  imageData: `data:image/png;base64,${id}`,
  imageFileName: null,
  toolId: "test",
  parameters: {},
  sourceStyleId: null,
  durationMs: 0,
  cost: 0,
  model: "",
  timestamp: 0,
  promptUsed: "test",
  sourceSummary: null,
  resolution: { width: 1, height: 1 },
  isStarred: false,
  origin: "generated",
  ...overrides,
});

describe("thumbnail strip helpers", () => {
  it("adds unique items while preserving order", () => {
    const snapshot = createDefaultThumbnailStripsSnapshot();
    const first = addItemToStrip(snapshot, "reference", "one");
    const second = addItemToStrip(first, "reference", "two");
    const duplicate = addItemToStrip(second, "reference", "one");

    expect(first.itemIdsByStrip.reference).toEqual(["one"]);
    expect(second.itemIdsByStrip.reference).toEqual(["one", "two"]);
    expect(duplicate.itemIdsByStrip.reference).toEqual(["one", "two"]);
  });

  it("reorders items within a strip", () => {
    const base = createDefaultThumbnailStripsSnapshot();
    const seeded = addItemToStrip(addItemToStrip(base, "reference", "a"), "reference", "b");
    const moved = reorderItemInStrip(seeded, "reference", "a", 1);

    expect(moved.itemIdsByStrip.reference).toEqual(["b", "a"]);
  });

  it("removes items from a strip", () => {
    const base = createDefaultThumbnailStripsSnapshot();
    const seeded = addItemToStrip(addItemToStrip(base, "reference", "a"), "reference", "b");
    const stripped = removeItemFromStrip(seeded, "reference", "a");

    expect(stripped.itemIdsByStrip.reference).toEqual(["b"]);
  });

  it("hydrates snapshot from persisted data and entries", () => {
    const entries = [makeEntry("base"), makeEntry("star", { isStarred: true })];
    const hydrated = hydrateThumbnailStripsSnapshot(null, entries);

    expect(hydrated.itemIdsByStrip.history).toEqual(["base", "star"]);
    expect(hydrated.itemIdsByStrip.starred).toEqual(["star"]);
  });
});
