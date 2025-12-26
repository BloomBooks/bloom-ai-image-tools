import React, { useMemo } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS, type Transform } from "@dnd-kit/utilities";
import { theme } from "../../themes";
import {
  STRIP_ACTIVE_BORDER_COLOR,
  STRIP_BORDER,
  STRIP_BORDER_COLOR,
} from "./stripStyleConstants";
import { ImageRecord, ThumbnailStripId } from "../../types";
import { Icon, Icons } from "../Icons";
import { ImageSlot } from "../ImageSlot";

interface ThumbnailStripProps {
  stripId: ThumbnailStripId;
  itemIds: string[];
  itemsById: Record<string, ImageRecord>;
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
    event?: React.DragEvent | null
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

const THUMB_WIDTH = 112;

const buildStripItemId = (stripId: ThumbnailStripId, imageId: string) =>
  `stripItem:${stripId}:${imageId}`;

const buildStripContainerId = (stripId: ThumbnailStripId) =>
  `strip:${stripId}`;

const StripThumbBase: React.FC<{
  stripId: ThumbnailStripId;
  item: ImageRecord;
  isSelected: boolean;
  allowRemove: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onRemove?: () => void;
  setNodeRef: (node: HTMLElement | null) => void;
  listeners?: any;
  attributes?: any;
  transform?: Transform | null;
  transition?: string | undefined;
  isDragging?: boolean;
}> = ({
  stripId,
  item,
  isSelected,
  allowRemove,
  onSelect,
  onToggleStar,
  onRemove,
  setNodeRef,
  listeners,
  attributes,
  transform,
  transition,
  isDragging,
}) => {
  return (
    <div
      ref={setNodeRef}
      data-testid={`thumbnail-strip-item-${stripId}`}
      data-strip-item-id={item.id}
      style={{
        width: THUMB_WIDTH,
        flexShrink: 0,
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: isDragging ? 0 : 1,
      }}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button")) {
          event.stopPropagation();
        }
      }}
      {...attributes}
      {...listeners}
    >
      <ImageSlot
        image={item}
        variant="thumb"
        dataTestId="history-card"
        onClick={onSelect}
        isSelected={isSelected}
        draggableImageId={undefined}
        controls={{
          upload: false,
          paste: false,
          copy: true,
          download: true,
          remove: allowRemove,
        }}
        onRemove={allowRemove ? onRemove : undefined}
        starState={{
          isStarred: Boolean(item.isStarred),
          onToggle: onToggleStar,
        }}
      />
    </div>
  );
};

const SortableStripThumb: React.FC<{
  stripId: ThumbnailStripId;
  item: ImageRecord;
  isSelected: boolean;
  allowRemove: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onRemove?: () => void;
}> = (props) => {
  const dndId = buildStripItemId(props.stripId, props.item.id);
  const sortable = useSortable({
    id: dndId,
    data: {
      kind: "image",
      imageId: props.item.id,
      source: { type: "strip", stripId: props.stripId },
    },
  });
  return (
    <StripThumbBase
      {...props}
      setNodeRef={sortable.setNodeRef}
      listeners={sortable.listeners}
      attributes={sortable.attributes}
      transform={sortable.transform}
      transition={sortable.transition}
      isDragging={sortable.isDragging}
    />
  );
};

const DraggableStripThumb: React.FC<{
  stripId: ThumbnailStripId;
  item: ImageRecord;
  isSelected: boolean;
  allowRemove: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onRemove?: () => void;
}> = (props) => {
  const dndId = buildStripItemId(props.stripId, props.item.id);
  const draggable = useDraggable({
    id: dndId,
    data: {
      kind: "image",
      imageId: props.item.id,
      source: { type: "strip", stripId: props.stripId },
    },
  });
  return (
    <StripThumbBase
      {...props}
      setNodeRef={draggable.setNodeRef}
      listeners={draggable.listeners}
      attributes={draggable.attributes}
      isDragging={draggable.isDragging}
    />
  );
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
  const droppable = useDroppable({
    id: buildStripContainerId(stripId),
    data: { kind: "strip", stripId },
    disabled: !allowDrop,
  });

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
      .filter((item): item is ImageRecord => Boolean(item?.imageData));
  }, [itemIds, itemsById]);

  const content = orderedItems.length ? (
    <div
      ref={droppable.setNodeRef}
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
      {allowReorder ? (
        <SortableContext
          items={orderedItems.map((item) => buildStripItemId(stripId, item.id))}
          strategy={horizontalListSortingStrategy}
        >
          {orderedItems.map((item) => (
            <SortableStripThumb
              key={`${stripId}-${item.id}`}
              stripId={stripId}
              item={item}
              isSelected={item.id === selectedId}
              allowRemove={allowRemove}
              onSelect={() => onSelect(item.id)}
              onToggleStar={() => onToggleStar(item.id)}
              onRemove={allowRemove ? () => onRemoveItem?.(item.id) : undefined}
            />
          ))}
        </SortableContext>
      ) : (
        orderedItems.map((item) => (
          <DraggableStripThumb
            key={`${stripId}-${item.id}`}
            stripId={stripId}
            item={item}
            isSelected={item.id === selectedId}
            allowRemove={allowRemove}
            onSelect={() => onSelect(item.id)}
            onToggleStar={() => onToggleStar(item.id)}
            onRemove={allowRemove ? () => onRemoveItem?.(item.id) : undefined}
          />
        ))
      )}

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
      ref={droppable.setNodeRef}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "24px 16px",
        color: theme.colors.textMuted,
        fontSize: "0.9rem",
        gap: 12,
      }}
    >
      <span>{emptyStateMessage || "No items yet"}</span>
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
    >
      {content}
    </div>
  );
};
