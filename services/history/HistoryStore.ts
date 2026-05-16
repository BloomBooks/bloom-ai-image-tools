import * as browser from "./browser/BrowserHistoryBackend";
import * as folder from "./folder/FolderHistoryBackend";
import { diffFolderAgainstMemory, synthesizeEntryForOrphan } from "./folder/scan";
import {
  AppStateFile,
  APP_STATE_FILE_VERSION,
  FolderStatus,
  HistoryEntry,
  HistorySnapshot,
  TOMBSTONE_TTL_MS,
  Tombstone,
} from "./types";
import { blobToBase64 } from "../../lib/imageUtils";

const BROADCAST_CHANNEL_NAME = "bloom-history";

type Listener = (snapshot: HistorySnapshot) => void;
type AppStateListener = (state: AppStateFile | null) => void;

const sortByTimestampAsc = (a: HistoryEntry, b: HistoryEntry) => a.timestamp - b.timestamp;

export class HistoryStore {
  private entries = new Map<string, HistoryEntry>();
  private folderBinding: folder.FolderBinding | null = null;
  private folderStatus: FolderStatus = "none";
  private listeners = new Set<Listener>();
  private appStateListeners = new Set<AppStateListener>();
  private lastAppState: AppStateFile | null = null;
  private bytesPromiseCache = new Map<string, Promise<Blob | null>>();
  private broadcastChannel: BroadcastChannel | null = null;
  private visibilityHandler: (() => void) | null = null;
  private focusHandler: (() => void) | null = null;
  private flushingWal = false;
  private hydrating = false;
  private hydrated = false;

  // ---------- lifecycle ----------

