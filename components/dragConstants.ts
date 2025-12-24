export const INTERNAL_IMAGE_DRAG_DATA_MIME = "application/x-bloom-image-id";

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
  dataTransfer.setData(INTERNAL_IMAGE_DRAG_DATA_MIME, imageId);
  dataTransfer.setData("text/plain", imageId);
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
