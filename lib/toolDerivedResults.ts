import { removeBackgroundFromImage } from "./backgroundRemoval";
import { segmentImageIntoPieces } from "./imageSegmentation";

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

  const backgroundRemoved = await removeBackgroundFromImage(imageData, options);
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
