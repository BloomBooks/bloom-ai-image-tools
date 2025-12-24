import React from "react";
import { HistoryItem } from "../types";
import { ImagePanel, ImagePanelSlot } from "./ImagePanel";
import { TOOLS } from "./tools/tools-registry";
import { theme } from "../themes";

interface WorkspaceProps {
  targetImage: HistoryItem | null;
  referenceImages: HistoryItem[];
  rightImage: HistoryItem | null;
  onSetTarget: (id: string) => void;
  onSetReferenceAt: (index: number, id: string) => void;
  onSetRight: (id: string) => void;
  onUploadTarget: (file: File) => void;
  onRemoveReferenceAt: (index: number) => void;
  onUploadReference: (file: File, slotIndex?: number) => void;
  onClearTarget: () => void;
  onClearRight: () => void;
  onUploadRight: (file: File) => void;
  isProcessing: boolean;
  activeToolId: string | null;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  targetImage,
  referenceImages,
  rightImage,
  onSetTarget,
  onSetReferenceAt,
  onSetRight,
  onUploadTarget,
  onRemoveReferenceAt,
  onUploadReference,
  onClearTarget,
  onClearRight,
  onUploadRight,
  isProcessing,
  activeToolId,
}) => {
  const tool = activeToolId ? TOOLS.find((t) => t.id === activeToolId) : null;
  const referenceMode = tool?.referenceImages ?? "0";
  const showReferencePanel = referenceMode === "0+" || referenceMode === "1+";
  const showTargetPanel =
    (tool ? tool.editImage !== false : true) || !targetImage;

  const slots: ImagePanelSlot[] = !showReferencePanel
    ? []
    : [
        ...referenceImages.map((image, i) => ({
          image,
          slotIndex: i,
          canRemove: true,
          dataTestId: `reference-slot-${i}`,
          uploadInputTestId: `reference-upload-input-${i}`,
          dropLabel: "Drop to add",
          actionLabels: { remove: "Remove reference" },
        })),
        {
          image: null,
          slotIndex: referenceImages.length,
          canRemove: false,
          dataTestId: `reference-slot-${referenceImages.length}`,
          uploadInputTestId: `reference-upload-input-${referenceImages.length}`,
          dropLabel: "Drop to add",
          actionLabels: { remove: "Remove reference" },
        },
      ];

  const referenceLabel = "Reference Images";

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
        {/* Left Column: Target + References */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {showTargetPanel && (
            <div
              className="relative flex-1 min-h-0"
              style={{
                flex: showReferencePanel ? "1 1 0%" : "1 1 auto",
              }}
            >
              <ImagePanel
                image={targetImage}
                label="Image to Edit"
                onUpload={onUploadTarget}
                isDropZone={true}
                onDrop={onSetTarget}
                onClear={onClearTarget}
                draggableImageId={targetImage?.id || undefined}
                uploadInputTestId="target-upload-input"
              />
            </div>
          )}

          {showReferencePanel && (
            <div className="flex-1 relative min-h-0">
              <ImagePanel
                label={referenceLabel}
                layout="grid"
                panelTestId="reference-panel"
                slots={slots}
                disabled={false}
                onSlotUpload={(file, slotIndex) =>
                  onUploadReference(file, slotIndex)
                }
                onSlotDrop={(imageId, slotIndex) =>
                  onSetReferenceAt(slotIndex, imageId)
                }
                onSlotRemove={(slotIndex) => onRemoveReferenceAt(slotIndex)}
              />
            </div>
          )}
        </div>

        {/* Right Panel - Result */}
        <div className="flex-1 relative min-h-0">
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
