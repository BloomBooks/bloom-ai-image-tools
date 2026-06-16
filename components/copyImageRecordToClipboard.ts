import { ImageRecord } from "../types";
import { handleCopy as copyImageToClipboard } from "../lib/clipboardUtils";
import { getModelNameById } from "../lib/modelsCatalog";
import { emitImageCopyFeedback } from "../lib/imageCopyFeedback";
import { TOOLS } from "./tools/tools-registry";

// Copies an image record to the clipboard, embedding the originating model and
// reasoning level as PNG text metadata (and the caption, when present). Shared
// by the per-thumbnail copy button and the Ctrl+C shortcut so both behave
// identically.
export const copyImageRecordToClipboard = async (image: ImageRecord): Promise<boolean> => {
  const tool = TOOLS.find((t) => t.id === image.toolId) || null;
  const isNewImageTool = tool?.editImage === false;
  const modelId = (image.model || "").trim();
  const modelName = getModelNameById(modelId) || modelId;
  const reasoningLevel = (image.reasoningLevel || "").trim();
  const pngMetadata = modelId
    ? isNewImageTool
      ? {
          IllustratorModel: modelName,
          IllustratorModelId: modelId,
          IllustratorReasoningLevel: reasoningLevel,
        }
      : {
          EditorModel: modelName,
          EditorModelId: modelId,
          EditorReasoningLevel: reasoningLevel,
        }
    : undefined;

  return copyImageToClipboard(image.imageData, pngMetadata, image.caption ?? undefined);
};

// Same as copyImageRecordToClipboard, but broadcasts copying/copied/copyError
// status so any ImageSlot showing this image displays the "Copied!" badge.
// Use this from UI entry points (buttons, keyboard shortcuts) that want
// feedback; it never throws.
export const copyImageRecordWithFeedback = async (image: ImageRecord): Promise<boolean> => {
  emitImageCopyFeedback(image.id, "copying");
  try {
    const ok = await copyImageRecordToClipboard(image);
    emitImageCopyFeedback(image.id, ok ? "copied" : "copyError");
    return ok;
  } catch (err) {
    console.error("Failed to copy image:", err);
    emitImageCopyFeedback(image.id, "copyError");
    return false;
  }
};
