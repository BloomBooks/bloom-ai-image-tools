import {
  convertBlobToPng,
  copyBlobToClipboard,
  getBlobFromImageSource,
  isPngBlob,
} from "copy-image-clipboard";

export type ClipboardUploadHandler = (file: File) => void | Promise<void>;

export const getDataUrlMimeType = (
  dataUrl: string | null | undefined
): string | null => {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);/i);
  return match ? match[1].toLowerCase() : null;
};

export const getTypeFromFileName = (
  fileName: string | null | undefined
): string | null => {
  if (!fileName) return null;
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "jpeg";
    default:
      return ext;
  }
};

export const getBlobFromDataUrl = async (dataUrl: string): Promise<Blob> => {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/i);
  if (!match) {
    throw new Error("Invalid data URL");
  }

  const [, mime = "application/octet-stream", base64Indicator, dataPart] =
    match;

  if (base64Indicator) {
    const cleaned = dataPart.replace(/\s+/g, "");
    const binary = atob(cleaned);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime || "application/octet-stream" });
  }

  const decoded = decodeURIComponent(dataPart);
  return new Blob([decoded], { type: mime || "application/octet-stream" });
};

export const getTypeFromMime = (mime: string | null): string | null => {
  if (!mime) return null;
  const lowered = mime.toLowerCase().replace("image/", "");
  if (lowered === "jpg" || lowered === "pjpeg") {
    return "jpeg";
  }
  if (lowered === "x-png") {
    return "png";
  }
  return lowered;
};

export const getNormalizedImageBlob = async (dataUrl: string): Promise<Blob> => {
  const blobFromSource = await (dataUrl.startsWith("data:")
    ? getBlobFromDataUrl(dataUrl)
    : getBlobFromImageSource(dataUrl));
  const type =
    getTypeFromMime(blobFromSource.type) ||
    getTypeFromMime(getDataUrlMimeType(dataUrl)) ||
    "png";

  if (blobFromSource.type === type) {
    return blobFromSource;
  }

  const buffer = await blobFromSource.arrayBuffer();
  return new Blob([buffer], { type });
};

export const clipboardSupportsMime = (mime: string): boolean => {
  if (typeof ClipboardItem === "undefined") return true;
  if (typeof ClipboardItem.supports === "function") {
    try {
      return ClipboardItem.supports(mime);
    } catch (err) {
      console.warn("Unable to query ClipboardItem support:", err);
    }
  }
  return true;
};

export const shouldRetryWithPng = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const message = String((error as { message?: string }).message || "");
  return /not\s*allowed|not\s*supported|does\s+not\s+support|unsupported/i.test(
    message
  );
};

export const convertBlobToPngWithFallback = async (blob: Blob): Promise<Blob> => {
  if (isPngBlob(blob)) {
    return blob;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.createImageBitmap === "function"
  ) {
    try {
      const bitmap = await window.createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas context unavailable for PNG conversion");
        }
        context.drawImage(bitmap, 0, 0);
        const pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error("Canvas toBlob() returned null")),
            "image/png"
          );
        });
        return pngBlob;
      } finally {
        if (typeof bitmap.close === "function") {
          bitmap.close();
        }
      }
    } catch (error) {
      console.warn(
        "Bitmap-based PNG conversion failed, retrying with default method:",
        error
      );
    }
  }

  return convertBlobToPng(blob);
};

export const copyWithFallbackIfNeeded = async (blob: Blob): Promise<void> => {
  const mime = blob.type || "image/png";
  const canUseOriginal = clipboardSupportsMime(mime);

  if (canUseOriginal) {
    try {
      await copyBlobToClipboard(blob);
      return;
    } catch (error) {
      if (!shouldRetryWithPng(error)) {
        throw error;
      }
    }
  } else {
    console.info(
      `Clipboard does not support ${mime}, attempting PNG fallback.`
    );
  }

  const pngBlob = await convertBlobToPngWithFallback(blob);
  await copyBlobToClipboard(pngBlob);
};

export const handleCopy = async (
  imageData: string | null | undefined
): Promise<boolean> => {
  if (!imageData) return false;
  const normalizedBlob = await getNormalizedImageBlob(imageData);
  await copyWithFallbackIfNeeded(normalizedBlob);
  return true;
};

export const readClipboardImageFile = async (): Promise<File | null> => {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard API is not available in this environment");
  }

  if (typeof navigator.clipboard.read !== "function") {
    throw new Error("navigator.clipboard.read is not supported");
  }

  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (!imageType) continue;

    const blob = await item.getType(imageType);
    const extension = imageType.split("/")[1] || "png";
    return new File([blob], `pasted.${extension}`, {
      type: imageType,
    });
  }

  return null;
};

export const handlePaste = async (
  onUpload?: ClipboardUploadHandler
): Promise<boolean> => {
  if (!onUpload) return false;
  const file = await readClipboardImageFile();
  if (!file) return false;
  await onUpload(file);
  return true;
};

export const getImageFileFromClipboardEvent = (
  event: ClipboardEvent
): File | null => {
  const data = event.clipboardData;
  if (!data) return null;

  for (let i = 0; i < data.files.length; i += 1) {
    const file = data.files[i];
    if (!file) continue;
    if (!file.type || file.type.startsWith("image/")) {
      return file;
    }
  }

  return null;
};

export const handleClipboardPaste = async (
  event: ClipboardEvent,
  onUpload?: ClipboardUploadHandler
): Promise<boolean> => {
  if (!onUpload) return false;
  const file = getImageFileFromClipboardEvent(event);
  if (!file) return false;

  event.preventDefault();
  await onUpload(file);
  return true;
};
