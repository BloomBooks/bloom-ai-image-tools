import React, { useMemo } from "react";
import { Tooltip } from "@mui/material";
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
  replacementItemsByIncomingId?: Record<string, ImageRecord | null>;
  bookImagesAction?: {
    label: string;
    testId?: string;
    disabled?: boolean;
    onClick: () => void;
  };
  removeDisabledReasonById?: Partial<Record<string, string>>;
  selectedId: string | null;
  previewModifierActive?: boolean;
  previewSelectionImageIds?: string[];
  allowDrop: boolean;
  allowRemove: boolean;
  allowReorder: boolean;
  pinned: boolean;
  isActive?: boolean;
  emptyStateMessage?: string;
  onOpenPreview?: (stripId: ThumbnailStripId, itemIds: string[]) => void;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onRenameItem?: (id: string, name: string) => void;
  onRemoveItem?: (id: string) => void;
  // When provided on the "characters" strip, renders a paste/upload placeholder
  // that adds a pasted (or picked) image as a new character.
  onAddCharacterImage?: (file: File) => void;
  onAssignReplacement?: (incomingId: string, replacementId: string | null) => void;
  onAssignCurrent?: (incomingId: string | null, currentImageId: string) => void;
  hasHiddenHistory?: boolean;
  onRequestHistoryAccess?: () => void;
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
const BOOK_IMAGE_PAIR_WIDTH = THUMB_WIDTH;
const BOOK_IMAGE_LABEL_COLUMN_WIDTH = 72;
const STRIP_ITEM_GAP = 12;
const STRIP_HORIZONTAL_PADDING = 16;
const STRIP_VISIBILITY_OVERSCAN_ITEMS = 2;

const buildStripItemId = (stripId: ThumbnailStripId, imageId: string) =>
  `stripItem:${stripId}:${imageId}`;

const buildStripContainerId = (stripId: ThumbnailStripId) => `strip:${stripId}`;
const buildStripStackId = (stripId: ThumbnailStripId) => `stripStack:${stripId}`;
const buildBookImageReplacementSlotId = (incomingId: string) =>
  `bookImageReplacement:${incomingId}`;
const buildBookImageCurrentSlotId = (incomingId: string | null) =>
  `bookImageCurrent:${incomingId ?? "new"}`;

const BOOK_IMAGE_PAIR_RADIUS = 0;

const ASPECT_RATIO_TOLERANCE = 0.05;

const formatResolution = (resolution: { width: number; height: number }) =>
  `${resolution.width}x${resolution.height}`;

const gcd = (left: number, right: number): number => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
};

const formatAspectRatio = (resolution: { width: number; height: number }) => {
  const divisor = gcd(resolution.width, resolution.height);
  return `${resolution.width / divisor}:${resolution.height / divisor}`;
};

const formatRatioComparison = (
  current: { width: number; height: number },
  replacement: { width: number; height: number },
) => {
  const useWidthScale = current.width >= current.height;
  if (useWidthScale) {
    const scaledReplacementHeight = Math.round(
      (current.width * replacement.height) / replacement.width,
    );
    return `${current.width}:${current.height} to ${current.width}:${scaledReplacementHeight} (${formatAspectRatio(replacement)})`;
  }

  const scaledReplacementWidth = Math.round(
    (current.height * replacement.width) / replacement.height,
  );
  return `${current.width}:${current.height} to ${scaledReplacementWidth}:${current.height} (${formatAspectRatio(replacement)})`;
};

type CompatibilityIndicator = {
  kind: "aspect" | "resolution";
  level: "info" | "warning";
  message: string;
};

const CompatibilityBadgeGlyph: React.FC<{
  kind: CompatibilityIndicator["kind"];
}> = ({ kind }) => {
  if (kind === "aspect") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        aria-hidden="true"
        style={{ display: "block" }}
      >
        <rect
          x="4"
          y="6"
          width="8"
          height="12"
          rx="1"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="13"
          y="9"
          width="7"
          height="8"
          rx="1"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ display: "block" }}>
      <rect x="4" y="4" width="4" height="4" fill="currentColor" />
      <rect x="10" y="4" width="4" height="4" fill="currentColor" opacity="0.8" />
      <rect x="16" y="4" width="4" height="4" fill="currentColor" opacity="0.6" />
      <rect x="4" y="10" width="4" height="4" fill="currentColor" opacity="0.8" />
      <rect x="10" y="10" width="4" height="4" fill="currentColor" />
      <rect x="16" y="10" width="4" height="4" fill="currentColor" opacity="0.8" />
      <rect x="4" y="16" width="4" height="4" fill="currentColor" opacity="0.6" />
      <rect x="10" y="16" width="4" height="4" fill="currentColor" opacity="0.8" />
      <rect x="16" y="16" width="4" height="4" fill="currentColor" />
    </svg>
  );
};

