import { getImageFileExtensionFromMimeType } from "../../lib/imageUtils";

const MAX_SLUG_LEN = 40;

/**
 * Build a filesystem-safe slug from a free-form string. Lowercase, alphanumerics
 * only, runs of dashes collapsed, trimmed to MAX_SLUG_LEN. Returns "" for empty
 * input so callers can supply a fallback.
 */
export const slugify = (source: string | null | undefined): string => {
  if (!source) return "";
  const cleaned = source
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return "";
  return cleaned.slice(0, MAX_SLUG_LEN).replace(/-+$/g, "");
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** UTC ISO-ish timestamp safe for filesystems. e.g. "2026-05-11T14-32-07". */
export const formatIsoForFilename = (date: Date): string => {
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}-${pad2(date.getUTCMinutes())}-${pad2(date.getUTCSeconds())}`
  );
};

const randHex = (len: number, rng: () => number = Math.random): string => {
  let out = "";
  while (out.length < len) {
    out += Math.floor(rng() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  }
  return out.slice(0, len);
};

export interface BuildIdInput {
  /** UI prompt the user typed, if any. */
  promptUsed?: string | null;
  /** Tool id (used as fallback slug source). */
  toolId?: string | null;
  /** Tool parameters (we look for a "subject" key as another slug source). */
  parameters?: Record<string, string> | null;
  /** Defaults to new Date(). */
  now?: Date;
  /** For tests: deterministic random. */
  rng?: () => number;
}

/**
 * Build a new image id of the form `<iso>_<slug>_<rand>`. The id is suitable
 * for use as the filename stem (extension is added separately).
 *
 * Examples:
 *   "2026-05-11T14-32-07_friendly-robot_a3f9"
 *   "2026-05-11T14-32-07_upload_b2c1"   (no prompt -> tool id)
 */
export const buildHistoryId = (input: BuildIdInput = {}): string => {
  const date = input.now ?? new Date();
  const iso = formatIsoForFilename(date);

  let slug = slugify(input.promptUsed);
  if (!slug) slug = slugify(input.parameters?.subject);
  if (!slug) slug = slugify(input.toolId);
  if (!slug) slug = "image";

  const rand = randHex(4, input.rng);
  return `${iso}_${slug}_${rand}`;
};

/** Derive the on-disk filename for the image bytes. */
export const imageFileNameForEntry = (entry: { id: string; imageMime: string }): string => {
  const ext = getImageFileExtensionFromMimeType(entry.imageMime);
  return `${entry.id}.${ext}`;
};

/** Sidecar filename is always `<id>.json`. */
export const sidecarFileNameForId = (id: string): string => `${id}.json`;

/** Tombstone filename is always `<id>.json`. */
export const tombstoneFileNameForId = (id: string): string => `${id}.json`;

/** Extract the id from any of: "<id>.png", "<id>.jpg", "<id>.json". */
export const idFromFileName = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? fileName : fileName.slice(0, dot);
};
