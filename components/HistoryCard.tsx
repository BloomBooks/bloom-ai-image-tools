import React, { useEffect, useRef } from "react";
import { HistoryItem } from "../types";
import { TOOLS } from "../tools/registry";
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
  const tool = TOOLS.find((t) => t.id === item.toolId);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    popoverRef.current?.hidePopover();
  }, []);

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
        className="
          relative group flex-shrink-0 w-32 cursor-pointer transition-all duration-200
          hover:scale-105 opacity-70 hover:opacity-100
        "
      >
        {/* Thumbnail Container */}
        <div className="relative w-full aspect-square">
          <div
            className="relative rounded-lg border-2 w-full h-full"
            style={{
              borderColor: theme.colors.border,
              boxShadow: "none",
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

          {/* Tool Icon Overlay */}
          {tool && (
            <div
              className="absolute bottom-1 right-1 backdrop-blur-sm p-1 rounded"
              style={{
                backgroundColor: theme.colors.overlay,
                color: theme.colors.textPrimary,
              }}
            >
              <Icon path={tool.icon} className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>

      {/* Native Popover - renders in top layer */}
      <div
        ref={popoverRef}
        popover="manual"
        className="border text-xs rounded-lg shadow-2xl p-4 m-0"
        style={{
          position: "fixed",
          transform: "translate(-50%, -100%)",
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          color: theme.colors.textPrimary,
          width: "max-content",
          maxWidth: "calc(100vw - 32px)",
          overflow: "visible",
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