const getReplacementCompatibilityIndicators = (
  current: ImageRecord,
  replacement: ImageRecord | null,
): CompatibilityIndicator[] => {
  if (!replacement?.resolution || !current.resolution) {
    return [];
  }

  const currentAspect = current.resolution.width / current.resolution.height;
  const replacementAspect = replacement.resolution.width / replacement.resolution.height;
  const aspectDelta =
    Math.max(currentAspect, replacementAspect) / Math.min(currentAspect, replacementAspect) - 1;
  const sameAspect = aspectDelta <= ASPECT_RATIO_TOLERANCE;
  const currentPixels = current.resolution.width * current.resolution.height;
  const replacementPixels = replacement.resolution.width * replacement.resolution.height;
  const indicators: CompatibilityIndicator[] = [];

  if (!sameAspect) {
    indicators.push({
      kind: "aspect",
      level: "warning",
      message: `Aspect ratio changed from ${formatRatioComparison(current.resolution, replacement.resolution)}.`,
    });
  }

  if (replacementPixels < currentPixels) {
    indicators.push({
      kind: "resolution",
      level: "warning",
      message: `Resolution decreased from ${formatResolution(current.resolution)} to ${formatResolution(replacement.resolution)}.`,
    });
  }

  if (!indicators.length && sameAspect && replacementPixels > currentPixels) {
    indicators.push({
      kind: "resolution",
      level: "info",
      message: `Resolution increased from ${formatResolution(current.resolution)} to ${formatResolution(replacement.resolution)} while keeping the same aspect ratio (${formatAspectRatio(current.resolution)}).`,
    });
  }

  return indicators;
};

const BookImageStripLabels: React.FC = () => (
  <div
    style={{
      position: "sticky",
      left: 0,
      zIndex: 1,
      width: BOOK_IMAGE_LABEL_COLUMN_WIDTH,
      flexShrink: 0,
      marginRight: 12,
      display: "grid",
      gridTemplateRows: "1fr 1fr",
      gap: 8,
      alignSelf: "stretch",
      paddingTop: 10,
      paddingBottom: 10,
      background: `linear-gradient(90deg, ${theme.colors.surface} 0%, ${theme.colors.surface} 85%, transparent 100%)`,
    }}
  >
    {(["Current", "Replacement"] as const).map((label) => (
      <div
        key={label}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          color: theme.colors.textMuted,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          textAlign: "left",
        }}
      >
        {label}
      </div>
    ))}
  </div>
);

