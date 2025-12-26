import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  AppState,
  ImageRecord,
  ModelInfo,
  ToolParamsById,
  ThumbnailStripId,
  ThumbnailStripsSnapshot,
} from "../types";
import { ImageTool } from "./tools/ImageTool";
import { Workspace } from "./Workspace";
import { ThumbnailStripsCollection } from "./thumbnailStrips/ThumbnailStripsCollection";
import { ImageSlot } from "./ImageSlot";
import { theme } from "../themes";
import { Icon, Icons } from "./Icons";
import type { ThumbnailStripConfig } from "../lib/thumbnailStrips";

const parseStripIdFromContainer = (id: unknown): ThumbnailStripId | null => {
  const raw = String(id);
  if (!raw.startsWith("strip:")) return null;
  return raw.slice("strip:".length) as ThumbnailStripId;
};

const parseStripItem = (
  id: unknown
): { stripId: ThumbnailStripId; imageId: string } | null => {
  const raw = String(id);
  if (!raw.startsWith("stripItem:")) return null;
  const parts = raw.split(":");
  if (parts.length < 3) return null;
  const stripId = parts[1] as ThumbnailStripId;
  const imageId = parts.slice(2).join(":");
  return { stripId, imageId };
};

const parsePanelDrop = (id: unknown):
  | { kind: "target" }
  | { kind: "result" }
  | { kind: "reference"; slotIndex: number }
  | null => {
  const raw = String(id);
  if (raw === "panel:target") return { kind: "target" };
  if (raw === "panel:result") return { kind: "result" };
  if (raw.startsWith("panel:reference:")) {
    const index = Number(raw.slice("panel:reference:".length));
    if (Number.isFinite(index)) return { kind: "reference", slotIndex: index };
  }
  return null;
};

interface ImageToolsPanelBar {
  appState: AppState;
  selectedModel: ModelInfo | null;
  targetImage: ImageRecord | null;
  referenceImages: ImageRecord[];
  rightImage: ImageRecord | null;
  activeToolId: string | null;
  toolParams: ToolParamsById;
  historyItems: ImageRecord[];
  hasHiddenHistory: boolean;
  onRequestHistoryAccess: () => void;
  thumbnailStrips: ThumbnailStripsSnapshot;
  thumbnailStripConfigs?: Record<ThumbnailStripId, ThumbnailStripConfig>;
  onStripItemDrop: (
    stripId: ThumbnailStripId,
    dropIndex: number,
    draggedId: string | null,
    event?: React.DragEvent | null
  ) => void;
  onStripRemoveItem: (stripId: ThumbnailStripId, id: string) => void;
  onStripPinToggle: (stripId: ThumbnailStripId) => void;
  onStripActivate: (stripId: ThumbnailStripId) => void;
  onStripDragActivate: (stripId: ThumbnailStripId) => void;
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
  onToggleHistoryStar: (id: string) => void;
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
  thumbnailStrips,
  thumbnailStripConfigs,
  onStripItemDrop,
  onStripRemoveItem,
  onStripPinToggle,
  onStripActivate,
  onStripDragActivate,
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
  onToggleHistoryStar,
  onDismissError,
}) => {
  const hasTargetImage = !!targetImage;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const [activeDragImage, setActiveDragImage] = React.useState<ImageRecord | null>(
    null
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragImage(null);
    const imageId = (event.active.data.current as any)?.imageId as
      | string
      | undefined;
    if (!imageId) return;

    const overId = event.over?.id;
    if (!overId) return;

    const panel = parsePanelDrop(overId);
    if (panel) {
      if (panel.kind === "target") {
        onSetTarget(imageId);
        return;
      }
      if (panel.kind === "result") {
        onSetRight(imageId);
        return;
      }
      if (panel.kind === "reference") {
        onSetReferenceAt(panel.slotIndex, imageId);
        return;
      }
    }

    const overStripItem = parseStripItem(overId);
    if (overStripItem) {
      const { stripId, imageId: overImageId } = overStripItem;
      const list = thumbnailStrips.itemIdsByStrip[stripId] || [];
      const dropIndex = Math.max(0, list.indexOf(overImageId));
      onStripItemDrop(stripId, dropIndex, imageId, null);
      return;
    }

    const overStrip = parseStripIdFromContainer(overId);
    if (overStrip) {
      const list = thumbnailStrips.itemIdsByStrip[overStrip] || [];
      onStripItemDrop(overStrip, list.length, imageId, null);
      return;
    }
  };

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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => {
            const imageId = (event.active.data.current as any)?.imageId as
              | string
              | undefined;
            if (!imageId) return;
            // `historyItems` contains the same records used by strips and panels.
            const match = historyItems.find((item) => item.id === imageId) || null;
            setActiveDragImage(match);
          }}
          onDragCancel={() => setActiveDragImage(null)}
          onDragEnd={handleDragEnd}
        >
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
              onToggleHistoryStar={onToggleHistoryStar}
            />

            <ThumbnailStripsCollection
              snapshot={thumbnailStrips}
              entries={historyItems}
              selectedId={appState.rightPanelImageId}
              stripConfigs={thumbnailStripConfigs}
              hasHiddenHistory={hasHiddenHistory}
              onRequestHistoryAccess={onRequestHistoryAccess}
              onSelect={onSelectHistoryItem}
              onToggleStar={onToggleHistoryStar}
              onRemoveFromStrip={onStripRemoveItem}
              onDropToStrip={onStripItemDrop}
              onActivateStrip={onStripActivate}
              onTogglePin={onStripPinToggle}
              onDragActivateStrip={onStripDragActivate}
            />
          </Box>

          <DragOverlay>
            {activeDragImage ? (
              <div style={{ width: 112, flexShrink: 0 }}>
                <ImageSlot
                  image={activeDragImage}
                  variant="thumb"
                  dataTestId="history-card"
                  controls={{
                    upload: false,
                    paste: false,
                    copy: true,
                    download: true,
                    remove: false,
                  }}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Box>
    </Box>
  );
};
