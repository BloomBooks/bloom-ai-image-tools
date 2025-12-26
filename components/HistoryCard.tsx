import React, { useRef } from "react";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Popper from "@mui/material/Popper";
import { HistoryItem } from "../types";
import { theme } from "../themes";
import { Icon, Icons } from "./Icons";
import { ImageInfoPanel } from "./ImageInfoPanel";

interface HistoryCardProps {
  item: HistoryItem;
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);

  const borderColor = isSelected ? theme.colors.accent : theme.colors.border;
  const cardShadow = isSelected ? theme.colors.accentShadow : "none";

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
          opacity: isSelected ? 1 : isHovered ? 1 : 0.8,
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
              borderColor,
              boxShadow: cardShadow,
              transition: "border-color 150ms ease, box-shadow 150ms ease",
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

          {/* Star Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar();
            }}
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              padding: 4,
              borderRadius: 999,
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.overlay,
              color: isStarred ? theme.colors.accent : theme.colors.textPrimary,
              opacity: isStarred ? 1 : isHovered ? 1 : 0,
              transition:
                "opacity 120ms ease, color 120ms ease, box-shadow 120ms ease",
              boxShadow: isStarred ? theme.colors.accentShadow : "none",
              backdropFilter: "blur(4px)",
              zIndex: 11,
            }}
            aria-pressed={isStarred}
            title={isStarred ? "Unstar image" : "Star image"}
          >
            {isStarred ? (
              <StarIcon sx={{ fontSize: 16 }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: 16 }} />
            )}
          </button>

          {/* Remove Button - inside thumbnail bounds to avoid clipping */}
          {onRemove && (
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
              title="Remove"
            >
              <Icon path={Icons.X} width={12} height={12} />
            </button>
          )}
        </div>
      </div>
      <Popper
        open={isHovered}
        anchorEl={cardRef.current}
        placement="top"
        modifiers={[
          { name: "offset", options: { offset: [0, 12] } },
          { name: "preventOverflow", options: { padding: 8, altAxis: true } },
        ]}
        style={{ zIndex: 1500 }}
      >
        <div
          style={{
            border: `1px solid ${theme.colors.border}`,
            fontSize: "0.75rem",
            borderRadius: 12,
            padding: 16,
            backgroundColor: theme.colors.surfaceRaised,
            color: theme.colors.textPrimary,
            width: "max-content",
            maxWidth: "min(320px, calc(100vw - 32px))",
            boxShadow: theme.colors.panelShadow,
            position: "relative",
          }}
        >
          <ImageInfoPanel item={item} />
          <div
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: `6px solid ${theme.colors.surfaceRaised}`,
            }}
          />
        </div>
      </Popper>
    </>
  );
};
