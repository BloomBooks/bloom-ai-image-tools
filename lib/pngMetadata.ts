const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const textEncoder = new TextEncoder();

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = crc32Table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const readUint32BE = (bytes: Uint8Array, offset: number): number => {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
};

const writeUint32BE = (value: number, out: Uint8Array, offset: number) => {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
};

const isValidPng = (bytes: Uint8Array): boolean => {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
};

const sanitizeKeyword = (keyword: string): string => {
  const trimmed = keyword.trim();
  if (!trimmed) return "Metadata";
  // PNG tEXt keyword: 1-79 bytes, Latin-1, no NUL.
  // We keep it ASCII-ish; remove NULs and clamp length.
  const withoutNull = trimmed.replace(/\u0000/g, "");
  const maxLen = 79;
  return withoutNull.length > maxLen
    ? withoutNull.slice(0, maxLen)
    : withoutNull;
};

const buildTextChunk = (keyword: string, text: string): Uint8Array => {
  const safeKeyword = sanitizeKeyword(keyword);
  const keywordBytes = textEncoder.encode(safeKeyword);
  const textBytes = textEncoder.encode(text ?? "");

  const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  data.set(keywordBytes, 0);
  data[keywordBytes.length] = 0;
  data.set(textBytes, keywordBytes.length + 1);

  const typeBytes = textEncoder.encode("tEXt");
  const crcBytes = new Uint8Array(typeBytes.length + data.length);
  crcBytes.set(typeBytes, 0);
  crcBytes.set(data, typeBytes.length);

  const total = new Uint8Array(4 + 4 + data.length + 4);
  writeUint32BE(data.length, total, 0);
  total.set(typeBytes, 4);
  total.set(data, 8);
  writeUint32BE(crc32(crcBytes), total, 8 + data.length);

  return total;
};

export type PngTextMetadata = Record<string, string | null | undefined>;

export const injectPngTextMetadata = (
  pngBytes: Uint8Array,
  fields: PngTextMetadata
): Uint8Array => {
  if (!isValidPng(pngBytes)) {
    throw new Error("injectPngTextMetadata: invalid PNG signature");
  }

  const entries = Object.entries(fields).filter(([, value]) => {
    const v = (value ?? "").trim();
    return v.length > 0;
  });

  if (entries.length === 0) return pngBytes;

  // PNG structure: signature (8) + chunks.
  // First chunk must be IHDR. Insert metadata immediately after IHDR.
  const signatureLen = 8;
  if (pngBytes.length < signatureLen + 12) {
    throw new Error("injectPngTextMetadata: PNG too small");
  }

  const ihdrLen = readUint32BE(pngBytes, signatureLen);
  const ihdrType = String.fromCharCode(
    pngBytes[signatureLen + 4],
    pngBytes[signatureLen + 5],
    pngBytes[signatureLen + 6],
    pngBytes[signatureLen + 7]
  );
  if (ihdrType !== "IHDR") {
    throw new Error("injectPngTextMetadata: missing IHDR chunk");
  }

  const ihdrTotalLen = 4 + 4 + ihdrLen + 4;
  const afterIhdr = signatureLen + ihdrTotalLen;
  if (afterIhdr > pngBytes.length) {
    throw new Error("injectPngTextMetadata: IHDR chunk overruns file");
  }

  const textChunks = entries.map(([k, v]) => buildTextChunk(k, (v ?? "").trim()));
  const insertedBytesLen = textChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  const out = new Uint8Array(pngBytes.length + insertedBytesLen);
  out.set(pngBytes.slice(0, afterIhdr), 0);

  let offset = afterIhdr;
  for (const chunk of textChunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  out.set(pngBytes.slice(afterIhdr), offset);
  return out;
};

export const injectPngTextMetadataIntoBlob = async (
  blob: Blob,
  fields: PngTextMetadata
): Promise<Blob> => {
  const entries = Object.entries(fields).filter(([, value]) => {
    const v = (value ?? "").trim();
    return v.length > 0;
  });
  if (entries.length === 0) return blob;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const updated = injectPngTextMetadata(bytes, fields);
  const buffer = updated.buffer as ArrayBuffer;
  const arrayBuffer = buffer.slice(
    updated.byteOffset,
    updated.byteOffset + updated.byteLength
  );
  return new Blob([arrayBuffer], { type: "image/png" });
};
