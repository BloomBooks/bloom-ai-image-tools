import React from "react";
import { HistoryItem } from "../types";
import { ImagePanel } from "./ImagePanel";
import { ReferenceImagesPanel } from "./ReferenceImagesPanel";
import { TOOLS } from "../tools/tools-registry";
import { theme } from "../themes";

interface WorkspaceProps {
  referenceImages: HistoryItem[];
  rightImage: HistoryItem | null;
  onSetReferenceAt: (index: number, id: string) => void;
  onSetRight: (id: string) => void;
  onRemoveReferenceAt: (index: number) => void;
  onUploadReference: (file: File, slotIndex?: number) => void;
  onClearRight: () => void;
  onUploadRight: (file: File) => void;
  isProcessing: boolean;
  isGeneratingNew: boolean;
  activeToolId: string | null;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  referenceImages,
  rightImage,
  onSetReferenceAt,
  onSetRight,
  onRemoveReferenceAt,
  onUploadReference,
  onClearRight,
  onUploadRight,
  isProcessing,
  isGeneratingNew,
  activeToolId,
}) => {
  const tool = activeToolId ? TOOLS.find((t) => t.id === activeToolId) : null;
  const referenceMode = tool?.referenceImages ?? "1";
  const isReferencePanelDisabled = referenceMode === "0";
  const isMultiReference = referenceMode === "0+" || referenceMode === "1+";
  const isSingleReference = referenceMode === "1";

  const slots = (() => {
    if (isReferencePanelDisabled) {
      return [] as {
        image: HistoryItem | null;
        slotIndex: number;
        canRemove: boolean;
      }[];
    }

    if (isSingleReference) {
      const image = referenceImages[0] || null;
      return [{ image, slotIndex: 0, canRemove: !!image }];
    }

    // Multi reference: always render one extra empty slot.
    const filled = referenceImages.map((image, i) => ({
      image,
      slotIndex: i,
      canRemove: true,
    }));

    return [
      ...filled,
      { image: null, slotIndex: referenceImages.length, canRemove: false },
    ];
  })();

  const referenceLabel = isMultiReference
    ? "Reference Images"
    : "Reference Image";

  return (
    <div
      className="flex-1 flex overflow-hidden relative"
      style={{ backgroundColor: theme.colors.surface }}
    >
      <div
        className="absolute inset-0 -z-10"
        style={{ background: theme.gradients.canvas }}
      ></div>

      <div className="flex w-full h-full gap-[10px]">
        {/* Left Panel - Reference */}
        <div className="flex-1 relative">
          <ReferenceImagesPanel
            label={referenceLabel}
            slots={slots}
            disabled={isReferencePanelDisabled}
            onUpload={(file, slotIndex) => onUploadReference(file, slotIndex)}
            onDrop={(imageId, slotIndex) =>
              onSetReferenceAt(slotIndex, imageId)
            }
            onRemove={(slotIndex) => onRemoveReferenceAt(slotIndex)}
          />
        </div>
        {/* Right Panel - Result */}
        <div className="flex-1 relative">
          <ImagePanel
            image={rightImage}
            label="Result"
            onUpload={onUploadRight}
            isDropZone={true}
            onDrop={onSetRight}
            showUploadControls={false}
            onClear={onClearRight}
            draggableImageId={rightImage?.id || undefined}
            isLoading={isProcessing}
          />
        </div>
      </div>
    </div>
  );
};
