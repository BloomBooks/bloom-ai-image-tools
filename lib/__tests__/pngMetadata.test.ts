import { describe, expect, it } from "vitest";
import { injectPngTextMetadata } from "../pngMetadata";

const toBytes = (base64: string): Uint8Array => {
  const binary = Buffer.from(base64, "base64");
  return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
};

const readTextChunks = (png: Uint8Array): Record<string, string[]> => {
  const signatureLen = 8;
  let offset = signatureLen;
  const out: Record<string, string[]> = {};

  const readU32 = (i: number) =>
    ((png[i] << 24) | (png[i + 1] << 16) | (png[i + 2] << 8) | png[i + 3]) >>>
    0;

  while (offset + 12 <= png.length) {
    const len = readU32(offset);
    const type = String.fromCharCode(
      png[offset + 4],
      png[offset + 5],
      png[offset + 6],
      png[offset + 7]
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    const crcEnd = dataEnd + 4;
    if (crcEnd > png.length) break;

    if (type === "tEXt") {
      const data = png.slice(dataStart, dataEnd);
      const nul = data.indexOf(0);
      const keyBytes = nul >= 0 ? data.slice(0, nul) : data;
      const valueBytes = nul >= 0 ? data.slice(nul + 1) : new Uint8Array();
      const key = Buffer.from(keyBytes).toString("utf8");
      const value = Buffer.from(valueBytes).toString("utf8");
      out[key] = out[key] || [];
      out[key].push(value);
    }

    offset = crcEnd;
    if (type === "IEND") break;
  }

  return out;
};

// 1x1 transparent PNG
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6Xk5GQAAAAASUVORK5CYII=";

describe("injectPngTextMetadata", () => {
  it("inserts tEXt chunks after IHDR", () => {
    const bytes = toBytes(PNG_1X1_BASE64);
    const updated = injectPngTextMetadata(bytes, {
      IllustratorModel: "google/gemini-2.5-flash-image",
    });

    const chunks = readTextChunks(updated);
    expect(chunks["IllustratorModel"]?.[0]).toBe(
      "google/gemini-2.5-flash-image"
    );
  });

  it("ignores empty metadata values", () => {
    const bytes = toBytes(PNG_1X1_BASE64);
    const updated = injectPngTextMetadata(bytes, {
      IllustratorModel: "   ",
      EditorModel: "",
      SomethingElse: null,
    });

    const chunks = readTextChunks(updated);
    expect(Object.keys(chunks)).toHaveLength(0);
  });
});
