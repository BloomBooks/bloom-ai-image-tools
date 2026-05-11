import { createStore, del, get, keys, set, UseStore } from "idb-keyval";
import type { HistoryEntry, WalEntry } from "../types";

/**
 * IndexedDB-backed cache and write-ahead log. Three logical stores share one
 * IDB database via key prefixes (idb-keyval doesn't natively support multiple
 * stores per call site without extra plumbing).
 *
 *   entry:<id>   -> HistoryEntry          (metadata, browser-only mode = truth)
 *   bytes:<id>   -> Blob                  (lazy cache of image bytes)
 *   wal:<seq>    -> WalEntry              (pending folder writes)
 *   meta:lru     -> string[]              (LRU order, most-recent-used last)
 *   meta:wal-seq -> number                (monotonic seq counter for wal keys)
 *   meta:folder-imported -> 1             (one-shot guard for migration)
 *   meta:tombstones -> Record<string, number>  (browser-mode deletions, kept
 *                      so they can be promoted to folder tombstones on attach)
 */

const DB_NAME = "bloom-image-tools-history";
const STORE_NAME = "history";

const ENTRY_PREFIX = "entry:";
const BYTES_PREFIX = "bytes:";
const WAL_PREFIX = "wal:";
const META_LRU = "meta:lru";
const META_WAL_SEQ = "meta:wal-seq";
const META_FOLDER_IMPORTED = "meta:folder-imported";
const META_TOMBSTONES = "meta:tombstones";

let storeSingleton: UseStore | null = null;

const store = (): UseStore | null => {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  if (!storeSingleton) storeSingleton = createStore(DB_NAME, STORE_NAME);
  return storeSingleton;
};

const isQuotaError = (error: unknown): boolean => {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22
  );
};

// ---------- entries ----------

export const writeEntry = async (entry: HistoryEntry): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    await set(`${ENTRY_PREFIX}${entry.id}`, entry, s);
  } catch (error) {
    if (isQuotaError(error)) {
      console.warn("Quota exceeded writing entry metadata; entry not cached", entry.id);
      return;
    }
    console.error("Failed to write entry", error);
  }
};

export const readEntry = async (id: string): Promise<HistoryEntry | null> => {
  const s = store();
  if (!s) return null;
  try {
    return ((await get(`${ENTRY_PREFIX}${id}`, s)) as HistoryEntry | undefined) ?? null;
  } catch (error) {
    console.error("Failed to read entry", error);
    return null;
  }
};

export const deleteEntry = async (id: string): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    await del(`${ENTRY_PREFIX}${id}`, s);
    await del(`${BYTES_PREFIX}${id}`, s);
    await removeFromLru(id);
  } catch (error) {
    console.error("Failed to delete entry", error);
  }
};

export const readAllEntries = async (): Promise<HistoryEntry[]> => {
  const s = store();
  if (!s) return [];
  try {
    const allKeys = (await keys(s)) as string[];
    const entryKeys = allKeys.filter((k) => k.startsWith(ENTRY_PREFIX));
    const entries = await Promise.all(
      entryKeys.map((k) => get(k, s) as Promise<HistoryEntry | undefined>),
    );
    return entries.filter((e): e is HistoryEntry => !!e);
  } catch (error) {
    console.error("Failed to enumerate entries", error);
    return [];
  }
};

// ---------- bytes cache (LRU + quota-aware) ----------

const readLru = async (): Promise<string[]> => {
  const s = store();
  if (!s) return [];
  try {
    return ((await get(META_LRU, s)) as string[] | undefined) ?? [];
  } catch {
    return [];
  }
};

const writeLru = async (order: string[]): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    await set(META_LRU, order, s);
  } catch (error) {
    // LRU itself failing on quota is rare; ignore.
    if (!isQuotaError(error)) console.error("Failed to write LRU order", error);
  }
};

const bumpLru = async (id: string): Promise<void> => {
  const order = await readLru();
  const next = order.filter((x) => x !== id);
  next.push(id);
  await writeLru(next);
};

const removeFromLru = async (id: string): Promise<void> => {
  const order = await readLru();
  const next = order.filter((x) => x !== id);
  if (next.length !== order.length) await writeLru(next);
};

const evictOldest = async (): Promise<boolean> => {
  const s = store();
  if (!s) return false;
  const order = await readLru();
  const victim = order[0];
  if (!victim) return false;
  try {
    await del(`${BYTES_PREFIX}${victim}`, s);
    await writeLru(order.slice(1));
    return true;
  } catch (error) {
    console.error("Failed to evict LRU victim", error);
    return false;
  }
};

/**
 * Cache image bytes. If we hit a quota error we evict the oldest entry and
 * retry, up to a reasonable bound. If we still can't write, we give up
 * quietly — the bytes can always be reloaded from the folder.
 */
