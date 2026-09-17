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
      {status === "saving" && l10n("AiImageEditor.Status.Saving", "Saving...")}
      {status === "copying" && l10n("AiImageEditor.Status.Copying", "Copying...")}
      {status === "success" && l10n("AiImageEditor.Status.ThumbnailSaved", "Thumbnail saved!")}
      {status === "error" && l10n("AiImageEditor.Status.FailedToSave", "Failed to save")}
      {status === "copied" && l10n("AiImageEditor.Status.Copied", "Copied!")}
      {status === "copyError" && l10n("AiImageEditor.Status.CopyFailed", "Copy failed")}
    </div>
  );
};
