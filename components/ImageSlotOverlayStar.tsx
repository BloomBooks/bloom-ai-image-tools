import React from "react";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { theme } from "../themes";

export interface ImageSlotOverlayStarProps {
  isVisible: boolean;
  isStarred: boolean;
  onToggle: () => void;
  isHovered: boolean;
  disabled: boolean;
  cornerOffset: number;
  buttonPadding: number;
}

export const ImageSlotOverlayStar: React.FC<ImageSlotOverlayStarProps> = ({
  isVisible,
  isStarred,
  onToggle,
  isHovered,
  disabled,
  cornerOffset,
  buttonPadding,
}) => {
  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={isStarred}
      title={isStarred ? "Unstar image" : "Star image"}
      style={{
        position: "absolute",
        top: cornerOffset,
        left: cornerOffset,
        padding: isStarred ? 3 : buttonPadding,
        borderRadius: isStarred ? 0 : 999,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isStarred ? "transparent" : theme.colors.overlay,
        color: isStarred ? theme.colors.accent : theme.colors.textPrimary,
        opacity: isStarred ? 1 : isHovered ? 1 : 0,
        transition:
          "opacity 120ms ease, color 120ms ease, box-shadow 120ms ease",
        boxShadow: "none",
        backdropFilter: isStarred ? "none" : "blur(6px)",
        zIndex: 25,
        pointerEvents: disabled || (!isStarred && !isHovered) ? "none" : "auto",
      }}
    >
      {isStarred ? (
        <StarIcon
          sx={{
            fontSize: 18,
            filter: `drop-shadow(${theme.colors.panelShadow})`,
          }}
        />
      ) : (
        <StarBorderIcon sx={{ fontSize: 16 }} />
      )}
    </button>
  );
};
