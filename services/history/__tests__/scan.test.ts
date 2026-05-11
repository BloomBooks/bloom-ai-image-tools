import { describe, expect, it } from "vitest";
import { diffFolderAgainstMemory, synthesizeEntryForOrphan } from "../folder/scan";
import type { HistoryEntry, Tombstone } from "../types";
import type { FolderScanResult } from "../folder/FolderHistoryBackend";

const makeEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: overrides.id ?? "img_1",
  parentId: null,
  toolId: "generate",
  parameters: {},
  promptUsed: "test",
  model: "model",
  timestamp: 1000,
  durationMs: 0,
  cost: 0,
  imageMime: "image/png",
  metaUpdatedAt: 1000,
  isStarred: false,
  ...overrides,
});

const makeScan = (overrides: Partial<FolderScanResult> = {}): FolderScanResult => ({
  images: overrides.images ?? [],
  sidecars: overrides.sidecars ?? new Map<string, HistoryEntry>(),
  tombstones: overrides.tombstones ?? new Map<string, Tombstone>(),
});

const TTL = 30 * 24 * 60 * 60 * 1000;

describe("diffFolderAgainstMemory", () => {
  it("adds new sidecars to memory", () => {
    const sidecars = new Map<string, HistoryEntry>([
      ["a", makeEntry({ id: "a" })],
      ["b", makeEntry({ id: "b" })],
    ]);
    const plan = diffFolderAgainstMemory({
      scan: makeScan({ sidecars }),
      memory: new Map(),
      now: 2000,
      tombstoneTtlMs: TTL,
    });
    expect(plan.toAdd.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(plan.toRemoveFromMemory).toEqual([]);
  });

  it("tombstones remove from memory and schedule file deletion", () => {
    const memory = new Map<string, HistoryEntry>([["x", makeEntry({ id: "x" })]]);
    const tombstones = new Map<string, Tombstone>([
      ["x", { id: "x", deletedAt: 1500 }],
    ]);
    const images = [{ id: "x", fileName: "x.png", mime: "image/png", lastModified: 1000 }];
    const plan = diffFolderAgainstMemory({
      scan: makeScan({ tombstones, images }),
      memory,
      now: 2000,
      tombstoneTtlMs: TTL,
    });
    expect(plan.toRemoveFromMemory).toEqual(["x"]);
    expect(plan.toDeleteFiles).toEqual([{ id: "x", imageMime: "image/png" }]);
  });

  it("tombstone wins over a sidecar present in the same scan (resurrection guard)", () => {
    const sidecars = new Map<string, HistoryEntry>([["x", makeEntry({ id: "x" })]]);
    const tombstones = new Map<string, Tombstone>([
      ["x", { id: "x", deletedAt: 1500 }],
    ]);
    const plan = diffFolderAgainstMemory({
      scan: makeScan({ sidecars, tombstones }),
      memory: new Map(),
      now: 2000,
      tombstoneTtlMs: TTL,
    });
    expect(plan.toAdd).toEqual([]);
    expect(plan.toRemoveFromMemory).toEqual([]);
  });

  it("does NOT delete from memory when image bytes are missing without a tombstone (Dropbox protection)", () => {
    const memory = new Map<string, HistoryEntry>([["y", makeEntry({ id: "y" })]]);
    // Scan has no image bytes and no sidecar for y, and no tombstone.
    const plan = diffFolderAgainstMemory({
      scan: makeScan(),
      memory,
      now: 2000,
      tombstoneTtlMs: TTL,
    });
    expect(plan.toRemoveFromMemory).toEqual([]);
    expect(plan.toUpdateInMemory).toEqual([]);
  });

  it("orphan image (no sidecar) is surfaced for recovery", () => {
    const images = [{ id: "orph", fileName: "orph.png", mime: "image/png", lastModified: 5000 }];
    const plan = diffFolderAgainstMemory({
      scan: makeScan({ images }),
      memory: new Map(),
      now: 6000,
      tombstoneTtlMs: TTL,
    });
    expect(plan.orphanImages).toEqual([
      { id: "orph", mime: "image/png", lastModified: 5000, fileName: "orph.png" },
    ]);
  });

  it("metadata LWW: newer on disk replaces memory", () => {
    const memory = new Map<string, HistoryEntry>([
      ["m", makeEntry({ id: "m", metaUpdatedAt: 100, isStarred: false })],
    ]);
    const sidecars = new Map<string, HistoryEntry>([
      ["m", makeEntry({ id: "m", metaUpdatedAt: 200, isStarred: true })],
    ]);
    const plan = diffFolderAgainstMemory({
      scan: makeScan({ sidecars }),
      memory,
      now: 1000,
      tombstoneTtlMs: TTL,
    });
    expect(plan.toUpdateInMemory).toHaveLength(1);
    expect(plan.toUpdateInMemory[0].isStarred).toBe(true);
    expect(plan.toRewriteSidecar).toEqual([]);
  });

  it("metadata LWW: newer in memory triggers a sidecar rewrite", () => {
    const memory = new Map<string, HistoryEntry>([
      ["m", makeEntry({ id: "m", metaUpdatedAt: 300, isStarred: true })],
    ]);
    const sidecars = new Map<string, HistoryEntry>([
      ["m", makeEntry({ id: "m", metaUpdatedAt: 200, isStarred: false })],
    ]);
    const plan = diffFolderAgainstMemory({
      scan: makeScan({ sidecars }),
      memory,
      now: 1000,
      tombstoneTtlMs: TTL,
    });
    expect(plan.toRewriteSidecar).toHaveLength(1);
    expect(plan.toRewriteSidecar[0].isStarred).toBe(true);
    expect(plan.toUpdateInMemory).toEqual([]);
  });

  it("expired tombstones are flagged for GC", () => {
    const tombstones = new Map<string, Tombstone>([
      ["old", { id: "old", deletedAt: 0 }],
      ["new", { id: "new", deletedAt: 1_000_000_000 }],
    ]);
    const plan = diffFolderAgainstMemory({
      scan: makeScan({ tombstones }),
      memory: new Map(),
      now: 1_000_001_000 + TTL,
      tombstoneTtlMs: TTL,
    });
    expect(plan.expiredTombstones.sort()).toEqual(["new", "old"].sort());
  });

  it("non-expired tombstones are not GC'd", () => {
    const tombstones = new Map<string, Tombstone>([
      ["fresh", { id: "fresh", deletedAt: 1000 }],
    ]);
    const plan = diffFolderAgainstMemory({
      scan: makeScan({ tombstones }),
      memory: new Map(),
      now: 2000,
      tombstoneTtlMs: TTL,
    });
    expect(plan.expiredTombstones).toEqual([]);
  });
});

describe("synthesizeEntryForOrphan", () => {
  it("produces a minimum-viable HistoryEntry", () => {
    const entry = synthesizeEntryForOrphan({
      id: "orph",
      mime: "image/jpeg",
      lastModified: 1234,
    });
    expect(entry.id).toBe("orph");
    expect(entry.imageMime).toBe("image/jpeg");
    expect(entry.timestamp).toBe(1234);
    expect(entry.toolId).toBe("recovered");
  });
});
