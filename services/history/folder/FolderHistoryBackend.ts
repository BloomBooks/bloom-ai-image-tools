import { createStore, del, get, set } from "idb-keyval";
import {
  IMAGE_TOOLS_FS_DB_NAME,
  IMAGE_TOOLS_FS_HANDLE_KEY,
  IMAGE_TOOLS_FS_HANDLE_STORE,
} from "../../persistence/constants";
import {
  APP_STATE_FILE_NAME,
  AppStateFile,
  HistoryEntry,
  HistoryEntrySidecar,
  IMAGES_DIR_NAME,
  TOMBSTONES_DIR_NAME,
  Tombstone,
} from "../types";
import {
  idFromFileName,
  imageFileNameForEntry,
  sidecarFileNameForId,
  tombstoneFileNameForId,
} from "../ids";
import { blobToBase64 } from "../../../lib/imageUtils";

export interface FolderBinding {
  directoryHandle: FileSystemDirectoryHandle;
  directoryName: string;
}

type PermissionMode = "read" | "readwrite";

type PermissionDescriptor = { mode?: PermissionMode };

type PermissionQueryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: PermissionDescriptor) => Promise<PermissionState>;
};

type PermissionRequestHandle = FileSystemDirectoryHandle & {
  requestPermission: (descriptor?: PermissionDescriptor) => Promise<PermissionState>;
};

const rwDescriptor: PermissionDescriptor = { mode: "readwrite" };

const supportsPermissionQuery = (h: FileSystemDirectoryHandle): h is PermissionQueryHandle =>
  typeof (h as PermissionQueryHandle).queryPermission === "function";

const supportsPermissionRequest = (h: FileSystemDirectoryHandle): h is PermissionRequestHandle =>
  typeof (h as PermissionRequestHandle).requestPermission === "function";

const isNotFoundError = (error: unknown) =>
  error instanceof DOMException && error.name === "NotFoundError";

let handleStore: ReturnType<typeof createStore> | null = null;
const resolveHandleStore = () => {
  if (typeof window === "undefined") return null;
  if (!handleStore) {
    handleStore = createStore(IMAGE_TOOLS_FS_DB_NAME, IMAGE_TOOLS_FS_HANDLE_STORE);
  }
  return handleStore;
};

type DirectoryPicker = (options?: { mode?: PermissionMode }) => Promise<FileSystemDirectoryHandle>;

const getDirectoryPicker = (): DirectoryPicker | null => {
  if (typeof window === "undefined") return null;
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker })
    .showDirectoryPicker;
  return typeof picker === "function" ? picker.bind(window) : null;
};

export const supportsFolderStorage = (): boolean => !!getDirectoryPicker();

const persistHandle = async (handle: FileSystemDirectoryHandle | null) => {
  const store = resolveHandleStore();
  if (!store) return;
  try {
    if (handle) {
      await set(IMAGE_TOOLS_FS_HANDLE_KEY, handle, store);
    } else {
      await del(IMAGE_TOOLS_FS_HANDLE_KEY, store);
    }
  } catch (error) {
    console.error("Failed to persist directory handle", error);
  }
};

const loadPersistedHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  const store = resolveHandleStore();
  if (!store) return null;
  try {
    const handle = (await get(IMAGE_TOOLS_FS_HANDLE_KEY, store)) as
      | FileSystemDirectoryHandle
      | undefined;
    return handle ?? null;
  } catch (error) {
    console.error("Failed to load directory handle", error);
    return null;
  }
};

const hasReadWrite = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
  if (!supportsPermissionQuery(handle)) return true;
  try {
    return (await handle.queryPermission(rwDescriptor)) === "granted";
  } catch (error) {
    console.error("Failed to query file system permissions", error);
    return false;
  }
};

const requestReadWrite = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
  if (!supportsPermissionRequest(handle)) return true;
  try {
    return (await handle.requestPermission(rwDescriptor)) === "granted";
  } catch (error) {
    console.error("Failed to request file system permissions", error);
    return false;
  }
};

export const restoreFolderBinding = async (): Promise<FolderBinding | null> => {
  if (!supportsFolderStorage()) return null;
  const handle = await loadPersistedHandle();
  if (!handle) return null;
  if (!(await hasReadWrite(handle))) {
    await persistHandle(null);
    return null;
  }
  return { directoryHandle: handle, directoryName: handle.name };
};

export const requestFolderBinding = async (): Promise<FolderBinding | null> => {
  const picker = getDirectoryPicker();
  if (!picker) return null;
  try {
    const handle = await picker({ mode: "readwrite" });
    if (!(await requestReadWrite(handle))) return null;
    await persistHandle(handle);
    return { directoryHandle: handle, directoryName: handle.name };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    console.error("Failed to select directory", error);
    return null;
  }
};

export const forgetFolderBinding = async () => {
  await persistHandle(null);
};

