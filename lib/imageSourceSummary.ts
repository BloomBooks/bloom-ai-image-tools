import { L10nFunc } from "./localization";

/**
 * Where an image in the history came from, as the info panel's "Sources" block tells the
 * user.
 *
 * This is data, not text, because a history record outlives the session that made it: it is
 * written into the sidecar of a folder-backed history and read back later, possibly by a
 * Bloom running in another language. Sentences built here and stored would be frozen in the
 * language of whoever generated the image. The English lives in `describeImageSource`
 * instead, where it is translated each time it is shown.
 */
export type ImageSourceSummary =
  /** A picture taken from the book the editor was opened on. */
  | { kind: "bookImage" }
  /** The snapshot of a book slot's picture kept so the slot can be put back. */
  | { kind: "originalBookImage" }
  /** A file found in the history folder with no sidecar to say what made it. */
  | { kind: "recoveredFromFolder" }
  /** A picture taken from a PDF the user imported. `pageNumber` is 1-based. */
  | { kind: "pdfPage"; fileName: string; pageNumber: number; pageCount: number }
  /** The result of running a tool, counting the images that went into it. */
  | { kind: "toolRun"; editImageCount: number; referenceImageCount: number }
  /**
   * Text to show as it stands. Two callers: the fake-Bloom dev harness, and a sidecar
   * written before this field held anything but a sentence — see `readImageSourceSummary`.
   */
  | { kind: "text"; text: string };

/**
 * The lines of the "Sources" block, in order. Empty when there is nothing to say, which is
 * how the block knows not to appear at all.
 */
export const describeImageSource = (
  l10n: L10nFunc,
  source: ImageSourceSummary | null | undefined,
): string[] => {
  if (!source) {
    return [];
  }
  switch (source.kind) {
    case "bookImage":
      return [l10n("AiImageEditor.Source.BookImage", "A picture from this book")];
    case "originalBookImage":
      return [
        l10n("AiImageEditor.Source.OriginalBookImage", "The picture this book slot started with"),
      ];
    case "recoveredFromFolder":
      return [l10n("AiImageEditor.Source.RecoveredFromFolder", "Found in the history folder")];
    case "pdfPage":
      return [
        l10n("AiImageEditor.Source.PdfFile", "From {0}", source.fileName),
        l10n(
          "AiImageEditor.Source.PdfPage",
          "Page {0} of {1}",
          String(source.pageNumber),
          String(source.pageCount),
        ),
      ];
    case "toolRun": {
      const lines: string[] = [];
      if (source.editImageCount > 0) {
        // "Images to edit: 2" rather than "2 images to edit", so that no translation has to
        // carry an English plural rule on a number the code cannot inflect for.
        lines.push(
          l10n(
            "AiImageEditor.Source.ImagesToEdit",
            "Images to edit: {0}",
            String(source.editImageCount),
          ),
        );
      }
      if (source.referenceImageCount > 0) {
        lines.push(
          l10n(
            "AiImageEditor.Source.ReferenceImages",
            "Reference images: {0}",
            String(source.referenceImageCount),
          ),
        );
      }
      return lines;
    }
    case "text":
      return source.text.trim() ? [source.text] : [];
    default:
      // A record written by an older build can hold a shape this build does not know,
      // and callers index into the result; an unknown kind must still yield an array.
      return [];
  }
};

/**
 * A stored `sourceSummary`, whatever shape the build that wrote it used. Folder sidecars
 * written before this became structured hold a finished English sentence; keep showing it
 * rather than dropping the line from every image a beta tester already has.
 */
export const readImageSourceSummary = (value: unknown): ImageSourceSummary | null => {
  if (typeof value === "string") {
    return value.trim() ? { kind: "text", text: value } : null;
  }
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { kind?: unknown }).kind === "string"
  ) {
    return value as ImageSourceSummary;
  }
  return null;
};
