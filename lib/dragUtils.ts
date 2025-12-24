/**
 * Checks if a DataTransfer contains at least one image file.
 */
export const hasImageFilePayload = (
  dataTransfer: DataTransfer | null
): boolean => {
  if (!dataTransfer) return false;

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i += 1) {
      const item = dataTransfer.items[i];
      if (!item || item.kind !== "file") continue;
      if (!item.type || item.type.startsWith("image/")) {
        return true;
      }
    }
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i += 1) {
      const file = dataTransfer.files[i];
      if (!file) continue;
      if (!file.type || file.type.startsWith("image/")) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Extracts the first image File from a DataTransfer, or null if none found.
 */
export const getImageFileFromDataTransfer = (
  dataTransfer: DataTransfer | null
): File | null => {
  if (!dataTransfer) return null;

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i += 1) {
      const item = dataTransfer.items[i];
      if (!item || item.kind !== "file") continue;
      if (item.type && !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i += 1) {
      const file = dataTransfer.files[i];
      if (!file) continue;
      if (!file.type || file.type.startsWith("image/")) {
        return file;
      }
    }
  }

  return null;
};
