import { createStore, del, get, set } from "idb-keyval";
import {
  IMAGE_TOOLS_FS_DB_NAME,
  IMAGE_TOOLS_FS_HANDLE_KEY,
  IMAGE_TOOLS_FS_HANDLE_STORE,
  IMAGE_TOOLS_FS_IMAGES_DIR,
} from "./constants";
import { ImageRecord, PersistedAppState, ThumbnailStripsSnapshot } from "../../types";
import { APP_STATE_FILE_VERSION } from "../history/types";
import type { AppStateFile, HistoryEntry } from "../history/types";
import {
  deleteImageAndSidecar,
  readAppStateFile,
  scanFolder,
  writeAppStateFile,
  writeTombstone,
} from "../history/folder/FolderHistoryBackend";

export interface FileSystemImageBinding {
  directoryHandle: FileSystemDirectoryHandle;
  directoryName: string;
}

export interface FolderPersistedState {
  appState: PersistedAppState;
  thumbnailStrips?: ThumbnailStripsSnapshot;
}

type DirectoryPicker = (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;

type DirectoryPickerOptions = {
  mode?: "read" | "readwrite";
};

type PermissionMode = "read" | "readwrite";

type PermissionDescriptor = {
  mode?: PermissionMode;
};

const rwDescriptor: PermissionDescriptor = { mode: "readwrite" };

type PermissionQueryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: PermissionDescriptor) => Promise<PermissionState>;
};

type PermissionRequestHandle = FileSystemDirectoryHandle & {
  requestPermission: (descriptor?: PermissionDescriptor) => Promise<PermissionState>;
};

type DirectoryEntriesHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

type HistoryImageFile = {
  id: string;
  fileName: string;
  lastModified: number;
};

const supportsPermissionQuery = (
  handle: FileSystemDirectoryHandle,
): handle is PermissionQueryHandle => {
  return typeof (handle as PermissionQueryHandle).queryPermission === "function";
};

const supportsPermissionRequest = (
  handle: FileSystemDirectoryHandle,
): handle is PermissionRequestHandle => {
  return typeof (handle as PermissionRequestHandle).requestPermission === "function";
};

let handleStore: ReturnType<typeof createStore> | null = null;
const resolveHandleStore = () => {
  if (typeof window === "undefined") {
    return null;
  }
  if (!handleStore) {
    handleStore = createStore(IMAGE_TOOLS_FS_DB_NAME, IMAGE_TOOLS_FS_HANDLE_STORE);
  }
  return handleStore;
};

const getDirectoryPicker = (): DirectoryPicker | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const picker = (
    window as Window &
      typeof globalThis & {
        showDirectoryPicker?: DirectoryPicker;
      }
  ).showDirectoryPicker;

  return typeof picker === "function" ? picker.bind(window) : null;
};

const isNotFoundError = (error: unknown) => {
  return error instanceof DOMException && error.name === "NotFoundError";
};

const isInvalidStateError = (error: unknown) => {
  return error instanceof DOMException && error.name === "InvalidStateError";
};

const hasReadWritePermission = async (handle: FileSystemDirectoryHandle) => {
  if (!supportsPermissionQuery(handle)) {
    return true;
  }
  try {
    const status = await handle.queryPermission(rwDescriptor);
    return status === "granted";
  } catch (error) {
    console.error("Failed to query file system permissions", error);
    return false;
  }
};

const requestReadWritePermission = async (handle: FileSystemDirectoryHandle) => {
  if (!supportsPermissionRequest(handle)) {
    return true;
  }
  try {
    const status = await handle.requestPermission(rwDescriptor);
    return status === "granted";
  } catch (error) {
    console.error("Failed to request file system permissions", error);
    return false;
  }
};

const persistDirectoryHandle = async (handle: FileSystemDirectoryHandle | null) => {
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

const loadPersistedDirectoryHandle = async () => {
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

const getImagesDirectoryHandle = async (root: FileSystemDirectoryHandle) => {
  return root.getDirectoryHandle(IMAGE_TOOLS_FS_IMAGES_DIR, { create: true });
};

const isImageFileName = (fileName: string) => {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(fileName);
};

const dataUrlToBlob = async (dataUrl: string) => {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Unsupported image format");
  }
  const [, mime, base64] = match;
  const binary = atob(base64);
  const len = binary.length;
  const buffer = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return { blob: new Blob([buffer], { type: mime }), mime };
};

const writeJsonFile = async (
  handle: FileSystemDirectoryHandle,
  fileName: string,
  data: unknown,
) => {
  const payload = JSON.stringify(data, null, 2);
  const attemptWrite = async () => {
    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([payload], { type: "application/json" }));
    await writable.close();
  };

  try {
    await attemptWrite();
  } catch (error) {
    if (!isInvalidStateError(error)) {
      throw error;
    }
    await attemptWrite();
  }
};

