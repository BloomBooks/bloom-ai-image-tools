import extractPngChunks from "png-chunks-extract";
import encodePngChunks from "png-chunks-encode";
import piexif from "piexifjs";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = new Uint8Array([255, 216]);
const EXIF_HEADER = "Exif\u0000\u0000";
const PNG_EXIF_CHUNK = "eXIf";

export type ExifChunk = Uint8Array;

const isPngBytes = (bytes: Uint8Array): boolean => {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
};

const isJpegBytes = (bytes: Uint8Array): boolean => {
  if (bytes.length < JPEG_SIGNATURE.length) return false;
  return JPEG_SIGNATURE.every((value, index) => bytes[index] === value);
};

const binaryStringToBytes = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
};

const bytesToBinaryString = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let output = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return output;
};

const decodeBase64 = (value: string): string => {
  if (typeof atob === "function") {
    return atob(value);
  }

  return Buffer.from(value, "base64").toString("binary");
};

const encodeBase64 = (value: string): string => {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  return Buffer.from(value, "binary").toString("base64");
};

const getMimeTypeFromDataUrl = (dataUrl: string | null | undefined): string | null => {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,/i);
  return match?.[1]?.toLowerCase() || null;
};

const getBytesFromDataUrl = (dataUrl: string): Uint8Array => {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/i);
  if (!match) {
    throw new Error("Invalid data URL");
  }

  const [, , isBase64, dataPart] = match;
  const binary = isBase64
    ? decodeBase64(dataPart.replace(/\s+/g, ""))
    : decodeURIComponent(dataPart);
  return binaryStringToBytes(binary);
};

const createDataUrl = (mimeType: string, bytes: Uint8Array): string => {
  return `data:${mimeType};base64,${encodeBase64(bytesToBinaryString(bytes))}`;
};

const stripExifHeader = (exifBinary: string): Uint8Array => {
  const binaryWithoutHeader = exifBinary.startsWith(EXIF_HEADER)
    ? exifBinary.slice(EXIF_HEADER.length)
    : exifBinary;
  return binaryStringToBytes(binaryWithoutHeader);
};

const insertOrReplacePngExif = (pngBytes: Uint8Array, exifBytes: ExifChunk): Uint8Array => {
  const chunks = extractPngChunks(pngBytes);
  const chunksWithoutExif = chunks.filter((chunk) => chunk.name !== PNG_EXIF_CHUNK);
  const insertAt = chunksWithoutExif.findIndex((chunk) => chunk.name === "IDAT");
  const targetIndex = insertAt >= 0 ? insertAt : chunksWithoutExif.length - 1;

  chunksWithoutExif.splice(targetIndex, 0, {
    name: PNG_EXIF_CHUNK,
    data: exifBytes,
  });

  return encodePngChunks(chunksWithoutExif);
};

const extractPngExif = (pngBytes: Uint8Array): ExifChunk | null => {
  const exifChunk = extractPngChunks(pngBytes).find((chunk) => chunk.name === PNG_EXIF_CHUNK);
  return exifChunk?.data || null;
};

const extractJpegExif = (jpegBytes: Uint8Array): ExifChunk | null => {
  let offset = 2;

  while (offset + 4 <= jpegBytes.length) {
    if (jpegBytes[offset] !== 0xff) {
      break;
    }

    while (offset < jpegBytes.length && jpegBytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= jpegBytes.length) {
      break;
    }

    const marker = jpegBytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 2 > jpegBytes.length) {
      break;
    }

    const segmentLength = (jpegBytes[offset] << 8) | jpegBytes[offset + 1];
    const segmentDataStart = offset + 2;
    const segmentDataEnd = offset + segmentLength;
    if (segmentDataEnd > jpegBytes.length) {
      break;
    }

    if (
      marker === 0xe1 &&
      segmentLength >= 8 &&
      jpegBytes[segmentDataStart] === 0x45 &&
      jpegBytes[segmentDataStart + 1] === 0x78 &&
      jpegBytes[segmentDataStart + 2] === 0x69 &&
      jpegBytes[segmentDataStart + 3] === 0x66 &&
      jpegBytes[segmentDataStart + 4] === 0x00 &&
      jpegBytes[segmentDataStart + 5] === 0x00
    ) {
      return jpegBytes.slice(segmentDataStart + EXIF_HEADER.length, segmentDataEnd);
    }

    offset = segmentDataEnd;
  }

  return null;
};

export const buildModelExif = (modelName: string | null | undefined): ExifChunk | null => {
  const trimmedModelName = (modelName || "").trim();
  if (!trimmedModelName) return null;

  const zeroth: Record<number, string> = {
    [piexif.ImageIFD.Artist]: trimmedModelName,
    [piexif.ImageIFD.Copyright]: trimmedModelName,
  };
  const exifBinary = piexif.dump({
    "0th": zeroth,
    Exif: {},
    GPS: {},
    Interop: {},
    "1st": {},
    thumbnail: null,
  });

  return stripExifHeader(exifBinary);
};

export const extractExifFromBytes = (
  bytes: Uint8Array,
  mimeHint?: string | null,
): ExifChunk | null => {
  const normalizedMime = (mimeHint || "").toLowerCase();

  if (normalizedMime === "image/png" || (!normalizedMime && isPngBytes(bytes))) {
    return extractPngExif(bytes);
  }

  if (
    normalizedMime === "image/jpeg" ||
    normalizedMime === "image/jpg" ||
    (!normalizedMime && isJpegBytes(bytes))
  ) {
    return extractJpegExif(bytes);
  }

  return null;
};

export const extractExifFromBlob = async (blob: Blob): Promise<ExifChunk | null> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return extractExifFromBytes(bytes, blob.type);
};

export const applyExifToDataUrl = (imageData: string, exifBytes: ExifChunk): string => {
  const mimeType = getMimeTypeFromDataUrl(imageData);
  if (!mimeType) {
    throw new Error("Image data URL is missing a MIME type");
  }

  if (mimeType === "image/png") {
    const pngBytes = getBytesFromDataUrl(imageData);
    return createDataUrl(mimeType, insertOrReplacePngExif(pngBytes, exifBytes));
  }

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    const exifBinary = EXIF_HEADER + bytesToBinaryString(exifBytes);
    return piexif.insert(exifBinary, imageData);
  }

  throw new Error(`Unsupported image type for EXIF metadata: ${mimeType}`);
};

export const applyExifToBlob = async (blob: Blob, exifBytes: ExifChunk): Promise<Blob> => {
  const imageData = createDataUrl(
    blob.type ||
      (isPngBytes(new Uint8Array(await blob.arrayBuffer())) ? "image/png" : "image/jpeg"),
    new Uint8Array(await blob.arrayBuffer()),
  );
  const updatedData = applyExifToDataUrl(imageData, exifBytes);
  const updatedMimeType = getMimeTypeFromDataUrl(updatedData) || blob.type || "image/png";
  const updatedBytes = Uint8Array.from(getBytesFromDataUrl(updatedData));
  return new Blob([updatedBytes], { type: updatedMimeType });
};

export const applyModelExifToImageData = (
  imageData: string,
  modelName: string | null | undefined,
): string => {
  const exifBytes = buildModelExif(modelName);
  if (!exifBytes) return imageData;
  return applyExifToDataUrl(imageData, exifBytes);
};
