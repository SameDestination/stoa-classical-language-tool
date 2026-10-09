// PDFKit's browser build is already part of STOA's searchable-PDF pipeline.
// The raster fallback deliberately reuses it only as a page/image container;
// layout is captured from the final browser preview, never from vector output.
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import html2canvas from "html2canvas";

export const RASTER_PDF_MIN_PIXEL_RATIO = 2;
export const RASTER_PDF_PREFERRED_PIXEL_RATIO = 3;
export const RASTER_PDF_MAX_TOTAL_PIXELS = 120_000_000;
export const RASTER_PDF_MAX_DIMENSION = 16_384;

export type RasterPdfProgress = Readonly<{
  pageNumber: number;
  pageCount: number;
  pixelRatio: number;
}>;

export type RasterPdfFontFace = Readonly<{
  family: string;
  bytes: ArrayBuffer;
  style: "normal" | "italic";
  weight: "400" | "700";
}>;

export type RasterPdfInput = Readonly<{
  pages: readonly HTMLElement[];
  paperWidthMm: number;
  paperHeightMm: number;
  backgroundColor: string;
  title: string;
  /** Runtime-imported faces that must also exist in html2canvas's cloned document. */
  fontFaces?: readonly RasterPdfFontFace[];
  onProgress?: (progress: RasterPdfProgress) => void;
}>;

export type RasterPdfResult = Readonly<{
  kind: "raster";
  bytes: Uint8Array;
  blob: Blob;
  pageCount: number;
  pixelRatio: number;
}>;

const MM_TO_PT = 72 / 25.4;

const finitePositive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
};

export const chooseRasterPdfPixelRatio = (
  pageSizes: readonly Readonly<{ width: number; height: number }>[],
): number => {
  if (!pageSizes.length) return RASTER_PDF_MIN_PIXEL_RATIO;
  const totalAtPreferred = pageSizes.reduce(
    (total, page) => total + Math.max(1, page.width) * Math.max(1, page.height)
      * RASTER_PDF_PREFERRED_PIXEL_RATIO ** 2,
    0,
  );
  const largestPreferredDimension = Math.max(...pageSizes.flatMap((page) => [
    page.width * RASTER_PDF_PREFERRED_PIXEL_RATIO,
    page.height * RASTER_PDF_PREFERRED_PIXEL_RATIO,
  ]));
  return totalAtPreferred <= RASTER_PDF_MAX_TOTAL_PIXELS
    && largestPreferredDimension <= RASTER_PDF_MAX_DIMENSION
    ? RASTER_PDF_PREFERRED_PIXEL_RATIO
    : RASTER_PDF_MIN_PIXEL_RATIO;
};

