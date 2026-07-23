import { removeBackgroundFromImage } from "./backgroundRemoval";
import {
  detectMagentaFrameBoundsFromImage,
  segmentImageIntoPieces,
  sliceSheetIntoGridCells,
} from "./imageSegmentation";

export type DerivedImageExtractionResult = {
  imageDataItems: string[];
  durationMs: number;
};

export const extractDerivedImageItems = async (
  imageData: string,
  options: {
    signal?: AbortSignal;
    preferSeparatedSubjects?: boolean;
    preferComponents?: boolean;
    componentMergeMarginRatio?: number;
    targetPieceCount?: number;
    detectColoredFrames?: boolean;
    /**
     * Slice the sheet along the uniform grid the generation prompt mandated
     * for this many frames, keeping each full cell as one piece so the subject
     * stays wherever it sits inside its cell. Used for animation sprite
     * sheets, where that registration is what keeps the encoded GIF from
     * jittering. Falls back to whitespace/component segmentation when no
     * plausible grid is found.
     */
    uniformGridFrameCount?: number;
  } = {},
): Promise<DerivedImageExtractionResult> => {
  // Magenta-frame path first, on the PRISTINE generator output: the neural
  // background remover below can erode the thin frame lines, so detect and cut
  // along the frames before it runs. When the generator drew usable frames this
  // is authoritative and skips both background removal and whitespace inference.
  if (options.detectColoredFrames) {
    const frameItems = await segmentImageIntoPieces(imageData, { detectColoredFrames: true });
    if (frameItems.length >= 2) {
      return { imageDataItems: frameItems, durationMs: 0 };
    }
  }

  // Magenta frame boxes are detected on the PRISTINE sheet (the background
  // remover erodes the thin lines), but the frames themselves are cut from
  // the background-removed image — the coordinates are the same.
  const magentaBoxes = options.uniformGridFrameCount
    ? await detectMagentaFrameBoundsFromImage(imageData)
    : [];

  const backgroundRemoved = await removeBackgroundFromImage(imageData, options);

  if (options.uniformGridFrameCount) {
    const gridCells = await sliceSheetIntoGridCells(backgroundRemoved.imageData, {
      expectedFrameCount: options.uniformGridFrameCount,
      presetCellBounds: magentaBoxes.length >= 2 ? magentaBoxes : undefined,
    });
    if (gridCells.length) {
      return { imageDataItems: gridCells, durationMs: backgroundRemoved.durationMs };
    }
  }

  const segmentedItems = await segmentImageIntoPieces(backgroundRemoved.imageData, {
    preferSeparatedSubjects: options.preferSeparatedSubjects,
    preferComponents: options.preferComponents,
    componentMergeMarginRatio: options.componentMergeMarginRatio,
    targetPieceCount: options.targetPieceCount,
  });

  return {
    imageDataItems: segmentedItems.length ? segmentedItems : [backgroundRemoved.imageData],
    durationMs: backgroundRemoved.durationMs,
  };
};
