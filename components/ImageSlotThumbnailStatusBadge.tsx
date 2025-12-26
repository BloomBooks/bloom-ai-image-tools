import React from "react";
import { theme } from "../themes";

export type ThumbnailStatus = "idle" | "saving" | "success" | "error";

export interface ImageSlotThumbnailStatusBadgeProps {
  status: ThumbnailStatus;
}

export const ImageSlotThumbnailStatusBadge: React.FC<
  ImageSlotThumbnailStatusBadgeProps
> = ({ status }) => {
  if (status === "idle") return null;

  return (
    <div
      data-testid="thumbnail-status"
      style={{
        position: "absolute",
        bottom: 8,
        left: 8,
        padding: "4px 12px",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 500,
        zIndex: 40,
        backgroundColor:
          status === "saving"
            ? theme.colors.accent
            : status === "success"
            ? "#22c55e"
            : "#ef4444",
        color: "white",
      }}
    >
      {status === "saving" && "Saving..."}
      {status === "success" && "Thumbnail saved!"}
      {status === "error" && "Failed to save"}
    </div>
  );
};