export const writeBytes = async (id: string, blob: Blob): Promise<void> => {
  const s = store();
  if (!s) return;
  let attempts = 0;
  while (attempts < 16) {
    try {
      await set(`${BYTES_PREFIX}${id}`, blob, s);
      await bumpLru(id);
      return;
    } catch (error) {
      if (!isQuotaError(error)) {
        console.error("Failed to write bytes", error);
        return;
      }
      const evicted = await evictOldest();
      if (!evicted) {
        console.warn("Quota exceeded and nothing to evict; dropping bytes for", id);
        return;
      }
      attempts += 1;
    }
  }
  console.warn("Gave up writing bytes after repeated quota failures", id);
};

export const readBytes = async (id: string): Promise<Blob | null> => {
  const s = store();
  if (!s) return null;
  try {
    const blob = ((await get(`${BYTES_PREFIX}${id}`, s)) as Blob | undefined) ?? null;
    if (blob) await bumpLru(id);
    return blob;
  } catch (error) {
    console.error("Failed to read bytes", error);
    return null;
  }
};

export const deleteBytes = async (id: string): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    await del(`${BYTES_PREFIX}${id}`, s);
    await removeFromLru(id);
  } catch (error) {
    console.error("Failed to delete bytes", error);
  }
};

export const listCachedBytesIds = async (): Promise<string[]> => readLru();

// ---------- write-ahead log ----------

const nextWalSeq = async (): Promise<number> => {
  const s = store();
  if (!s) return Date.now();
  try {
    const current = ((await get(META_WAL_SEQ, s)) as number | undefined) ?? 0;
    const next = current + 1;
    await set(META_WAL_SEQ, next, s);
    return next;
  } catch {
    return Date.now();
  }
};

export const enqueueWal = async (entry: Omit<WalEntry, "enqueuedAt">): Promise<void> => {
  const s = store();
  if (!s) return;
  const seq = await nextWalSeq();
  const full: WalEntry = { ...entry, enqueuedAt: Date.now() };
  try {
    await set(`${WAL_PREFIX}${seq.toString().padStart(10, "0")}`, full, s);
  } catch (error) {
    if (!isQuotaError(error)) console.error("Failed to enqueue WAL entry", error);
  }
};

export const readWal = async (): Promise<Array<{ key: string; value: WalEntry }>> => {
  const s = store();
  if (!s) return [];
  try {
    const allKeys = ((await keys(s)) as string[]).filter((k) => k.startsWith(WAL_PREFIX));
    allKeys.sort();
    const values = await Promise.all(
      allKeys.map((k) => get(k, s) as Promise<WalEntry | undefined>),
    );
    return allKeys
      .map((key, i) => ({ key, value: values[i] }))
      .filter((p): p is { key: string; value: WalEntry } => !!p.value);
  } catch (error) {
    console.error("Failed to read WAL", error);
    return [];
  }
};

export const removeWalKey = async (key: string): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    await del(key, s);
  } catch (error) {
    console.error("Failed to remove WAL key", error);
  }
};

// ---------- browser-mode tombstones ----------

/**
 * In folder-less mode, deletes happen in memory only. We still record them
 * so that when a folder is later attached, those ids are promoted to real
 * folder tombstones and don't get resurrected if the folder already has
 * the file (e.g. a stale Dropbox sync).
 */
export const recordBrowserTombstone = async (id: string): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    const current = ((await get(META_TOMBSTONES, s)) as Record<string, number> | undefined) ?? {};
    current[id] = Date.now();
    await set(META_TOMBSTONES, current, s);
  } catch (error) {
    console.error("Failed to record browser tombstone", error);
  }
};

export const readBrowserTombstones = async (): Promise<Record<string, number>> => {
  const s = store();
  if (!s) return {};
  try {
    return ((await get(META_TOMBSTONES, s)) as Record<string, number> | undefined) ?? {};
  } catch {
    return {};
  }
};

export const clearBrowserTombstones = async (): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    await del(META_TOMBSTONES, s);
  } catch {
    /* ignore */
  }
};

// ---------- one-shot guards ----------

export const isFolderImported = async (): Promise<boolean> => {
  const s = store();
  if (!s) return false;
  try {
    return !!(await get(META_FOLDER_IMPORTED, s));
  } catch {
    return false;
  }
};

export const setFolderImported = async (): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    await set(META_FOLDER_IMPORTED, 1, s);
  } catch {
    /* ignore */
  }
};

export const clearFolderImported = async (): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    await del(META_FOLDER_IMPORTED, s);
  } catch {
    /* ignore */
  }
};

// ---------- wholesale clear (used by tests) ----------

export const clearAll = async (): Promise<void> => {
  const s = store();
  if (!s) return;
  try {
    const allKeys = (await keys(s)) as string[];
    await Promise.all(allKeys.map((k) => del(k, s)));
  } catch (error) {
    console.error("Failed to clear browser history backend", error);
  }
};
