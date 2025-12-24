import React, { useRef } from "react";
import { HistoryItem } from "../types";
import { Icon, Icons } from "./Icons";
import { theme } from "../themes";
import { ImageInfoPanel } from "./ImageInfoPanel";
import { setInternalImageDragData } from "./dragConstants";

interface HistoryStripProps {
  items: HistoryItem[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  hasHiddenHistory?: boolean;
  onRequestHistoryAccess?: () => void;
}

// Individual history card with its own popover
const HistoryCard: React.FC<{
  item: HistoryItem;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onRemove: () => void;
}> = ({ item, isSelected, onSelect, onDragStart, onRemove }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (popoverRef.current && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      // Position the popover above the card, centered
      popoverRef.current.style.left = `${rect.left + rect.width / 2}px`;
      popoverRef.current.style.top = `${rect.top - 12}px`;
      popoverRef.current.showPopover();
    }
  };

  const handleMouseLeave = () => {
    popoverRef.current?.hidePopover();
  };

  return (
    <>
      <div
        ref={cardRef}
        onClick={onSelect}
        draggable
        onDragStart={onDragStart}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-testid="history-card"
        className={`
          relative group flex-shrink-0 w-28 cursor-pointer transition-opacity duration-200
          ${isSelected ? "opacity-100" : "opacity-80 hover:opacity-100"}
        `}
      >
        {/* Thumbnail Container */}
        <div className="relative w-full aspect-square">
          <div
            className="relative rounded-lg border-2 w-full h-full"
            style={{
              borderColor: isSelected
                ? theme.colors.accent
                : theme.colors.border,
              boxShadow: isSelected ? theme.colors.accentShadow : "none",
            }}
          >
            <div className="w-full h-full rounded-[inherit] overflow-hidden">
              <img
                src={item.imageData}
                alt="History item"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Remove Button - inside thumbnail bounds to avoid clipping */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-1 right-1 backdrop-blur-sm p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
            style={{
              backgroundColor: theme.colors.overlay,
              color: theme.colors.textPrimary,
            }}
            title="Remove from history"
          >
            <Icon path={Icons.X} className="w-3 h-3" />
          </button>

        </div>
      </div>

      {/* Native Popover - renders in top layer */}
      <div
        ref={popoverRef}
        popover="manual"
        className="w-56 border text-xs rounded-lg shadow-2xl p-4 m-0"
        style={{
          position: "fixed",
          transform: "translate(-50%, -100%)",
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          color: theme.colors.textPrimary,
        }}
      >
        <ImageInfoPanel item={item} />
        {/* Arrow */}
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent"
          style={{ borderTopColor: theme.colors.surfaceRaised }}
        />
      </div>
    </>
  );
};

export const HistoryStrip: React.FC<HistoryStripProps> = ({
  items,
  currentId,
  onSelect,
  onRemove,
  hasHiddenHistory = false,
  onRequestHistoryAccess,
}) => {
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setInternalImageDragData(e.dataTransfer, id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copyMove";
    }
  };

  // Show newest items closest to the workspace (leftmost slot).
  const newestFirst = [...items].reverse();

  return (
    <div
      className="h-44 border-t flex flex-col flex-shrink-0 z-10 relative"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div className="px-4 py-1 flex items-center justify-end relative z-0">
        <button
          type="button"
          className="p-1 rounded-full border text-xs hover:opacity-80 transition-opacity"
          style={{
            color: theme.colors.textMuted,
            borderColor: theme.colors.border,
            backgroundColor: "transparent",
          }}
          title="You can drag these items to the above panels."
          aria-label="History strip drag instructions"
        >
          <Icon path={Icons.Info} className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-clip flex items-center py-2 px-4 gap-3 custom-scrollbar relative">
        {newestFirst.map((item) => (
          <HistoryCard
            key={item.id}
            item={item}
            isSelected={item.id === currentId}
            onSelect={() => onSelect(item.id)}
            onDragStart={(e) => handleDragStart(e, item.id)}
            onRemove={() => onRemove(item.id)}
          />
        ))}
        {hasHiddenHistory && onRequestHistoryAccess && (
          <button
            type="button"
            onClick={onRequestHistoryAccess}
            className="flex flex-col justify-between items-start flex-shrink-0 w-44 h-36 border-2 border-dashed rounded-xl p-4 text-left hover:opacity-90 transition-opacity"
            style={{
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
              color: theme.colors.textPrimary,
              boxShadow: theme.colors.panelShadow,
            }}
          >
            <span className="text-sm font-semibold">
              More history available
            </span>
            <span className="text-xs text-left opacity-80">
              Connect to a folder on your computer for more history.
            </span>
            <span
              className="mt-2 inline-flex items-center gap-2 text-xs font-semibold"
              style={{ color: theme.colors.accent }}
            >
              <Icon path={Icons.Refresh} className="w-3.5 h-3.5" />
              Reconnect folder
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
