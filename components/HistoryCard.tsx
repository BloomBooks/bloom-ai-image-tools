import React, { useEffect, useRef } from "react";
import { HistoryItem } from "../types";
import { theme } from "../themes";
import { Icon, Icons } from "./Icons";
import { ImageInfoPanel } from "./ImageInfoPanel";

interface HistoryCardProps {
  item: HistoryItem;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onRemove: () => void;
}

// Individual history card with its own popover
export const HistoryCard: React.FC<HistoryCardProps> = ({
  item,
  onSelect,
  onDragStart,
  onRemove,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  useEffect(() => {
    popoverRef.current?.hidePopover();
  }, []);

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
        style={{
          position: "relative",
          flexShrink: 0,
          width: 112,
          cursor: "pointer",
          opacity: isHovered ? 1 : 0.8,
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
              borderColor: theme.colors.border,
              boxShadow: "none",
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
          border: `1px solid ${theme.colors.border}`,
          fontSize: "0.75rem",
          borderRadius: 12,
          padding: 16,
          position: "fixed",
          transform: "translate(-50%, -100%)",
          backgroundColor: theme.colors.surfaceRaised,
          color: theme.colors.textPrimary,
          width: "max-content",
          maxWidth: "calc(100vw - 32px)",
          overflow: "visible",
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
