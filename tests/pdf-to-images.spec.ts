import { test, expect, type Page } from "@playwright/test";
import { resetImageToolsPersistence } from "./playwright_helpers";

// PDF to Images takes the pictures stored in a PDF out of it (lib/pdfToImages.ts),
// rather than making a picture of each page.
const HARNESS_ROUTE = "/?mode=bloom-harness";

type PdfImage = { width: number; height: number; gray: boolean; pixel: (x: number) => number[] };

/**
 * A PDF with uncompressed image XObjects, so the test can say exactly what is in it.
 * `pages` lists, per page, the names of the images drawn on it; every page also has text.
 */
const buildPdf = (images: Record<string, PdfImage>, pages: string[][]): Buffer => {
  const objects: Buffer[] = [];
  const add = (body: Buffer | string) => {
    objects.push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
    return objects.length;
  };
  const stream = (dict: string, data: Buffer) =>
    Buffer.concat([
      Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"),
      data,
      Buffer.from("\nendstream", "latin1"),
    ]);

  const catalogId = add("");
  const pagesId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const imageIds: Record<string, number> = {};
  for (const [name, image] of Object.entries(images)) {
    const channels = image.gray ? 1 : 3;
    const data = Buffer.alloc(image.width * image.height * channels);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const pixel = image.pixel(x);
        pixel.forEach((value, c) => (data[(y * image.width + x) * channels + c] = value));
      }
    }
    imageIds[name] = add(
      stream(
        `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          `/ColorSpace /${image.gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8`,
        data,
      ),
    );
  }
  const pageIds = pages.map((names) => {
    const drawing = names
      .map((name, i) => `q 200 0 0 150 72 ${500 - i * 170} cm /${name} Do Q`)
      .join("\n");
    const contentId = add(
      stream("", Buffer.from(`BT /F1 24 Tf 72 720 Td (Once upon a time) Tj ET\n${drawing}`)),
    );
    const xobjects = [...new Set(names)].map((name) => `/${name} ${imageIds[name]} 0 R`).join(" ");
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> /XObject << ${xobjects} >> >> >>`,
    );
  });
  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, "latin1");
  objects[pagesId - 1] = Buffer.from(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
    "latin1",
  );

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    const obj = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    offsets.push(length);
    parts.push(obj);
    length += obj.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
};

const historyImages = (page: Page) =>
  page
    .getByTestId("thumbnail-strip-history")
    .getByTestId("thumbnail-strip-item-history")
    .locator("img");

const runPdfToImages = async (page: Page, pdf: Buffer) => {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByText("PDF to Images", { exact: true }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /Choose PDF/i })
    .last()
    .click();
  await (
    await fileChooser
  ).setFiles({ name: "story.pdf", mimeType: "application/pdf", buffer: pdf });
};

test.describe("PDF to Images", () => {
  test.beforeEach(async ({ page }) => {
    await resetImageToolsPersistence(page, HARNESS_ROUTE);
    await page.goto(HARNESS_ROUTE);
    await expect(page.getByTestId("thumbnail-strip-bookImages")).toBeVisible();
    await page.getByTestId("thumbnail-tab-history").click();
  });

  test("takes out each stored picture once, at its own size, and skips tiny ones", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const pdf = buildPdf(
      {
        // Left half red, right half blue.
        Tree: {
          width: 120,
          height: 80,
          gray: false,
          pixel: (x) => (x < 60 ? [255, 0, 0] : [0, 0, 255]),
        },
        House: { width: 64, height: 200, gray: true, pixel: () => [128] },
        Bullet: { width: 10, height: 10, gray: true, pixel: () => [0] },
      },
      // The tree appears twice on page 1 and again on page 3.
      [["Tree", "Bullet", "Tree"], [], ["House", "Tree"]],
    );
    const before = await historyImages(page).count();

    await runPdfToImages(page, pdf);

    await expect(historyImages(page)).toHaveCount(before + 2, { timeout: 15_000 });
    // New images go in at the front of the strip, in reading order.
    const added = await historyImages(page).evaluateAll(async (imgs, count) => {
      const results = [];
      for (const img of imgs.slice(0, count) as HTMLImageElement[]) {
        const full = new Image();
        full.src = img.src;
        await full.decode();
        const canvas = document.createElement("canvas");
        canvas.width = full.naturalWidth;
        canvas.height = full.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(full, 0, 0);
        const at = (x: number) => Array.from(context.getImageData(x, 0, 1, 1).data.slice(0, 3));
        results.push({
          width: full.naturalWidth,
          height: full.naturalHeight,
          left: at(0),
          right: at(full.naturalWidth - 1),
        });
      }
      return results;
    }, 2);

    expect(added).toEqual([
      { width: 120, height: 80, left: [255, 0, 0], right: [0, 0, 255] },
      { width: 64, height: 200, left: [128, 128, 128], right: [128, 128, 128] },
    ]);
  });

  test("says so when the PDF has no pictures in it", async ({ page }) => {
    test.setTimeout(30_000);
    const before = await historyImages(page).count();

    await runPdfToImages(page, buildPdf({}, [[], []]));

    await expect(page.getByText("No pictures were found in that PDF.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(historyImages(page)).toHaveCount(before);
  });
});
