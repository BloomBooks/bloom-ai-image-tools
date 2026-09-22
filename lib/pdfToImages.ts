// The legacy build, because the modern one calls `Map.prototype.getOrInsertComputed`,
// which browsers only recently gained (Playwright's Chromium 1.57 lacks it); the legacy
// build carries a polyfill for it and other new built-ins, in the worker too.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// `?worker&inline` bundles PDF.js's worker into this chunk as a blob, so
// reading a PDF fetches no second file. The worker must not be a separate
// asset: Bloom serves this app from /bloom/aiImageEditor/ and does not serve
// the emitted `.mjs` worker, so the old `?url` import failed at run time with
// `Setting up fake worker failed: "Failed to fetch dynamically imported
// module: .../assets/pdf.worker.min-<hash>.mjs"`. This module is imported
// lazily (see ImageToolsWorkspace), so the ~1MB of worker only loads when the
// PDF tool actually runs. pdfjs-dist is marked external in tsup.config.ts so
// this Vite-specific import never reaches the library bundle.
import PdfJsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline";
import jbig2WasmUrl from "pdfjs-dist/wasm/jbig2.wasm?url&inline";
import openJpegWasmUrl from "pdfjs-dist/wasm/openjpeg.wasm?url&inline";

export interface PdfEmbeddedImage {
  /** PNG data URL of the picture at the resolution it is stored in the PDF. */
  dataUrl: string;
  dimensions: { width: number; height: number };
  /** 1-based page the picture was first drawn on. */
  pageNumber: number;
  /** 1-based position among the pictures kept from that page. */
  indexOnPage: number;
}

export interface ExtractPdfImagesResult {
  images: PdfEmbeddedImage[];
  pageCount: number;
}

export interface ExtractPdfImagesOptions {
  signal?: AbortSignal;
  /**
   * Pictures whose shorter edge is below this many pixels are dropped: they are
   * rules, bullets, and other page decoration rather than pictures anyone wants.
   */
  minShortEdge?: number;
  /** Called after each page is read, for progress UI. */
  onProgress?: (pagesRead: number, pageCount: number) => void;
}

const DEFAULT_MIN_SHORT_EDGE = 48;

/**
 * An image as the PDF.js worker hands it to the main thread. `bitmap` is set
 * when the worker could decode to an ImageBitmap; otherwise `data` holds raw
 * pixels laid out as `kind` says. Soft masks are already merged into RGBA.
 */
interface PdfJsImageObject {
  width: number;
  height: number;
  bitmap?: ImageBitmap;
  data?: Uint8Array | Uint8ClampedArray | string;
  kind?: number;
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("PDF reading aborted", "AbortError");
  }
};

// Objects whose id starts with "g_" are shared by several pages and live in
// commonObjs; the rest belong to the page. An image can arrive after the
// operator list that draws it (JPEGs are decoded separately), so wait for it.
// The worker resolves an image it could not decode with null.
const waitForPdfObject = (
  page: pdfjsLib.PDFPageProxy,
  objId: string,
  signal?: AbortSignal,
): Promise<PdfJsImageObject | null> =>
  new Promise((resolve, reject) => {
    const store = objId.startsWith("g_") ? page.commonObjs : page.objs;
    const onAbort = () => reject(new DOMException("PDF reading aborted", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    store.get(objId, (image: PdfJsImageObject | null) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(image ?? null);
    });
  });

const WASM_URLS: Record<string, string> = {
  "jbig2.wasm": jbig2WasmUrl,
  "openjpeg.wasm": openJpegWasmUrl,
};

/**
 * Hands the worker the WebAssembly decoders PDF.js needs for JBIG2 and CCITT
 * (scanned black-and-white pages) and JPEG 2000 images. They are inlined for
 * the same reason the worker is: the host serves no extra files. Without them
 * PDF.js skips those images.
 */
class InlineWasmDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = kind === "wasmUrl" ? WASM_URLS[filename] : undefined;
    if (!url) {
      throw new Error(`No ${kind} data for ${filename}.`);
    }
    // The build inlines these as data URLs; the dev server hands out a URL to fetch.
    if (url.startsWith("data:")) {
      const binary = atob(url.slice(url.indexOf(",") + 1));
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  }
}

/**
 * Write the pixels of a decoded PDF image into `rgba`; false if its layout is
 * one this does not know. `isMask` is for an image mask (a
 * stencil the PDF fills with the current colour), which is shown here as black
 * ink on white paper, the way it appears on almost every page.
 */
const writeRgba = (image: PdfJsImageObject, isMask: boolean, rgba: Uint8ClampedArray): boolean => {
  const { width, height, data } = image;
  if (!data || typeof data === "string") return false;
  const pixelCount = width * height;

  if (isMask || image.kind === pdfjsLib.ImageKind.GRAYSCALE_1BPP) {
    // One bit per pixel, rows padded to whole bytes. For a plain 1-bit image a
    // set bit is white; for a mask a clear bit is where the ink goes.
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const value = bit ? 255 : 0;
        const out = (y * width + x) * 4;
        rgba[out] = value;
        rgba[out + 1] = value;
        rgba[out + 2] = value;
        rgba[out + 3] = 255;
      }
    }
    return true;
  }
  if (image.kind === pdfjsLib.ImageKind.RGB_24BPP) {
    for (let i = 0; i < pixelCount; i += 1) {
      rgba[i * 4] = data[i * 3];
      rgba[i * 4 + 1] = data[i * 3 + 1];
      rgba[i * 4 + 2] = data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    return true;
  }
  if (image.kind === pdfjsLib.ImageKind.RGBA_32BPP) {
    rgba.set(data.subarray(0, pixelCount * 4));
    return true;
  }
  return false;
};

