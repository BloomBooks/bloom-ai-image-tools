import React, { useMemo, useState } from "react";
import { HistoryCard } from "../HistoryCard";
import { theme } from "../../themes";
import {
  getInternalImageDragData,
  setInternalImageDragData,
} from "../dragConstants";
import { HistoryItem, ThumbnailStripId } from "../../types";
import { Icon, Icons } from "../Icons";

interface ThumbnailStripProps {
  stripId: ThumbnailStripId;
  itemIds: string[];
  itemsById: Record<string, HistoryItem>;
  selectedId: string | null;
  allowDrop: boolean;
  allowRemove: boolean;
  allowReorder: boolean;
  pinned: boolean;
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
  borderTop: `1px solid ${theme.colors.border}`,
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
  transition: "background-color 150ms ease",
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
  hasHiddenHistory = false,
  onRequestHistoryAccess,
  emptyStateMessage,
  onSelect,
  onToggleStar,
  onRemoveItem,
  onItemDropped,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const orderedItems = useMemo(() => {
    return itemIds
      .map((id) => itemsById[id])
      .filter((item): item is HistoryItem => Boolean(item?.imageData));
  }, [itemIds, itemsById]);

  const handleDragStart = (event: React.DragEvent, id: string) => {
    setInternalImageDragData(event.dataTransfer, id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = allowReorder ? "move" : "copy";
    }
  };

  const handleDropAtIndex = (
    event: React.DragEvent,
    dropIndex: number
  ) => {
    if (!allowDrop) {
      return;
    }
    event.preventDefault();
    setHoveredIndex(null);
    const draggedId = getInternalImageDragData(event.dataTransfer);
    onItemDropped(stripId, dropIndex, draggedId, event);
  };

  const handleDragOverZone = (
    event: React.DragEvent,
    index: number
  ) => {
    if (!allowDrop) {
      return;
    }
    event.preventDefault();
    setHoveredIndex(index);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = allowReorder ? "move" : "copy";
    }
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
          hoveredIndex === index
            ? theme.colors.accentSubtle
            : "transparent",
        border:
          hoveredIndex === index
            ? `1px solid ${theme.colors.accent}`
            : `1px dashed ${theme.colors.border}`,
      }}
    />
  );

  const content = orderedItems.length ? (
    <div
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
          <HistoryCard
            item={item}
            isSelected={item.id === selectedId}
            isStarred={Boolean(item.isStarred)}
            onSelect={() => onSelect(item.id)}
            onDragStart={(event) => handleDragStart(event, item.id)}
            onToggleStar={() => onToggleStar(item.id)}
            onRemove={allowRemove ? () => onRemoveItem?.(item.id) : undefined}
          />
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
      }}
      data-strip-id={stripId}
      data-testid={`thumbnail-strip-${stripId}`}
    >
      {content}
    </div>
  );
};
