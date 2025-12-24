import React from "react";
import { AppState, HistoryItem, ModelInfo, ToolParamsById } from "../types";
import { ToolPanel } from "./tools/ToolPanel";
import { Workspace } from "./Workspace";
import { HistoryStrip } from "./HistoryStrip";
import { theme } from "../themes";
import { Icon, Icons } from "./Icons";

interface ImageToolsPanelProps {
  appState: AppState;
  selectedModel: ModelInfo | null;
  targetImage: HistoryItem | null;
  referenceImages: HistoryItem[];
  rightImage: HistoryItem | null;
  activeToolId: string | null;
  toolParams: ToolParamsById;
  historyItems: HistoryItem[];
  hasHiddenHistory: boolean;
  onRequestHistoryAccess: () => void;
  selectedArtStyleId: string | null;
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  onCancelProcessing: () => void;
  onToolSelect: (toolId: string | null) => void;
  onParamChange: (toolId: string, paramName: string, value: string) => void;
  onArtStyleChange: (styleId: string) => void;
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
  historyItems,
  hasHiddenHistory,
  onRequestHistoryAccess,
  selectedArtStyleId,
  onApplyTool,
  onCancelProcessing,
  onToolSelect,
  onParamChange,
  onArtStyleChange,
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
          role="alert"
          className="mx-4 my-3 px-4 py-3 flex items-start gap-3 border rounded-2xl shadow-lg"
          style={{
            backgroundColor: "#ffffff",
            color: "#0f172a",
            borderColor: theme.colors.accent,
            boxShadow: theme.colors.accentShadow,
          }}
        >
          <div className="flex-1 leading-relaxed">
            <span>{appState.error}</span>
          </div>
          <button
            onClick={onDismissError}
            className="ml-4 px-2 py-0 text-lg font-semibold"
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: theme.colors.accent,
            }}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <ToolPanel
          onApplyTool={onApplyTool}
          isProcessing={appState.isProcessing}
          onCancelProcessing={onCancelProcessing}
          onToolSelect={onToolSelect}
          referenceImageCount={referenceImages.length}
          hasTargetImage={hasTargetImage}
          isAuthenticated={appState.isAuthenticated}
          selectedModel={selectedModel}
          activeToolId={activeToolId}
          paramsByTool={toolParams}
          onParamChange={onParamChange}
          selectedArtStyleId={selectedArtStyleId}
          onArtStyleChange={onArtStyleChange}
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
            items={historyItems}
            currentId={appState.rightPanelImageId}
            onSelect={onSelectHistoryItem}
            onRemove={onRemoveHistoryItem}
            hasHiddenHistory={hasHiddenHistory}
            onRequestHistoryAccess={onRequestHistoryAccess}
          />
        </div>
      </div>
    </div>
  );
};
