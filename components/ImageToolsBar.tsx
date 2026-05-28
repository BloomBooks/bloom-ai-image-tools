import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import {
  closestCenter,
  DndContext,
  DragCancelEvent,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MeasuringStrategy,
  type CollisionDetection,
  type Modifier,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDndMonitor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  AppState,
  GenerationProgressState,
  ImageRecord,
  ModelInfo,
  ToolParamsById,
  ThumbnailStripId,
  ThumbnailStripsSnapshot,
} from "../types";
import { ImageTool } from "./tools/ImageTool";
import { Workspace } from "./Workspace";
import { ThumbnailStripsCollection } from "./thumbnailStrips/ThumbnailStripsCollection";
import { theme } from "../themes";
import { emitDragDebugLog, isDragDebugEnabled } from "./dragConstants";
import { Icon, Icons } from "./Icons";
import type { ThumbnailStripConfig } from "../lib/thumbnailStrips";

const DRAG_PREVIEW_SIZE = 112;

type DragPreviewMode = "image" | "lite";

type ActiveDragPreview = {
  imageId: string;
  imageData: string | null;
};

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const getActivatorClientPoint = (event: Event | null) => {
  if (event instanceof MouseEvent || event instanceof PointerEvent) {
    return { x: event.clientX, y: event.clientY };
  }

  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    const touch = event.touches[0] || event.changedTouches[0];
    if (touch) {
      return { x: touch.clientX, y: touch.clientY };
    }
  }

  return null;
};

const alignDragPreviewToCursor: Modifier = ({
  activatorEvent,
  activeNodeRect,
  overlayNodeRect,
  transform,
}) => {
  const point = getActivatorClientPoint(activatorEvent);
  if (!point || !activeNodeRect || !overlayNodeRect) {
    return transform;
  }

  const sourceOffsetX = point.x - activeNodeRect.left;
  const sourceOffsetY = point.y - activeNodeRect.top;
  const sourceRatioX = activeNodeRect.width > 0 ? sourceOffsetX / activeNodeRect.width : 0.5;
  const sourceRatioY = activeNodeRect.height > 0 ? sourceOffsetY / activeNodeRect.height : 0.5;

  return {
    ...transform,
    x: transform.x + sourceOffsetX - clamp01(sourceRatioX) * overlayNodeRect.width,
    y: transform.y + sourceOffsetY - clamp01(sourceRatioY) * overlayNodeRect.height,
  };
};

const parseStripIdFromContainer = (id: unknown): ThumbnailStripId | null => {
  const raw = String(id);
  if (!raw.startsWith("strip:")) return null;
  return raw.slice("strip:".length) as ThumbnailStripId;
};

const parseStripItem = (id: unknown): { stripId: ThumbnailStripId; imageId: string } | null => {
  const raw = String(id);
  if (!raw.startsWith("stripItem:")) return null;
  const parts = raw.split(":");
  if (parts.length < 3) return null;
  const stripId = parts[1] as ThumbnailStripId;
  const imageId = parts.slice(2).join(":");
  return { stripId, imageId };
};

const parsePanelDrop = (
  id: unknown,
): { kind: "target" } | { kind: "result" } | { kind: "reference"; slotIndex: number } | null => {
  const raw = String(id);
  if (raw === "panel:target") return { kind: "target" };
  if (raw === "panel:result") return { kind: "result" };
  if (raw.startsWith("panel:reference:")) {
    const index = Number(raw.slice("panel:reference:".length));
    if (Number.isFinite(index)) return { kind: "reference", slotIndex: index };
  }
  return null;
};

const getDragPreviewMode = (): DragPreviewMode => {
  if (typeof window === "undefined") {
    return "image";
  }

  // Default: show the real image while dragging. ?dndPreview=lite forces the
  // lightweight badge (useful if perf is poor).
  const mode = new URLSearchParams(window.location.search).get("dndPreview");
  return mode === "lite" ? "lite" : "image";
};

const pointerFirstCollisionDetection: CollisionDetection = (args) => {
  const pointerMatches = pointerWithin(args);
  if (pointerMatches.length > 0) {
    return pointerMatches;
  }

  const rectMatches = rectIntersection(args);
  if (rectMatches.length > 0) {
    return rectMatches;
  }

  return closestCenter(args);
};

