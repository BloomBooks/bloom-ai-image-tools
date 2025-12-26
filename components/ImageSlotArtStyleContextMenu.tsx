import React from "react";
import { theme } from "../themes";

export interface ImageSlotArtStyleContextMenuProps {
  contextMenu: { x: number; y: number } | null;
  onSetThumbnail: () => void;
}

export const ImageSlotArtStyleContextMenu: React.FC<
  ImageSlotArtStyleContextMenuProps
> = ({ contextMenu, onSetThumbnail }) => {
  if (!contextMenu) return null;

  return (
    <div
      data-testid="image-slot-context-menu"
      style={{
        position: "fixed",
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 50,
        borderRadius: 12,
        padding: 4,
        minWidth: 160,
        backgroundColor: theme.colors.surfaceRaised,
        borderColor: theme.colors.border,
        boxShadow: theme.colors.panelShadow,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid="context-menu-set-thumbnail"
        style={{
          width: "100%",
          padding: "8px 16px",
          textAlign: "left",
          fontSize: "0.85rem",
          color: theme.colors.textPrimary,
          backgroundColor: "transparent",
          border: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.surfaceAlt;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        onClick={onSetThumbnail}
      >
        Set thumbnail
      </button>
    </div>
  );
};