const getImagesDir = (binding: FolderBinding, create = true) =>
  binding.directoryHandle.getDirectoryHandle(IMAGES_DIR_NAME, { create });

const getTombstonesDir = (binding: FolderBinding, create = true) =>
  binding.directoryHandle.getDirectoryHandle(TOMBSTONES_DIR_NAME, { create });

const writeJsonFile = async (
  dir: FileSystemDirectoryHandle,
  fileName: string,
  data: unknown,
) => {
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const payload = JSON.stringify(data, null, 2);
  await writable.write(new Blob([payload], { type: "application/json" }));
  await writable.close();
};

const readJsonFile = async <T>(
  dir: FileSystemDirectoryHandle,
  fileName: string,
): Promise<T | null> => {
  try {
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    console.error(`Failed to read ${fileName}`, error);
    return null;
  }
};

const removeFromDir = async (dir: FileSystemDirectoryHandle, fileName: string) => {
  try {
    await dir.removeEntry(fileName);
  } catch (error) {
    if (isNotFoundError(error)) return;
    console.error(`Failed to remove ${fileName}`, error);
    throw error;
  }
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Unsupported image data URL");
  const [, mime, base64] = match;
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i);
  return new Blob([buffer], { type: mime });
};

// ---------- Image bytes + sidecar ----------

/**
 * Write image bytes and sidecar atomically (best-effort). If the sidecar
 * write fails, the image file is removed to avoid orphans.
 */
export const writeImageAndSidecar = async (
  binding: FolderBinding,
  entry: HistoryEntry,
  dataUrl: string,
): Promise<void> => {
  const imagesDir = await getImagesDir(binding);
  const imageName = imageFileNameForEntry(entry);
  const sidecarName = sidecarFileNameForId(entry.id);

  const imageHandle = await imagesDir.getFileHandle(imageName, { create: true });
  const imageWritable = await imageHandle.createWritable();
  const blob = await dataUrlToBlob(dataUrl);
  await imageWritable.write(blob);
  await imageWritable.close();

  try {
    await writeJsonFile(imagesDir, sidecarName, entry satisfies HistoryEntrySidecar);
  } catch (error) {
    // Roll back the image write so we never have a bytes-without-sidecar orphan.
    await removeFromDir(imagesDir, imageName).catch(() => undefined);
    throw error;
  }
};

/** Rewrite just the sidecar (for metadata edits like starring). */
export const writeSidecar = async (
  binding: FolderBinding,
  entry: HistoryEntry,
): Promise<void> => {
  const imagesDir = await getImagesDir(binding);
  await writeJsonFile(imagesDir, sidecarFileNameForId(entry.id), entry);
};

export const readImageBlob = async (
  binding: FolderBinding,
  entry: { id: string; imageMime: string },
): Promise<Blob | null> => {
  try {
    const imagesDir = await getImagesDir(binding, false);
    const fileHandle = await imagesDir.getFileHandle(imageFileNameForEntry(entry));
    return await fileHandle.getFile();
  } catch (error) {
    if (isNotFoundError(error)) return null;
    console.error("Failed to read image bytes", error);
    return null;
  }
};

export const readImageDataUrl = async (
  binding: FolderBinding,
  entry: { id: string; imageMime: string },
): Promise<string | null> => {
  const blob = await readImageBlob(binding, entry);
  if (!blob) return null;
  return blobToBase64(blob);
};

export const readSidecar = async (
  binding: FolderBinding,
  id: string,
): Promise<HistoryEntry | null> => {
  try {
    const imagesDir = await getImagesDir(binding, false);
    return await readJsonFile<HistoryEntry>(imagesDir, sidecarFileNameForId(id));
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
};

// ---------- Tombstones ----------

export const writeTombstone = async (binding: FolderBinding, tombstone: Tombstone) => {
  const dir = await getTombstonesDir(binding);
  await writeJsonFile(dir, tombstoneFileNameForId(tombstone.id), tombstone);
};

export const deleteImageAndSidecar = async (binding: FolderBinding, id: string, imageMime: string) => {
  try {
    const imagesDir = await getImagesDir(binding, false);
    await removeFromDir(imagesDir, imageFileNameForEntry({ id, imageMime }));
    await removeFromDir(imagesDir, sidecarFileNameForId(id));
  } catch (error) {
    if (isNotFoundError(error)) return;
    // Other errors already logged inside removeFromDir.
  }
};

export const deleteTombstoneFile = async (binding: FolderBinding, id: string) => {
  try {
    const dir = await getTombstonesDir(binding, false);
    await removeFromDir(dir, tombstoneFileNameForId(id));
  } catch (error) {
    if (isNotFoundError(error)) return;
  }
};

// ---------- Folder scan ----------

export interface FolderScanResult {
  /** Image bytes filenames (`<id>.<ext>`) with their lastModified. */
  images: Array<{ id: string; fileName: string; mime: string; lastModified: number }>;
  /** Sidecar contents keyed by id (may be missing for orphan bytes). */
  sidecars: Map<string, HistoryEntry>;
  /** Tombstone records keyed by id. */
  tombstones: Map<string, Tombstone>;
}

const mimeFromExtension = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".");
  const ext = dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "png":
      return "image/png";
    default:
      return "";
  }
};

