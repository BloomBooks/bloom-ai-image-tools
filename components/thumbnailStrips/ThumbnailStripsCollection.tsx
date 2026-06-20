import React, { useMemo } from "react";
import { ImageRecord, ThumbnailStripId, ThumbnailStripsSnapshot } from "../../types";
import {
  getOtherStripsContainingItem,
  STRIP_TIPS,
  THUMBNAIL_STRIP_ORDER,
  ThumbnailStripConfig,
  THUMBNAIL_STRIP_CONFIGS,
} from "../../lib/thumbnailStrips";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { ThumbnailStripTabs } from "./ThumbnailStripTabs";

interface ThumbnailStripsCollectionProps {
  snapshot: ThumbnailStripsSnapshot;
  entries: ImageRecord[];
  replacementItemsByIncomingId?: Record<string, ImageRecord | null>;
  bookImagesAction?: {
    label: string;
    testId?: string;
    disabled?: boolean;
    onClick: () => void;
  };
  selectedId: string | null;
  previewModifierActive?: boolean;
  previewSelectionImageIds?: string[];
  stripConfigs?: Record<ThumbnailStripId, ThumbnailStripConfig>;
  onOpenPreview: (stripId: ThumbnailStripId, itemIds: string[]) => void;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onRenameItem?: (id: string, name: string) => void;
  onRemoveFromStrip: (stripId: ThumbnailStripId, id: string) => void;
  onAddCharacterImage?: (file: File) => void;
  onAssignReplacement?: (incomingId: string, replacementId: string | null) => void;
  onAssignCurrent?: (incomingId: string | null, currentImageId: string) => void;
  hasHiddenHistory: boolean;
  onRequestHistoryAccess: () => void;
  onDropToStrip: (
    stripId: ThumbnailStripId,
    dropIndex: number,
    draggedId: string | null,
    event?: React.DragEvent | null,
  ) => void;
  onVisibleItemIdsChange: (stripId: ThumbnailStripId, visibleItemIds: string[]) => void;
  onActivateStrip: (stripId: ThumbnailStripId) => void;
  onTogglePin: (stripId: ThumbnailStripId) => void;
  onDragActivateStrip: (stripId: ThumbnailStripId) => void;
  isAnyDndDragging?: boolean;
}

export const ThumbnailStripsCollection: React.FC<ThumbnailStripsCollectionProps> = ({
  snapshot,
  entries,
  replacementItemsByIncomingId = {},
  bookImagesAction,
  selectedId,
  previewModifierActive = false,
  previewSelectionImageIds = [],
  stripConfigs,
  onOpenPreview,
  onSelect,
  onToggleStar,
  onRenameItem,
  onRemoveFromStrip,
  onAddCharacterImage,
  onAssignReplacement,
  onAssignCurrent,
  hasHiddenHistory,
  onRequestHistoryAccess,
  onDropToStrip: _onDropToStrip,
  onVisibleItemIdsChange,
  onActivateStrip,
  onTogglePin,
  onDragActivateStrip,
  isAnyDndDragging = false,
}) => {
  const resolvedStripConfigs = stripConfigs ?? THUMBNAIL_STRIP_CONFIGS;
  const pinnedStripIds = new Set(snapshot.pinnedStripIds);

  const entriesById = useMemo(() => {
    const map: Record<string, ImageRecord> = {};
    for (const entry of entries) {
      map[entry.id] = entry;
    }
    return map;
  }, [entries]);

  const isStripVisible = (stripId: ThumbnailStripId) => !resolvedStripConfigs[stripId]?.hidden;

  const visiblePinnedStripIds = THUMBNAIL_STRIP_ORDER.filter(
    (id) => pinnedStripIds.has(id) && isStripVisible(id),
  );

  const unpinnedStripIds = THUMBNAIL_STRIP_ORDER.filter(
    (id) => !pinnedStripIds.has(id) && isStripVisible(id),
  );

  const activeUnpinnedStripId = unpinnedStripIds.length
    ? unpinnedStripIds.includes(snapshot.activeStripId)
      ? snapshot.activeStripId
      : unpinnedStripIds[0]
    : null;

  const historyRemoveDisabledReasonById = useMemo(() => {
    const reasons: Record<string, string> = {};
    const historyItemIds = snapshot.itemIdsByStrip.history || [];

    const formatStripNames = (stripIds: ThumbnailStripId[]) => {
      const labels = stripIds.map((stripId) => `${resolvedStripConfigs[stripId].label} strip`);
      if (labels.length <= 1) {
        return labels[0] || "another strip";
      }
      if (labels.length === 2) {
        return `${labels[0]} and ${labels[1]}`;
      }
      return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
    };

    historyItemIds.forEach((itemId) => {
      const otherStripIds = getOtherStripsContainingItem(snapshot, "history", itemId);
      if (otherStripIds.length === 0) {
        return;
      }

      reasons[itemId] =
        `Cannot delete this image because it also exists in the ${formatStripNames(otherStripIds)}.`;
    });

    return reasons;
  }, [resolvedStripConfigs, snapshot]);

  const renderStrip = (stripId: ThumbnailStripId, activeOverride?: boolean) => {
    const config = resolvedStripConfigs[stripId];
    const itemIds = snapshot.itemIdsByStrip[stripId] || [];
    const tipSource = STRIP_TIPS[stripId];
    const tip = typeof tipSource === "function" ? tipSource(config) : tipSource;

    return (
      <ThumbnailStrip
        key={stripId}
        stripId={stripId}
        itemIds={itemIds}
        itemsById={entriesById}
        removeDisabledReasonById={
          stripId === "history" ? historyRemoveDisabledReasonById : undefined
        }
        replacementItemsByIncomingId={replacementItemsByIncomingId}
        bookImagesAction={stripId === "bookImages" ? bookImagesAction : undefined}
        selectedId={selectedId}
        previewModifierActive={previewModifierActive}
        previewSelectionImageIds={previewSelectionImageIds}
        allowDrop={config.allowDrop}
        allowRemove={config.allowRemove}
        allowReorder={config.allowReorder}
        pinned={pinnedStripIds.has(stripId)}
        isActive={activeOverride ?? snapshot.activeStripId === stripId}
        hasHiddenHistory={stripId === "history" && hasHiddenHistory}
        onRequestHistoryAccess={stripId === "history" ? onRequestHistoryAccess : undefined}
        tip={tip}
        onOpenPreview={onOpenPreview}
        onSelect={onSelect}
        onToggleStar={onToggleStar}
        onRenameItem={onRenameItem}
        onRemoveItem={(id) => onRemoveFromStrip(stripId, id)}
        onAddCharacterImage={stripId === "characters" ? onAddCharacterImage : undefined}
        onAssignReplacement={onAssignReplacement}
        onAssignCurrent={onAssignCurrent}
        onVisibleItemIdsChange={onVisibleItemIdsChange}
        isAnyDndDragging={isAnyDndDragging}
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
    // Lay the column out as a flex column so the active panel can grow to fill
    // the row's height. The row stretches to the tab rail (which is naturally
    // as tall as all its tabs combined), and the panel follows — no height math.
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
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
      {visiblePinnedStripIds.map((stripId) => (
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
            {unpinnedStripIds.map((stripId) => {
              const isActive = stripId === activeUnpinnedStripId;
              return (
                <div
                  key={`unpinned-${stripId}`}
                  style={
                    isActive
                      ? { display: "flex", flexDirection: "column", flex: 1 }
                      : { display: "none" }
                  }
                >
                  {renderStrip(stripId, isActive)}
                </div>
              );
            })}
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
