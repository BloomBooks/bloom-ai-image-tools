import React from "react";
import { CircularProgress } from "@mui/material";
import { theme } from "../themes";

export interface ImageSlotLoadingOverlayProps {
  isVisible: boolean;
  borderRadius: number | string;
}

export const ImageSlotLoadingOverlay: React.FC<
  ImageSlotLoadingOverlayProps
> = ({ isVisible, borderRadius }) => {
  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        zIndex: 30,
        borderRadius,
        backgroundColor: theme.colors.overlayStrong,
        backdropFilter: "blur(4px)",
      }}
    >
      <CircularProgress size={40} sx={{ color: theme.colors.accent }} />
      <span
        style={{
          fontSize: "0.9rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: theme.colors.textPrimary,
        }}
      >
        Generating...
      </span>
    </div>
  );
};