  /**
   * Hydrate from IndexedDB, then if a folder handle was persisted, restore it
   * and run an initial reconciliation. Must be awaited once at app startup.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated || this.hydrating) return;
    this.hydrating = true;

    try {
      const browserEntries = await browser.readAllEntries();
      for (const entry of browserEntries) this.entries.set(entry.id, entry);

      const restored = await folder.restoreFolderBinding();
      if (restored) {
        await this.attachBinding(restored);
      }

      this.installBroadcast();
      this.installLifecycleListeners();
    } finally {
      this.hydrating = false;
      this.hydrated = true;
      this.emit();
    }
  }

  /** Disconnect listeners and channels. Called at app shutdown / unit tests. */
  dispose(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.focusHandler && typeof window !== "undefined") {
      window.removeEventListener("focus", this.focusHandler);
      this.focusHandler = null;
    }
    this.listeners.clear();
    this.appStateListeners.clear();
  }

  // ---------- subscription ----------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeAppState(listener: AppStateListener): () => void {
    this.appStateListeners.add(listener);
    listener(this.lastAppState);
    return () => this.appStateListeners.delete(listener);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  private emitAppState(): void {
    for (const l of this.appStateListeners) l(this.lastAppState);
  }

  snapshot(): HistorySnapshot {
    const entries = Array.from(this.entries.values()).sort(sortByTimestampAsc);
    return {
      entries,
      folderStatus: this.folderStatus,
      folderName: this.folderBinding?.directoryName ?? null,
      hydrated: this.hydrated,
    };
  }

  // ---------- folder attach / detach ----------

  async attachFolder(): Promise<{ ok: boolean }> {
    const binding = await folder.requestFolderBinding();
    if (!binding) return { ok: false };
    await this.attachBinding(binding);
    return { ok: true };
  }

  async detachFolder(): Promise<void> {
    if (!this.folderBinding) return;
    await folder.forgetFolderBinding();
    this.folderBinding = null;
    this.folderStatus = "none";
    // Bytes cache + entries remain in IndexedDB (browser-only mode from here).
    this.emit();
  }

  private async attachBinding(binding: folder.FolderBinding): Promise<void> {
    this.folderBinding = binding;
    this.folderStatus = "attached";

    // First-time attach migration: promote browser tombstones to folder
    // tombstones so a stale Dropbox folder can't resurrect them.
    if (!(await browser.isFolderImported())) {
      const browserTombs = await browser.readBrowserTombstones();
      for (const [id, deletedAt] of Object.entries(browserTombs)) {
        try {
          await folder.writeTombstone(binding, { id, deletedAt });
        } catch (error) {
          console.error("Failed to promote browser tombstone", id, error);
        }
      }
      // Push every browser entry that has bytes into the folder. Entries that
      // were in the browser but missing bytes are best-effort dropped (we
      // can't reconstruct what we don't have).
      for (const entry of this.entries.values()) {
        try {
          const blob = await browser.readBytes(entry.id);
          if (!blob) continue;
          const dataUrl = await blobToBase64(blob);
          await folder.writeImageAndSidecar(binding, entry, dataUrl);
        } catch (error) {
          console.error("Failed to push browser entry to folder", entry.id, error);
        }
      }
      await browser.setFolderImported();
      await browser.clearBrowserTombstones();
    }

    // Read app-state.json (if any) so strip layout etc. comes across.
    try {
      this.lastAppState = await folder.readAppStateFile(binding);
      this.emitAppState();
    } catch (error) {
      console.error("Failed to read app-state.json", error);
    }

    await this.reconcileWithFolder();
    await this.flushWal();
  }

  // ---------- mutations ----------

  async add(entry: HistoryEntry, dataUrl: string): Promise<void> {
    const enriched: HistoryEntry = { ...entry, metaUpdatedAt: entry.metaUpdatedAt || Date.now() };

    // Update in-memory state and notify subscribers synchronously so the UI
    // can render the new entry immediately. IDB and folder writes follow.
    this.entries.set(enriched.id, enriched);
    this.emit();
    this.broadcast({ type: "added", id: enriched.id });

    await browser.writeEntry(enriched);

    try {
      const blob = await dataUrlToBlob(dataUrl);
      await browser.writeBytes(enriched.id, blob);
    } catch (error) {
      console.error("Failed to cache bytes", error);
    }

    if (this.folderBinding) {
      await browser.enqueueWal({ id: enriched.id, kind: "add", dataUrl, entry: enriched });
      void this.flushWal();
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.entries.has(id)) return;
    const entry = this.entries.get(id);

    this.entries.delete(id);

    if (this.folderBinding) {
      // Tombstone-first deletion: ensure the tombstone is on disk before the
      // bytes/sidecar so a racing reader can never resurrect.
      try {
        await folder.writeTombstone(this.folderBinding, { id, deletedAt: Date.now() });
      } catch (error) {
        console.error("Failed to write tombstone", error);
      }
      if (entry) {
        try {
          await folder.deleteImageAndSidecar(this.folderBinding, id, entry.imageMime);
        } catch (error) {
          console.error("Failed to delete image/sidecar", error);
        }
      }
    } else {
      // Browser-only: record so a future folder attach knows about the delete.
      await browser.recordBrowserTombstone(id);
    }

    await browser.deleteEntry(id);

    this.emit();
    this.broadcast({ type: "deleted", id });
  }

  async updateMeta(id: string, patch: Partial<HistoryEntry>): Promise<void> {
    const current = this.entries.get(id);
    if (!current) return;
    const next: HistoryEntry = { ...current, ...patch, id, metaUpdatedAt: Date.now() };
    this.entries.set(id, next);
    await browser.writeEntry(next);
    if (this.folderBinding) {
      try {
        await folder.writeSidecar(this.folderBinding, next);
      } catch (error) {
        console.error("Failed to write sidecar update", error);
      }
    }
    this.emit();
    this.broadcast({ type: "meta", id });
  }

  // ---------- bytes ----------

  async loadBytes(id: string): Promise<Blob | null> {
    const existing = this.bytesPromiseCache.get(id);
    if (existing) return existing;
    const p = this.loadBytesInner(id);
    this.bytesPromiseCache.set(id, p);
    p.finally(() => this.bytesPromiseCache.delete(id));
    return p;
  }

  private async loadBytesInner(id: string): Promise<Blob | null> {
    const cached = await browser.readBytes(id);
    if (cached) return cached;
    if (!this.folderBinding) return null;
    const entry = this.entries.get(id);
    if (!entry) return null;
    const blob = await folder.readImageBlob(this.folderBinding, entry);
    if (blob) {
      await browser.writeBytes(id, blob);
    }
    return blob;
  }

  async loadDataUrl(id: string): Promise<string | null> {
    const blob = await this.loadBytes(id);
    if (!blob) return null;
    return blobToBase64(blob);
  }

  // ---------- app state file ----------

  async writeAppState(state: AppStateFile): Promise<void> {
    this.lastAppState = state;
    this.emitAppState();
    if (!this.folderBinding) return;
    try {
      await folder.writeAppStateFile(this.folderBinding, state);
    } catch (error) {
      console.error("Failed to write app-state.json", error);
    }
  }

  // ---------- reconciliation ----------

  async reconcileWithFolder(): Promise<void> {
    if (!this.folderBinding) return;
    let scan: Awaited<ReturnType<typeof folder.scanFolder>>;
    try {
      scan = await folder.scanFolder(this.folderBinding);
    } catch (error) {
      console.error("Folder scan failed", error);
      this.folderStatus = "error";
      this.emit();
      return;
    }

    const plan = diffFolderAgainstMemory({
      scan,
      memory: this.entries,
      now: Date.now(),
      tombstoneTtlMs: TOMBSTONE_TTL_MS,
    });

    let changed = false;

    for (const id of plan.toRemoveFromMemory) {
      if (this.entries.delete(id)) {
        await browser.deleteEntry(id);
        changed = true;
      }
    }

    for (const target of plan.toDeleteFiles) {
      try {
        await folder.deleteImageAndSidecar(this.folderBinding, target.id, target.imageMime);
      } catch (error) {
        console.error("Failed to delete file during reconcile", error);
      }
    }

    for (const entry of plan.toAdd) {
      this.entries.set(entry.id, entry);
      await browser.writeEntry(entry);
      changed = true;
    }

    for (const entry of plan.toUpdateInMemory) {
      this.entries.set(entry.id, entry);
      await browser.writeEntry(entry);
      changed = true;
    }

    for (const entry of plan.toRewriteSidecar) {
      try {
        await folder.writeSidecar(this.folderBinding, entry);
      } catch (error) {
        console.error("Failed to rewrite sidecar during reconcile", error);
      }
    }

    for (const orphan of plan.orphanImages) {
      const synthesized = synthesizeEntryForOrphan(orphan);
      this.entries.set(synthesized.id, synthesized);
      await browser.writeEntry(synthesized);
      try {
        await folder.writeSidecar(this.folderBinding, synthesized);
      } catch (error) {
        console.error("Failed to write synthesized sidecar", error);
      }
      changed = true;
    }

    for (const id of plan.expiredTombstones) {
      try {
        await folder.deleteTombstoneFile(this.folderBinding, id);
      } catch (error) {
        console.error("Failed to GC tombstone", error);
      }
    }

    // Re-read app-state.json if changed.
    try {
      const nextAppState = await folder.readAppStateFile(this.folderBinding);
      const prevSaved = this.lastAppState?.savedAt ?? -Infinity;
      const nextSaved = nextAppState?.savedAt ?? -Infinity;
      if (nextAppState && nextSaved > prevSaved) {
        this.lastAppState = nextAppState;
        this.emitAppState();
      }
    } catch (error) {
      console.error("Failed to re-read app-state.json", error);
    }

    if (changed) this.emit();
  }

  // ---------- WAL ----------

  private async flushWal(): Promise<void> {
    if (this.flushingWal) return;
    if (!this.folderBinding) return;
    this.flushingWal = true;
    try {
      const items = await browser.readWal();
      for (const { key, value } of items) {
        try {
          if (value.kind === "add" && value.entry && value.dataUrl) {
            await folder.writeImageAndSidecar(this.folderBinding, value.entry, value.dataUrl);
          } else if (value.kind === "delete") {
            await folder.writeTombstone(this.folderBinding, {
              id: value.id,
              deletedAt: value.enqueuedAt,
            });
          }
          await browser.removeWalKey(key);
        } catch (error) {
          console.error("WAL flush failed for", key, error);
          // Leave the entry; we'll retry next flush.
          break;
        }
      }
    } finally {
      this.flushingWal = false;
    }
  }

  // ---------- broadcast / lifecycle ----------

  private installBroadcast(): void {
    if (typeof BroadcastChannel === "undefined") return;
    try {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data as { type: string };
        // Any peer-side change → reconcile from folder. Cheap because the
        // folder is local IDB-side data on most machines.
        if (msg && (msg.type === "added" || msg.type === "deleted" || msg.type === "meta")) {
          void this.reconcileWithFolder();
        }
      };
    } catch (error) {
      console.error("Failed to install BroadcastChannel", error);
    }
  }

  private broadcast(message: { type: "added" | "deleted" | "meta"; id: string }): void {
    if (!this.broadcastChannel) return;
    try {
      this.broadcastChannel.postMessage(message);
    } catch {
      /* ignore */
    }
  }

  private installLifecycleListeners(): void {
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          void this.reconcileWithFolder();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    if (typeof window !== "undefined") {
      this.focusHandler = () => void this.reconcileWithFolder();
      window.addEventListener("focus", this.focusHandler);
    }
  }
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Unsupported image data URL");
  const [, mime, base64] = match;
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i);
  return new Blob([buffer], { type: mime });
};

// Lazy singleton so the module is import-safe in SSR contexts.
let singleton: HistoryStore | null = null;
export const getHistoryStore = (): HistoryStore => {
  if (!singleton) singleton = new HistoryStore();
  return singleton;
};

/** Reset the singleton — for tests only. */
export const __resetHistoryStoreForTests = (): void => {
  if (singleton) singleton.dispose();
  singleton = null;
};
