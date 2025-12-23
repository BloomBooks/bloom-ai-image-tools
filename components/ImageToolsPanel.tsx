import React from "react";
import {
  AppState,
  HistoryItem,
  ModelInfo,
  ToolParamsById,
} from "../types";
import { ToolPanel } from "./ToolPanel";
import { Workspace } from "./Workspace";
import { HistoryStrip } from "./HistoryStrip";

interface ImageToolsPanelProps {
  appState: AppState;
  selectedModel: ModelInfo | null;
  targetImage: HistoryItem | null;
  referenceImages: HistoryItem[];
  rightImage: HistoryItem | null;
  activeToolId: string | null;
  toolParams: ToolParamsById;
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  onToolSelect: (toolId: string | null) => void;
  onParamChange: (toolId: string, paramName: string, value: string) => void;
  onSetTarget: (id: string) => void;
  onSetReferenceAt: (index: number, id: string) => void;
  onSetRight: (id: string) => void;
  onUploadTarget: (file: File) => void;
  onRemoveReferenceAt: (index: number) => void;
  onUploadReference: (file: File, slotIndex?: number) => void;
  onClearTarget: () => void;
  onClearRight: () => void;
  onUploadRight: (file: File) => void;
  onSelectHistoryItem: (id: string) => void;
  onRemoveHistoryItem: (id: string) => void;
  onDismissError: () => void;
}

export const ImageToolsPanel: React.FC<ImageToolsPanelProps> = ({
  appState,
  selectedModel,
  targetImage,
  referenceImages,
  rightImage,
  activeToolId,
  toolParams,
  onApplyTool,
  onToolSelect,
  onParamChange,
  onSetTarget,
  onSetReferenceAt,
  onSetRight,
  onUploadTarget,
  onRemoveReferenceAt,
  onUploadReference,
  onClearTarget,
  onClearRight,
  onUploadRight,
  onSelectHistoryItem,
  onRemoveHistoryItem,
  onDismissError,
}) => {
  const hasTargetImage = !!targetImage;

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
          hasTargetImage={hasTargetImage}
          isAuthenticated={appState.isAuthenticated}
          selectedModel={selectedModel}
          activeToolId={activeToolId}
          paramsByTool={toolParams}
          onParamChange={onParamChange}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <Workspace
            targetImage={targetImage}
            referenceImages={referenceImages}
            rightImage={rightImage}
            onSetTarget={onSetTarget}
            onSetReferenceAt={onSetReferenceAt}
            onSetRight={onSetRight}
            onUploadTarget={onUploadTarget}
            onRemoveReferenceAt={onRemoveReferenceAt}
            onUploadReference={onUploadReference}
            onClearTarget={onClearTarget}
            onClearRight={onClearRight}
            onUploadRight={onUploadRight}
            isProcessing={appState.isProcessing}
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