const DragPreview: React.FC<{
  preview: ActiveDragPreview;
  mode: DragPreviewMode;
  activeDragStartRef: React.MutableRefObject<number | null>;
  debugLog: (...args: any[]) => void;
}> = ({ preview, mode, activeDragStartRef, debugLog }) => {
  const imageRef = React.useRef<HTMLImageElement | null>(null);

  React.useLayoutEffect(() => {
    if (activeDragStartRef.current == null) {
      return;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const img = imageRef.current;
    const mountSummary = {
      phase: "dragPreview-mounted",
      dtMs: Math.round(now - activeDragStartRef.current),
      previewMode: mode,
      imageComplete: img?.complete ?? null,
      naturalWidth: img?.naturalWidth ?? null,
      naturalHeight: img?.naturalHeight ?? null,
    };

    try {
      (window as any).__BLOOM_DND_OVERLAY_LAST = mountSummary;
    } catch {
      // ignore
    }

    debugLog("overlay", mountSummary);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        if (activeDragStartRef.current == null) {
          return;
        }
        const rafNow = typeof performance !== "undefined" ? performance.now() : Date.now();
        debugLog("overlay", {
          phase: "dragPreview-first-raf",
          dtMs: Math.round(rafNow - activeDragStartRef.current),
          previewMode: mode,
        });
      });
    }

    if (mode !== "image" || !img || img.complete) {
      return;
    }

    const handleLoad = () => {
      if (activeDragStartRef.current == null) {
        return;
      }
      const loadNow = typeof performance !== "undefined" ? performance.now() : Date.now();
      debugLog("overlay", {
        phase: "dragPreview-image-load",
        dtMs: Math.round(loadNow - activeDragStartRef.current),
        previewMode: mode,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
    };

    img.addEventListener("load", handleLoad, { once: true });
    return () => {
      img.removeEventListener("load", handleLoad);
    };
  }, [preview.imageData, mode, activeDragStartRef, debugLog]);

  return (
    <div
      style={{
        width: DRAG_PREVIEW_SIZE,
        height: DRAG_PREVIEW_SIZE,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: theme.colors.panelShadow,
        background: theme.colors.surface,
        pointerEvents: "none",
      }}
    >
      {mode === "lite" ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, rgba(15, 23, 42, 0.14), rgba(15, 23, 42, 0.04))",
            color: theme.colors.textPrimary,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Dragging
        </div>
      ) : (
        <img
          ref={imageRef}
          src={preview.imageData ?? undefined}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
    </div>
  );
};

