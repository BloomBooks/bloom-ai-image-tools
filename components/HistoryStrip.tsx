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
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (popoverRef.current && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      // Position the popover above the card, centered
      popoverRef.current.style.left = `${rect.left + rect.width / 2}px`;
      popoverRef.current.style.top = `${rect.top - 12}px`;
      popoverRef.current.showPopover();
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
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
        style={{
          position: "relative",
          flexShrink: 0,
          width: 112,
          cursor: "pointer",
          opacity: isSelected ? 1 : isHovered ? 1 : 0.85,
          transition: "opacity 150ms ease",
        }}
      >
        {/* Thumbnail Container */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: 12,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: isSelected
                ? theme.colors.accent
                : theme.colors.border,
              boxShadow: isSelected ? theme.colors.accentShadow : "none",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "inherit",
                overflow: "hidden",
              }}
            >
              <img
                src={item.imageData}
                alt="History item"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          </div>

          {/* Remove Button - inside thumbnail bounds to avoid clipping */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              padding: 4,
              borderRadius: 8,
              backgroundColor: theme.colors.overlay,
              color: theme.colors.textPrimary,
              border: "none",
              opacity: isHovered ? 1 : 0,
              transition: "opacity 120ms ease",
              backdropFilter: "blur(4px)",
              zIndex: 10,
            }}
            title="Remove from history"
          >
            <Icon path={Icons.X} width={12} height={12} />
          </button>
        </div>
      </div>

      {/* Native Popover - renders in top layer */}
      <div
        ref={popoverRef}
        popover="manual"
        style={{
          width: 224,
          border: `1px solid ${theme.colors.border}`,
          fontSize: "0.75rem",
          borderRadius: 12,
          padding: 16,
          position: "fixed",
          transform: "translate(-50%, -100%)",
          backgroundColor: theme.colors.surfaceRaised,
          color: theme.colors.textPrimary,
        }}
      >
        <ImageInfoPanel item={item} />
        {/* Arrow */}
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translate(-50%, -100%)",
            width: 0,
            height: 0,
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: `4px solid ${theme.colors.surfaceRaised}`,
          }}
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
      style={{
        height: 176,
        borderTop: `1px solid ${theme.colors.border}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
        backgroundColor: theme.colors.surface,
      }}
    >
      <div
        style={{
          padding: "4px 16px",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          position: "relative",
          zIndex: 0,
        }}
      >
        <button
          type="button"
          style={{
            padding: 6,
            borderRadius: "50%",
            border: `1px solid ${theme.colors.border}`,
            backgroundColor: "transparent",
            color: theme.colors.textMuted,
            fontSize: "0.75rem",
            transition: "opacity 120ms ease",
          }}
          title="You can drag these items to the above panels."
          aria-label="History strip drag instructions"
        >
          <Icon path={Icons.Info} width={16} height={16} />
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          display: "flex",
          alignItems: "center",
          padding: "8px 16px",
          gap: 12,
          position: "relative",
        }}
      >
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
    </div>
  );
};
