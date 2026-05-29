import { describe, expect, it } from "vite-plus/test";
import {
  addItemToStrip,
  createDefaultThumbnailStripsSnapshot,
  getOtherStripsContainingItem,
  hydrateThumbnailStripsSnapshot,
  mergeThumbnailStripsSnapshots,
  removeItemsFromAllStrips,
  removeItemFromStrip,
  reorderItemInStrip,
} from "../thumbnailStrips";
import { ImageRecord } from "../../types";

const makeEntry = (id: string, overrides: Partial<ImageRecord> = {}): ImageRecord => ({
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
  it("starts with no pinned strips by default", () => {
    const snapshot = createDefaultThumbnailStripsSnapshot();

    expect(snapshot.activeStripId).toBe("bookImages");
    expect(snapshot.pinnedStripIds).toEqual([]);
  });

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

  it("removes orphaned ids from every strip", () => {
    const base = createDefaultThumbnailStripsSnapshot();
    const seeded = {
      ...base,
      itemIdsByStrip: {
        history: ["keep", "drop"],
        starred: ["drop"],
        reference: ["keep", "drop"],
        bookImages: ["drop", "keep"],
        characters: [],
      },
    };

    const stripped = removeItemsFromAllStrips(seeded, ["drop"]);

    expect(stripped.itemIdsByStrip.history).toEqual(["keep"]);
    expect(stripped.itemIdsByStrip.starred).toEqual([]);
    expect(stripped.itemIdsByStrip.reference).toEqual(["keep"]);
    expect(stripped.itemIdsByStrip.bookImages).toEqual(["keep"]);
  });

  it("finds other strips that still contain a history item", () => {
    const base = createDefaultThumbnailStripsSnapshot();
    const seeded = {
      ...base,
      itemIdsByStrip: {
        ...base.itemIdsByStrip,
        history: ["shared", "history-only"],
        characters: ["shared"],
        starred: ["shared"],
        reference: [],
        environment: [],
      },
    };

    expect(getOtherStripsContainingItem(seeded, "history", "shared")).toEqual([
      "characters",
      "starred",
    ]);
    expect(getOtherStripsContainingItem(seeded, "history", "history-only")).toEqual([]);
  });

  it("hydrates snapshot from persisted data and entries", () => {
    const entries = [makeEntry("base"), makeEntry("star", { isStarred: true })];
    const hydrated = hydrateThumbnailStripsSnapshot(null, entries);

    expect(hydrated.itemIdsByStrip.history).toEqual(["star", "base"]);
    expect(hydrated.itemIdsByStrip.starred).toEqual(["star"]);
    expect(hydrated.pinnedStripIds).toEqual([]);
  });

  it("preserves explicitly empty pinnedStripIds during hydrate", () => {
    const entries = [makeEntry("base"), makeEntry("star", { isStarred: true })];
    const persisted = {
      ...createDefaultThumbnailStripsSnapshot(),
      pinnedStripIds: [],
      itemIdsByStrip: {
        history: ["base"],
        starred: [],
        reference: [],
        bookImages: [],
        characters: [],
      },
    };

    const hydrated = hydrateThumbnailStripsSnapshot(persisted, entries);
    expect(hydrated.pinnedStripIds).toEqual([]);
  });

  it("merges strip membership from current and incoming snapshots", () => {
    const entries = [
      makeEntry("folder"),
      makeEntry("local", { isStarred: true }),
      makeEntry("ref"),
    ];
    const current = {
      ...createDefaultThumbnailStripsSnapshot(),
      activeStripId: "reference" as const,
      pinnedStripIds: ["history" as const],
      itemIdsByStrip: {
        history: ["local"],
        starred: ["local"],
        reference: ["ref"],
        bookImages: [],
        characters: [],
      },
    };
    const incoming = {
      ...createDefaultThumbnailStripsSnapshot(),
      pinnedStripIds: ["starred" as const],
      itemIdsByStrip: {
        history: ["folder"],
        starred: [],
        reference: [],
        bookImages: [],
        characters: [],
      },
    };

    const merged = mergeThumbnailStripsSnapshots(current, incoming, entries);

    expect(merged.activeStripId).toBe("reference");
    expect(merged.pinnedStripIds).toEqual(["history", "starred"]);
    expect(merged.itemIdsByStrip.history).toEqual(["ref", "local", "folder"]);
    expect(merged.itemIdsByStrip.starred).toEqual(["local"]);
    expect(merged.itemIdsByStrip.reference).toEqual(["ref"]);
  });

  it("preserves bookImages strip membership even when entries are missing", () => {
    // Synthetic / host-supplied book-image ids never appear in persisted
    // history. Sanitizing the strip against the entries list would erase the
    // user's current/replacement pairings on every folder restore.
    const entries = [makeEntry("real-1")];
    const persisted = {
      ...createDefaultThumbnailStripsSnapshot(),
      itemIdsByStrip: {
        history: ["real-1"],
        starred: [],
        reference: [],
        bookImages: ["env-0-abc", "env-1-def", "real-1"],
        characters: [],
      },
    };

    const hydrated = hydrateThumbnailStripsSnapshot(persisted, entries);

    expect(hydrated.itemIdsByStrip.bookImages).toEqual(["env-0-abc", "env-1-def", "real-1"]);
  });
});
