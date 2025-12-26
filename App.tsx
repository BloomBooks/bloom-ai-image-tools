import React, { useMemo } from "react";
import { ImageToolsWorkspace } from "./src";
import { createBrowserImageToolsPersistence } from "./services/persistence/browserPersistence";
import { ENV_KEY_SKIP_FLAG } from "./lib/authFlags";
import retroFuturism from "./assets/art-styles/retro-futurism.png";
import watercolorDream from "./assets/art-styles/watercolor-dream.png";
import paperCutCollage from "./assets/art-styles/paper-cut-collage.png";
import cleanLineArt from "./assets/art-styles/clean-line-art.png";

const ENV_API_KEY = (process.env.E2E_OPENROUTER_API_KEY || "").trim();

const getEnvApiKey = (): string => {
  if (!ENV_API_KEY) return "";
  if (typeof window === "undefined") {
    return ENV_API_KEY;
  }
  return window.sessionStorage?.getItem(ENV_KEY_SKIP_FLAG) === "1"
    ? ""
    : ENV_API_KEY;
};

export default function App() {
  const persistence = useMemo(() => createBrowserImageToolsPersistence(), []);

  const envApiKey = getEnvApiKey();
  const environmentImages = useMemo(
    () => [retroFuturism, watercolorDream, paperCutCollage, cleanLineArt],
    []
  );

  return (
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
  );
}
