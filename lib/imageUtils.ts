export type ImageDimensions = {
  width: number;
  height: number;
};

const DEFAULT_DIMENSIONS: ImageDimensions = { width: 0, height: 0 };

export const getImageDimensions = (source: string | null | undefined): Promise<ImageDimensions> => {
  if (!source || typeof Image === "undefined") {
    return Promise.resolve(DEFAULT_DIMENSIONS);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve(DEFAULT_DIMENSIONS);
    };
    img.src = source;
  });
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  if (typeof FileReader === "undefined") {
    return Promise.reject(new Error("FileReader is not supported"));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? "");
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to convert blob to data URL"));
    };
    reader.readAsDataURL(blob);
  });
};

/**
 * Returns a base64 `data:` URL for the given image source. If the source is
 * already a data URL it is returned unchanged; otherwise it is fetched and
 * converted. Book images supplied by the Bloom host arrive as plain http(s)
 * URLs, which the OpenRouter client cannot consume directly — it requires
 * base64 — so any image used as a tool source must be normalized first.
 */
export const ensureDataUrl = async (source: string): Promise<string> => {
  if (!source || source.startsWith("data:")) {
    return source;
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to load image for editing (${response.status}).`);
  }
  const blob = await response.blob();
  return blobToBase64(blob);
};

export const getMimeTypeFromUrl = (dataUrl: string | null | undefined): string | null => {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);/i);
  return match ? match[1].toLowerCase() : null;
};

export const getImageFileExtensionFromMimeType = (mimeType: string | null | undefined): string => {
  switch ((mimeType || "").toLowerCase()) {
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

/**
 * Short human-facing name for an image MIME type, for the info panel's Format
 * row. An unrecognized type is shown as its subtype in upper case rather than
 * hidden, so an unusual source still says what it is.
 */
export const formatMimeLabel = (mimeType: string | null | undefined): string | null => {
  const normalized = (mimeType || "").trim().toLowerCase();
  if (!normalized) return null;

  switch (normalized) {
    case "image/jpeg":
    case "image/jpg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "image/webp":
      return "WebP";
    case "image/gif":
      return "GIF";
    case "image/svg+xml":
      return "SVG";
    case "image/avif":
      return "AVIF";
    case "image/bmp":
      return "BMP";
    case "image/tiff":
      return "TIFF";
    default: {
      const subtype = normalized.includes("/") ? normalized.split("/")[1] : normalized;
      return subtype ? subtype.toUpperCase() : null;
    }
  }
};

export type PreparedImageBlob = {
  dataUrl: string;
  mimeType: string | null;
  dimensions: ImageDimensions;
};

export const prepareImageBlob = async (blob: Blob): Promise<PreparedImageBlob> => {
  const dataUrl = await blobToBase64(blob);
  const mimeType = blob.type || getMimeTypeFromUrl(dataUrl);
  const dimensions = await getImageDimensions(dataUrl);
  return { dataUrl, mimeType, dimensions };
};
