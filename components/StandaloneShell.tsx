import React, { useMemo } from "react";
import { ImageToolsWorkspace } from "./ImageToolsWorkspace";
import { createBrowserImageToolsPersistence } from "../services/persistence/browserPersistence";
import retroFuturism from "../assets/art-styles/retro-futurism.png";
import watercolorDream from "../assets/art-styles/watercolor-dream.png";
import paperCutCollage from "../assets/art-styles/paper-cut-collage.png";
import cleanLineArt from "../assets/art-styles/clean-line-art.png";

interface StandaloneShellProps {
  envApiKey?: string;
}

export const StandaloneShell: React.FC<StandaloneShellProps> = ({ envApiKey = "" }) => {
  const persistence = useMemo(() => createBrowserImageToolsPersistence(), []);
  const bookImages = useMemo(
    () => [retroFuturism, watercolorDream, paperCutCollage, cleanLineArt],
    [],
  );

  return (
    <ImageToolsWorkspace
      persistence={persistence}
      envApiKey={envApiKey}
      bookImageUrls={bookImages}
      bookImagesStripMode="editable"
      thumbnailStripConfigOverrides={{
        bookImages: {
          label: "Book Images",
          allowDrop: true,
          allowRemove: true,
          allowReorder: false,
        },
      }}
    />
  );
};