const DragOverlayLayer: React.FC<{
  historyItems: ImageRecord[];
  dragPreviewMode: DragPreviewMode;
  dragPerfRef: React.MutableRefObject<{
    startT: number | null;
    lastMoveT: number | null;
    moveCount: number;
    maxMoveDeltaMs: number;
  }>;
  activeDragStartRef: React.MutableRefObject<number | null>;
  pendingDragProbeRef: React.MutableRefObject<{
    token: number;
    dragStarted: boolean;
    timeoutIds: number[];
  } | null>;
  clearPendingDragProbe: () => void;
  lastPointerDownRef: React.MutableRefObject<{
    t: number;
    x: number;
    y: number;
    pointerType: string;
    targetTestId: string;
  } | null>;
  debugLog: (...args: any[]) => void;
}> = ({
  historyItems,
  dragPreviewMode,
  dragPerfRef,
  activeDragStartRef,
  pendingDragProbeRef,
  clearPendingDragProbe,
  lastPointerDownRef,
  debugLog,
}) => {
  const [activeDragPreview, setActiveDragPreview] = React.useState<ActiveDragPreview | null>(null);

  React.useLayoutEffect(() => {
    if (!activeDragPreview || activeDragStartRef.current == null) {
      return;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const summary = {
      phase: "activeDragImage-committed",
      dtMs: Math.round(now - activeDragStartRef.current),
      previewMode: dragPreviewMode,
      hasImageData: Boolean(activeDragPreview.imageData),
      imageBytes: activeDragPreview.imageData?.length ?? 0,
    };

    try {
      (window as any).__BLOOM_DND_OVERLAY_LAST = summary;
    } catch {
      // ignore
    }

    debugLog("overlay", summary);
  }, [activeDragPreview, activeDragStartRef, dragPreviewMode, debugLog]);

  useDndMonitor({
    onDragStart(event: DragStartEvent) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      activeDragStartRef.current = now;
      if (pendingDragProbeRef.current) {
        pendingDragProbeRef.current.dragStarted = true;
      }
      clearPendingDragProbe();

      dragPerfRef.current.startT = now;
      dragPerfRef.current.lastMoveT = now;
      dragPerfRef.current.moveCount = 0;
      dragPerfRef.current.maxMoveDeltaMs = 0;

      const last = lastPointerDownRef.current;
      if (last) {
        debugLog(
          `dragStart dt=${Math.round(now - last.t)}ms pointer=${last.pointerType} from=(${Math.round(
            last.x,
          )},${Math.round(last.y)}) targetTestId=${last.targetTestId || ""}`,
        );
      } else {
        debugLog("dragStart (no prior pointerdown recorded)");
      }

      const imageId = (event.active.data.current as any)?.imageId as string | undefined;
      if (!imageId) {
        setActiveDragPreview(null);
        return;
      }

      const previewImageData =
        dragPreviewMode === "image"
          ? historyItems.find((item) => item.id === imageId && !!item.imageData)?.imageData || null
          : null;
      debugLog("overlay", {
        phase: "setActiveDragImage",
        dtMs: Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - now,
        ),
        previewMode: dragPreviewMode,
        foundMatch: dragPreviewMode === "image" ? Boolean(previewImageData) : true,
        imageBytes: previewImageData?.length ?? 0,
      });
      // EXPERIMENT 2026-05-18: removed flushSync wrapper (suspect of stall)
      setActiveDragPreview({
        imageId,
        imageData: previewImageData,
      });
    },
    onDragEnd(_event: DragEndEvent) {
      setActiveDragPreview(null);
    },
    onDragCancel(_event: DragCancelEvent) {
      setActiveDragPreview(null);
    },
  });

  return (
    <DragOverlay modifiers={[alignDragPreviewToCursor]}>
      {activeDragPreview ? (
        <DragPreview
          preview={activeDragPreview}
          mode={dragPreviewMode}
          activeDragStartRef={activeDragStartRef}
          debugLog={debugLog}
        />
      ) : null}
    </DragOverlay>
  );
};

interface ImageToolsPanelBar {
  appState: AppState;
  selectedModel: ModelInfo | null;
  targetImage: ImageRecord | null;
  referenceImages: ImageRecord[];
  rightImage: ImageRecord | null;
  resultImages?: ImageRecord[];
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
    event?: React.DragEvent | null,
  ) => void;
  onStripRemoveItem: (stripId: ThumbnailStripId, id: string) => void;
  onStripPinToggle: (stripId: ThumbnailStripId) => void;
  onStripActivate: (stripId: ThumbnailStripId) => void;
  onStripDragActivate: (stripId: ThumbnailStripId) => void;
  onVisibleStripItemIdsChange: (stripId: ThumbnailStripId, visibleItemIds: string[]) => void;
  selectedArtStyleId: string | null;
  onApplyTool: (toolId: string, params: Record<string, string>) => void;
  onCancelProcessing: () => void;
  onToolSelect: (toolId: string | null) => void;
  onParamChange: (toolId: string, paramName: string, value: string) => void;
  onArtStyleChange: (styleId: string) => void;
  onSetTarget: (id: string) => void;
  onSetReferenceAt: (index: number, id: string) => void;
  onAddReferencesAt: (index: number, ids: string[]) => void;
  onSetRight: (id: string) => void;
  onUploadTarget: (file: File) => void;
  onRemoveReferenceAt: (index: number) => void;
  onUploadReference: (file: File, slotIndex?: number) => void;
  onClearTarget: () => void;
  onClearRight: () => void;
  onUploadRight: (file: File) => void;
  generationProgress: GenerationProgressState | null;
  onSelectHistoryItem: (id: string) => void;
  onToggleHistoryStar: (id: string) => void;
  previewModifierActive?: boolean;
  previewSelectionImageIds?: string[];
  onDismissError: () => void;
}