const collectPdfBytes = (document: PDFKit.PDFDocument) => new Promise<Uint8Array>(
  (resolve, reject) => {
    const chunks: Uint8Array[] = [];
    document.on("data", (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
    document.on("error", reject);
    document.on("end", () => {
      const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(bytes);
    });
  },
);

const capturePage = async (
  page: HTMLElement,
  pixelRatio: number,
  backgroundColor: string,
  fontFaces: readonly RasterPdfFontFace[],
) => {
  page.classList.add("is-exporting");
  try {
    const bounds = page.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw new Error("A preview page has no measurable dimensions.");
    }
    return await html2canvas(page, {
      scale: pixelRatio,
      backgroundColor,
      useCORS: true,
      allowTaint: false,
      logging: false,
      removeContainer: true,
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
      windowWidth: Math.max(document.documentElement.clientWidth, Math.ceil(bounds.width)),
      windowHeight: Math.max(document.documentElement.clientHeight, Math.ceil(bounds.height)),
      ignoreElements: (element) => element.classList?.contains("insert-token-button") === true,
      onclone: async (clonedDocument) => {
        clonedDocument.querySelectorAll(".paper-preview.export-page").forEach((candidate) => {
          candidate.classList.add("is-exporting");
        });
        if (fontFaces.length && typeof FontFace !== "function") {
          throw new Error("This browser cannot reproduce imported fonts in the raster PDF clone.");
        }
        for (const specification of fontFaces) {
          const face = new FontFace(
            specification.family,
            specification.bytes.slice(0),
            { style: specification.style, weight: specification.weight },
          );
          await face.load();
          clonedDocument.fonts.add(face);
        }
        await clonedDocument.fonts.ready;
      },
    });
  } finally {
    page.classList.remove("is-exporting");
  }
};

/**
 * Captures each already-paginated preview page independently and places the
 * resulting lossless PNG on a same-size PDF page. This path intentionally
 * never invokes STOA's vector renderer, so an unsafe vector attempt cannot
 * contaminate or dictate the fallback appearance.
 */
export const createRasterPdfFromPreview = async (
  input: RasterPdfInput,
): Promise<RasterPdfResult> => {
  if (!input.pages.length) throw new Error("No preview pages are available to export.");
  finitePositive(input.paperWidthMm, "Paper width");
  finitePositive(input.paperHeightMm, "Paper height");
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
    throw new Error("Raster PDF export requires a browser preview.");
  }
  await document.fonts.ready;

  const pageSizes = input.pages.map((page) => {
    const bounds = page.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  const pixelRatio = chooseRasterPdfPixelRatio(pageSizes);
  const totalAtMinimum = pageSizes.reduce(
    (total, page) => total + Math.max(1, page.width) * Math.max(1, page.height)
      * RASTER_PDF_MIN_PIXEL_RATIO ** 2,
    0,
  );
  if (totalAtMinimum > RASTER_PDF_MAX_TOTAL_PIXELS) {
    throw new Error("This document is too large for a safe 2× raster PDF capture. Export fewer pages or reduce the paper size.");
  }
  const largestAtMinimum = Math.max(...pageSizes.flatMap((page) => [
    page.width * RASTER_PDF_MIN_PIXEL_RATIO,
    page.height * RASTER_PDF_MIN_PIXEL_RATIO,
  ]));
  if (largestAtMinimum > RASTER_PDF_MAX_DIMENSION) {
    throw new Error("The selected paper size is too large for a safe 2× raster PDF capture.");
  }

  const widthPt = input.paperWidthMm * MM_TO_PT;
  const heightPt = input.paperHeightMm * MM_TO_PT;
  const pdf = new PDFDocument({
    autoFirstPage: false,
    compress: true,
    margin: 0,
    size: [widthPt, heightPt],
    bufferPages: false,
  });
  pdf.info.Title = input.title;
  pdf.info.Subject = "Raster interlinear text; browser appearance preserved";
  pdf.info.Author = "STOA Interlinear Studio";
  pdf.info.Creator = "STOA Interlinear Studio";
  const bytesPromise = collectPdfBytes(pdf);

  for (let index = 0; index < input.pages.length; index += 1) {
    input.onProgress?.({
      pageNumber: index + 1,
      pageCount: input.pages.length,
      pixelRatio,
    });
    const canvas = await capturePage(
      input.pages[index],
      pixelRatio,
      input.backgroundColor,
      input.fontFaces ?? [],
    );
    if (!canvas.width || !canvas.height) throw new Error(`Preview page ${index + 1} rendered blank.`);
    pdf.addPage({ size: [widthPt, heightPt], margin: 0 });
    pdf.image(canvas.toDataURL("image/png"), 0, 0, {
      width: widthPt,
      height: heightPt,
    });
    canvas.width = 1;
    canvas.height = 1;
  }
  pdf.end();
  const bytes = await bytesPromise;
  if (bytes.byteLength < 1_000) throw new Error("Raster PDF generation returned an empty document.");
  const blobBytes = Uint8Array.from(bytes);
  return {
    kind: "raster",
    bytes,
    blob: new Blob([blobBytes.buffer], { type: "application/pdf" }),
    pageCount: input.pages.length,
    pixelRatio,
  };
};
