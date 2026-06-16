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
  } = {},
): Promise<DerivedImageExtractionResult> => {
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
