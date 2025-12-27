import React from "react";
import { Box } from "@mui/material";
import { ImageRecord } from "../types";
import { ImagePanel, ImagePanelSlot } from "./ImagePanel";
import { TOOLS } from "./tools/tools-registry";
import { theme } from "../themes";

const SPLITTER_STORAGE_KEY = "workspacePanelSplitters";

type SplitterState = {
  horizontal: number;
  vertical: number;
};

const DEFAULT_SPLITTERS: SplitterState = {
  horizontal: 0.58,
  vertical: 0.55,
};

const HORIZONTAL_LIMITS = { min: 0.25, max: 0.75 } as const;
const VERTICAL_LIMITS = { min: 0.2, max: 0.8 } as const;
const KEYBOARD_STEP = 0.02;

const clampRatio = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const readStoredSplitters = (): SplitterState => {
  if (typeof window === "undefined") {
    return DEFAULT_SPLITTERS;
  }

  try {
    const rawValue = window.localStorage.getItem(SPLITTER_STORAGE_KEY);
    if (!rawValue) return DEFAULT_SPLITTERS;

    const parsed = JSON.parse(rawValue) as Partial<SplitterState>;
    return {
      horizontal: clampRatio(
        typeof parsed.horizontal === "number"
          ? parsed.horizontal
          : DEFAULT_SPLITTERS.horizontal,
        HORIZONTAL_LIMITS.min,
        HORIZONTAL_LIMITS.max
      ),
      vertical: clampRatio(
        typeof parsed.vertical === "number"
          ? parsed.vertical
          : DEFAULT_SPLITTERS.vertical,
        VERTICAL_LIMITS.min,
        VERTICAL_LIMITS.max
      ),
    };
  } catch {
    return DEFAULT_SPLITTERS;
  }
};

