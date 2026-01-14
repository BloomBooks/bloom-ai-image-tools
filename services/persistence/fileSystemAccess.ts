import { createStore, del, get, set } from "idb-keyval";
import {
  IMAGE_TOOLS_FS_DB_NAME,
  IMAGE_TOOLS_FS_HANDLE_KEY,
  IMAGE_TOOLS_FS_HANDLE_STORE,
  IMAGE_TOOLS_FS_IMAGES_DIR,
  IMAGE_TOOLS_FS_MANIFEST_FILE,
  IMAGE_TOOLS_FS_MANIFEST_VERSION,
} from "./constants";
import { HistoryManifest } from "../../types";

export interface FileSystemImageBinding {
  directoryHandle: FileSystemDirectoryHandle;
  directoryName: string;
}

type DirectoryPicker = (options?: DirectoryPickerOptions) => Promise<
  FileSystemDirectoryHandle
>;

type DirectoryPickerOptions = {
  mode?: "read" | "readwrite";
};

type PermissionMode = "read" | "readwrite";

type PermissionDescriptor = {
  mode?: PermissionMode;
};

const rwDescriptor: PermissionDescriptor = { mode: "readwrite" };

type PermissionQueryHandle = FileSystemDirectoryHandle & {
  queryPermission: (
    descriptor?: PermissionDescriptor
  ) => Promise<PermissionState>;
};

type PermissionRequestHandle = FileSystemDirectoryHandle & {
  requestPermission: (
    descriptor?: PermissionDescriptor
  ) => Promise<PermissionState>;
};

const supportsPermissionQuery = (
  handle: FileSystemDirectoryHandle
): handle is PermissionQueryHandle => {
  return typeof (handle as PermissionQueryHandle).queryPermission === "function";
};

const supportsPermissionRequest = (
  handle: FileSystemDirectoryHandle
): handle is PermissionRequestHandle => {
  return (
    typeof (handle as PermissionRequestHandle).requestPermission === "function"
  );
};

let handleStore: ReturnType<typeof createStore> | null = null;
const resolveHandleStore = () => {
  if (typeof window === "undefined") {
    return null;
  }
  if (!handleStore) {
    handleStore = createStore(
      IMAGE_TOOLS_FS_DB_NAME,
      IMAGE_TOOLS_FS_HANDLE_STORE
    );
  }
  return handleStore;
};

const getDirectoryPicker = (): DirectoryPicker | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const picker = (window as Window & typeof globalThis & {
    showDirectoryPicker?: DirectoryPicker;
  }).showDirectoryPicker;

  return typeof picker === "function" ? picker.bind(window) : null;
};

const isNotFoundError = (error: unknown) => {
  return error instanceof DOMException && error.name === "NotFoundError";
};

const hasReadWritePermission = async (
  handle: FileSystemDirectoryHandle
) => {
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

const requestReadWritePermission = async (
  handle: FileSystemDirectoryHandle
) => {
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

const persistDirectoryHandle = async (
  handle: FileSystemDirectoryHandle | null
) => {
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
    const handle = (await get(
      IMAGE_TOOLS_FS_HANDLE_KEY,
      store
    )) as FileSystemDirectoryHandle | undefined;
    return handle ?? null;
  } catch (error) {
    console.error("Failed to load directory handle", error);
    return null;
  }
};

const getImagesDirectoryHandle = async (
  root: FileSystemDirectoryHandle
) => {
  return root.getDirectoryHandle(IMAGE_TOOLS_FS_IMAGES_DIR, { create: true });
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
  data: unknown
) => {
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const payload = JSON.stringify(data, null, 2);
  await writable.write(new Blob([payload], { type: "application/json" }));
  await writable.close();
};

const readJsonFile = async <T>(
  handle: FileSystemDirectoryHandle,
  fileName: string
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

export const supportsFileSystemAccess = (): boolean => !!getDirectoryPicker();

export const restoreFileSystemImageBinding = async (): Promise<
  FileSystemImageBinding | null
> => {
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

export const requestFileSystemImageBinding = async (): Promise<
  FileSystemImageBinding | null
> => {
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
  dataUrl: string
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
  fileName: string
): Promise<string | null> => {
  try {
    const dir = await getImagesDirectoryHandle(binding.directoryHandle);
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await blobToDataUrl(file);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    console.error("Failed to read history image", error);
    return null;
  }
};

export const deleteImageFile = async (
  binding: FileSystemImageBinding,
  fileName: string
) => {
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

export const deriveImageFileName = (
  historyId: string,
  mime: string
) => {
  const extension = getFileExtension(mime);
  return `${historyId}.${extension}`;
};

export const listHistoryImageFiles = async (
  binding: FileSystemImageBinding
) => {
  try {
    const dir = await getImagesDirectoryHandle(binding.directoryHandle);
    const entries: Array<{ id: string; fileName: string; lastModified: number }> =
      [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== "file") {
        continue;
      }
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const id = name.replace(/\.[^.]+$/, "");
      if (!id) {
        continue;
      }
      entries.push({ id, fileName: name, lastModified: file.lastModified });
    }
    return entries;
  } catch (error) {
    console.error("Failed to list history images", error);
    return [];
  }
};

export const readHistoryManifest = async (
  binding: FileSystemImageBinding
): Promise<HistoryManifest | null> => {
  const manifest = await readJsonFile<HistoryManifest>(
    binding.directoryHandle,
    IMAGE_TOOLS_FS_MANIFEST_FILE
  );
  if (!manifest || manifest.version !== IMAGE_TOOLS_FS_MANIFEST_VERSION) {
    return null;
  }
  return manifest;
};

export const writeHistoryManifest = async (
  binding: FileSystemImageBinding,
  manifest: Omit<HistoryManifest, "version">
) => {
  await writeJsonFile(binding.directoryHandle, IMAGE_TOOLS_FS_MANIFEST_FILE, {
    ...manifest,
    version: IMAGE_TOOLS_FS_MANIFEST_VERSION,
  });
};
