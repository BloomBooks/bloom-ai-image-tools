import React, { useMemo } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS, type Transform } from "@dnd-kit/utilities";
import { theme } from "../../themes";
import { STRIP_ACTIVE_BORDER_COLOR, STRIP_BORDER, STRIP_BORDER_COLOR } from "./stripStyleConstants";
import { ImageRecord, ThumbnailStripId } from "../../types";
import { Icon, Icons, PasteIcon } from "../Icons";
import { ImageSlot } from "../ImageSlot";
import { handlePaste as pasteImageFromClipboard } from "../../lib/clipboardUtils";

interface ThumbnailStripProps {
  stripId: ThumbnailStripId;
  itemIds: string[];
  itemsById: Record<string, ImageRecord>;
  removeDisabledReasonById?: Partial<Record<string, string>>;
  selectedId: string | null;
  previewModifierActive?: boolean;
  previewSelectionImageIds?: string[];
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
  onRenameItem?: (id: string, name: string) => void;
  onRemoveItem?: (id: string) => void;
  // When provided on the "characters" strip, renders a paste/upload placeholder
  // that adds a pasted (or picked) image as a new character.
  onAddCharacterImage?: (file: File) => void;
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
  isPreviewSelected: boolean;
  previewModifierActive: boolean;
  allowRemove: boolean;
  removeDisabledReason?: string;
  isAnyDndDragging?: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onRename?: (name: string) => void;
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
  isPreviewSelected: boolean;
  previewModifierActive: boolean;
  isAnyDndDragging: boolean;
  allowRemove: boolean;
  removeDisabledReason?: string;
  onSelect: () => void;
  onToggleStar: () => void;
  onRename?: (name: string) => void;
  onRemove?: () => void;
};

