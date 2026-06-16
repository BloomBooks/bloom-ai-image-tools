import React from "react";
import { CircularProgress } from "@mui/material";
import { theme } from "../themes";
import { GenerationProgressState } from "../types";

export interface ImageSlotLoadingOverlayProps {
  isVisible: boolean;
  borderRadius: number | string;
  progress: GenerationProgressState | null;
}

const getNowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Elapsed wall-clock for the running generation. Under a minute we show plain
// seconds ("12s"); past that we switch to m:ss since some edits run for minutes.
const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const ImageSlotLoadingOverlay: React.FC<ImageSlotLoadingOverlayProps> = ({
  isVisible,
  borderRadius,
  progress,
}) => {
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
  // While under the estimate, fill a determinate ring toward 95% so it reads as
  // progress. Once overtime we have no idea how long is left, so hand off to
  // MUI's standard indeterminate spinner — the same animation (and default
  // stroke thickness) as the "Click to Cancel" button. The earlier thin (1.6)
  // determinate arc spun by CSS is what felt "annoying"/wobbly.
  const isOvertime = !progress || elapsedMs >= estimatedDurationMs;
  const progressValue = Math.min(95, (elapsedMs / estimatedDurationMs) * 100);
  const phaseText =
    progress?.phaseLabel && progress.phaseCount && progress.phaseCount > 1
      ? `Step ${progress.phaseIndex}/${progress.phaseCount}: ${progress.phaseLabel}`
      : null;
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
        {isOvertime ? (
          // `disableShrink` removes MUI's grow/shrink + dash-offset animation,
          // which is what makes a large indeterminate ring appear to wobble
          // around a shifting center. What's left is a fixed-length arc that
          // simply rotates around a stable center — clean at any size.
          <CircularProgress
            variant="indeterminate"
            disableShrink
            size="clamp(160px, 46%, 300px)"
            sx={{ color: theme.colors.accent }}
          />
        ) : (
          <CircularProgress
            variant="determinate"
            value={progressValue}
            thickness={1.6}
            size="clamp(160px, 46%, 300px)"
            sx={{ color: theme.colors.accent }}
          />
        )}
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
            lineHeight: 1.3,
            letterSpacing: "0.04em",
            textAlign: "right",
            color: theme.colors.textPrimary,
            opacity: 0.68,
            pointerEvents: "none",
          }}
        >
          {phaseText && <div style={{ opacity: 0.95, marginBottom: 2 }}>{phaseText}</div>}
          <div>{formatElapsed(elapsedMs)}</div>
          <div style={{ opacity: 0.75 }}>est. {estimatedSeconds}s</div>
        </div>
      </div>
    </div>
  );
};
