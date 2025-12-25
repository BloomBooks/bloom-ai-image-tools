import React from "react";
import { Box } from "@mui/material";
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
  // Only show target panel if the tool requires an image to edit (editImage !== false)
  const showTargetPanel = tool ? tool.editImage !== false : true;

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
    <Box
      sx={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "transparent",
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          width: "100%",
          height: "100%",
          gap: "10px",
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minHeight: 0,
          }}
        >
          {showTargetPanel && (
            <Box
              sx={{
                position: "relative",
                flex: showReferencePanel ? "1 1 0%" : "1 1 auto",
                minHeight: 0,
              }}
            >
              <ImagePanel
                image={targetImage}
                label="Image to Edit"
                panelTestId="target-panel"
                onUpload={onUploadTarget}
                isDropZone={true}
                onDrop={onSetTarget}
                onClear={onClearTarget}
                draggableImageId={targetImage?.id || undefined}
                uploadInputTestId="target-upload-input"
              />
            </Box>
          )}

          {showReferencePanel && (
            <Box sx={{ flex: 1, position: "relative", minHeight: 0 }}>
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
            </Box>
          )}
        </Box>

        <Box sx={{ flex: 1, position: "relative", minHeight: 0 }}>
          <ImagePanel
            image={rightImage}
            label="Result"
            panelTestId="result-panel"
            onUpload={onUploadRight}
            isDropZone={true}
            onDrop={onSetRight}
            showUploadControls={false}
            onClear={onClearRight}
            draggableImageId={rightImage?.id || undefined}
            isLoading={isProcessing}
          />
        </Box>
      </Box>
    </Box>
  );
};
