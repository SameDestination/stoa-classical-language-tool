import assert from "node:assert/strict";
import test from "node:test";

import {
  RASTER_PDF_MAX_TOTAL_PIXELS,
  RASTER_PDF_MIN_PIXEL_RATIO,
  RASTER_PDF_PREFERRED_PIXEL_RATIO,
  chooseRasterPdfPixelRatio,
} from "../app/lib/raster-pdf.ts";

test("raster PDF density prefers 3x for ordinary preview pages", () => {
  assert.equal(
    chooseRasterPdfPixelRatio([{ width: 794, height: 1123 }]),
    RASTER_PDF_PREFERRED_PIXEL_RATIO,
  );
});

test("raster PDF density falls back to 2x under total-pixel pressure", () => {
  const pageCount = Math.ceil(
    RASTER_PDF_MAX_TOTAL_PIXELS / (794 * 1123 * RASTER_PDF_PREFERRED_PIXEL_RATIO ** 2),
  ) + 1;
  assert.equal(
    chooseRasterPdfPixelRatio(Array.from({ length: pageCount }, () => ({ width: 794, height: 1123 }))),
    RASTER_PDF_MIN_PIXEL_RATIO,
  );
});

test("raster PDF density falls back to 2x when a 3x page exceeds the dimension ceiling", () => {
  assert.equal(
    chooseRasterPdfPixelRatio([{ width: 6_000, height: 2_000 }]),
    RASTER_PDF_MIN_PIXEL_RATIO,
  );
});
