import * as pdfjsLib from "pdfjs-dist";
// Vite rewrites this `?url` import to the emitted worker asset. This module is
// imported lazily (see ImageToolsWorkspace) so the ~1MB worker is only pulled
// in when the PDF tool actually runs. pdfjs-dist is marked external in
// tsup.config.ts so this Vite-specific import never reaches the library bundle.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfPageImage {
  /** PNG data URL for the rendered page. */
  dataUrl: string;
  dimensions: { width: number; height: number };
  pageNumber: number;
}

export interface RenderPdfOptions {
  signal?: AbortSignal;
  /**
   * Multiplier applied to the PDF's native (72dpi) page size. Higher = crisper
   * but heavier. The result is still capped by `maxLongEdge`.
   */
  scale?: number;
  /** Hard cap on the longest rendered edge in pixels, to bound canvas memory. */
  maxLongEdge?: number;
  /** Called after each page renders, for progress UI. */
  onProgress?: (rendered: number, total: number) => void;
}

const DEFAULT_SCALE = 2;
const DEFAULT_MAX_LONG_EDGE = 4096;

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("PDF rendering aborted", "AbortError");
  }
};

/**
 * Render every page of a PDF to a PNG image, entirely in the browser via
 * PDF.js. No network call and no AI — this just rasterizes each page.
 */
export const renderPdfToImages = async (
  file: File | ArrayBuffer | Uint8Array,
  options: RenderPdfOptions = {},
): Promise<PdfPageImage[]> => {
  const {
    signal,
    scale = DEFAULT_SCALE,
    maxLongEdge = DEFAULT_MAX_LONG_EDGE,
    onProgress,
  } = options;

  throwIfAborted(signal);

  const data =
    file instanceof File
      ? new Uint8Array(await file.arrayBuffer())
      : file instanceof ArrayBuffer
        ? new Uint8Array(file)
        : file;

  const loadingTask = pdfjsLib.getDocument({ data });
  // Abort the load if the caller cancels before it resolves.
  const onAbort = () => {
    void loadingTask.destroy();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  try {
    const pageCount = pdf.numPages;
    const images: PdfPageImage[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      throwIfAborted(signal);

      const page = await pdf.getPage(pageNumber);
      try {
        // Clamp the scale so the longest edge never exceeds maxLongEdge.
        const baseViewport = page.getViewport({ scale: 1 });
        const baseLongEdge = Math.max(baseViewport.width, baseViewport.height);
        const effectiveScale =
          baseLongEdge > 0 ? Math.min(scale, maxLongEdge / baseLongEdge) : scale;
        const viewport = page.getViewport({ scale: Math.max(effectiveScale, 0.1) });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not get a 2D canvas context to render the PDF page.");
        }
        // White backdrop: PDFs assume paper, but a canvas starts transparent.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: context, viewport, canvas }).promise;
        throwIfAborted(signal);

        images.push({
          dataUrl: canvas.toDataURL("image/png"),
          dimensions: { width: canvas.width, height: canvas.height },
          pageNumber,
        });

        // Free the backing store promptly; posters can be large.
        canvas.width = 0;
        canvas.height = 0;
        onProgress?.(pageNumber, pageCount);
      } finally {
        page.cleanup();
      }
    }

    return images;
  } finally {
    await loadingTask.destroy();
  }
};