const isImageFile = (fileName: string) =>
  /\.(png|jpg|jpeg|webp|gif)$/i.test(fileName);

const isJsonFile = (fileName: string) => /\.json$/i.test(fileName);

const iterateDirectoryEntries = async (
  dir: FileSystemDirectoryHandle,
): Promise<Array<{ name: string; handle: FileSystemHandle }>> => {
  const out: Array<{ name: string; handle: FileSystemHandle }> = [];
  // The spec uses async iterators on the directory handle itself; entries()
  // is the canonical method but some polyfills attach it differently.
  const dirAny = dir as unknown as {
    entries?: () => AsyncIterable<[string, FileSystemHandle]>;
  };
  const source = dirAny.entries ? dirAny.entries() : (dir as unknown as AsyncIterable<[string, FileSystemHandle]>);
  for await (const [name, handle] of source) {
    out.push({ name, handle });
  }
  return out;
};

export const scanFolder = async (binding: FolderBinding): Promise<FolderScanResult> => {
  const images: FolderScanResult["images"] = [];
  const sidecars = new Map<string, HistoryEntry>();
  const tombstones = new Map<string, Tombstone>();

  let imagesDir: FileSystemDirectoryHandle | null = null;
  try {
    imagesDir = await getImagesDir(binding, false);
  } catch (error) {
    if (!isNotFoundError(error)) console.error("Failed to open images dir", error);
  }

  if (imagesDir) {
    const entries = await iterateDirectoryEntries(imagesDir);
    for (const { name, handle } of entries) {
      if (handle.kind !== "file") continue;
      const fileHandle = handle as FileSystemFileHandle;
      if (isImageFile(name)) {
        try {
          const file = await fileHandle.getFile();
          images.push({
            id: idFromFileName(name),
            fileName: name,
            mime: mimeFromExtension(name) || file.type || "image/png",
            lastModified: file.lastModified,
          });
        } catch (error) {
          console.error(`Failed to stat ${name}`, error);
        }
      } else if (isJsonFile(name)) {
        try {
          const file = await fileHandle.getFile();
          const parsed = JSON.parse(await file.text()) as HistoryEntry;
          if (parsed && typeof parsed.id === "string") {
            sidecars.set(parsed.id, parsed);
          }
        } catch (error) {
          console.error(`Failed to read sidecar ${name}`, error);
        }
      }
    }
  }

  let tombstonesDir: FileSystemDirectoryHandle | null = null;
  try {
    tombstonesDir = await getTombstonesDir(binding, false);
  } catch (error) {
    if (!isNotFoundError(error)) console.error("Failed to open tombstones dir", error);
  }

  if (tombstonesDir) {
    const entries = await iterateDirectoryEntries(tombstonesDir);
    for (const { name, handle } of entries) {
      if (handle.kind !== "file") continue;
      if (!isJsonFile(name)) continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        const parsed = JSON.parse(await file.text()) as Tombstone;
        if (parsed && typeof parsed.id === "string") {
          tombstones.set(parsed.id, parsed);
        }
      } catch (error) {
        console.error(`Failed to read tombstone ${name}`, error);
      }
    }
  }

  return { images, sidecars, tombstones };
};

// ---------- App state file ----------

export const readAppStateFile = async (binding: FolderBinding): Promise<AppStateFile | null> => {
  return readJsonFile<AppStateFile>(binding.directoryHandle, APP_STATE_FILE_NAME);
};

export const writeAppStateFile = async (
  binding: FolderBinding,
  state: AppStateFile,
): Promise<void> => {
  await writeJsonFile(binding.directoryHandle, APP_STATE_FILE_NAME, state);
};

// ---------- Legacy file access (for migration) ----------

export const readRawJson = async <T>(
  binding: FolderBinding,
  fileName: string,
): Promise<T | null> => readJsonFile<T>(binding.directoryHandle, fileName);

export const renameTopLevelFile = async (
  binding: FolderBinding,
  fromName: string,
  toName: string,
): Promise<void> => {
  try {
    const fromHandle = await binding.directoryHandle.getFileHandle(fromName);
    const file = await fromHandle.getFile();
    const toHandle = await binding.directoryHandle.getFileHandle(toName, { create: true });
    const writable = await toHandle.createWritable();
    await writable.write(file);
    await writable.close();
    await binding.directoryHandle.removeEntry(fromName);
  } catch (error) {
    if (isNotFoundError(error)) return;
    console.error(`Failed to rename ${fromName} -> ${toName}`, error);
  }
};