const EditableBookImageEmptyPair: React.FC<{
  isAnyDndDragging?: boolean;
}> = ({ isAnyDndDragging = false }) => {
  const currentDroppable = useDroppable({
    id: buildBookImageCurrentSlotId(null),
    data: {
      kind: "book-image-current",
      incomingId: null,
    },
  });

  return (
    <div
      data-testid="thumbnail-strip-item-bookImages-empty"
      style={{
        width: BOOK_IMAGE_PAIR_WIDTH,
        flexShrink: 0,
        display: "flex",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          borderRadius: BOOK_IMAGE_PAIR_RADIUS,
          overflow: "hidden",
          border: `1px solid ${theme.colors.border}`,
          backgroundColor: theme.colors.surface,
          boxShadow: theme.colors.panelShadow,
        }}
      >
        <div
          ref={currentDroppable.setNodeRef}
          data-testid="book-image-current-slot-new"
          style={{
            padding: 6,
            backgroundColor: currentDroppable.isOver ? theme.colors.dropZone : theme.colors.surface,
          }}
        >
          <ImageSlot
            image={null}
            variant="thumb"
            isAnyDndDragging={isAnyDndDragging}
            controls={{
              upload: false,
              paste: false,
              copy: false,
              download: false,
              remove: false,
            }}
            renderEmptyState={() => <div style={{ width: "100%", height: "100%" }} />}
          />
        </div>
        <div
          style={{
            padding: 6,
            borderTop: `1px solid ${theme.colors.border}`,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          <ImageSlot
            image={null}
            variant="thumb"
            isAnyDndDragging={isAnyDndDragging}
            controls={{
              upload: false,
              paste: false,
              copy: false,
              download: false,
              remove: false,
            }}
            renderEmptyState={() => <div style={{ width: "100%", height: "100%" }} />}
          />
        </div>
      </div>
    </div>
  );
};

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

const BookImagePairThumb: React.FC<{
  stripId: ThumbnailStripId;
  item: ImageRecord;
  replacement: ImageRecord | null;
  isSelected: boolean;
  isReplacementSelected: boolean;
  isPreviewSelected: boolean;
  previewModifierActive: boolean;
  allowRemove: boolean;
  removeDisabledReason?: string;
  isAnyDndDragging?: boolean;
  onSelect: () => void;
  onSelectReplacement: () => void;
  onToggleStar: () => void;
  onRemove?: () => void;
  onClearReplacement: () => void;
}> = ({
  stripId,
  item,
  replacement,
  isSelected,
  isReplacementSelected,
  isPreviewSelected,
  previewModifierActive,
  allowRemove,
  removeDisabledReason: _removeDisabledReason,
  isAnyDndDragging = false,
  onSelect,
  onSelectReplacement,
  onRemove,
  onClearReplacement,
}) => {
  const currentDroppable = useDroppable({
    id: buildBookImageCurrentSlotId(item.id),
    data: {
      kind: "book-image-current",
      incomingId: item.id,
    },
    disabled: !allowRemove,
  });
  const currentDraggable = useDraggable({
    id: `bookImageCurrentItem:${item.id}`,
    data: {
      kind: "image",
      imageId: item.id,
      source: { type: "book-image-current", incomingId: item.id },
    },
  });
  const outgoingDroppable = useDroppable({
    id: buildBookImageReplacementSlotId(item.id),
    data: {
      kind: "book-image-replacement",
      incomingId: item.id,
    },
  });
  const outgoingDraggable = useDraggable({
    id: `bookImageReplacementItem:${item.id}`,
    disabled: !replacement,
    data: replacement
      ? {
          kind: "image",
          imageId: replacement.id,
          source: { type: "book-image-replacement", incomingId: item.id },
        }
      : undefined,
  });

  const setOutgoingNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      outgoingDroppable.setNodeRef(node);
      outgoingDraggable.setNodeRef(node);
    },
    [outgoingDraggable, outgoingDroppable],
  );

  const setCurrentNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      currentDroppable.setNodeRef(node);
      currentDraggable.setNodeRef(node);
    },
    [currentDraggable, currentDroppable],
  );

  return (
    <div
      data-testid={`thumbnail-strip-item-${stripId}`}
      data-strip-item-id={item.id}
      style={{
        width: BOOK_IMAGE_PAIR_WIDTH,
        flexShrink: 0,
        display: "flex",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: BOOK_IMAGE_PAIR_RADIUS,
          overflow: "hidden",
          border: `1px solid ${theme.colors.border}`,
          backgroundColor: theme.colors.surface,
          boxShadow: theme.colors.panelShadow,
        }}
      >
        <div
          ref={setCurrentNodeRef}
          data-testid={`book-image-current-slot-${item.id}`}
          {...currentDraggable.attributes}
          {...currentDraggable.listeners}
          style={{
            padding: 6,
            backgroundColor: currentDroppable.isOver
              ? theme.colors.dropZone
              : isSelected
                ? theme.colors.accentSubtle
                : theme.colors.surface,
            cursor: "grab",
            opacity: currentDraggable.isDragging ? 0.35 : 1,
          }}
        >
          <ImageSlot
            image={item}
            variant="thumb"
            borderless
            isAnyDndDragging={isAnyDndDragging}
            previewModifierActive={previewModifierActive}
            previewSelected={isPreviewSelected}
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
          />
        </div>
        <div
          data-testid={`book-image-outgoing-slot-${item.id}`}
          ref={setOutgoingNodeRef}
          {...outgoingDraggable.attributes}
          {...outgoingDraggable.listeners}
          style={{
            position: "relative",
            padding: 6,
            backgroundColor: outgoingDroppable.isOver
              ? theme.colors.dropZone
              : theme.colors.surfaceAlt,
            cursor: replacement ? "grab" : "default",
            opacity: outgoingDraggable.isDragging ? 0.35 : 1,
          }}
        >
          {(() => {
            const indicators = getReplacementCompatibilityIndicators(item, replacement);
            if (!indicators.length) {
              return null;
            }

            return (
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  right: 12,
                  zIndex: 2,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 6,
                }}
              >
                {indicators.map((indicator) => {
                  const badgeColor =
                    indicator.level === "warning" ? theme.colors.danger : theme.colors.accent;

                  return (
                    <Tooltip
                      key={`${indicator.kind}-${indicator.level}`}
                      title={indicator.message}
                      arrow
                      placement="top"
                    >
                      <div
                        data-testid={`book-image-replacement-compatibility-${item.id}-${indicator.kind}`}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: badgeColor,
                          backgroundColor: theme.colors.overlayStrong,
                          boxShadow: theme.colors.insetShadow,
                          pointerEvents: "auto",
                        }}
                      >
                        <CompatibilityBadgeGlyph kind={indicator.kind} />
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            );
          })()}
          <ImageSlot
            image={replacement}
            variant="thumb"
            borderless={!!replacement}
            isAnyDndDragging={isAnyDndDragging}
            previewModifierActive={false}
            previewSelected={false}
            dataTestId={replacement ? "history-card" : undefined}
            onClick={replacement ? onSelectReplacement : undefined}
            isSelected={isReplacementSelected}
            draggableImageId={undefined}
            onRemove={replacement ? onClearReplacement : undefined}
            controls={{
              upload: false,
              paste: false,
              copy: !!replacement,
              download: !!replacement,
              remove: !!replacement,
            }}
            renderEmptyState={() => (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                }}
              />
            )}
          />
        </div>
      </div>
    </div>
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
  replacementItemsByIncomingId = {},
  bookImagesAction,
  removeDisabledReasonById,
  selectedId,
  previewModifierActive = false,
  previewSelectionImageIds = [],
  allowDrop,
  allowRemove,
  allowReorder,
  pinned,
  isActive = false,
  emptyStateMessage,
  onOpenPreview,
  onSelect,
  onToggleStar,
  onRenameItem,
  onRemoveItem,
  onAddCharacterImage,
  onAssignReplacement,
  hasHiddenHistory = false,
  onRequestHistoryAccess,
  onVisibleItemIdsChange,
  isAnyDndDragging = false,
}) => {
  const stripContentRef = React.useRef<HTMLDivElement | null>(null);
  const lastPublishedVisibleIdsRef = React.useRef<string[] | null>(null);
  const [isBookImagesActionPressed, setIsBookImagesActionPressed] = React.useState(false);
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

  const canOpenPreview = orderedItemIds.length > 0 && !!onOpenPreview;

  const publishVisibleItemIds = React.useCallback(
    (visibleItemIds: string[]) => {
      if (!onVisibleItemIdsChange) {
        return;
      }

      const deduped = visibleItemIds.filter((id, index, ids) => ids.indexOf(id) === index);
      const lastPublished = lastPublishedVisibleIdsRef.current;
      const isUnchanged =
        !!lastPublished &&
        lastPublished.length === deduped.length &&
        lastPublished.every((id, index) => id === deduped[index]);

      if (isUnchanged) {
        return;
      }

      lastPublishedVisibleIdsRef.current = deduped;
      onVisibleItemIdsChange(stripId, deduped);
    },
    [onVisibleItemIdsChange, stripId],
  );

  React.useEffect(() => {
    if (!onVisibleItemIdsChange) {
      return;
    }

    return () => {
      lastPublishedVisibleIdsRef.current = null;
      onVisibleItemIdsChange(stripId, []);
    };
  }, [onVisibleItemIdsChange, stripId]);

  React.useEffect(() => {
    if (!onVisibleItemIdsChange) {
      return;
    }

    const node = stripContentRef.current;
    if (!node) {
      publishVisibleItemIds(orderedItemIds);
      return;
    }

    const publishVisibleIds = () => {
      if (orderedItemIds.length === 0) {
        publishVisibleItemIds([]);
        return;
      }

      const itemWidth = stripId === "bookImages" ? BOOK_IMAGE_PAIR_WIDTH : THUMB_WIDTH;
      const stride = itemWidth + STRIP_ITEM_GAP;
      const visibleWidth = Math.max(itemWidth, node.clientWidth - STRIP_HORIZONTAL_PADDING * 2);
      const startIndex = Math.max(
        0,
        Math.floor(node.scrollLeft / stride) - STRIP_VISIBILITY_OVERSCAN_ITEMS,
      );
      const visibleCount = Math.max(
        1,
        Math.ceil(visibleWidth / stride) + STRIP_VISIBILITY_OVERSCAN_ITEMS * 2,
      );
      const endIndex = Math.min(orderedItemIds.length, startIndex + visibleCount);
      publishVisibleItemIds(orderedItemIds.slice(startIndex, endIndex));
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
  }, [onVisibleItemIdsChange, orderedItemIds, publishVisibleItemIds, stripId]);

  const content =
    orderedItems.length || showCharacterPlaceholder ? (
      <div
        ref={setStripContentNodeRef}
        style={{
          display: "flex",
          alignItems: stripId === "bookImages" ? "stretch" : "center",
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
        {stripId === "bookImages" ? (
          <>
            <BookImageStripLabels />
            {orderedItems.map((item) => (
              <BookImagePairThumb
                key={`${stripId}-${item.id}`}
                stripId={stripId}
                item={item}
                replacement={replacementItemsByIncomingId[item.id] || null}
                isSelected={item.id === selectedId}
                isReplacementSelected={replacementItemsByIncomingId[item.id]?.id === selectedId}
                isPreviewSelected={previewSelectionIdSet.has(item.id)}
                previewModifierActive={previewModifierActive}
                allowRemove={allowRemove}
                removeDisabledReason={removeDisabledReasonById?.[item.id]}
                isAnyDndDragging={isAnyDndDragging}
                onSelect={() => onSelect(item.id)}
                onSelectReplacement={() => {
                  const replacement = replacementItemsByIncomingId[item.id];
                  if (replacement) {
                    onSelect(replacement.id);
                  }
                }}
                onToggleStar={() => onToggleStar(item.id)}
                onRemove={allowRemove ? () => onRemoveItem?.(item.id) : undefined}
                onClearReplacement={() => onAssignReplacement?.(item.id, null)}
              />
            ))}
            {allowDrop ? <EditableBookImageEmptyPair isAnyDndDragging={isAnyDndDragging} /> : null}
          </>
        ) : allowReorder ? (
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
      <Tooltip title="Show in full-screen gallery" arrow>
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 2,
            display: "inline-flex",
          }}
        >
          <button
            type="button"
            data-testid={`thumbnail-strip-expand-${stripId}`}
            aria-label={`Expand ${stripId} strip preview`}
            disabled={!canOpenPreview}
            onClick={() => {
              if (!canOpenPreview) {
                return;
              }

              onOpenPreview(stripId, orderedItemIds);
            }}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: 0,
              borderRadius: 999,
              backgroundColor: theme.colors.overlayStrong,
              color: theme.colors.textPrimary,
              cursor: canOpenPreview ? "pointer" : "default",
              opacity: canOpenPreview ? 1 : 0.45,
            }}
          >
            <Icon path={Icons.Expand} width={16} height={16} />
          </button>
        </span>
      </Tooltip>
      <div
        style={{
          paddingTop: 30,
          paddingBottom: stripId === "bookImages" && bookImagesAction ? 64 : 0,
        }}
      >
        {content}
      </div>
      {stripId === "bookImages" && bookImagesAction ? (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            zIndex: 3,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            data-testid={bookImagesAction.testId}
            disabled={bookImagesAction.disabled}
            onClick={bookImagesAction.onClick}
            onMouseDown={() => {
              if (!bookImagesAction.disabled) {
                setIsBookImagesActionPressed(true);
              }
            }}
            onMouseUp={() => setIsBookImagesActionPressed(false)}
            onMouseLeave={() => setIsBookImagesActionPressed(false)}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "10px 16px",
              backgroundColor: bookImagesAction.disabled
                ? "rgba(148, 163, 184, 0.35)"
                : theme.colors.accent,
              color: bookImagesAction.disabled ? theme.colors.textMuted : theme.colors.textOnAccent,
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.2,
              boxShadow: theme.colors.panelShadow,
              cursor: bookImagesAction.disabled ? "not-allowed" : "pointer",
              transform: isBookImagesActionPressed ? "translateY(1px) scale(0.99)" : "none",
              transition:
                "transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease, color 120ms ease",
            }}
          >
            {bookImagesAction.label}
          </button>
        </div>
      ) : null}
    </div>
  );
};
