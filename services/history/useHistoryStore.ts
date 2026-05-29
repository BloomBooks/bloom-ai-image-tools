import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHistoryStore, HistoryStore } from "./HistoryStore";
import {
  AppStateFile,
  APP_STATE_FILE_VERSION,
  FolderStatus,
  HistoryEntry,
  HistorySnapshot,
} from "./types";
import type { ImageRecord, ThumbnailStripsSnapshot } from "../../types";
import { imageFileNameForEntry } from "./ids";
import { supportsFolderStorage } from "./folder/FolderHistoryBackend";

const DEFAULT_STRIPS: ThumbnailStripsSnapshot = {
  activeStripId: "history",
  pinnedStripIds: [],
  itemIdsByStrip: { history: [], starred: [], reference: [], bookImages: [], characters: [] },
};

export const historyEntryToImageRecord = (
  entry: HistoryEntry,
  dataUrl: string | null,
): ImageRecord => ({
  id: entry.id,
  parentId: entry.parentId ?? null,
  incomingSlotId: entry.incomingSlotId,
  imageData: dataUrl ?? "",
  imageFileName: imageFileNameForEntry(entry),
  toolId: entry.toolId,
  parameters: entry.parameters ?? {},
  sourceStyleId: entry.sourceStyleId ?? null,
  durationMs: entry.durationMs,
  cost: entry.cost,
  model: entry.model,
  reasoningLevel: entry.reasoningLevel ?? null,
  timestamp: entry.timestamp,
  promptUsed: entry.promptUsed,
  sourceSummary: entry.sourceSummary ?? null,
  resolution: entry.resolution,
  isStarred: entry.isStarred ?? false,
  origin: entry.origin,
});

export const imageRecordToHistoryEntry = (record: ImageRecord, mime: string): HistoryEntry => ({
  id: record.id,
  parentId: record.parentId ?? null,
  incomingSlotId: record.incomingSlotId,
  toolId: record.toolId,
  parameters: record.parameters ?? {},
  promptUsed: record.promptUsed ?? "",
  model: record.model ?? "",
  reasoningLevel: record.reasoningLevel ?? null,
  timestamp: record.timestamp,
  durationMs: record.durationMs,
  cost: record.cost,
  resolution: record.resolution,
  origin: record.origin,
  isStarred: record.isStarred ?? false,
  sourceStyleId: record.sourceStyleId ?? null,
  sourceSummary: record.sourceSummary ?? null,
  imageMime: mime,
  metaUpdatedAt: Date.now(),
});

export interface UseHistoryStoreResult {
  /** Current history snapshot mapped to ImageRecord shape (imageData populated when cached). */
  history: ImageRecord[];
  folderStatus: FolderStatus;
  folderName: string | null;
  folderSupported: boolean;
  /** True once the initial IDB hydration has completed. */
  hydrated: boolean;
  appState: AppStateFile | null;

  /** Add an image. `dataUrl` must be a base64 data URL. */
  addImage: (record: ImageRecord) => Promise<void>;
  deleteImage: (id: string) => Promise<void>;
  setStarred: (id: string, starred: boolean) => Promise<void>;
  /** Generic metadata patch. */
  updateRecord: (id: string, patch: Partial<ImageRecord>) => Promise<void>;

  /** Trigger lazy load of bytes; returns the data URL or null. */
  ensureImageData: (id: string) => Promise<string | null>;

  /** Write the app-state.json contents (strip layout, target/reference IDs, etc.). */
  saveAppState: (state: Omit<AppStateFile, "version" | "savedAt">) => Promise<void>;

  attachFolder: () => Promise<boolean>;
  detachFolder: () => Promise<void>;
  /** Force a reconcile (e.g. after explicit user "refresh" gesture). */
  refresh: () => Promise<void>;
}

/**
 * React adapter for HistoryStore. Exposes history as ImageRecord[] for
 * compatibility with the existing component tree, and lazy-loads bytes in
 * the background as entries appear in the snapshot.
 */
