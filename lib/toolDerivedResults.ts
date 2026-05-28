import { removeBackgroundFromImage } from "./backgroundRemoval";
import { segmentImageIntoPieces } from "./imageSegmentation";

export type DerivedImageExtractionResult = {
  imageDataItems: string[];
  durationMs: number;
};

export const extractDerivedImageItems = async (
  imageData: string,
  options: { signal?: AbortSignal; preferSeparatedSubjects?: boolean } = {},
): Promise<DerivedImageExtractionResult> => {
  const backgroundRemoved = await removeBackgroundFromImage(imageData, options);
  const segmentedItems = await segmentImageIntoPieces(backgroundRemoved.imageData, {
    preferSeparatedSubjects: options.preferSeparatedSubjects,
  });

  return {
    imageDataItems: segmentedItems.length ? segmentedItems : [backgroundRemoved.imageData],
    durationMs: backgroundRemoved.durationMs,
  };
};
