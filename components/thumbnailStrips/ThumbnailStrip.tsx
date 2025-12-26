import React, { useMemo, useState } from "react";
import { theme } from "../../themes";
import {
  STRIP_ACTIVE_BORDER_COLOR,
  STRIP_BORDER,
  STRIP_BORDER_COLOR,
} from "./stripStyleConstants";
import {
  getInternalImageDragData,
} from "../dragConstants";
import { HistoryItem, ThumbnailStripId } from "../../types";
import { Icon, Icons } from "../Icons";
import { ImageInfoPanel } from "../ImageInfoPanel";
import { ImageSlot } from "../ImageSlot";

interface ThumbnailStripProps {
  stripId: ThumbnailStripId;
  itemIds: string[];
  itemsById: Record<string, HistoryItem>;
  selectedId: string | null;
  allowDrop: boolean;
  allowRemove: boolean;
  allowReorder: boolean;
  pinned: boolean;
  isActive?: boolean;
  hasHiddenHistory?: boolean;
  onRequestHistoryAccess?: () => void;
  emptyStateMessage?: string;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onRemoveItem?: (id: string) => void;
  onItemDropped: (
    stripId: ThumbnailStripId,
    dropIndex: number,
    draggedId: string | null,
    event: React.DragEvent
  ) => void;
}

const stripShellStyles: React.CSSProperties = {
  border: STRIP_BORDER,
  backgroundColor: theme.colors.surface,
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  position: "relative",
};

const dropZoneBaseStyles: React.CSSProperties = {
  width: 10,
  height: 120,
  borderRadius: 999,
  margin: "0 4px",
  alignSelf: "center",
  transition:
    "background-color 150ms ease, border-color 150ms ease, opacity 150ms ease",
};

