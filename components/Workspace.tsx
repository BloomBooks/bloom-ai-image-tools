import React from "react";
import { HistoryItem } from "../types";
import { ImagePanel } from "./ImagePanel";
import { theme } from "../themes";

interface WorkspaceProps {
  leftImage: HistoryItem | null;
  rightImage: HistoryItem | null;
  onSetLeft: (id: string) => void;
  onSetRight: (id: string) => void;
  onClearLeft: () => void;
  onClearRight: () => void;
  onUploadLeft: (file: File) => void;
  onUploadRight: (file: File) => void;
  isProcessing: boolean;
  isGeneratingNew: boolean;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  leftImage,
  rightImage,
  onSetLeft,
  onSetRight,
  onClearLeft,
  onClearRight,
  onUploadLeft,
  onUploadRight,
  isProcessing,
  isGeneratingNew,
}) => {
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
          <ImagePanel
            image={leftImage}
            label={"Reference Image"}
            onUpload={onUploadLeft}
            isDropZone={true}
            onDrop={onSetLeft}
            onClear={onClearLeft}
            disabled={false}
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
