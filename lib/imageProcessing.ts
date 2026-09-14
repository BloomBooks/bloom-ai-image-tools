/**
 * Image processing utilities for thumbnails.
 */

/**
 * Crops empty space (background) around an image and returns a new data URL.
 * Detects the background color by sampling corner pixels, then finds the bounding box of content.
 */
export const cropWhitespace = (imageData: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageDataObj;

      // Helper to get pixel at x,y
      const getPixel = (x: number, y: number) => {
        const idx = (y * width + x) * 4;
        return {
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          a: data[idx + 3],
        };
      };

      // Sample corners and edges to detect background color
      const samplePoints = [
        { x: 0, y: 0 },
        { x: width - 1, y: 0 },
        { x: 0, y: height - 1 },
        { x: width - 1, y: height - 1 },
        { x: Math.floor(width / 2), y: 0 },
        { x: Math.floor(width / 2), y: height - 1 },
        { x: 0, y: Math.floor(height / 2) },
        { x: width - 1, y: Math.floor(height / 2) },
      ];

      let bgR = 0,
        bgG = 0,
        bgB = 0;
      let validSamples = 0;
      for (const pt of samplePoints) {
        const px = getPixel(pt.x, pt.y);
        // Only count non-transparent pixels
        if (px.a > 128) {
          bgR += px.r;
          bgG += px.g;
          bgB += px.b;
          validSamples++;
        }
      }

      if (validSamples === 0) {
        // All corners are transparent - just return original
        resolve(imageData);
        return;
      }

      bgR = Math.round(bgR / validSamples);
      bgG = Math.round(bgG / validSamples);
      bgB = Math.round(bgB / validSamples);

      // Calculate color distance from background
      // Use a threshold based on perceived color difference
      const colorDistance = (r: number, g: number, b: number) => {
        const dr = r - bgR;
        const dg = g - bgG;
        const db = b - bgB;
        // Weighted euclidean distance (human perception weights)
        return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
      };

      // Threshold for considering a pixel as "content" vs "background"
      // Higher value = more aggressive cropping
      const threshold = 25;

      // Find the bounding box of content pixels
      let top = height;
      let bottom = 0;
      let left = width;
      let right = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const px = getPixel(x, y);

          // Skip transparent pixels
          if (px.a < 128) continue;

          const dist = colorDistance(px.r, px.g, px.b);
          if (dist > threshold) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }

      // If no content found, return original
      if (top >= bottom || left >= right) {
        resolve(imageData);
        return;
      }

      // Add padding (5% of dimension or 10px, whichever is larger)
      const paddingX = Math.max(10, Math.floor((right - left) * 0.05));
      const paddingY = Math.max(10, Math.floor((bottom - top) * 0.05));
      top = Math.max(0, top - paddingY);
      bottom = Math.min(height - 1, bottom + paddingY);
      left = Math.max(0, left - paddingX);
      right = Math.min(width - 1, right + paddingX);

      const croppedWidth = right - left + 1;
      const croppedHeight = bottom - top + 1;

      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = croppedWidth;
      croppedCanvas.height = croppedHeight;
      const croppedCtx = croppedCanvas.getContext("2d");
      if (!croppedCtx) {
        reject(new Error("Failed to get cropped canvas context"));
        return;
      }

      croppedCtx.drawImage(
        canvas,
        left,
        top,
        croppedWidth,
        croppedHeight,
        0,
        0,
        croppedWidth,
        croppedHeight,
      );

      resolve(croppedCanvas.toDataURL("image/png"));
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageData;
  });
};

/**
 * Resizes an image to fit within maxSize (preserving aspect ratio).
 * The larger dimension will be scaled to maxSize.
 */
export const resizeImage = (imageData: string, maxSize: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = img;

      // If already smaller than maxSize, return as-is
      if (width <= maxSize && height <= maxSize) {
        resolve(imageData);
        return;
      }

      let newWidth: number;
      let newHeight: number;

      if (width >= height) {
        newWidth = maxSize;
        newHeight = Math.round((height / width) * maxSize);
      } else {
        newHeight = maxSize;
        newWidth = Math.round((width / height) * maxSize);
      }

      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Use better quality interpolation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageData;
  });
};

/**
 * The longest edge a reference image is sent to a model at.
 *
 * Measured against openai/gpt-image-2.5-flare on 2026-09-14. That model's
 * vision encoder bills an input image as one token per 32x32 patch plus about
 * ten, so `ceil(width / 32) * ceil(height / 32) + 10` predicts the prompt
 * tokens exactly, at every size tried. At $8/1M those tokens dominate a call:
 * one 2048px reference took a 1024x1536 generation from $0.0054 to $0.0171,
 * and three took it to $0.0405.
 *
 * 1024 is the largest edge that still bills the least. Below it the charge
 * stops falling — a 512, a 768 and a 1024 wide reference all bill the same 617
 * prompt tokens — so a smaller cap would give up detail and save nothing.
 *
 * Only references come through here. The image being edited is what the result
 * is made from and has to keep its resolution.
 */
export const MAX_REFERENCE_IMAGE_EDGE = 1024;

/**
 * A reference image at no more than MAX_REFERENCE_IMAGE_EDGE on its long edge.
 * One already smaller comes back untouched (resizeImage short-circuits).
 *
 * A resize that fails should cost money, not the run, so the original is sent.
 */
export const shrinkReferenceImage = async (imageData: string): Promise<string> => {
  try {
    return await resizeImage(imageData, MAX_REFERENCE_IMAGE_EDGE);
  } catch (error) {
    console.warn("[references] could not shrink a reference image; sending it full size", error);
    return imageData;
  }
};

/**
 * Process an image for use as an art style thumbnail:
 * 1. Crop whitespace
 * 2. Resize to 200px (max dimension)
 */
export const processImageForThumbnail = async (imageData: string): Promise<string> => {
  const cropped = await cropWhitespace(imageData);
  const resized = await resizeImage(cropped, 400);
  return resized;
};

/**
 * Save an art style thumbnail via the dev server API.
 */
export const saveArtStyleThumbnail = async (
  artStyleId: string,
  imageData: string,
): Promise<void> => {
  const response = await fetch("/__api/save-art-style-thumbnail", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      artStyleId,
      imageData,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save thumbnail: ${errorText}`);
  }
};
