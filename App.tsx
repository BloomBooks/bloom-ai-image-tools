import React, { useEffect, useMemo } from "react";
import { ImageToolsWorkspace } from "./src";
import { createBrowserImageToolsPersistence } from "./services/persistence/browserPersistence";
import { ENV_KEY_SKIP_FLAG } from "./lib/authFlags";
import retroFuturism from "./assets/art-styles/retro-futurism.png";
import watercolorDream from "./assets/art-styles/watercolor-dream.png";
import paperCutCollage from "./assets/art-styles/paper-cut-collage.png";
import cleanLineArt from "./assets/art-styles/clean-line-art.png";
import { useLastDragDelayMs } from "./components/dndDragState";
import { seedHistory } from "./dev/seedHistory";

const ENV_API_KEY = (process.env.E2E_OPENROUTER_API_KEY || "").trim();

const getEnvApiKey = (): string => {
  if (!ENV_API_KEY) return "";
  if (typeof window === "undefined") {
    return ENV_API_KEY;
  }
  return window.sessionStorage?.getItem(ENV_KEY_SKIP_FLAG) === "1" ? "" : ENV_API_KEY;
};

function DragTimingOverlay() {
  const delayMs = useLastDragDelayMs();
  if (delayMs === null) return null;
  const color = delayMs < 100 ? "#4caf50" : delayMs < 300 ? "#ff9800" : "#f44336";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        color,
        fontFamily: "monospace",
        fontSize: 13,
        padding: "4px 10px",
        borderRadius: 6,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      drag delay: {delayMs}ms
    </div>
  );
}

export default function App() {
  const persistence = useMemo(() => createBrowserImageToolsPersistence(), []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as Window & { seedHistory?: typeof seedHistory }).seedHistory = seedHistory;
    return () => {
      delete (window as Window & { seedHistory?: typeof seedHistory }).seedHistory;
    };
  }, []);

  const envApiKey = getEnvApiKey();
  const environmentImages = useMemo(
    () => [retroFuturism, watercolorDream, paperCutCollage, cleanLineArt],
    [],
  );

  return (
    <>
      <ImageToolsWorkspace
        persistence={persistence}
        envApiKey={envApiKey}
        environmentImageUrls={environmentImages}
        environmentStripMode="editable"
        thumbnailStripConfigOverrides={{
          environment: {
            label: "Book pages",
            allowDrop: true,
            allowRemove: true,
            allowReorder: true,
          },
        }}
      />
      {import.meta.env.DEV && <DragTimingOverlay />}
    </>
  );
}
