import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { AppState, HistoryItem, ModelInfo, ToolParamsById } from "../types";
import { ImageTool } from "./tools/ImageTool";
import { Workspace } from "./Workspace";
import { HistoryStrip } from "./HistoryStrip";
import { theme } from "../themes";
import { Icon, Icons } from "./Icons";

interface ImageToolsPanelBar {
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

export const ImageToolsBar: React.FC<ImageToolsPanelBar> = ({
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
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      {appState.error && (
        <Stack
          data-testid="error-banner"
          role="alert"
          direction="row"
          spacing={2}
          alignItems="flex-start"
          sx={{
            mx: 4,
            my: 3,
            px: 4,
            py: 3,
            borderRadius: 4,
            border: `1px solid ${theme.colors.accent}`,
            boxShadow: theme.colors.accentShadow,
            backgroundColor: "#ffffff",
            color: "#0f172a",
          }}
        >
          <Typography component="span" sx={{ flex: 1, lineHeight: 1.6 }}>
            {appState.error}
          </Typography>
          <IconButton
            onClick={onDismissError}
            aria-label="Dismiss message"
            size="small"
            sx={{ color: theme.colors.accent }}
          >
            <Icon path={Icons.X} width={16} height={16} />
          </IconButton>
        </Stack>
      )}

      <Box sx={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <ImageTool
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

        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
          }}
        >
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
        </Box>
      </Box>
    </Box>
  );
};
