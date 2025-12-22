import React, { useRef } from "react";
import { HistoryItem } from "../types";
import { Icon } from "./Icons";
import { TOOLS } from "../tools/registry";
import { theme } from "../themes";

// Extend React's type definitions for the Popover API
declare module "react" {
  interface HTMLAttributes<T> {
    popover?: "auto" | "manual" | "";
  }
}

interface HistoryStripProps {
  items: HistoryItem[];
  currentId: string | null;
  onSelect: (id: string) => void;
}

// Tooltip content component for cleaner rendering
const TooltipContent: React.FC<{ item: HistoryItem }> = ({ item }) => {
  const tool = TOOLS.find((t) => t.id === item.toolId);
  const timeString = new Date(item.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div
        className="font-bold text-sm mb-2 border-b pb-2"
        style={{
          color: theme.colors.textPrimary,
          borderColor: theme.colors.border,
        }}
      >
        {tool?.title || "Original Image"}
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span style={{ color: theme.colors.textMuted }}>Tool:</span>
          <span
            style={{ color: theme.colors.textSecondary }}
            className="font-medium"
          >
            {tool?.title || "Import"}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: theme.colors.textMuted }}>Model:</span>
          <span style={{ color: theme.colors.textSecondary }}>
            {tool ? "OpenRouter (gpt-image-1)" : "N/A"}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: theme.colors.textMuted }}>Duration:</span>
          <span style={{ color: theme.colors.textSecondary }}>
            {item.durationMs > 0
              ? (item.durationMs / 1000).toFixed(2) + "s"
              : "N/A"}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: theme.colors.textMuted }}>Created:</span>
          <span style={{ color: theme.colors.textSecondary }}>{timeString}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: theme.colors.textMuted }}>Cost:</span>
          <span className="font-mono" style={{ color: tool ? theme.colors.success : theme.colors.textSecondary }}>
            {tool ? `$${item.cost.toFixed(4)}` : "N/A"}
          </span>
        </div>
        {item.resolution && (
          <div className="flex justify-between">
            <span style={{ color: theme.colors.textMuted }}>Resolution:</span>
            <span style={{ color: theme.colors.textSecondary }}>
              {item.resolution.width} x {item.resolution.height}
            </span>
          </div>
        )}

        {/* Show Parameters if any exist */}
        {Object.keys(item.parameters).length > 0 && (
          <div
            className="mt-2 pt-2 border-t"
            style={{ borderColor: theme.colors.border }}
          >
            <span
              className="block mb-1"
              style={{ color: theme.colors.textMuted }}
            >
              Parameters:
            </span>
            <div
              className="italic text-[10px] break-words"
              style={{ color: theme.colors.textSecondary }}
            >
              {Object.entries(item.parameters).map(([k, v]) => (
                <div key={k}>
                  {k}: {v}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// Individual history card with its own popover
const HistoryCard: React.FC<{
  item: HistoryItem;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
}> = ({ item, isSelected, onSelect, onDragStart }) => {
  const tool = TOOLS.find((t) => t.id === item.toolId);
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
        className={`
          relative group flex-shrink-0 w-32 cursor-pointer transition-all duration-200
          ${
            isSelected
              ? "scale-105"
              : "hover:scale-105 opacity-70 hover:opacity-100"
          }
        `}
      >
        {/* Thumbnail Container */}
        <div
          className="relative rounded-lg overflow-hidden aspect-square border-2"
          style={{
            borderColor: isSelected ? theme.colors.accent : theme.colors.border,
            boxShadow: isSelected ? theme.colors.accentShadow : "none",
          }}
        >
          <img
            src={item.imageData}
            alt="History item"
            className="w-full h-full object-cover"
          />
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

        {/* Metadata */}
        <div className="mt-2 text-center">
          <div
            className="text-xs font-medium truncate"
            style={{ color: theme.colors.textSecondary }}
          >
            {tool?.title || "Original"}
          </div>
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
        <TooltipContent item={item} />
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
}) => {
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className="h-40 border-t flex flex-col flex-shrink-0 z-10 relative"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div
        className="px-4 py-2 border-b flex items-center justify-between"
        style={{ borderColor: theme.colors.border }}
      >
        <span className="text-xs" style={{ color: theme.colors.textMuted }}>
          🛈 You can drag these items to the above panels.
        </span>
      </div>
      <div className="flex-1 overflow-x-auto flex items-center p-4 gap-4 custom-scrollbar relative">
        {items
          .slice()
          .reverse()
          .map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              isSelected={item.id === currentId}
              onSelect={() => onSelect(item.id)}
              onDragStart={(e) => handleDragStart(e, item.id)}
            />
          ))}
      </div>
    </div>
  );
};
