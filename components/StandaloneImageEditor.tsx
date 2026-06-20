/**
 * StandaloneImageEditor — the editor's top-level component when running on its own
 * (no Bloom host), e.g. the demo site. Sibling of BloomHostedImageEditor: same
 * ImageToolsWorkspace, but wired to browser/localStorage persistence.
 *
 * By default the Bloom-specific "Book Images" strip is hidden so the public demo
 * (e.g. GitHub Pages) doesn't confuse users with book-integration UI that only
 * makes sense inside Bloom. Pass `bloomFeatures` (App maps the `?bloomFeatures`
 * query param to it) to seed sample book images and show the strip, so the
 * feature can still be run and tested standalone.
 */
import React, { useMemo } from "react";
import { ImageToolsWorkspace } from "./ImageToolsWorkspace";
import { createBrowserImageToolsPersistence } from "../services/persistence/browserPersistence";
import retroFuturism from "../assets/art-styles/retro-futurism.png";
import watercolorDream from "../assets/art-styles/watercolor-dream.png";
import paperCutCollage from "../assets/art-styles/paper-cut-collage.png";
import cleanLineArt from "../assets/art-styles/clean-line-art.png";

interface StandaloneImageEditorProps {
  envApiKey?: string;
  // When true, enable the Bloom-specific book-images features (seed sample book
  // images + show the Book Images strip). Off by default so the public demo
  // stays free of Bloom-only UI.
  bloomFeatures?: boolean;
}

export const StandaloneImageEditor: React.FC<StandaloneImageEditorProps> = ({
  envApiKey = "",
  bloomFeatures = false,
}) => {
  const persistence = useMemo(() => createBrowserImageToolsPersistence(), []);
  const bookImages = useMemo(
    () =>
      bloomFeatures ? [retroFuturism, watercolorDream, paperCutCollage, cleanLineArt] : undefined,
    [bloomFeatures],
  );

  return (
    <ImageToolsWorkspace
      persistence={persistence}
      envApiKey={envApiKey}
      bookImageUrls={bookImages}
      bookImagesStripMode="editable"
      thumbnailStripConfigOverrides={
        bloomFeatures
          ? {
              bookImages: {
                label: "Book Images",
                allowDrop: true,
                allowRemove: true,
                allowReorder: false,
              },
            }
          : {
              // No Bloom host => no book to draw from, so hide the Book Images
              // strip/tab entirely rather than showing an empty one.
              bookImages: { hidden: true },
            }
      }
    />
  );
};
