// Lightweight pub/sub so a copy initiated anywhere (a thumbnail's copy button,
// the Ctrl/Cmd+C shortcut, etc.) can surface the same "Copied!" badge on every
// ImageSlot currently rendering that image. ImageSlot subscribes for its own
// image id; copy callers emit status transitions.

export type ImageCopyFeedbackStatus = "copying" | "copied" | "copyError";

type Listener = (status: ImageCopyFeedbackStatus) => void;

const listenersByImageId = new Map<string, Set<Listener>>();

export const subscribeToImageCopyFeedback = (imageId: string, listener: Listener): (() => void) => {
  let listeners = listenersByImageId.get(imageId);
  if (!listeners) {
    listeners = new Set();
    listenersByImageId.set(imageId, listeners);
  }
  listeners.add(listener);

  return () => {
    const current = listenersByImageId.get(imageId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersByImageId.delete(imageId);
    }
  };
};

export const emitImageCopyFeedback = (imageId: string, status: ImageCopyFeedbackStatus): void => {
  const listeners = listenersByImageId.get(imageId);
  if (!listeners) return;
  listeners.forEach((listener) => listener(status));
};