const imageToPngDataUrl = (image: PdfJsImageObject, isMask: boolean): string | null => {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get a 2D canvas context to draw the PDF image.");
  }
  try {
    if (image.bitmap) {
      if (isMask) {
        // A decoded mask is black ink on a transparent ground.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image.bitmap, 0, 0);
    } else {
      const imageData = context.createImageData(image.width, image.height);
      if (!writeRgba(image, isMask, imageData.data)) return null;
      context.putImageData(imageData, 0, 0);
    }
    return canvas.toDataURL("image/png");
  } finally {
    // Free the backing store promptly; scanned pages can be large.
    canvas.width = 0;
    canvas.height = 0;
  }
};

/**
 * Pull the pictures a PDF contains out of it, entirely in the browser via
 * PDF.js. No network call and no AI. Each picture comes out at the resolution
 * it is stored in the PDF, without the text or anything else drawn over it.
 * A picture drawn more than once (a logo on every page) comes out once.
 *
 * Artwork drawn with lines and shapes rather than stored as an image is not a
 * picture to PDF.js and does not come out.
 */
export const extractPdfImages = async (
  file: File | ArrayBuffer | Uint8Array,
  options: ExtractPdfImagesOptions = {},
): Promise<ExtractPdfImagesResult> => {
  const { signal, minShortEdge = DEFAULT_MIN_SHORT_EDGE, onProgress } = options;

  throwIfAborted(signal);

  const data =
    file instanceof File
      ? new Uint8Array(await file.arrayBuffer())
      : file instanceof ArrayBuffer
        ? new Uint8Array(file)
        : file;

  // One worker per document rather than a shared GlobalWorkerOptions port, so
  // tearing this run down can't leave a later one without a worker. PDF.js
  // never terminates a port it was handed (only one it created itself), so
  // `workerPort.terminate()` below is ours to call.
  const workerPort = new PdfJsWorker();
  const worker = pdfjsLib.PDFWorker.create({ port: workerPort });
  const loadingTask = pdfjsLib.getDocument({
    data,
    worker,
    useWorkerFetch: false,
    BinaryDataFactory: InlineWasmDataFactory,
  });
  // Abort the load if the caller cancels before it resolves.
  const onAbort = () => {
    void loadingTask.destroy();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    worker.destroy();
    workerPort.terminate();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  const { OPS } = pdfjsLib;
  try {
    const pageCount = pdf.numPages;
    const images: PdfEmbeddedImage[] = [];
    const seenObjIds = new Set<string>();
    // PDF.js only shares an object id across pages for some repeated images,
    // so a picture that recurs under a new id is caught by its pixels.
    const seenDataUrls = new Set<string>();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      throwIfAborted(signal);

      const page = await pdf.getPage(pageNumber);
      try {
        const { fnArray, argsArray } = await page.getOperatorList();
        throwIfAborted(signal);

        let indexOnPage = 0;
        for (let i = 0; i < fnArray.length; i += 1) {
          const fn = fnArray[i];
          const args = argsArray[i];
          let image: PdfJsImageObject | null = null;
          let objId: string | null = null;
          const isMask = fn === OPS.paintImageMaskXObject;

          if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
            objId = args[0] as string;
          } else if (isMask) {
            // A mask's data is either its pixels or the id of an object holding them.
            const mask = args[0] as PdfJsImageObject;
            if (typeof mask.data === "string") {
              objId = mask.data;
            } else {
              image = mask;
            }
          } else if (fn === OPS.paintInlineImageXObject) {
            image = args[0] as PdfJsImageObject;
          } else {
            continue;
          }

          if (objId) {
            // Page-local ids restart on every page.
            const dedupeKey = objId.startsWith("g_") ? objId : `${pageNumber}:${objId}`;
            if (seenObjIds.has(dedupeKey)) continue;
            seenObjIds.add(dedupeKey);
            image = await waitForPdfObject(page, objId, signal);
          }
          if (!image || Math.min(image.width, image.height) < minShortEdge) continue;

          const dataUrl = imageToPngDataUrl(image, isMask);
          if (!dataUrl || seenDataUrls.has(dataUrl)) continue;
          seenDataUrls.add(dataUrl);
          indexOnPage += 1;
          images.push({
            dataUrl,
            dimensions: { width: image.width, height: image.height },
            pageNumber,
            indexOnPage,
          });
        }
        onProgress?.(pageNumber, pageCount);
      } finally {
        page.cleanup();
      }
    }

    return { images, pageCount };
  } finally {
    await loadingTask.destroy();
    worker.destroy();
    workerPort.terminate();
  }
};
