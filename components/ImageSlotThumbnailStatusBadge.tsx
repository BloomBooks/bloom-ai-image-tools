import React from "react";
import { theme } from "../themes";
import { useL10n } from "../lib/localization";

export type ThumbnailStatus =
  | "idle"
  | "saving"
  | "success"
  | "error"
  | "copying"
  | "copied"
  | "copyError";

export interface ImageSlotThumbnailStatusBadgeProps {
  status: ThumbnailStatus;
}

export const ImageSlotThumbnailStatusBadge: React.FC<ImageSlotThumbnailStatusBadgeProps> = ({
  status,
}) => {
  const l10n = useL10n();
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
          status === "saving" || status === "copying"
            ? theme.colors.accent
            : status === "success" || status === "copied"
              ? "#22c55e"
              : "#ef4444",
        color: "white",
      }}
    >
      {status === "saving" && l10n("EditTab.SavingNotification", "Saving...")}
      {status === "copying" && "Copying..."}
      {status === "success" && "Thumbnail saved!"}
      {status === "error" && "Failed to save"}
      {status === "copied" && "Copied!"}
      {status === "copyError" && "Copy failed"}
    </div>
  );
};
