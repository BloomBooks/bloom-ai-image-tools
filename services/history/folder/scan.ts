import type { HistoryEntry, Tombstone } from "../types";
import type { FolderScanResult } from "./FolderHistoryBackend";

/**
 * Plan returned by diffing a scan against the in-memory state. The HistoryStore
 * uses this to update its in-memory snapshot and to enqueue any folder writes.
 *
 * Critical invariants enforced here:
 *   - A tombstone removes the entry from memory AND schedules an image-delete.
 *   - A sidecar present without image bytes is invalid; remove it from memory
 *     and delete the stray sidecar so the UI never renders a broken thumbnail.
 *   - Newer `metaUpdatedAt` on disk wins over memory (LWW for stars/notes).
 *   - Newer `metaUpdatedAt` in memory wins over disk; we re-write the sidecar.
 *   - Files in the folder with no sidecar are treated as orphans and surfaced
 *     so the caller can synthesize a sidecar from the filename + bytes.
 */
export interface ReconcilePlan {
  /** New entries discovered on disk (have sidecar + image). Add to memory. */
  toAdd: HistoryEntry[];
  /** Ids in memory that should be removed because of a tombstone. */
  toRemoveFromMemory: string[];
  /** Image files to delete from disk (tombstone present but image still on disk). */
  toDeleteFiles: Array<{ id: string; imageMime: string }>;
  /** Entries whose on-disk sidecar is newer; replace memory. */
  toUpdateInMemory: HistoryEntry[];
  /** Entries whose memory copy is newer; rewrite sidecar on disk. */
  toRewriteSidecar: HistoryEntry[];
  /** Image files on disk with no sidecar. Caller synthesizes a sidecar. */
  orphanImages: Array<{ id: string; mime: string; lastModified: number; fileName: string }>;
  /** Tombstones older than `now - ttl`; delete the tombstone file. */
  expiredTombstones: string[];
}

export interface DiffInput {
  scan: FolderScanResult;
  /** Current in-memory entries keyed by id. */
  memory: Map<string, HistoryEntry>;
  /** Current moment for TTL math. */
  now: number;
  /** Tombstones older than this are GC'd. */
  tombstoneTtlMs: number;
}

export const diffFolderAgainstMemory = (input: DiffInput): ReconcilePlan => {
  const { scan, memory, now, tombstoneTtlMs } = input;
  const plan: ReconcilePlan = {
    toAdd: [],
    toRemoveFromMemory: [],
    toDeleteFiles: [],
    toUpdateInMemory: [],
    toRewriteSidecar: [],
    orphanImages: [],
    expiredTombstones: [],
  };

  // Index of image bytes on disk, by id.
  const imageById = new Map<string, FolderScanResult["images"][number]>();
  for (const img of scan.images) imageById.set(img.id, img);

  // Step 1: tombstones win over everything.
  for (const [id, tomb] of scan.tombstones) {
    if (memory.has(id)) plan.toRemoveFromMemory.push(id);
    const img = imageById.get(id);
    if (img) plan.toDeleteFiles.push({ id, imageMime: img.mime });
    if (now - tomb.deletedAt > tombstoneTtlMs) {
      plan.expiredTombstones.push(id);
    }
  }

  // Step 2: sidecars present on disk -> add or reconcile.
  for (const [id, sidecar] of scan.sidecars) {
    if (scan.tombstones.has(id)) continue; // tombstoned
    const diskImage = imageById.get(id);
    if (!diskImage) {
      if (memory.has(id)) plan.toRemoveFromMemory.push(id);
      plan.toDeleteFiles.push({ id, imageMime: sidecar.imageMime });
      continue;
    }
    const inMemory = memory.get(id);
    if (!inMemory) {
      plan.toAdd.push(sidecar);
      continue;
    }
    const memMeta = inMemory.metaUpdatedAt ?? 0;
    const diskMeta = sidecar.metaUpdatedAt ?? 0;
    if (diskMeta > memMeta) {
      plan.toUpdateInMemory.push(sidecar);
    } else if (memMeta > diskMeta) {
      plan.toRewriteSidecar.push(inMemory);
    }
  }

  // Step 3: image bytes with no sidecar = orphan to recover.
  for (const img of scan.images) {
    if (scan.tombstones.has(img.id)) continue;
    if (scan.sidecars.has(img.id)) continue;
    plan.orphanImages.push({
      id: img.id,
      mime: img.mime,
      lastModified: img.lastModified,
      fileName: img.fileName,
    });
  }
  return plan;
};

/**
 * Build a synthesized HistoryEntry for an orphan image file (one with bytes
 * but no sidecar — e.g. a user dropped a PNG into the folder by hand, or the
 * sidecar was lost). The result is a best-effort recovery.
 */
export const synthesizeEntryForOrphan = (orphan: {
  id: string;
  mime: string;
  lastModified: number;
}): HistoryEntry => ({
  id: orphan.id,
  parentId: null,
  toolId: "recovered",
  parameters: {},
  promptUsed: "",
  model: "",
  reasoningLevel: null,
  timestamp: orphan.lastModified || Date.now(),
  durationMs: 0,
  cost: 0,
  origin: "uploaded",
  isStarred: false,
  sourceStyleId: null,
  sourceSummary: null,
  imageMime: orphan.mime || "image/png",
  metaUpdatedAt: orphan.lastModified || Date.now(),
});
