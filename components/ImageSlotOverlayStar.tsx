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
        padding: buttonPadding,
        borderRadius: 999,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isStarred ? theme.colors.accent : theme.colors.overlay,
        color: isStarred ? theme.colors.textPrimary : theme.colors.textPrimary,
        opacity: isStarred ? 1 : isHovered ? 1 : 0,
        transition:
          "opacity 120ms ease, color 120ms ease, background-color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
        boxShadow: isStarred ? `0 6px 16px ${theme.colors.panelShadow}` : "none",
        backdropFilter: "blur(6px)",
        transform: isStarred ? "scale(1.05)" : "scale(1)",
        zIndex: 25,
        pointerEvents: disabled || (!isStarred && !isHovered) ? "none" : "auto",
      }}
    >
      {isStarred ? (
        <StarIcon
          sx={{
            fontSize: 16,
          }}
        />
      ) : (
        <StarBorderIcon sx={{ fontSize: 16 }} />
      )}
    </button>
  );
};
