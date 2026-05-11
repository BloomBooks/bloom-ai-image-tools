import { readSidecar, readRawJson, renameTopLevelFile, writeImageAndSidecar, writeAppStateFile, FolderBinding } from "./folder/FolderHistoryBackend";
import {
  APP_STATE_FILE_VERSION,
  AppStateFile,
  HistoryEntry,
  LEGACY_MANIFEST_FILE,
  LEGACY_MANIFEST_RENAMED,
} from "./types";
import type { ImageRecord, ThumbnailStripsSnapshot } from "../../types";
import { getMimeTypeFromUrl } from "../../lib/imageUtils";

interface LegacyManifest {
  version?: number;
  appState?: {
    history?: ImageRecord[];
    targetImageId?: string | null;
    referenceImageIds?: string[];
    rightPanelImageId?: string | null;
  };
  thumbnailStrips?: ThumbnailStripsSnapshot;
}

const legacyEntryToHistoryEntry = (record: ImageRecord, fallbackMime: string): HistoryEntry => {
  const mime = getMimeTypeFromUrl(record.imageData) ?? fallbackMime;
  return {
    id: record.id,
    parentId: record.parentId ?? null,
    toolId: record.toolId,
    parameters: record.parameters ?? {},
    promptUsed: record.promptUsed ?? "",
    model: record.model ?? "",
    reasoningLevel: record.reasoningLevel ?? null,
    timestamp: record.timestamp ?? Date.now(),
    durationMs: record.durationMs ?? 0,
    cost: record.cost ?? 0,
    resolution: record.resolution,
    origin: record.origin,
    isStarred: record.isStarred ?? false,
    sourceStyleId: record.sourceStyleId ?? null,
    sourceSummary: record.sourceSummary ?? null,
    imageMime: mime || "image/png",
    metaUpdatedAt: record.timestamp ?? Date.now(),
  };
};

const defaultStrips: ThumbnailStripsSnapshot = {
  activeStripId: "history",
  pinnedStripIds: ["history"],
  itemIdsByStrip: { history: [], starred: [], reference: [], environment: [] },
};

/**
 * If a legacy `history-manifest.json` exists and we haven't migrated yet,
 * convert each `imageRecord` in it to a sidecar `<id>.json` (image bytes are
 * already on disk as `<id>.<ext>`). Then write an `app-state.json` from the
 * manifest's strip data and rename the manifest to `.legacy.json` as a
 * safety net.
 *
 * Idempotent: a second call is a no-op once the manifest has been renamed.
 */
export const migrateLegacyManifestIfNeeded = async (binding: FolderBinding): Promise<void> => {
  const legacy = await readRawJson<LegacyManifest>(binding, LEGACY_MANIFEST_FILE);
  if (!legacy) return; // already migrated, or never existed
  if (!legacy.appState || !Array.isArray(legacy.appState.history)) {
    // Manifest exists but is malformed; rename and move on.
    await renameTopLevelFile(binding, LEGACY_MANIFEST_FILE, LEGACY_MANIFEST_RENAMED);
    return;
  }

  for (const record of legacy.appState.history) {
    if (!record || !record.id) continue;

    // Check if a sidecar already exists; don't clobber.
    const existing = await readSidecar(binding, record.id).catch(() => null);
    if (existing) continue;

    const fallbackMime = "image/png";
    const entry = legacyEntryToHistoryEntry(record, fallbackMime);

    if (record.imageData) {
      // Have base64 in the manifest — re-write both bytes and sidecar via the
      // canonical helper so file naming matches the new convention.
      try {
        await writeImageAndSidecar(binding, entry, record.imageData);
      } catch (error) {
        console.error("Migration: failed to write image+sidecar", record.id, error);
      }
    } else if (record.imageFileName) {
      // Bytes are already on disk under the legacy filename. Write a sidecar
      // alongside it. The legacy filename was `<id>.<ext>` — same shape as
      // the new convention — so no rename is needed.
      try {
        const { writeSidecar } = await import("./folder/FolderHistoryBackend");
        await writeSidecar(binding, entry);
      } catch (error) {
        console.error("Migration: failed to write sidecar for existing file", record.id, error);
      }
    }
  }

  const appState: AppStateFile = {
    version: APP_STATE_FILE_VERSION,
    thumbnailStrips: legacy.thumbnailStrips ?? defaultStrips,
    targetImageId: legacy.appState.targetImageId ?? null,
    referenceImageIds: legacy.appState.referenceImageIds ?? [],
    rightPanelImageId: legacy.appState.rightPanelImageId ?? null,
    activeToolId: null,
    selectedModelId: null,
    selectedArtStyleId: null,
    savedAt: Date.now(),
  };

  try {
    await writeAppStateFile(binding, appState);
  } catch (error) {
    console.error("Migration: failed to write app-state.json", error);
  }

  await renameTopLevelFile(binding, LEGACY_MANIFEST_FILE, LEGACY_MANIFEST_RENAMED);
};
