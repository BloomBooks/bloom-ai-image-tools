import React, { useMemo } from "react";
import {
  HistoryItem,
  ThumbnailStripId,
  ThumbnailStripsSnapshot,
} from "../../types";
import {
  THUMBNAIL_STRIP_CONFIGS,
  THUMBNAIL_STRIP_ORDER,
} from "../../lib/thumbnailStrips";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { ThumbnailStripTabs } from "./ThumbnailStripTabs";

const EMPTY_MESSAGES: Partial<Record<ThumbnailStripId, string>> = {
  starred: "Star images to keep them handy.",
  reference: "Save frequently used reference images here.",
  environment: "Environment images supplied by host application.",
};

interface ThumbnailStripsCollectionProps {
  snapshot: ThumbnailStripsSnapshot;
  entries: HistoryItem[];
  selectedId: string | null;
  hasHiddenHistory: boolean;
  onRequestHistoryAccess: () => void;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onRemoveFromStrip: (stripId: ThumbnailStripId, id: string) => void;
  onDropToStrip: (
    stripId: ThumbnailStripId,
    dropIndex: number,
    draggedId: string | null,
    event: React.DragEvent
  ) => void;
  onActivateStrip: (stripId: ThumbnailStripId) => void;
  onTogglePin: (stripId: ThumbnailStripId) => void;
  onDragActivateStrip: (stripId: ThumbnailStripId) => void;
}

export const ThumbnailStripsCollection: React.FC<ThumbnailStripsCollectionProps> = ({
  snapshot,
  entries,
  selectedId,
  hasHiddenHistory,
  onRequestHistoryAccess,
  onSelect,
  onToggleStar,
  onRemoveFromStrip,
  onDropToStrip,
  onActivateStrip,
  onTogglePin,
  onDragActivateStrip,
}) => {
  const entriesById = useMemo(() => {
    return entries.reduce<Record<string, HistoryItem>>((acc, entry) => {
      acc[entry.id] = entry;
      return acc;
    }, {});
  }, [entries]);

  const pinnedStripIds = THUMBNAIL_STRIP_ORDER.filter((id) =>
    snapshot.pinnedStripIds.includes(id)
  );

  const unpinnedStripIds = THUMBNAIL_STRIP_ORDER.filter(
    (id) => !snapshot.pinnedStripIds.includes(id)
  );

  const primaryStripId = unpinnedStripIds.length
    ? unpinnedStripIds.includes(snapshot.activeStripId)
      ? snapshot.activeStripId
      : unpinnedStripIds[0]
    : null;

  const renderStrip = (stripId: ThumbnailStripId) => {
    const config = THUMBNAIL_STRIP_CONFIGS[stripId];
    const itemIds = snapshot.itemIdsByStrip[stripId] || [];
    return (
      <ThumbnailStrip
        key={stripId}
        stripId={stripId}
        itemIds={itemIds}
        itemsById={entriesById}
        selectedId={selectedId}
        allowDrop={config.allowDrop}
        allowRemove={config.allowRemove}
        allowReorder={config.allowReorder}
        pinned={snapshot.pinnedStripIds.includes(stripId)}
        hasHiddenHistory={stripId === "history" && hasHiddenHistory}
        onRequestHistoryAccess={
          stripId === "history" ? onRequestHistoryAccess : undefined
        }
        emptyStateMessage={EMPTY_MESSAGES[stripId]}
        onSelect={onSelect}
        onToggleStar={onToggleStar}
        onRemoveItem={(id) => onRemoveFromStrip(stripId, id)}
        onItemDropped={(targetStripId, dropIndex, draggedId, event) =>
          onDropToStrip(targetStripId, dropIndex, draggedId, event)
        }
      />
    );
  };

  const rowShellStyles: React.CSSProperties = {
    display: "flex",
    gap: 12,
    alignItems: "stretch",
    width: "100%",
  };

  const stripColumnStyles: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {pinnedStripIds.map((stripId) => (
        <div key={`pinned-${stripId}`} style={rowShellStyles}>
          <div style={stripColumnStyles}>{renderStrip(stripId)}</div>
          <ThumbnailStripTabs
            snapshot={snapshot}
            stripIds={[stripId]}
            variant="compact"
            activeStripId={
              snapshot.activeStripId === stripId ? stripId : null
            }
            onActivate={onActivateStrip}
            onTogglePin={onTogglePin}
            onDragActivate={onDragActivateStrip}
          />
        </div>
      ))}

      {primaryStripId && (
        <div style={rowShellStyles}>
          <div style={stripColumnStyles}>{renderStrip(primaryStripId)}</div>
          <ThumbnailStripTabs
            snapshot={snapshot}
            stripIds={unpinnedStripIds}
            activeStripId={primaryStripId}
            onActivate={onActivateStrip}
            onTogglePin={onTogglePin}
            onDragActivate={onDragActivateStrip}
          />
        </div>
      )}
    </div>
  );
};
