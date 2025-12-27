import {
  convertBlobToPng,
  copyBlobToClipboard,
  getBlobFromImageSource,
  isPngBlob,
} from "copy-image-clipboard";

import {
  injectPngTextMetadataIntoBlob,
  type PngTextMetadata,
} from "./pngMetadata";

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
  const lowered = mime.toLowerCase().trim();
  if (!lowered) return null;

  // Normalize common variants.
  if (lowered === "image/jpg" || lowered === "image/pjpeg") {
    return "image/jpeg";
  }
  if (lowered === "image/x-png") {
    return "image/png";
  }

  // If already a full MIME type, keep it.
  if (lowered.startsWith("image/")) {
    return lowered;
  }

  // Handle extension-like values.
  if (lowered === "jpg" || lowered === "jpeg" || lowered === "pjpeg") {
    return "image/jpeg";
  }
  if (lowered === "png" || lowered === "x-png") {
    return "image/png";
  }

  // Best-effort for other image extensions.
  return `image/${lowered}`;
};

export const getNormalizedImageBlob = async (dataUrl: string): Promise<Blob> => {
  const blobFromSource = await (dataUrl.startsWith("data:")
    ? getBlobFromDataUrl(dataUrl)
    : getBlobFromImageSource(dataUrl));

  const normalizedSourceType = getTypeFromMime(blobFromSource.type);
  const normalizedDataUrlType = getTypeFromMime(getDataUrlMimeType(dataUrl));
  const mime = normalizedSourceType || normalizedDataUrlType || "image/png";

  if ((blobFromSource.type || "").toLowerCase() === mime.toLowerCase()) {
    return blobFromSource;
  }

  const buffer = await blobFromSource.arrayBuffer();
  return new Blob([buffer], { type: mime });
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
  const mime = getTypeFromMime(blob.type) || "image/png";
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
  imageData: string | null | undefined,
  pngTextMetadata?: PngTextMetadata
): Promise<boolean> => {
  if (!imageData) return false;

  try {
    const normalizedBlob = await getNormalizedImageBlob(imageData);

    const hasMetadata =
      !!pngTextMetadata &&
      Object.values(pngTextMetadata).some(
        (v) => typeof v === "string" && v.trim().length > 0
      );

    if (hasMetadata) {
      const pngBlob = await convertBlobToPngWithFallback(normalizedBlob);
      const pngWithMetadata = await injectPngTextMetadataIntoBlob(
        pngBlob,
        pngTextMetadata || {}
      );
      await copyBlobToClipboard(pngWithMetadata);
    } else {
      await copyWithFallbackIfNeeded(normalizedBlob);
    }
    return true;
  } catch (error) {
    // Some browsers/environments can't write image types to the clipboard.
    // As a last resort, copy the image as text (data URL / URL) so the
    // clipboard is at least updated and users get something usable.
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(imageData);
        return true;
      }
    } catch {
      // ignore and rethrow original error
    }

    throw error;
  }
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
