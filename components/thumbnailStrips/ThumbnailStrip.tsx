import React, { useMemo } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS, type Transform } from "@dnd-kit/utilities";
import { theme } from "../../themes";
import { STRIP_ACTIVE_BORDER_COLOR, STRIP_BORDER, STRIP_BORDER_COLOR } from "./stripStyleConstants";
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
  onVisibleItemIdsChange?: (stripId: ThumbnailStripId, visibleItemIds: string[]) => void;
  isAnyDndDragging?: boolean;
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
const STRIP_ITEM_GAP = 12;
const STRIP_HORIZONTAL_PADDING = 16;
const STRIP_VISIBILITY_OVERSCAN_ITEMS = 2;

const buildStripItemId = (stripId: ThumbnailStripId, imageId: string) =>
  `stripItem:${stripId}:${imageId}`;

const buildStripContainerId = (stripId: ThumbnailStripId) => `strip:${stripId}`;
const buildStripStackId = (stripId: ThumbnailStripId) => `stripStack:${stripId}`;

const createCharacterStackSvgDataUrl = (frontImageData: string | null) => {
  const frontImageMarkup = frontImageData
    ? `<image href="${frontImageData}" x="32" y="18" width="48" height="66" preserveAspectRatio="xMidYMid slice" clip-path="url(#front-clip)" />`
    : `<rect x="32" y="18" width="48" height="66" rx="10" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" />`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112"><rect x="20" y="20" width="48" height="66" rx="10" fill="#e2e8f0" stroke="#334155" stroke-width="2" transform="rotate(-10 44 53)" /><rect x="28" y="18" width="48" height="66" rx="10" fill="#f1f5f9" stroke="#334155" stroke-width="2" transform="rotate(-4 52 51)" /><clipPath id="front-clip"><rect x="32" y="18" width="48" height="66" rx="10" /></clipPath><rect x="32" y="18" width="48" height="66" rx="10" fill="#ffffff" stroke="#0f172a" stroke-width="2" />${frontImageMarkup}<text x="56" y="98" text-anchor="middle" font-family="Roboto, Noto Sans, sans-serif" font-size="11" font-weight="700" fill="${theme.colors.accent}">Cast</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

type StripThumbBaseProps = {
  stripId: ThumbnailStripId;
  item: ImageRecord;
  isSelected: boolean;
  allowRemove: boolean;
  isAnyDndDragging?: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onRemove?: () => void;
  setNodeRef: (node: HTMLElement | null) => void;
  listeners?: any;
  attributes?: any;
  transform?: Transform | null;
  transition?: string | undefined;
  isDragging?: boolean;
};

// The visual contents of a thumbnail (ImageSlot with image, star, remove).
// This is the expensive part. Memoized so it doesn't re-render every time
// the dnd-kit context updates the wrapper's listeners.
type ThumbVisualProps = {
  stripId: ThumbnailStripId;
  item: ImageRecord;
  isSelected: boolean;
  isAnyDndDragging: boolean;
  allowRemove: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onRemove?: () => void;
};

const ThumbVisualInner: React.FC<ThumbVisualProps> = ({
  stripId,
  item,
  isSelected,
  isAnyDndDragging,
  allowRemove,
  onSelect,
  onToggleStar,
  onRemove,
}) => {
  if (typeof window !== "undefined") {
    const w = window as Window & { __thumbRenders?: number };
    w.__thumbRenders = (w.__thumbRenders ?? 0) + 1;
  }
  const image = item.imageData ? item : null;
  const isHistoryStrip = stripId === "history";
  return (
    <ImageSlot
      image={image}
      variant="thumb"
      isAnyDndDragging={isAnyDndDragging}
      dataTestId="history-card"
      onClick={onSelect}
      isSelected={isSelected}
      draggableImageId={undefined}
      controls={{
        upload: false,
        paste: false,
        copy: !!image,
        download: !!image,
        remove: allowRemove,
      }}
      onRemove={allowRemove ? onRemove : undefined}
      removeIcon={isHistoryStrip ? Icons.Trash : undefined}
      actionLabels={isHistoryStrip ? { remove: "Delete from history" } : undefined}
      starState={{
        isStarred: Boolean(item.isStarred) || stripId === "starred",
        onToggle: onToggleStar,
      }}
    />
  );
};

// Custom equality: ignore the inline arrow callbacks — they are re-created by
// the parent every render but behave identically.
const ThumbVisual = React.memo(ThumbVisualInner, (prev, next) => {
  return (
    prev.stripId === next.stripId &&
    prev.item.id === next.item.id &&
    prev.item.imageData === next.item.imageData &&
    prev.item.isStarred === next.item.isStarred &&
    prev.isSelected === next.isSelected &&
    prev.isAnyDndDragging === next.isAnyDndDragging &&
    prev.allowRemove === next.allowRemove
  );
});

// Wrapper owns the dnd-kit listeners. It MUST re-render whenever dnd-kit asks
// it to, so the DOM listeners stay current (otherwise the second drag after a
// completed first drag uses stale handlers and silently does nothing).
const StripThumbBase: React.FC<StripThumbBaseProps> = ({
  stripId,
  item,
  isSelected,
  allowRemove,
  isAnyDndDragging = false,
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
      <ThumbVisual
        stripId={stripId}
        item={item}
        isSelected={isSelected}
        isAnyDndDragging={isAnyDndDragging}
        allowRemove={allowRemove}
        onSelect={onSelect}
        onToggleStar={onToggleStar}
        onRemove={onRemove}
      />
    </div>
  );
};

const SortableStripThumb: React.FC<{
  stripId: ThumbnailStripId;
  item: ImageRecord;
  isSelected: boolean;
  allowRemove: boolean;
  isAnyDndDragging?: boolean;
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
  isAnyDndDragging?: boolean;
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

const CharacterStackThumb: React.FC<{
  stripId: ThumbnailStripId;
  imageIds: string[];
  frontImage: ImageRecord | null;
  onSelect: () => void;
}> = ({ stripId, imageIds, frontImage, onSelect }) => {
  const draggable = useDraggable({
    id: buildStripStackId(stripId),
    data: {
      kind: "image-stack",
      imageId: imageIds[0] || null,
      imageIds,
      source: { type: "strip", stripId },
    },
  });
  const previewSrc = React.useMemo(
    () => createCharacterStackSvgDataUrl(frontImage?.imageData || null),
    [frontImage?.imageData],
  );

  return (
    <button
      ref={draggable.setNodeRef}
      type="button"
      onClick={onSelect}
      style={{
        width: THUMB_WIDTH,
        height: 144,
        flexShrink: 0,
        padding: 0,
        borderRadius: 18,
        border: `1px solid ${theme.colors.border}`,
        backgroundColor: theme.colors.surface,
        boxShadow: theme.colors.panelShadow,
        overflow: "hidden",
        cursor: "grab",
        opacity: draggable.isDragging ? 0 : 1,
      }}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      <img
        src={previewSrc}
        alt="Character stack"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: "cover",
          backgroundColor: theme.colors.surface,
        }}
      />
    </button>
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
  onVisibleItemIdsChange,
  isAnyDndDragging = false,
}) => {
  const stripContentRef = React.useRef<HTMLDivElement | null>(null);
  const droppable = useDroppable({
    id: buildStripContainerId(stripId),
    data: { kind: "strip", stripId },
    disabled: !allowDrop,
  });

  const setStripContentNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      stripContentRef.current = node;
      droppable.setNodeRef(node);
    },
    [droppable],
  );

  const orderedItems = useMemo(() => {
    return itemIds.map((id) => itemsById[id]).filter((item): item is ImageRecord => Boolean(item));
  }, [itemIds, itemsById]);

  const orderedItemIds = useMemo(() => orderedItems.map((item) => item.id), [orderedItems]);
  const showCharacterStack = stripId === "characters" && orderedItemIds.length > 0;

  React.useEffect(() => {
    if (!onVisibleItemIdsChange) {
      return;
    }

    return () => {
      onVisibleItemIdsChange(stripId, []);
    };
  }, [onVisibleItemIdsChange, stripId]);

  React.useEffect(() => {
    if (!onVisibleItemIdsChange) {
      return;
    }

    const node = stripContentRef.current;
    if (!node) {
      onVisibleItemIdsChange(stripId, orderedItemIds);
      return;
    }

    const publishVisibleIds = () => {
      if (orderedItemIds.length === 0) {
        onVisibleItemIdsChange(stripId, []);
        return;
      }

      const stride = THUMB_WIDTH + STRIP_ITEM_GAP;
      const visibleWidth = Math.max(THUMB_WIDTH, node.clientWidth - STRIP_HORIZONTAL_PADDING * 2);
      const startIndex = Math.max(
        0,
        Math.floor(node.scrollLeft / stride) - STRIP_VISIBILITY_OVERSCAN_ITEMS,
      );
      const visibleCount = Math.max(
        1,
        Math.ceil(visibleWidth / stride) + STRIP_VISIBILITY_OVERSCAN_ITEMS * 2,
      );
      const endIndex = Math.min(orderedItemIds.length, startIndex + visibleCount);
      onVisibleItemIdsChange(stripId, orderedItemIds.slice(startIndex, endIndex));
    };

    publishVisibleIds();

    const handleResize = () => {
      publishVisibleIds();
    };

    node.addEventListener("scroll", publishVisibleIds, { passive: true });
    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        publishVisibleIds();
      });
      resizeObserver.observe(node);
    }

    return () => {
      node.removeEventListener("scroll", publishVisibleIds);
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
    };
  }, [onVisibleItemIdsChange, orderedItemIds, stripId]);

  const content = orderedItems.length ? (
    <div
      ref={setStripContentNodeRef}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 16px",
        gap: STRIP_ITEM_GAP,
        overflowX: "auto",
        overflowY: "hidden",
        position: "relative",
      }}
    >
      {showCharacterStack && (
        <CharacterStackThumb
          stripId={stripId}
          imageIds={orderedItemIds}
          frontImage={orderedItems[0] || null}
          onSelect={() => onSelect(orderedItemIds[0])}
        />
      )}
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
              isAnyDndDragging={isAnyDndDragging}
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
            isAnyDndDragging={isAnyDndDragging}
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
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>More history available</span>
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
