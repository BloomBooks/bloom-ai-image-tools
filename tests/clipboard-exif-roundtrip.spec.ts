import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { applyExifToDataUrl, buildModelExif, extractExifFromBytes } from "../lib/exifMetadata";
import {
  grantClipboardPermissions,
  resetImageToolsPersistence,
  readClipboardImage,
  SAMPLE_IMAGE_PATH,
  writeImageDataToClipboard,
} from "./playwright_helpers";

const SOURCE_IMAGE_BASE64 = readFileSync(SAMPLE_IMAGE_PATH).toString("base64");

test.describe("clipboard EXIF roundtrip", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page);
    await grantClipboardPermissions(page);
  });

  test("preserves EXIF when pasting into the target panel", async ({ page }) => {
    // Desired behavior: EXIF should survive a browser clipboard roundtrip so
    // pasted edit inputs can later be copied back out with the same metadata.
    // Current Chromium behavior: the browser strips or rewrites image metadata
    // before web content can read the clipboard image, so the app never sees
    // the original EXIF to preserve it.
    test.fail(
      true,
      "Chromium strips EXIF from clipboard image reads before the app can persist the pasted file.",
    );

    const sourceExif = buildModelExif("Original Illustrator");
    expect(sourceExif).not.toBeNull();

    const imageData = applyExifToDataUrl(
      `data:image/png;base64,${SOURCE_IMAGE_BASE64}`,
      sourceExif!,
    );

    await writeImageDataToClipboard(page, imageData);

    const clipboardImage = await readClipboardImage(page);
    expect(clipboardImage).not.toBeNull();

    const clipboardExif = extractExifFromBytes(
      new Uint8Array(clipboardImage!.bytes),
      clipboardImage!.type,
    );
    expect(Buffer.from(clipboardExif || []).equals(Buffer.from(sourceExif!))).toBe(true);

    await page.locator("body").click();
    await page.keyboard.press("Control+V");

    const targetImage = page.getByRole("img", { name: "Image to Edit" });
    await expect(targetImage).toBeVisible();

    const pastedImage = await page.evaluate(async () => {
      const image = document.querySelector<HTMLImageElement>('img[alt="Image to Edit"]');
      if (!image?.src) return null;

      const response = await fetch(image.src);
      const blob = await response.blob();
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      return {
        type: blob.type,
        bytes,
      };
    });

    expect(pastedImage).not.toBeNull();

    const pastedExif = extractExifFromBytes(new Uint8Array(pastedImage!.bytes), pastedImage!.type);
    expect(Buffer.from(pastedExif || []).equals(Buffer.from(sourceExif!))).toBe(true);
  });
});