const readJsonFile = async <T>(
  handle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<T | null> => {
  try {
    const fileHandle = await handle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    console.error("Failed to read json file", error);
    return null;
  }
};

const blobToDataUrl = (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
};

const getFileExtension = (mime: string) => {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
};

const getMimeTypeFromFileName = (fileName: string | null | undefined) => {
  const normalized = fileName?.toLowerCase() ?? "";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalized.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/png";
};

const imageRecordFromHistoryEntry = (
  entry: HistoryEntry,
  imageFileName: string | null,
): ImageRecord => ({
  id: entry.id,
  parentId: entry.parentId ?? null,
  imageData: "",
  imageFileName,
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

const buildPersistedAppStateFromAppStateFile = (
  appState: AppStateFile,
  sidecars: Map<string, HistoryEntry>,
  imageFilesById: Map<string, string>,
): PersistedAppState => {
  const orderedIds = appState.thumbnailStrips?.itemIdsByStrip?.history ?? [];
  const seenIds = new Set<string>();
  const history: ImageRecord[] = [];

  orderedIds.forEach((id) => {
    const sidecar = sidecars.get(id);
    if (!sidecar) {
      return;
    }
    history.push(imageRecordFromHistoryEntry(sidecar, imageFilesById.get(id) ?? null));
    seenIds.add(id);
  });

  sidecars.forEach((sidecar, id) => {
    if (seenIds.has(id)) {
      return;
    }
    history.push(imageRecordFromHistoryEntry(sidecar, imageFilesById.get(id) ?? null));
  });

  return {
    targetImageId: appState.targetImageId ?? null,
    referenceImageIds: appState.referenceImageIds ?? [],
    rightPanelImageId: appState.rightPanelImageId ?? null,
    history,
  };
};

export const supportsFileSystemAccess = (): boolean => !!getDirectoryPicker();

export const restoreFileSystemImageBinding = async (): Promise<FileSystemImageBinding | null> => {
  if (!supportsFileSystemAccess()) {
    return null;
  }

  const handle = await loadPersistedDirectoryHandle();
  if (!handle) {
    return null;
  }

  if (!(await hasReadWritePermission(handle))) {
    await persistDirectoryHandle(null);
    return null;
  }

  return {
    directoryHandle: handle,
    directoryName: handle.name,
  };
};

export const requestFileSystemImageBinding = async (): Promise<FileSystemImageBinding | null> => {
  const picker = getDirectoryPicker();
  if (!picker) {
    return null;
  }
  try {
    const handle = await picker({ mode: "readwrite" });
    const granted = await requestReadWritePermission(handle);
    if (!granted) {
      return null;
    }
    await persistDirectoryHandle(handle);
    return {
      directoryHandle: handle,
      directoryName: handle.name,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    console.error("Failed to select directory for images", error);
    return null;
  }
};

export const forgetFileSystemImageBinding = async () => {
  await persistDirectoryHandle(null);
};

export const writeImageFile = async (
  binding: FileSystemImageBinding,
  fileName: string,
  dataUrl: string,
) => {
  const dir = await getImagesDirectoryHandle(binding.directoryHandle);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const { blob } = await dataUrlToBlob(dataUrl);
  await writable.write(blob);
  await writable.close();
};

export const readImageFile = async (
  binding: FileSystemImageBinding,
  fileName: string,
): Promise<string | null> => {
  const readFromHandle = async (directory: FileSystemDirectoryHandle) => {
    const fileHandle = await directory.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await blobToDataUrl(file);
  };

  try {
    const dir = await getImagesDirectoryHandle(binding.directoryHandle);
    return await readFromHandle(dir);
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.error("Failed to read history image", error);
      return null;
    }
  }

  try {
    return await readFromHandle(binding.directoryHandle);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    console.error("Failed to read history image", error);
    return null;
  }
};

export const deleteImageFile = async (binding: FileSystemImageBinding, fileName: string) => {
  try {
    const dir = await getImagesDirectoryHandle(binding.directoryHandle);
    await dir.removeEntry(fileName);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    console.error("Failed to delete history image", error);
  }
};

export const deriveImageFileName = (historyId: string, mime: string) => {
  const extension = getFileExtension(mime);
  return `${historyId}.${extension}`;
};

export const listHistoryImageFiles = async (binding: FileSystemImageBinding) => {
  const scanHandle = async (handle: FileSystemDirectoryHandle) => {
    const iterableDir = handle as DirectoryEntriesHandle;
    const entries: HistoryImageFile[] = [];
    for await (const [name, entryHandle] of iterableDir.entries()) {
      if (entryHandle.kind !== "file" || !isImageFileName(name)) {
        continue;
      }
      const fileHandle = entryHandle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const id = name.replace(/\.[^.]+$/, "");
      if (!id) {
        continue;
      }
      entries.push({ id, fileName: name, lastModified: file.lastModified });
    }
    return entries;
  };

  try {
    const entriesById = new Map<string, HistoryImageFile>();

    try {
      const dir = await getImagesDirectoryHandle(binding.directoryHandle);
      for (const entry of await scanHandle(dir)) {
        entriesById.set(entry.id, entry);
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        console.error("Failed to list history images", error);
      }
    }

    for (const entry of await scanHandle(binding.directoryHandle)) {
      if (!entriesById.has(entry.id)) {
        entriesById.set(entry.id, entry);
      }
    }

    return Array.from(entriesById.values());
  } catch (error) {
    console.error("Failed to list history images", error);
    return [];
  }
};

export const readFolderPersistedState = async (
  binding: FileSystemImageBinding,
): Promise<FolderPersistedState | null> => {
  const appState = await readAppStateFile(binding);
  if (!appState) {
    return null;
  }

  const scan = await scanFolder(binding);
  const imageFilesById = new Map(scan.images.map((image) => [image.id, image.fileName] as const));
  return {
    appState: buildPersistedAppStateFromAppStateFile(appState, scan.sidecars, imageFilesById),
    thumbnailStrips: appState.thumbnailStrips,
  };
};

export const writeFolderAppState = async (
  binding: FileSystemImageBinding,
  appState: Omit<AppStateFile, "version" | "savedAt">,
) => {
  await writeAppStateFile(binding, {
    ...appState,
    version: APP_STATE_FILE_VERSION,
    savedAt: Date.now(),
  });
};

export const deletePersistedHistoryItem = async (
  binding: FileSystemImageBinding,
  item: ImageRecord,
) => {
  if (!item.imageFileName) {
    return;
  }

  await writeTombstone(binding, { id: item.id, deletedAt: Date.now() });
  await deleteImageAndSidecar(binding, item.id, getMimeTypeFromFileName(item.imageFileName));
};
