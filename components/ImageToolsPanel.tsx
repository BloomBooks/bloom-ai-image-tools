import React from "react";
import { AppState, HistoryItem } from "../types";
import { ToolPanel } from "./ToolPanel";
import { Workspace } from "./Workspace";
import { HistoryStrip } from "./HistoryStrip";

interface ImageToolsPanelProps {
  appState: AppState;
  leftImage: HistoryItem | null;
  rightImage: HistoryItem | null;
  activeToolId: string | null;
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  onToolSelect: (toolId: string | null) => void;
  onSetLeft: (id: string) => void;
  onSetRight: (id: string) => void;
  onClearLeft: () => void;
  onClearRight: () => void;
  onUploadLeft: (file: File) => void;
  onUploadRight: (file: File) => void;
  onSelectHistoryItem: (id: string) => void;
  onRemoveHistoryItem: (id: string) => void;
  onDismissError: () => void;
}

export const ImageToolsPanel: React.FC<ImageToolsPanelProps> = ({
  appState,
  leftImage,
  rightImage,
  activeToolId,
  onApplyTool,
  onToolSelect,
  onSetLeft,
  onSetRight,
  onClearLeft,
  onClearRight,
  onUploadLeft,
  onUploadRight,
  onSelectHistoryItem,
  onRemoveHistoryItem,
  onDismissError,
}) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {appState.error && (
        <div
          data-testid="error-banner"
          className="px-4 py-3 flex items-center justify-between"
          style={{
            backgroundColor: "#dc2626",
            color: "white",
          }}
        >
          <span>{appState.error}</span>
          <button
            onClick={onDismissError}
            className="ml-4 px-2 py-1 rounded hover:bg-red-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <ToolPanel
          onApplyTool={onApplyTool}
          isProcessing={appState.isProcessing}
          onToolSelect={onToolSelect}
          hasSourceImage={!!appState.leftPanelImageId}
          isAuthenticated={appState.isAuthenticated}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <Workspace
            leftImage={leftImage}
            rightImage={rightImage}
            onSetLeft={onSetLeft}
            onSetRight={onSetRight}
            onClearLeft={onClearLeft}
            onClearRight={onClearRight}
            onUploadLeft={onUploadLeft}
            onUploadRight={onUploadRight}
            isProcessing={appState.isProcessing}
            isGeneratingNew={activeToolId === "generate_image"}
          />

          <HistoryStrip
            items={appState.history}
            currentId={appState.rightPanelImageId}
            onSelect={onSelectHistoryItem}
            onRemove={onRemoveHistoryItem}
          />
        </div>
      </div>
    </div>
  );
};