export const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({
  stripId,
  itemIds,
  itemsById,
  selectedId,
  allowDrop,
  allowRemove,
  allowReorder,
  pinned,
  isActive = false,
  hasHiddenHistory = false,
  onRequestHistoryAccess,
  emptyStateMessage,
  onSelect,
  onToggleStar,
  onRemoveItem,
  onItemDropped,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const debugLog = (...args: any[]) => {
    try {
      if (typeof window !== "undefined" && (window as any).__E2E_VERBOSE) {
        // eslint-disable-next-line no-console
        console.log("[thumbnail-strip]", ...args);
      }
    } catch {
      // ignore
    }
  };

  const orderedItems = useMemo(() => {
    return itemIds
      .map((id) => itemsById[id])
      .filter((item): item is HistoryItem => Boolean(item?.imageData));
  }, [itemIds, itemsById]);

  const handleDropAtIndex = (event: React.DragEvent, dropIndex: number) => {
    if (!allowDrop) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setHoveredIndex(null);
    const draggedId = getInternalImageDragData(event.dataTransfer);
    debugLog("dropAtIndex", { stripId, dropIndex, draggedId });
    onItemDropped(stripId, dropIndex, draggedId, event);
  };

  const resolveDropEffect = (dataTransfer: DataTransfer | null) => {
    if (!dataTransfer) {
      return allowReorder ? "move" : "copy";
    }
    const draggedId = getInternalImageDragData(dataTransfer);
    const isReorder = !!draggedId && itemIds.includes(draggedId);
    if (isReorder) {
      return allowReorder ? "move" : "none";
    }
    return "copy";
  };

  const handleDragOverZone = (event: React.DragEvent, index: number) => {
    if (!allowDrop) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setHoveredIndex(index);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = resolveDropEffect(event.dataTransfer);
    }
  };

  const handleStripDragOver = (event: React.DragEvent) => {
    if (!allowDrop) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = resolveDropEffect(event.dataTransfer);
    }
  };

  const handleStripDrop = (event: React.DragEvent) => {
    if (!allowDrop) return;
    event.preventDefault();
    setHoveredIndex(null);
    const draggedId = getInternalImageDragData(event.dataTransfer);
    debugLog("dropOnStrip", { stripId, dropIndex: orderedItems.length, draggedId });
    // Dropping on the strip (not on a specific gutter) appends to the end.
    onItemDropped(stripId, orderedItems.length, draggedId, event);
  };

  const renderDropZone = (index: number) => (
    <div
      key={`drop-${stripId}-${index}`}
      onDragOver={(event) => handleDragOverZone(event, index)}
      onDragEnter={(event) => handleDragOverZone(event, index)}
      onDragLeave={() => setHoveredIndex(null)}
      onDrop={(event) => handleDropAtIndex(event, index)}
      style={{
        ...dropZoneBaseStyles,
        backgroundColor:
          hoveredIndex === index ? theme.colors.accentSubtle : "transparent",
        border:
          hoveredIndex === index
            ? `1px solid ${theme.colors.accent}`
            : "1px solid transparent",
      }}
    />
  );

  const content = orderedItems.length ? (
    <div
      onDragOver={handleStripDragOver}
      onDrop={handleStripDrop}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 16px",
        gap: 12,
        overflowX: "auto",
        overflowY: "hidden",
        position: "relative",
      }}
    >
      {allowDrop && renderDropZone(0)}
      {orderedItems.map((item, index) => (
        <React.Fragment key={`${stripId}-${item.id}`}>
          <div style={{ width: 112, flexShrink: 0 }}>
            <ImageSlot
              image={item}
              variant="thumb"
              dataTestId="history-card"
              onClick={() => onSelect(item.id)}
              isSelected={item.id === selectedId}
              draggableImageId={item.id}
              dragEffectAllowed="copyMove"
              controls={{
                upload: false,
                paste: false,
                copy: true,
                download: true,
                remove: allowRemove,
              }}
              onRemove={allowRemove ? () => onRemoveItem?.(item.id) : undefined}
              starState={{
                isStarred: Boolean(item.isStarred),
                onToggle: () => onToggleStar(item.id),
              }}
              hoverInfo={(image) => <ImageInfoPanel item={image} />}
            />
          </div>
          {allowDrop && renderDropZone(index + 1)}
        </React.Fragment>
      ))}
      {!orderedItems.length && emptyStateMessage && (
        <div
          style={{
            width: "100%",
            padding: "24px 16px",
            textAlign: "left",
            color: theme.colors.textMuted,
          }}
        >
          {emptyStateMessage}
        </div>
      )}
      {hasHiddenHistory && onRequestHistoryAccess && (
        <button
          type="button"
          onClick={onRequestHistoryAccess}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexShrink: 0,
            width: 176,
            height: 144,
            borderRadius: 16,
            border: `2px dashed ${theme.colors.border}`,
            padding: 16,
            textAlign: "left",
            backgroundColor: theme.colors.surfaceAlt,
            color: theme.colors.textPrimary,
            boxShadow: theme.colors.panelShadow,
            transition: "opacity 150ms ease",
          }}
        >
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            More history available
          </span>
          <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
            Connect to a folder on your computer for more history.
          </span>
          <span style={{ color: theme.colors.accent }}>
            <Icon path={Icons.Refresh} width={14} height={14} />
            Reconnect folder
          </span>
        </button>
      )}
    </div>
  ) : (
    <div
      onDragOver={handleStripDragOver}
      onDrop={handleStripDrop}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "24px 16px",
        color: theme.colors.textMuted,
        fontSize: "0.9rem",
        gap: 12,
      }}
    >
      {allowDrop && renderDropZone(0)}
      <span>{emptyStateMessage || "No items yet"}</span>
      {allowDrop && renderDropZone(1)}
    </div>
  );

  return (
    <div
      style={{
        ...stripShellStyles,
        minHeight: 168,
        boxShadow: pinned ? theme.colors.panelShadow : "none",
        borderColor: isActive ? STRIP_ACTIVE_BORDER_COLOR : STRIP_BORDER_COLOR,
        //borderRightWidth: isActive ? 0 : 1,
        border: `1px solid ${STRIP_ACTIVE_BORDER_COLOR}`,
      }}
      data-strip-id={stripId}
      data-testid={`thumbnail-strip-${stripId}`}
      data-active={isActive ? "true" : "false"}
      data-pinned={pinned ? "true" : "false"}
      onDragOver={handleStripDragOver}
      onDrop={handleStripDrop}
    >
      {content}
    </div>
  );
};
