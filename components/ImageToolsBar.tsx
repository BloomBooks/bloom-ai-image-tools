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
  const debugLog = React.useCallback((...args: any[]) => {
    try {
      if (typeof window !== "undefined" && (window as any).__E2E_VERBOSE) {
        // eslint-disable-next-line no-console
        console.log("[dnd-timing]", ...args);
      }
    } catch {
      // ignore
    }
  }, []);

  const lastPointerDownRef = React.useRef<
    | {
        t: number;
        x: number;
        y: number;
        pointerType: string;
        targetTestId: string;
      }
    | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // This governs how much movement is required before a drag is considered active.
      // Lower values make drags feel more immediate (especially on trackpads).
      activationConstraint: { distance: 2 },
    })
  );

  const [activeDragImage, setActiveDragImage] = React.useState<ImageRecord | null>(
    null
  );

  const dragPerfRef = React.useRef<{
    startT: number | null;
    lastMoveT: number | null;
    moveCount: number;
    maxMoveDeltaMs: number;
  }>({ startT: null, lastMoveT: null, moveCount: 0, maxMoveDeltaMs: 0 });

  const flushDragPerf = React.useCallback(
    (phase: "end" | "cancel") => {
      try {
        if (typeof window === "undefined" || !(window as any).__E2E_VERBOSE) {
          return;
        }
        const perf = dragPerfRef.current;
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const durationMs = perf.startT != null ? Math.round(now - perf.startT) : null;
        const summary = {
          phase,
          durationMs,
          moveCount: perf.moveCount,
          maxMoveDeltaMs: Math.round(perf.maxMoveDeltaMs),
        };
        (window as any).__BLOOM_DND_PERF_LAST = summary;
        debugLog("perf", summary);
      } catch {
        // ignore
      }
    },
    [debugLog]
  );

  const DragPreview: React.FC<{ image: ImageRecord }> = ({ image }) => {
    return (
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: theme.colors.panelShadow,
          background: theme.colors.surface,
          pointerEvents: "none",
        }}
      >
        <img
          src={image.imageData}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    );
  };

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
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();

            dragPerfRef.current.startT = now;
            dragPerfRef.current.lastMoveT = now;
            dragPerfRef.current.moveCount = 0;
            dragPerfRef.current.maxMoveDeltaMs = 0;

            const last = lastPointerDownRef.current;
            if (last) {
              debugLog(
                `dragStart dt=${Math.round(now - last.t)}ms pointer=${last.pointerType} from=(${Math.round(
                  last.x
                )},${Math.round(last.y)}) targetTestId=${last.targetTestId || ""}`
              );
            } else {
              debugLog("dragStart (no prior pointerdown recorded)");
            }

            const imageId = (event.active.data.current as any)?.imageId as
              | string
              | undefined;
            if (!imageId) return;
            // `historyItems` contains the same records used by strips and panels.
            const match = historyItems.find((item) => item.id === imageId) || null;
            setActiveDragImage(match);
          }}
          onDragMove={() => {
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            const perf = dragPerfRef.current;
            if (perf.lastMoveT != null) {
              const delta = now - perf.lastMoveT;
              if (delta > perf.maxMoveDeltaMs) perf.maxMoveDeltaMs = delta;
            }
            perf.lastMoveT = now;
            perf.moveCount += 1;
          }}
          onDragCancel={() => {
            setActiveDragImage(null);
            flushDragPerf("cancel");
          }}
          onDragEnd={(event) => {
            handleDragEnd(event);
            flushDragPerf("end");
          }}
        >
          <Box
            onPointerDownCapture={(event) => {
              if (typeof window === "undefined") return;
              const pe = event as React.PointerEvent<HTMLElement>;
              // Only record primary-button interactions.
              if (typeof (pe as any).button === "number" && (pe as any).button !== 0) return;

              const target = pe.target as HTMLElement | null;
              const targetTestId =
                target?.getAttribute("data-testid") ||
                target?.closest("[data-testid]")?.getAttribute("data-testid") ||
                "";

              lastPointerDownRef.current = {
                t: typeof performance !== "undefined" ? performance.now() : Date.now(),
                x: pe.clientX,
                y: pe.clientY,
                pointerType: (pe as any).pointerType || "unknown",
                targetTestId,
              };

              debugLog(
                `pointerDown (${lastPointerDownRef.current.pointerType}) @(${Math.round(
                  pe.clientX
                )},${Math.round(pe.clientY)}) targetTestId=${targetTestId || ""}`
              );
            }}
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
            {activeDragImage ? <DragPreview image={activeDragImage} /> : null}
          </DragOverlay>
        </DndContext>
      </Box>
    </Box>
  );
};
