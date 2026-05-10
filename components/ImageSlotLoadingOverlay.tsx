import React from "react";
import { CircularProgress } from "@mui/material";
import { theme } from "../themes";
import { GenerationProgressState } from "../types";

export interface ImageSlotLoadingOverlayProps {
  isVisible: boolean;
  borderRadius: number | string;
  progress: GenerationProgressState | null;
}

const getNowMs = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export const ImageSlotLoadingOverlay: React.FC<
  ImageSlotLoadingOverlayProps
> = ({ isVisible, borderRadius, progress }) => {
  const [now, setNow] = React.useState(getNowMs);

  React.useEffect(() => {
    if (!isVisible || !progress || typeof window === "undefined") {
      return;
    }

    const update = () => setNow(getNowMs());
    update();

    const intervalId = window.setInterval(update, 100);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isVisible, progress]);

  if (!isVisible) return null;

  const estimatedDurationMs = Math.max(1, progress?.estimatedDurationMs ?? 1);
  const estimatedSeconds = Math.max(1, Math.round(estimatedDurationMs / 1000));
  const elapsedMs = progress ? Math.max(0, now - progress.startedAt) : 0;
  const progressValue = Math.min(100, (elapsedMs / estimatedDurationMs) * 100);
  const isIndeterminate = !progress || elapsedMs >= estimatedDurationMs;
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
        backgroundColor: "rgba(11, 17, 26, 0.5)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "grid",
          placeItems: "center",
          width: "100%",
          height: "100%",
          padding: 24,
        }}
      >
        <CircularProgress
          variant="determinate"
          value={isIndeterminate ? 100 : progressValue}
          thickness={1.6}
          size="clamp(160px, 46%, 300px)"
          sx={{ color: theme.colors.accent }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            pointerEvents: "none",
            padding: 24,
            textAlign: "center",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 14,
            fontSize: "0.72rem",
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: theme.colors.textPrimary,
            opacity: 0.68,
            pointerEvents: "none",
          }}
        >
          Est. {estimatedSeconds}s
        </div>
      </div>
    </div>
  );
};
