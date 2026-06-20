import React from "react";
import IconButton from "@mui/material/IconButton";
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
    <IconButton
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={isStarred}
      title={isStarred ? "Unstar image" : "Star image"}
      sx={{
        position: "absolute",
        top: cornerOffset,
        left: cornerOffset,
        padding: `${buttonPadding}px`,
        borderRadius: 999,
        backgroundColor: isStarred ? theme.colors.accent : theme.colors.overlay,
        color: isStarred ? theme.colors.textOnAccent : theme.colors.textPrimary,
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
    </IconButton>
  );
};
