import type { CapabilityName } from "../types";

/**
 * Formats a numeric credit value for display.
 * Returns "--" for invalid/missing values.
 */
export const formatCreditsValue = (
  value: number | null | undefined
): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

/**
 * Builds a human-readable summary of source images used in an operation.
 * Returns null if no images were used.
 */
export const formatSourceSummary = (
  editImageCount: number,
  referenceImageCount: number
): string | null => {
  const normalizedEdit = Math.max(0, editImageCount);
  const normalizedReference = Math.max(0, referenceImageCount);
  const parts: string[] = [];

  if (normalizedEdit > 0) {
    const label = normalizedEdit === 1 ? "image" : "images";
    parts.push(`${normalizedEdit} ${label} to edit`);
  }

  if (normalizedReference > 0) {
    const label =
      normalizedReference === 1 ? "reference image" : "reference images";
    parts.push(`${normalizedReference} ${label}`);
  }

  if (!parts.length) {
    return null;
  }

  if (parts.length === 1) {
    return `Included ${parts[0]}.`;
  }

  const summary = `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Included ${summary}.`;
};

/**
 * Formats a capability name for display (e.g., "image-generation" -> "Image Generation").
 */
export const formatCapabilityLabel = (name: CapabilityName): string =>
  name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