type SplitterProps = {
  orientation: "vertical" | "horizontal";
  ariaLabel: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

const Splitter: React.FC<SplitterProps> = ({
  orientation,
  ariaLabel,
  onPointerDown,
  onKeyDown,
}) => {
  const isVertical = orientation === "vertical";

  return (
    <Box
      role="separator"
      aria-label={ariaLabel}
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      sx={{
        flex: "0 0 auto",
        cursor: isVertical ? "col-resize" : "row-resize",
        alignSelf: isVertical ? "stretch" : "auto",
        width: isVertical ? "14px" : "100%",
        height: isVertical ? "100%" : "14px",
        mx: isVertical ? 1 : 0,
        my: isVertical ? 0 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        touchAction: "none",
        transition: "background-color 120ms ease",
        borderRadius: isVertical ? "999px" : 0,
        outline: "none",
        "&:focus-visible": {
          backgroundColor: theme.colors.overlay,
        },
        "&:hover .splitter-thumb, &:focus-visible .splitter-thumb, &:active .splitter-thumb":
          {
            opacity: 1,
          },
      }}
    >
      <Box
        className="splitter-thumb"
        sx={{
          width: isVertical ? "3px" : "32px",
          height: isVertical ? "60%" : "3px",
          borderRadius: "999px",
          backgroundColor: theme.colors.panelBorder,
          boxShadow: theme.colors.panelShadow,
          opacity: 0,
          transition: "opacity 150ms ease",
        }}
      />
    </Box>
  );
};

interface WorkspaceProps {
  targetImage: ImageRecord | null;
  referenceImages: ImageRecord[];
  rightImage: ImageRecord | null;
  onSetTarget: (id: string) => void;
  onSetReferenceAt: (index: number, id: string) => void;
  onSetRight: (id: string) => void;
  onUploadTarget: (file: File) => void;
  onRemoveReferenceAt: (index: number) => void;
  onUploadReference: (file: File, slotIndex?: number) => void;
  onClearTarget: () => void;
  onClearRight: () => void;
  onUploadRight: (file: File) => void;
  isProcessing: boolean;
  activeToolId: string | null;
  onToggleHistoryStar: (id: string) => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  targetImage,
  referenceImages,
  rightImage,
  onSetTarget,
  onSetReferenceAt,
  onSetRight,
  onUploadTarget,
  onRemoveReferenceAt,
  onUploadReference,
  onClearTarget,
  onClearRight,
  onUploadRight,
  isProcessing,
  activeToolId,
  onToggleHistoryStar,
}) => {
  const tool = activeToolId ? TOOLS.find((t) => t.id === activeToolId) : null;
  const referenceMode = tool?.referenceImages ?? "0";
  const showReferencePanel = referenceMode === "0+" || referenceMode === "1+";
  const showTargetPanel = tool ? tool.editImage !== false : true;

  const slots: ImagePanelSlot[] = !showReferencePanel
    ? []
    : [
        ...referenceImages.map((image, i) => ({
          image,
          slotIndex: i,
          canRemove: true,
          dndDropId: `panel:reference:${i}`,
          dndDragId: `panelItem:reference:${i}:${image.id}`,
          dataTestId: `reference-slot-${i}`,
          uploadInputTestId: `reference-upload-input-${i}`,
          dropLabel: "Drop to add",
          actionLabels: { remove: "Remove reference" },
        })),
        {
          image: null,
          slotIndex: referenceImages.length,
          canRemove: false,
          dndDropId: `panel:reference:${referenceImages.length}`,
          dataTestId: `reference-slot-${referenceImages.length}`,
          uploadInputTestId: `reference-upload-input-${referenceImages.length}`,
          dropLabel: "Drop to add",
          actionLabels: { remove: "Remove reference" },
        },
      ];

  const referenceLabel = "Reference Images";

  const workspaceRef = React.useRef<HTMLDivElement>(null);
  const leftColumnRef = React.useRef<HTMLDivElement>(null);
  const [splitters, setSplitters] = React.useState<SplitterState>(() =>
    readStoredSplitters()
  );

  type IdleFriendlyWindow = Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  const splitterPersistRef = React.useRef<{
    idleHandle: number | null;
    timeoutHandle: number | null;
  }>({ idleHandle: null, timeoutHandle: null });

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const clearPending = () => {
      const handles = splitterPersistRef.current;
      if (handles.idleHandle !== null) {
        (window as IdleFriendlyWindow).cancelIdleCallback?.(handles.idleHandle);
        handles.idleHandle = null;
      }
      if (handles.timeoutHandle !== null) {
        window.clearTimeout(handles.timeoutHandle);
        handles.timeoutHandle = null;
      }
    };

    const persist = () => {
      try {
        window.localStorage.setItem(SPLITTER_STORAGE_KEY, JSON.stringify(splitters));
      } catch {
        // ignore
      }
    };

    // Splitters update rapidly during drag; defer persistence until the browser is idle.
    clearPending();
    const win = window as IdleFriendlyWindow;
    if (typeof win.requestIdleCallback === "function") {
      splitterPersistRef.current.idleHandle = win.requestIdleCallback(persist, {
        timeout: 500,
      });
    } else {
      splitterPersistRef.current.timeoutHandle = window.setTimeout(persist, 150);
    }

    return () => {
      clearPending();
    };
  }, [splitters]);

  const updateHorizontalSplit = React.useCallback((clientX: number) => {
    const host = workspaceRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    setSplitters((previous) => ({
      ...previous,
      horizontal: clampRatio(
        ratio,
        HORIZONTAL_LIMITS.min,
        HORIZONTAL_LIMITS.max
      ),
    }));
  }, []);

  const updateVerticalSplit = React.useCallback((clientY: number) => {
    const column = leftColumnRef.current;
    if (!column) return;
    const rect = column.getBoundingClientRect();
    if (rect.height <= 0) return;
    const ratio = (clientY - rect.top) / rect.height;
    setSplitters((previous) => ({
      ...previous,
      vertical: clampRatio(ratio, VERTICAL_LIMITS.min, VERTICAL_LIMITS.max),
    }));
  }, []);

  const handleHorizontalPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (typeof window === "undefined") return;
      updateHorizontalSplit(event.clientX);

      const handleMove = (moveEvent: PointerEvent) => {
        updateHorizontalSplit(moveEvent.clientX);
      };
      const stop = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    },
    [updateHorizontalSplit]
  );

  const handleVerticalPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (typeof window === "undefined") return;
      updateVerticalSplit(event.clientY);

      const handleMove = (moveEvent: PointerEvent) => {
        updateVerticalSplit(moveEvent.clientY);
      };
      const stop = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    },
    [updateVerticalSplit]
  );

  const handleHorizontalKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -KEYBOARD_STEP : KEYBOARD_STEP;
      setSplitters((previous) => ({
        ...previous,
        horizontal: clampRatio(
          previous.horizontal + delta,
          HORIZONTAL_LIMITS.min,
          HORIZONTAL_LIMITS.max
        ),
      }));
    },
    []
  );

  const handleVerticalKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? -KEYBOARD_STEP : KEYBOARD_STEP;
      setSplitters((previous) => ({
        ...previous,
        vertical: clampRatio(
          previous.vertical + delta,
          VERTICAL_LIMITS.min,
          VERTICAL_LIMITS.max
        ),
      }));
    },
    []
  );

  const showLeftColumn = showTargetPanel || showReferencePanel;
  const leftColumnFlexGrow = showLeftColumn ? splitters.horizontal : 0;
  const rightColumnFlexGrow = showLeftColumn ? 1 - splitters.horizontal : 1;
  const targetFlexGrow = showReferencePanel ? splitters.vertical : 1;
  const referenceFlexGrow = showTargetPanel ? 1 - splitters.vertical : 1;

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "transparent",
        minHeight: 0,
      }}
    >
      <Box
        ref={workspaceRef}
        sx={{
          display: "flex",
          width: "100%",
          height: "100%",
          minHeight: 0,
          minWidth: 0,
          alignItems: "stretch",
        }}
      >
        {showLeftColumn && (
          <Box
            ref={leftColumnRef}
            sx={{
              display: "flex",
              flexDirection: "column",
              flexGrow: leftColumnFlexGrow,
              flexShrink: 1,
              flexBasis: 0,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {showTargetPanel && (
              <Box
                sx={{
                  position: "relative",
                  flexGrow: showReferencePanel ? targetFlexGrow : 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                }}
              >
                <ImagePanel
                  image={targetImage}
                  label="Image to Edit"
                  panelTestId="target-panel"
                  onUpload={onUploadTarget}
                  isDropZone={true}
                  onDrop={onSetTarget}
                  onClear={onClearTarget}
                  showCopyButton={false}
                  showDownloadButton={false}
                  draggableImageId={undefined}
                  dndDropId="panel:target"
                  dndDragId={
                    targetImage ? `panelItem:target:${targetImage.id}` : undefined
                  }
                  uploadInputTestId="target-upload-input"
                  onToggleStar={
                    targetImage
                      ? () => onToggleHistoryStar(targetImage.id)
                      : undefined
                  }
                />
              </Box>
            )}

            {showTargetPanel && showReferencePanel && (
              <Splitter
                orientation="horizontal"
                ariaLabel="Resize Image to Edit and Reference panels"
                onPointerDown={handleVerticalPointerDown}
                onKeyDown={handleVerticalKeyDown}
              />
            )}

            {showReferencePanel && (
              <Box
                sx={{
                  flexGrow: showTargetPanel ? referenceFlexGrow : 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                }}
              >
                <ImagePanel
                  label={referenceLabel}
                  layout="grid"
                  panelTestId="reference-panel"
                  slots={slots}
                  disabled={false}
                  onSlotUpload={(file, slotIndex) =>
                    onUploadReference(file, slotIndex)
                  }
                  onSlotDrop={(imageId, slotIndex) =>
                    onSetReferenceAt(slotIndex, imageId)
                  }
                  onSlotRemove={(slotIndex) => onRemoveReferenceAt(slotIndex)}
                />
              </Box>
            )}
          </Box>
        )}

        {showLeftColumn && (
          <Splitter
            orientation="vertical"
            ariaLabel="Resize Image to Edit and Result panels"
            onPointerDown={handleHorizontalPointerDown}
            onKeyDown={handleHorizontalKeyDown}
          />
        )}

        <Box
          sx={{
            flexGrow: showLeftColumn ? rightColumnFlexGrow : 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
            minHeight: 0,
            position: "relative",
          }}
        >
          <ImagePanel
            image={rightImage}
            label="Result"
            panelTestId="result-panel"
            onUpload={onUploadRight}
            isDropZone={true}
            onDrop={onSetRight}
            showUploadControls={false}
            onClear={onClearRight}
            draggableImageId={undefined}
            dndDropId="panel:result"
            dndDragId={rightImage ? `panelItem:result:${rightImage.id}` : undefined}
            isLoading={isProcessing}
            onToggleStar={
              rightImage ? () => onToggleHistoryStar(rightImage.id) : undefined
            }
          />
        </Box>
      </Box>
    </Box>
  );
};
