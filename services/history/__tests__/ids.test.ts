import { describe, expect, it } from "vite-plus/test";
import {
  buildHistoryId,
  formatIsoForFilename,
  idFromFileName,
  imageFileNameForEntry,
  sidecarFileNameForId,
  slugify,
  tombstoneFileNameForId,
} from "../ids";

describe("slugify", () => {
  it("lowercases and replaces non-alphanumerics with single dashes", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("collapses runs of separators and trims edge dashes", () => {
    expect(slugify("  --foo   bar  baz!! ")).toBe("foo-bar-baz");
  });

  it("strips diacritics", () => {
    expect(slugify("naïve café")).toBe("naive-cafe");
  });

  it("returns empty string for empty or null input", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
    expect(slugify("!!!")).toBe("");
  });

  it("caps length and trims dashes from the cap point", () => {
    const long = "a".repeat(60);
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("formatIsoForFilename", () => {
  it("produces filesystem-safe UTC iso", () => {
    const d = new Date(Date.UTC(2026, 4, 11, 14, 32, 7));
    expect(formatIsoForFilename(d)).toBe("2026-05-11T14-32-07");
  });
});

describe("buildHistoryId", () => {
  const fixedRng = () => 0.12345; // deterministic

  it("uses promptUsed as the slug source by default", () => {
    const id = buildHistoryId({
      promptUsed: "A friendly robot on a bicycle",
      now: new Date(Date.UTC(2026, 4, 11, 14, 32, 7)),
      rng: fixedRng,
    });
    expect(id).toMatch(/^2026-05-11T14-32-07_a-friendly-robot-on-a-bicycle_[0-9a-f]{4}$/);
  });

  it("falls back to parameters.subject when no prompt", () => {
    const id = buildHistoryId({
      promptUsed: "",
      parameters: { subject: "wise owl" },
      now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
      rng: fixedRng,
    });
    expect(id).toMatch(/^2026-01-01T00-00-00_wise-owl_[0-9a-f]{4}$/);
  });

  it("falls back to toolId when neither prompt nor subject", () => {
    const id = buildHistoryId({
      toolId: "upload",
      now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
      rng: fixedRng,
    });
    expect(id).toMatch(/^2026-01-01T00-00-00_upload_[0-9a-f]{4}$/);
  });

  it("uses 'image' as the final fallback", () => {
    const id = buildHistoryId({
      now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
      rng: fixedRng,
    });
    expect(id).toMatch(/^2026-01-01T00-00-00_image_[0-9a-f]{4}$/);
  });

  it("ids sort chronologically as strings", () => {
    const a = buildHistoryId({ now: new Date(Date.UTC(2026, 0, 1)), rng: fixedRng });
    const b = buildHistoryId({ now: new Date(Date.UTC(2026, 1, 1)), rng: fixedRng });
    const c = buildHistoryId({ now: new Date(Date.UTC(2027, 0, 1)), rng: fixedRng });
    const sorted = [c, b, a].sort();
    expect(sorted).toEqual([a, b, c]);
  });
});

describe("filename helpers", () => {
  it("imageFileNameForEntry uses the mime to pick the extension", () => {
    expect(imageFileNameForEntry({ id: "x", imageMime: "image/jpeg" })).toBe("x.jpg");
    expect(imageFileNameForEntry({ id: "x", imageMime: "image/png" })).toBe("x.png");
    expect(imageFileNameForEntry({ id: "x", imageMime: "image/webp" })).toBe("x.webp");
  });

  it("sidecar and tombstone names are <id>.json", () => {
    expect(sidecarFileNameForId("abc")).toBe("abc.json");
    expect(tombstoneFileNameForId("abc")).toBe("abc.json");
  });

  it("idFromFileName strips the extension", () => {
    expect(idFromFileName("2026-05-11T14-32-07_foo_a3f9.png")).toBe("2026-05-11T14-32-07_foo_a3f9");
    expect(idFromFileName("plain")).toBe("plain");
  });
});
