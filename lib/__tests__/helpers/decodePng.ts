import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

export type DecodedImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

/**
 * Minimal PNG decoder for the test fixtures: 8-bit, color-type-2 (RGB),
 * non-interlaced. Returns RGBA pixel data shaped like a canvas ImageData, so
 * decoded fixtures can be fed straight into extractPieceBoundsFromRaster without
 * a browser canvas or a third-party image dependency (the repo avoids adding
 * deps casually). Throws on any unsupported variation rather than guessing.
 */
export const decodePng = (path: string): DecodedImage => {
  const buf = readFileSync(path);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8 || colorType !== 2 || interlace !== 0) {
    throw new Error(
      `decodePng only supports 8-bit RGB non-interlaced PNG (got depth=${bitDepth} colorType=${colorType} interlace=${interlace})`,
    );
  }

  const idatChunks: Buffer[] = [];
  let offset = 8; // skip the 8-byte signature
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") {
      idatChunks.push(buf.subarray(offset + 8, offset + 8 + length));
    }
    if (type === "IEND") {
      break;
    }
    offset += 12 + length; // length + type + data + crc
  }

  const raw = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const unfiltered = Buffer.alloc(height * stride);

  let rawPos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawPos];
    rawPos += 1;
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[rawPos];
      rawPos += 1;
      const a = x >= bytesPerPixel ? unfiltered[rowStart + x - bytesPerPixel] : 0;
      const b = y > 0 ? unfiltered[prevStart + x] : 0;
      const c = y > 0 && x >= bytesPerPixel ? unfiltered[prevStart + x - bytesPerPixel] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + ((a + b) >> 1);
          break;
        case 4:
          value = rawByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`Unsupported PNG filter type ${filter}`);
      }
      unfiltered[rowStart + x] = value & 0xff;
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = unfiltered[i * 3];
    data[i * 4 + 1] = unfiltered[i * 3 + 1];
    data[i * 4 + 2] = unfiltered[i * 3 + 2];
    data[i * 4 + 3] = 255;
  }

  return { data, width, height };
};