export const useHistoryStore = (): UseHistoryStoreResult => {
  const storeRef = useRef<HistoryStore | null>(null);
  if (!storeRef.current) storeRef.current = getHistoryStore();
  const store = storeRef.current;

  const [snapshot, setSnapshot] = useState<HistorySnapshot>(() => store.snapshot());
  const [appState, setAppState] = useState<AppStateFile | null>(null);
  const [bytesById, setBytesById] = useState<Record<string, string>>({});
  const folderSupported = useMemo(() => supportsFolderStorage(), []);

  // Subscribe and hydrate on mount.
  useEffect(() => {
    let cancelled = false;

    const unsub = store.subscribe((snap) => {
      if (cancelled) return;
      setSnapshot(snap);
    });
    const unsubApp = store.subscribeAppState((state) => {
      if (cancelled) return;
      setAppState(state);
    });

    void store.hydrate();

    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__bloomHistory = store;
    }

    return () => {
      cancelled = true;
      unsub();
      unsubApp();
    };
  }, [store]);

  // Background lazy-load bytes for any entry without a cached data URL.
  useEffect(() => {
    const toLoad = snapshot.entries.filter((entry) => !bytesById[entry.id]);
    if (toLoad.length === 0) return;
    let cancelled = false;
    void (async () => {
      const updates: Record<string, string> = {};
      for (const entry of toLoad) {
        const url = await store.loadDataUrl(entry.id);
        if (url) updates[entry.id] = url;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setBytesById((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot.entries, store, bytesById]);

  // Prune the bytes map when entries disappear so it doesn't grow without bound.
  useEffect(() => {
    setBytesById((prev) => {
      const valid = new Set(snapshot.entries.map((e) => e.id));
      const next: Record<string, string> = {};
      let changed = false;
      for (const [id, url] of Object.entries(prev)) {
        if (valid.has(id)) next[id] = url;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [snapshot.entries]);

  const history = useMemo(
    () =>
      snapshot.entries.map((entry) =>
        historyEntryToImageRecord(entry, bytesById[entry.id] ?? null),
      ),
    [snapshot.entries, bytesById],
  );

  const addImage = useCallback(
    async (record: ImageRecord) => {
      if (!record.imageData) return;
      const match = record.imageData.match(/^data:(.+?);base64,/);
      const mime = (match?.[1] ?? "image/png").toLowerCase();
      const entry = imageRecordToHistoryEntry(record, mime);
      await store.add(entry, record.imageData);
      // Pre-populate the bytes map so the UI doesn't flash a placeholder.
      setBytesById((prev) => ({ ...prev, [entry.id]: record.imageData }));
    },
    [store],
  );

  const deleteImage = useCallback(
    async (id: string) => {
      await store.delete(id);
    },
    [store],
  );

  const setStarred = useCallback(
    async (id: string, starred: boolean) => {
      await store.updateMeta(id, { isStarred: starred });
    },
    [store],
  );

  const updateRecord = useCallback(
    async (id: string, patch: Partial<ImageRecord>) => {
      const allowed: Partial<HistoryEntry> = {};
      if (typeof patch.isStarred === "boolean") allowed.isStarred = patch.isStarred;
      if (typeof patch.promptUsed === "string") allowed.promptUsed = patch.promptUsed;
      if (typeof patch.sourceSummary !== "undefined") allowed.sourceSummary = patch.sourceSummary;
      if (typeof patch.sourceStyleId !== "undefined") allowed.sourceStyleId = patch.sourceStyleId;
      if (typeof patch.parameters !== "undefined") allowed.parameters = patch.parameters;
      if (Object.keys(allowed).length === 0) return;
      await store.updateMeta(id, allowed);
    },
    [store],
  );

  const ensureImageData = useCallback(
    async (id: string) => {
      const cached = bytesById[id];
      if (cached) return cached;
      const url = await store.loadDataUrl(id);
      if (url) setBytesById((prev) => ({ ...prev, [id]: url }));
      return url;
    },
    [bytesById, store],
  );

  const saveAppState = useCallback(
    async (partial: Omit<AppStateFile, "version" | "savedAt">) => {
      const full: AppStateFile = {
        version: APP_STATE_FILE_VERSION,
        savedAt: Date.now(),
        thumbnailStrips: partial.thumbnailStrips ?? DEFAULT_STRIPS,
        targetImageId: partial.targetImageId ?? null,
        referenceImageIds: partial.referenceImageIds ?? [],
        rightPanelImageId: partial.rightPanelImageId ?? null,
        activeToolId: partial.activeToolId ?? null,
        selectedModelId: partial.selectedModelId ?? null,
        selectedArtStyleId: partial.selectedArtStyleId ?? null,
      };
      await store.writeAppState(full);
    },
    [store],
  );

  const attachFolder = useCallback(async () => {
    const { ok } = await store.attachFolder();
    return ok;
  }, [store]);

  const detachFolder = useCallback(async () => {
    await store.detachFolder();
  }, [store]);

  const refresh = useCallback(async () => {
    await store.reconcileWithFolder();
  }, [store]);

  return {
    history,
    folderStatus: snapshot.folderStatus,
    folderName: snapshot.folderName,
    folderSupported,
    hydrated: snapshot.hydrated,
    appState,
    addImage,
    deleteImage,
    setStarred,
    updateRecord,
    ensureImageData,
    saveAppState,
    attachFolder,
    detachFolder,
    refresh,
  };
};
