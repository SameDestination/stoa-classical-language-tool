import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
const vector = await readFile(new URL("../app/vector-pdf.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("Preview renders resolved smart gaps instead of reapplying a fixed CSS grid gap", () => {
  assert.match(source, /smart:\s*true/u);
  assert.match(source, /line\.paragraphSpacingBefore\s*\+\s*line\.resolvedGapBefore/u);
  assert.match(css, /\.token-lines\s*\{[^}]*gap:\s*0;/su);
  assert.match(source, /data-resolved-gap-px/u);
});

test("running-text and translation reservations use the same explicit Preview metrics", () => {
  assert.match(source, /HEADER_RESERVE_PX = 41/u);
  assert.match(source, /FOOTER_RESERVE_PX = 26/u);
  assert.match(source, /TRANSLATION_CHROME_PX = 59/u);
  assert.match(vector, /HEADER_RESERVE_MM = 41 \* PX_TO_MM/u);
  assert.match(vector, /FOOTER_RESERVE_MM = 26 \* PX_TO_MM/u);
  assert.match(vector, /TRANSLATION_CHROME_MM = 59 \* PX_TO_MM/u);
  assert.match(css, /\.paper-heading,\s*\.paper-footer\s*\{[^}]*line-height:\s*10px;/su);
  assert.match(css, /\.paper-heading > span,\s*\.paper-footer > span\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/su);
  assert.match(vector, /ellipsizeRunningText/u);
  assert.match(css, /\.translation-block span\s*\{[^}]*line-height:\s*10px;/su);
  assert.match(
    css,
    /\.paper-preview\.is-exporting \.paper-heading > span,\s*\.paper-preview\.is-exporting \.paper-footer > span,\s*\.paper-preview\.is-exporting \.translation-block > span\s*\{[^}]*padding-block:\s*4px;[^}]*margin-block:\s*-4px;/su,
  );
});

test("vector PDF consumes and verifies the browser-resolved pagination plan", () => {
  assert.match(source, /paginationPlan:\s*previewPagination\.plan/u);
  assert.match(vector, /layoutPlanSource:\s*"preview"\s*\|\s*"vector"/u);
  assert.match(vector, /Preview and vector export do not contain the same ordered token IDs/u);
  assert.match(vector, /Preview and vector PDF contain different translation text or section order/u);
  assert.match(source, /translationSources:\s*translationSources\.map/u);
  assert.match(source, /const translationBlocks = page\.trailingTextSections/u);
  assert.match(source, /literalTranslation:\s*analysis\.literalTranslation/u);
  assert.match(source, /VectorPdfLayoutMismatchError/u);
});

test("font activation invalidates measurement using actual rendered document text", () => {
  assert.match(source, /documentFontRequests\(publicationAnalysis, currentProjectSettings, documentTokenStyle\)/u);
  assert.match(source, /readyFontRequestKey === fontRequestKey/u);
  assert.match(source, /fontMetricsStatus:\s*fontsReady \? "ready" : "loading"/u);
  assert.match(source, /Promise\.all\(styleRequests\)/u);
  assert.match(source, /documentLayoutReady = fontsReady && missingDocumentFonts\.length === 0/u);
  assert.match(source, /disabled=\{!analysis\.tokens\.length \|\| pngExportCapability\?\.supported === false \|\| activeDocumentExport !== null \|\| !documentLayoutReady\}/u);
  assert.match(source, /data-pagination-key=\{layoutSourceKey\}/u);
  assert.match(source, /assertLayoutSnapshotCurrent\(exportLayoutKey\)/u);
});

test("PNG remains derived from the final PDF instead of running a second paginator", () => {
  assert.match(source, /const finalPdf = await generateCurrentPdf\(exportLayoutKey\);/u);
  assert.match(source, /pdfJs\.getDocument\(\{ data: finalPdf\.bytes\.slice\(\) \}\)/u);
  assert.match(source, /const zipBlob = await zip\.generateAsync[\s\S]*assertLayoutSnapshotCurrent\(exportLayoutKey\);[\s\S]*downloadBlob\(zipBlob/u);
  const pdfGenerationIndex = source.indexOf("const finalPdf = await generateCurrentPdf(exportLayoutKey);", source.indexOf("const exportPng"));
  const pngRenderingIndex = source.indexOf("pdfJs.getDocument", pdfGenerationIndex);
  assert.ok(pdfGenerationIndex >= 0 && pngRenderingIndex > pdfGenerationIndex);
});

test("wide paper expands from the scroll origin while narrow paper stays centered", () => {
  const pageStack = css.match(/\.page-stack\s*\{(?<rules>[\s\S]*?)\}/u)?.groups?.rules ?? "";
  const pageWrap = css.match(/\.page-wrap\s*\{(?<rules>[\s\S]*?)\}/u)?.groups?.rules ?? "";
  assert.match(css, /\.canvas-stage\s*\{[\s\S]*?overflow:\s*auto/u);
  assert.match(pageStack, /width:\s*max-content/u);
  assert.match(pageStack, /min-width:\s*100%/u);
  assert.match(pageStack, /justify-content:\s*center/u);
  assert.match(pageStack, /justify-items:\s*center/u);
  assert.match(pageWrap, /width:\s*max-content/u);
  assert.match(pageWrap, /max-width:\s*none/u);
});