const ThumbVisualInner: React.FC<ThumbVisualProps> = ({
  stripId,
  item,
  isSelected,
  isPreviewSelected,
  previewModifierActive,
  isAnyDndDragging,
  allowRemove,
  removeDisabledReason,
  onSelect,
  onToggleStar,
  onRename,
  onRemove,
}) => {
  if (typeof window !== "undefined") {
    const w = window as Window & { __thumbRenders?: number };
    w.__thumbRenders = (w.__thumbRenders ?? 0) + 1;
  }
  const image = item.imageData ? item : null;
  const isHistoryStrip = stripId === "history";
  const isCharactersStrip = stripId === "characters";
  const caption = item.caption?.trim();

  const nameInputRef = React.useRef<HTMLInputElement | null>(null);
  const [draftName, setDraftName] = React.useState(item.name ?? "");

  // Re-sync the local draft if the persisted name changes from elsewhere.
  React.useEffect(() => {
    setDraftName(item.name ?? "");
  }, [item.name]);

  const commitName = React.useCallback(() => {
    const next = draftName.trim();
    if ((item.name ?? "") !== next) {
      onRename?.(next);
    }
  }, [draftName, item.name, onRename]);

  // Clicking the character image selects it AND drops the cursor in the name
  // box so the user can immediately type a name.
  const handleSelect = React.useCallback(() => {
    onSelect();
    if (isCharactersStrip) {
      const input = nameInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }, [onSelect, isCharactersStrip]);

  return (
    <>
      <ImageSlot
        image={image}
        variant="thumb"
        isAnyDndDragging={isAnyDndDragging}
        previewModifierActive={previewModifierActive}
        previewSelected={isPreviewSelected}
        dataTestId="history-card"
        onClick={handleSelect}
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
        actionDisabledReasons={removeDisabledReason ? { remove: removeDisabledReason } : undefined}
        starState={{
          isStarred: Boolean(item.isStarred) || stripId === "starred",
          onToggle: onToggleStar,
        }}
      />
      {isCharactersStrip ? (
        <input
          ref={nameInputRef}
          data-testid="character-name-input"
          type="text"
          value={draftName}
          placeholder="Name"
          aria-label="Character name"
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onPointerDown={(event) => {
            // Don't let the surrounding draggable swallow the click.
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
              nameInputRef.current?.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraftName(item.name ?? "");
              nameInputRef.current?.blur();
            }
          }}
          style={{
            marginTop: 4,
            width: "100%",
            boxSizing: "border-box",
            padding: "3px 6px",
            fontSize: 11,
            lineHeight: 1.3,
            textAlign: "center",
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            outline: "none",
          }}
        />
      ) : (
        caption && (
          <div
            data-testid="thumb-caption"
            title={caption}
            style={{
              marginTop: 3,
              maxWidth: "100%",
              fontSize: 10,
              lineHeight: 1.25,
              color: theme.colors.textSecondary,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {caption}
          </div>
        )
      )}
    </>
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
    prev.item.caption === next.item.caption &&
    prev.item.name === next.item.name &&
    prev.isSelected === next.isSelected &&
    prev.isPreviewSelected === next.isPreviewSelected &&
    prev.previewModifierActive === next.previewModifierActive &&
    prev.isAnyDndDragging === next.isAnyDndDragging &&
    prev.allowRemove === next.allowRemove &&
    prev.removeDisabledReason === next.removeDisabledReason
  );
});

// Wrapper owns the dnd-kit listeners. It MUST re-render whenever dnd-kit asks
// it to, so the DOM listeners stay current (otherwise the second drag after a
// completed first drag uses stale handlers and silently does nothing).
const StripThumbBase: React.FC<StripThumbBaseProps> = ({
  stripId,
  item,
  isSelected,
  isPreviewSelected,
  previewModifierActive,
  allowRemove,
  removeDisabledReason,
  isAnyDndDragging = false,
  onSelect,
  onToggleStar,
  onRename,
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
        // Let buttons and the name input handle their own pointer events
        // instead of starting a drag.
        if (target?.closest("button") || target?.closest("input")) {
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
        isPreviewSelected={isPreviewSelected}
        previewModifierActive={previewModifierActive}
        isAnyDndDragging={isAnyDndDragging}
        allowRemove={allowRemove}
        removeDisabledReason={removeDisabledReason}
        onSelect={onSelect}
        onToggleStar={onToggleStar}
        onRename={onRename}
        onRemove={onRemove}
      />
    </div>
  );
};

const SortableStripThumb: React.FC<{
  stripId: ThumbnailStripId;
  item: ImageRecord;
  isSelected: boolean;
  isPreviewSelected: boolean;
  previewModifierActive: boolean;
  allowRemove: boolean;
  removeDisabledReason?: string;
  isAnyDndDragging?: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onRename?: (name: string) => void;
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
  isPreviewSelected: boolean;
  previewModifierActive: boolean;
  allowRemove: boolean;
  removeDisabledReason?: string;
  isAnyDndDragging?: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onRename?: (name: string) => void;
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

// Dashed placeholder shown on the characters strip. Clicking pastes an image
// from the clipboard (falling back to a file picker when the clipboard has no
// image) and hands it to the parent to register as a new character.
const CharacterPastePlaceholder: React.FC<{ onAddImage: (file: File) => void }> = ({
  onAddImage,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  const openFilePicker = () => fileInputRef.current?.click();

  const handlePasteClick = async () => {
    try {
      const pasted = await pasteImageFromClipboard(onAddImage);
      if (!pasted) {
        openFilePicker();
      }
    } catch (err) {
      console.error("Failed to paste character image:", err);
      openFilePicker();
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onAddImage(file);
      event.currentTarget.value = "";
    }
  };

  return (
    <div
      data-testid="character-paste-placeholder"
      role="button"
      tabIndex={0}
      title="Paste an image to add a character"
      onClick={() => void handlePasteClick()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void handlePasteClick();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: THUMB_WIDTH,
        height: 144,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        borderRadius: 18,
        border: `2px dashed ${theme.colors.border}`,
        backgroundColor: isHovered ? theme.colors.surfaceAlt : theme.colors.surface,
        cursor: "pointer",
        transition: "background-color 150ms ease, border-color 150ms ease",
        position: "relative",
      }}
    >
      {/* Faint, simple silhouette of a person */}
      <svg width="52" height="52" viewBox="0 0 100 100" aria-hidden="true" style={{ opacity: 0.2 }}>
        <circle cx="50" cy="32" r="18" fill={theme.colors.textMuted} />
        <path d="M18 92 C18 68 32 56 50 56 C68 56 82 68 82 92 Z" fill={theme.colors.textMuted} />
      </svg>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: theme.colors.accent,
        }}
      >
        <PasteIcon width={14} height={14} />
        Paste
      </span>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleInputChange}
      />
    </div>
  );
};

