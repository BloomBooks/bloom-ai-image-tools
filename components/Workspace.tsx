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

      <div
        className="flex w-full h-full"
        style={{ borderRight: `1px solid ${theme.colors.border}` }}
      >
        {/* Left Panel - Reference */}
        <div className="w-1/2 relative">
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

        {/* Center Action Indicator (Optional visual flair) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
          {isProcessing ? (
            <div
              className="backdrop-blur p-3 rounded-full shadow-xl border"
              style={{
                backgroundColor: theme.colors.overlay,
                color: theme.colors.accent,
                borderColor: theme.colors.border,
              }}
            >
              <div
                className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                style={{
                  borderColor: theme.colors.accent,
                  borderTopColor: "transparent",
                }}
              ></div>
            </div>
          ) : (
            <div
              className="p-2 rounded-full"
              style={{
                backgroundColor: theme.colors.overlaySoft,
                color: theme.colors.textMuted,
              }}
            >
              {/* Just a divider marker */}
            </div>
          )}
        </div>

        {/* Right Panel - Result */}
        <div className="w-1/2 relative">
          <ImagePanel
            image={rightImage}
            label="Result"
            onUpload={onUploadRight}
            isDropZone={true}
            onDrop={onSetRight}
          />
        </div>
      </div>
    </div>
  );
};
