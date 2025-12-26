import React, { useMemo } from "react";
import {
  ImageRecord,
  ThumbnailStripId,
  ThumbnailStripsSnapshot,
} from "../../types";
import {
  THUMBNAIL_STRIP_ORDER,
  ThumbnailStripConfig,
  THUMBNAIL_STRIP_CONFIGS,
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
  entries: ImageRecord[];
  selectedId: string | null;
  stripConfigs?: Record<ThumbnailStripId, ThumbnailStripConfig>;
  hasHiddenHistory: boolean;
  onRequestHistoryAccess: () => void;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onRemoveFromStrip: (stripId: ThumbnailStripId, id: string) => void;
  onDropToStrip: (
    stripId: ThumbnailStripId,
    dropIndex: number,
    draggedId: string | null,
    event?: React.DragEvent | null
  ) => void;
  onActivateStrip: (stripId: ThumbnailStripId) => void;
  onTogglePin: (stripId: ThumbnailStripId) => void;
  onDragActivateStrip: (stripId: ThumbnailStripId) => void;
}

export const ThumbnailStripsCollection: React.FC<
  ThumbnailStripsCollectionProps
> = ({
  snapshot,
  entries,
  selectedId,
  stripConfigs,
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
  const resolvedStripConfigs = stripConfigs ?? THUMBNAIL_STRIP_CONFIGS;

  const entriesById = useMemo(() => {
    const map: Record<string, ImageRecord> = {};
    for (const entry of entries) {
      map[entry.id] = entry;
    }
    return map;
  }, [entries]);

  const pinnedStripIds = THUMBNAIL_STRIP_ORDER.filter((id) =>
    snapshot.pinnedStripIds.includes(id)
  );

  const unpinnedStripIds = THUMBNAIL_STRIP_ORDER.filter(
    (id) => !snapshot.pinnedStripIds.includes(id)
  );

  const activeUnpinnedStripId = unpinnedStripIds.length
    ? unpinnedStripIds.includes(snapshot.activeStripId)
      ? snapshot.activeStripId
      : unpinnedStripIds[0]
    : null;

  const renderStrip = (stripId: ThumbnailStripId, activeOverride?: boolean) => {
    const config = resolvedStripConfigs[stripId];
    const itemIds = snapshot.itemIdsByStrip[stripId] || [];
    const emptyStateMessage =
      stripId === "environment" && config.allowDrop
        ? "Drag images here to add book pages."
        : EMPTY_MESSAGES[stripId];

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
        isActive={activeOverride ?? snapshot.activeStripId === stripId}
        hasHiddenHistory={stripId === "history" && hasHiddenHistory}
        onRequestHistoryAccess={
          stripId === "history" ? onRequestHistoryAccess : undefined
        }
        emptyStateMessage={emptyStateMessage}
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
    gap: 0,
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
            activeStripId={snapshot.activeStripId === stripId ? stripId : null}
            onActivate={onActivateStrip}
            onTogglePin={onTogglePin}
            onDragActivate={onDragActivateStrip}
            stripConfigs={resolvedStripConfigs}
          />
        </div>
      ))}

      {activeUnpinnedStripId && (
        <div style={rowShellStyles}>
          <div style={stripColumnStyles}>
            {unpinnedStripIds.map((stripId) => (
              <div
                key={`unpinned-${stripId}`}
                style={{
                  display: stripId === activeUnpinnedStripId ? "block" : "none",
                }}
              >
                {renderStrip(stripId, stripId === activeUnpinnedStripId)}
              </div>
            ))}
          </div>
          <ThumbnailStripTabs
            snapshot={snapshot}
            stripIds={unpinnedStripIds}
            activeStripId={activeUnpinnedStripId}
            onActivate={onActivateStrip}
            onTogglePin={onTogglePin}
            onDragActivate={onDragActivateStrip}
            stripConfigs={resolvedStripConfigs}
          />
        </div>
      )}
    </div>
  );
};