export const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({
  stripId,
  itemIds,
  itemsById,
  removeDisabledReasonById,
  selectedId,
  previewModifierActive = false,
  previewSelectionImageIds = [],
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
  onRenameItem,
  onRemoveItem,
  onAddCharacterImage,
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
  const previewSelectionIdSet = useMemo(
    () => new Set(previewSelectionImageIds),
    [previewSelectionImageIds],
  );

  const orderedItemIds = useMemo(() => orderedItems.map((item) => item.id), [orderedItems]);
  const showCharacterStack = stripId === "characters" && orderedItemIds.length > 0;
  // The characters strip always offers a paste/upload placeholder on the left
  // (after the cast button), even when there are no characters yet.
  const showCharacterPlaceholder = stripId === "characters" && !!onAddCharacterImage;

  // When a single new character appears (e.g. via the paste placeholder), make
  // it slide out from the placeholder's position into its resting slot. Running
  // in a layout effect (before paint) starts the animation at the offset
  // position, so there is no flash at the resting spot first.
  const prevCharIdsRef = React.useRef<string[] | null>(null);
  React.useLayoutEffect(() => {
    if (stripId !== "characters") {
      return;
    }
    const previous = prevCharIdsRef.current;
    prevCharIdsRef.current = orderedItemIds;
    if (previous === null) {
      // First render — don't animate characters that were already present.
      return;
    }
    const previousSet = new Set(previous);
    const added = orderedItemIds.filter((id) => !previousSet.has(id));
    if (added.length !== 1) {
      // Only the single-paste case gets the slide-in flourish.
      return;
    }
    const node = stripContentRef.current?.querySelector<HTMLElement>(
      `[data-strip-item-id="${added[0]}"]`,
    );
    if (!node || typeof node.animate !== "function") {
      return;
    }
    const slotStride = THUMB_WIDTH + STRIP_ITEM_GAP;
    node.animate(
      [
        { transform: `translateX(-${slotStride}px)`, opacity: 0.4 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [orderedItemIds, stripId]);

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

  const content =
    orderedItems.length || showCharacterPlaceholder ? (
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
        {showCharacterStack && (
          <CharacterStackThumb
            stripId={stripId}
            imageIds={orderedItemIds}
            frontImage={orderedItems[0] || null}
            onSelect={() => onSelect(orderedItemIds[0])}
          />
        )}
        {showCharacterPlaceholder && onAddCharacterImage && (
          <CharacterPastePlaceholder onAddImage={onAddCharacterImage} />
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
                isPreviewSelected={previewSelectionIdSet.has(item.id)}
                previewModifierActive={previewModifierActive}
                allowRemove={allowRemove}
                removeDisabledReason={removeDisabledReasonById?.[item.id]}
                isAnyDndDragging={isAnyDndDragging}
                onSelect={() => onSelect(item.id)}
                onToggleStar={() => onToggleStar(item.id)}
                onRename={onRenameItem ? (name) => onRenameItem(item.id, name) : undefined}
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
              isPreviewSelected={previewSelectionIdSet.has(item.id)}
              previewModifierActive={previewModifierActive}
              allowRemove={allowRemove}
              removeDisabledReason={removeDisabledReasonById?.[item.id]}
              isAnyDndDragging={isAnyDndDragging}
              onSelect={() => onSelect(item.id)}
              onToggleStar={() => onToggleStar(item.id)}
              onRename={onRenameItem ? (name) => onRenameItem(item.id, name) : undefined}
              onRemove={allowRemove ? () => onRemoveItem?.(item.id) : undefined}
            />
          ))
        )}

        {!orderedItems.length && emptyStateMessage && !showCharacterPlaceholder && (
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
