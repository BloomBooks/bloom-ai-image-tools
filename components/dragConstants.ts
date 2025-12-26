export const INTERNAL_IMAGE_DRAG_DATA_MIME = "application/x-bloom-image-id";

let lastInternalDraggedImageId: string | null = null;

const normalizeCandidate = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const isLikelyHistoryId = (value: string) => {
  return /^[a-z0-9_-]{3,64}$/i.test(value);
};

export const setInternalImageDragData = (
  dataTransfer: DataTransfer | null,
  imageId: string | null | undefined
) => {
  if (!dataTransfer || !imageId) {
    return;
  }

  lastInternalDraggedImageId = imageId;

  // Some drag sources (or Playwright's synthetic drag) can be picky about
  // which MIME types are allowed. Try each independently so we at least
  // populate a plain-text fallback.
  try {
    dataTransfer.setData(INTERNAL_IMAGE_DRAG_DATA_MIME, imageId);
  } catch {
    // ignore
  }
  try {
    dataTransfer.setData("text/plain", imageId);
  } catch {
    // ignore
  }
};

export const getInternalImageDragData = (
  dataTransfer: DataTransfer | null
): string | null => {
  if (!dataTransfer) {
    return null;
  }

  const mimeValue = normalizeCandidate(
    dataTransfer.getData(INTERNAL_IMAGE_DRAG_DATA_MIME)
  );
  if (mimeValue) {
    return mimeValue;
  }

  const plainValue = normalizeCandidate(dataTransfer.getData("text/plain"));
  if (plainValue && isLikelyHistoryId(plainValue)) {
    return plainValue;
  }

  // Fallback: some environments expose the drag data types but return empty
  // strings from getData() during dragover/drop. If the drag is internal,
  // fall back to the last ID we successfully set.
  const types = Array.from(dataTransfer.types || []);
  const looksInternal =
    types.includes(INTERNAL_IMAGE_DRAG_DATA_MIME) || types.includes("text/plain");
  if (
    looksInternal &&
    lastInternalDraggedImageId &&
    isLikelyHistoryId(lastInternalDraggedImageId)
  ) {
    return lastInternalDraggedImageId;
  }

  return null;
};

export const hasInternalImageDragData = (
  dataTransfer: DataTransfer | null
): boolean => {
  if (!dataTransfer || !dataTransfer.types) {
    return false;
  }
  const types = Array.from(dataTransfer.types);
  return (
    types.includes(INTERNAL_IMAGE_DRAG_DATA_MIME) || types.includes("text/plain")
  );
};
