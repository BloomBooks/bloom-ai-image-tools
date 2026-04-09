import { removeBackground, getCapabilities } from "rembg-webgpu";
import { blobToBase64 } from "./imageUtils";

export type BackgroundRemovalResult = {
  imageData: string;
  durationMs: number;
  model: string;
};

const createAbortError = (): Error => {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Background removal aborted.", "AbortError");
  }
  const error = new Error("Background removal aborted.");
  error.name = "AbortError";
  return error;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

export const removeBackgroundFromImage = async (
  imageUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<BackgroundRemovalResult> => {
  const { signal } = options;
  throwIfAborted(signal);

  const capability = await getCapabilities().catch(() => null);
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const result = await removeBackground(imageUrl);
  const blobUrl = result.blobUrl;
  const previewUrl = result.previewUrl;

  try {
    throwIfAborted(signal);

    const response = await fetch(blobUrl, { signal });
    if (!response.ok) {
      throw new Error("Background removal produced an unreadable image.");
    }

    const blob = await response.blob();
    const imageData = await blobToBase64(blob);
    const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationMs = Math.max(
      0,
      Math.round(
        Number.isFinite(result.processingTimeSeconds)
          ? result.processingTimeSeconds * 1000
          : finishedAt - startedAt,
      ),
    );
    const model = capability
      ? `rembg-webgpu (${capability.device}/${capability.dtype})`
      : "rembg-webgpu";

    return {
      imageData,
      durationMs,
      model,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
    URL.revokeObjectURL(previewUrl);
  }
};