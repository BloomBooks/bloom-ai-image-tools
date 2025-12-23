import React from "react";
import { AppState, HistoryItem, ModelInfo } from "../types";
import { ToolPanel } from "./ToolPanel";
import { Workspace } from "./Workspace";
import { HistoryStrip } from "./HistoryStrip";

interface ImageToolsPanelProps {
  appState: AppState;
  selectedModel: ModelInfo | null;
  referenceImages: HistoryItem[];
  rightImage: HistoryItem | null;
  activeToolId: string | null;
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  onToolSelect: (toolId: string | null) => void;
  onSetReferenceAt: (index: number, id: string) => void;
  onSetRight: (id: string) => void;
  onRemoveReferenceAt: (index: number) => void;
  onUploadReference: (file: File, slotIndex?: number) => void;
  onClearRight: () => void;
  onUploadRight: (file: File) => void;
  onSelectHistoryItem: (id: string) => void;
  onRemoveHistoryItem: (id: string) => void;
  onDismissError: () => void;
}

export const ImageToolsPanel: React.FC<ImageToolsPanelProps> = ({
  appState,
  selectedModel,
  referenceImages,
  rightImage,
  activeToolId,
  onApplyTool,
  onToolSelect,
  onSetReferenceAt,
  onSetRight,
  onRemoveReferenceAt,
  onUploadReference,
  onClearRight,
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
          referenceImageCount={appState.referenceImageIds.length}
          isAuthenticated={appState.isAuthenticated}
          selectedModel={selectedModel}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <Workspace
            referenceImages={referenceImages}
            rightImage={rightImage}
            onSetReferenceAt={onSetReferenceAt}
            onSetRight={onSetRight}
            onRemoveReferenceAt={onRemoveReferenceAt}
            onUploadReference={onUploadReference}
            onClearRight={onClearRight}
            onUploadRight={onUploadRight}
            isProcessing={appState.isProcessing}
            isGeneratingNew={activeToolId === "generate_image"}
            activeToolId={activeToolId}
          />

          <HistoryStrip
            items={appState.history}
            onSelect={onSelectHistoryItem}
            onRemove={onRemoveHistoryItem}
          />
        </div>
      </div>
    </div>
  );
};
