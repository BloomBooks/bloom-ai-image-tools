import type { ModelReasoningLevel, ThumbnailStripsSnapshot } from "../../types";

/**
 * Metadata for a single image in the history. Bytes are stored separately
 * (in the folder as <id>.<ext>, in the browser as a Blob in IndexedDB) and
 * loaded on demand via HistoryStore.loadBytes(id).
 */
export interface HistoryEntry {
  id: string;
  parentId: string | null;
  toolId: string;
  parameters: Record<string, string>;
  promptUsed: string;
  model: string;
  reasoningLevel?: ModelReasoningLevel | null;
  timestamp: number;
  durationMs: number;
  cost: number;
  resolution?: { width: number; height: number };
  origin?: "generated" | "uploaded" | "environment";
  isStarred?: boolean;
  sourceStyleId?: string | null;
  sourceSummary?: string | null;
  /** Human-facing text for the image (e.g. an OCR-extracted panel caption). */
  caption?: string | null;
  /** MIME type of the stored bytes (e.g. "image/png"). Drives file extension. */
  imageMime: string;
  /** Bumped every time mutable metadata changes; LWW key during reconcile. */
  metaUpdatedAt: number;
}

/** Sidecar file shape on disk: HistoryEntry serialized verbatim. */
export type HistoryEntrySidecar = HistoryEntry;

/** Tombstone record written when a user deletes an image. */
export interface Tombstone {
  id: string;
  deletedAt: number;
}

/** UI state persisted alongside the images. Not authoritative about what exists. */
export interface AppStateFile {
  version: 2;
  thumbnailStrips: ThumbnailStripsSnapshot;
  targetImageId: string | null;
  referenceImageIds: string[];
  rightPanelImageId: string | null;
  activeToolId: string | null;
  /** Per-tool model selection mirrored for folder sync (toolId -> model id). */
  modelByTool?: Record<string, string>;
  selectedArtStyleId?: string | null;
  /** Persisted at write time; used for `mtime`-style conflict resolution. */
  savedAt: number;
}

export const APP_STATE_FILE_VERSION = 2 as const;
export const APP_STATE_FILE_NAME = "app-state.json";
export const IMAGES_DIR_NAME = "images";
export const TOMBSTONES_DIR_NAME = "tombstones";

/** Tombstones older than this are GC'd on next scan. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type FolderStatus = "none" | "attached" | "error";

/**
 * Snapshot emitted to subscribers. `entries` are ordered oldest -> newest by
 * `timestamp`; the UI can re-order for display.
 */
export interface HistorySnapshot {
  entries: HistoryEntry[];
  folderStatus: FolderStatus;
  folderName: string | null;
  /** True once the initial IDB hydration has completed. */
  hydrated: boolean;
}

/** A pending folder write waiting to be flushed. */
export interface WalEntry {
  id: string;
  /** "add" — write image + sidecar. "delete" — write tombstone + remove files. */
  kind: "add" | "delete";
  /** Present for "add" — base64 data URL of the image bytes. */
  dataUrl?: string;
  /** Present for "add" — sidecar metadata to write. */
  entry?: HistoryEntry;
  enqueuedAt: number;
}
