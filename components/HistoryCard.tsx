import React from "react";
import { ImageRecord } from "../types";
import { ImageSlot } from "./ImageSlot";

interface HistoryCardProps {
  item: ImageRecord;
  isSelected?: boolean;
  isStarred?: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onRemove?: () => void;
  onToggleStar: () => void;
}

// Individual history card with its own popover
export const HistoryCard: React.FC<HistoryCardProps> = ({
  item,
  isSelected = false,
  isStarred = false,
  onSelect,
  onDragStart,
  onRemove,
  onToggleStar,
}) => {
  return (
    <div style={{ width: 112, flexShrink: 0 }}>
      <ImageSlot
        image={item}
        variant="thumb"
        dataTestId="history-card"
        onClick={onSelect}
        isSelected={isSelected}
        draggableImageId={item.id}
        onImageDragStart={onDragStart}
        controls={{
          upload: false,
          paste: false,
          copy: true,
          download: true,
          remove: Boolean(onRemove),
        }}
        onRemove={onRemove}
        starState={{ isStarred, onToggle: onToggleStar }}
      />
    </div>
  );
};