export const ImageToolsBar: React.FC<ImageToolsPanelBar> = ({
  appState,
  selectedModel,
  targetImage,
  referenceImages,
  rightImage,
  resultImages = [],
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
  onVisibleStripItemIdsChange,
  selectedArtStyleId,
  onApplyTool,
  onCancelProcessing,
  onToolSelect,
  onParamChange,
  onArtStyleChange,
  onSetTarget,
  onSetReferenceAt,
  onAddReferencesAt,
  onSetRight,
  onUploadTarget,
  onRemoveReferenceAt,
  onUploadReference,
  onClearTarget,
  onClearRight,
  onUploadRight,
  generationProgress,
  onSelectHistoryItem,
  onToggleHistoryStar,
  previewModifierActive = false,
  previewSelectionImageIds = [],
  onDismissError,
}) => {
  const majorElementGap = { xs: 1.5, md: 3.75 } as const;
  const hasTargetImage = !!targetImage;
  const debugLog = React.useCallback((...args: any[]) => {
    try {
      if (isDragDebugEnabled()) {
        emitDragDebugLog("[dnd-timing]", ...args);
      }
    } catch {
      // ignore
    }
  }, []);

  const lastPointerDownRef = React.useRef<{
    t: number;
    x: number;
    y: number;
    pointerType: string;
    targetTestId: string;
  } | null>(null);
  const pendingDragProbeRef = React.useRef<{
    token: number;
    dragStarted: boolean;
    timeoutIds: number[];
  } | null>(null);

  const clearPendingDragProbe = React.useCallback(() => {
    const current = pendingDragProbeRef.current;
    if (!current || typeof window === "undefined") {
      pendingDragProbeRef.current = null;
      return;
    }

    current.timeoutIds.forEach((id) => window.clearTimeout(id));
    pendingDragProbeRef.current = null;
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // This governs how much movement is required before a drag is considered active.
      // Lower values make drags feel more immediate (especially on trackpads).
      activationConstraint: { distance: 2 },
    }),
  );

  const dragPreviewMode = React.useMemo(() => getDragPreviewMode(), []);
  const activeDragStartRef = React.useRef<number | null>(null);

  const dragPerfRef = React.useRef<{
    startT: number | null;
    lastMoveT: number | null;
    moveCount: number;
    maxMoveDeltaMs: number;
  }>({ startT: null, lastMoveT: null, moveCount: 0, maxMoveDeltaMs: 0 });

  const flushDragPerf = React.useCallback(
    (phase: "end" | "cancel") => {
      try {
        if (typeof window === "undefined" || !isDragDebugEnabled()) {
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
    [debugLog],
  );

  React.useEffect(() => {
    return () => {
      clearPendingDragProbe();
    };
  }, [clearPendingDragProbe]);

  const handleDragEnd = (event: DragEndEvent) => {
    const imageId = (event.active.data.current as any)?.imageId as string | undefined;
    const imageIds = Array.isArray((event.active.data.current as any)?.imageIds)
      ? ((event.active.data.current as any).imageIds as string[]).filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : imageId
        ? [imageId]
        : [];
    if (!imageIds.length) return;

    const overId = event.over?.id;
    if (!overId) return;

    const panel = parsePanelDrop(overId);
    if (panel) {
      if (panel.kind === "target") {
        onSetTarget(imageIds[0]);
        return;
      }
      if (panel.kind === "result") {
        onSetRight(imageIds[0]);
        return;
      }
      if (panel.kind === "reference") {
        if (imageIds.length === 1) {
          onSetReferenceAt(panel.slotIndex, imageIds[0]);
        } else {
          onAddReferencesAt(panel.slotIndex, imageIds);
        }
        return;
      }
    }

    const overStripItem = parseStripItem(overId);
    if (overStripItem) {
      const { stripId, imageId: overImageId } = overStripItem;
      const list = thumbnailStrips.itemIdsByStrip[stripId] || [];
      const dropIndex = Math.max(0, list.indexOf(overImageId));
      imageIds.forEach((draggedId, index) => {
        onStripItemDrop(stripId, dropIndex + index, draggedId, null);
      });
      return;
    }

    const overStrip = parseStripIdFromContainer(overId);
    if (overStrip) {
      const list = thumbnailStrips.itemIdsByStrip[overStrip] || [];
      imageIds.forEach((draggedId, index) => {
        onStripItemDrop(overStrip, list.length + index, draggedId, null);
      });
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

      <Box
        sx={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          minHeight: 0,
          columnGap: majorElementGap,
        }}
      >
        <Box sx={{ display: "flex" }}>
          <ImageTool
            onApplyTool={onApplyTool}
            isProcessing={appState.isProcessing}
            onCancelProcessing={onCancelProcessing}
            onToolSelect={onToolSelect}
            referenceImageCount={referenceImages.length}
            hasTargetImage={hasTargetImage}
            targetImageResolution={targetImage?.resolution ?? null}
            isAuthenticated={appState.isAuthenticated}
            selectedModel={selectedModel}
            activeToolId={activeToolId}
            paramsByTool={toolParams}
            onParamChange={onParamChange}
            selectedArtStyleId={selectedArtStyleId}
            onArtStyleChange={onArtStyleChange}
          />
        </Box>

        <DndContext
          sensors={sensors}
          collisionDetection={pointerFirstCollisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
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
            activeDragStartRef.current = null;
            clearPendingDragProbe();
            flushDragPerf("cancel");
          }}
          onDragEnd={(event) => {
            clearPendingDragProbe();
            handleDragEnd(event);
            activeDragStartRef.current = null;
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

              clearPendingDragProbe();
              if (typeof window !== "undefined" && isDragDebugEnabled()) {
                const token = lastPointerDownRef.current.t;
                const logAfter = (delayMs: number) => {
                  return window.setTimeout(() => {
                    const probe = pendingDragProbeRef.current;
                    const last = lastPointerDownRef.current;
                    if (!probe || probe.token !== token || probe.dragStarted || !last) {
                      return;
                    }

                    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
                    debugLog(
                      `drag pending ${delayMs}ms after pointerDown targetTestId=${last.targetTestId || ""} pointer=${last.pointerType}`,
                    );
                    debugLog(
                      `pending dt=${Math.round(now - last.t)}ms from=(${Math.round(last.x)},${Math.round(last.y)})`,
                    );
                  }, delayMs);
                };

                pendingDragProbeRef.current = {
                  token,
                  dragStarted: false,
                  timeoutIds: [logAfter(120), logAfter(400), logAfter(1000)],
                };
              }

              debugLog(
                `pointerDown (${lastPointerDownRef.current.pointerType}) @(${Math.round(
                  pe.clientX,
                )},${Math.round(pe.clientY)}) targetTestId=${targetTestId || ""}`,
              );
            }}
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              rowGap: majorElementGap,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <Workspace
              targetImage={targetImage}
              referenceImages={referenceImages}
              rightImage={rightImage}
              resultImages={resultImages}
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
              generationProgress={generationProgress}
              activeToolId={activeToolId}
              onToggleHistoryStar={onToggleHistoryStar}
            />

            <ThumbnailStripsCollection
              snapshot={thumbnailStrips}
              entries={historyItems}
              selectedId={appState.rightPanelImageId}
              previewModifierActive={previewModifierActive}
              previewSelectionImageIds={previewSelectionImageIds}
              stripConfigs={thumbnailStripConfigs}
              hasHiddenHistory={hasHiddenHistory}
              onRequestHistoryAccess={onRequestHistoryAccess}
              onSelect={onSelectHistoryItem}
              onToggleStar={onToggleHistoryStar}
              onRemoveFromStrip={onStripRemoveItem}
              onDropToStrip={onStripItemDrop}
              onVisibleItemIdsChange={onVisibleStripItemIdsChange}
              onActivateStrip={onStripActivate}
              onTogglePin={onStripPinToggle}
              onDragActivateStrip={onStripDragActivate}
            />
          </Box>

          <DragOverlayLayer
            historyItems={historyItems}
            dragPreviewMode={dragPreviewMode}
            dragPerfRef={dragPerfRef}
            activeDragStartRef={activeDragStartRef}
            pendingDragProbeRef={pendingDragProbeRef}
            clearPendingDragProbe={clearPendingDragProbe}
            lastPointerDownRef={lastPointerDownRef}
            debugLog={debugLog}
          />
        </DndContext>
      </Box>
    </Box>
  );
};
