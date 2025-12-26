import React from "react";
import { theme } from "../themes";

export interface ImageSlotDropOverlayProps {
  isVisible: boolean;
  label: string;
  borderRadius: number | string;
}

export const ImageSlotDropOverlay: React.FC<ImageSlotDropOverlayProps> = ({
  isVisible,
  label,
  borderRadius,
}) => {
  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 20,
        borderRadius,
        backgroundColor: theme.colors.dropZone,
        border: `2px dashed ${theme.colors.dropZoneBorder}`,
        pointerEvents: "none",
        backdropFilter: "blur(1px)",
      }}
    >
      <span
        style={{
          fontWeight: 700,
          fontSize: "0.9rem",
          color: theme.colors.textPrimary,
          textShadow: theme.colors.panelShadow,
        }}
      >
        {label}
      </span>
    </div>
  );
};
