import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  createVectorPdf,
  type VectorPdfInput,
  type VectorPdfSettings,
  type VectorPdfToken,
} from "../app/vector-pdf.ts";
import type { ResolvedInterlinearPaginationPlan } from "../app/lib/page-flow.ts";
import { deriveDocumentTokenStyleDefaults } from "../app/lib/token-style.ts";

type CanonicalProject = {
  document: {
    analysis: {
      tokens: VectorPdfToken[];
      literalTranslation: string;
      naturalTranslation: string;
    };
    settings: VectorPdfSettings;
  };
};

type InspectedTextItem = {
  str: string;
  x: number;
  y: number;
  fontHeight: number;
};

const fixture = async (name: string): Promise<CanonicalProject> => JSON.parse(
  // Geometry fixtures explicitly select the bundled compatible family. The
  // production exporter must never substitute it for actual Times New Roman.
  (await readFile(new URL(`./fixtures/canonical/${name}`, import.meta.url), "utf8"))
    .replaceAll("Times New Roman", "Liberation Serif STOA"),
) as CanonicalProject;

const notoSerifFonts = Promise.all([
  readFile(new URL("../public/fonts/NotoSerif-Regular.ttf", import.meta.url), "base64"),
  readFile(new URL("../public/fonts/NotoSerif-Bold.ttf", import.meta.url), "base64"),
  readFile(new URL("../public/fonts/NotoSerif-Italic.ttf", import.meta.url), "base64"),
  readFile(new URL("../public/fonts/NotoSerif-BoldItalic.ttf", import.meta.url), "base64"),
]).then(([normal, bold, italic, bolditalic]) => ({ normal, bold, italic, bolditalic }));
const liberationSerifFonts = Promise.all([
  readFile(new URL("../public/fonts/LiberationSerif-Regular.ttf", import.meta.url), "base64"),
  readFile(new URL("../public/fonts/LiberationSerif-Bold.ttf", import.meta.url), "base64"),
  readFile(new URL("../public/fonts/LiberationSerif-Italic.ttf", import.meta.url), "base64"),
  readFile(new URL("../public/fonts/LiberationSerif-BoldItalic.ttf", import.meta.url), "base64"),
]).then(([normal, bold, italic, bolditalic]) => ({ normal, bold, italic, bolditalic }));

const inspectPdf = async (bytes: Uint8Array) => {
  const loadingTask = getDocument({ data: bytes.slice() });
  const document = await loadingTask.promise;
  const items: InspectedTextItem[] = [];
  let hasRasterImage = false;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        fontHeight: Math.hypot(item.transform[0], item.transform[1]),
      });
    }
    const operators = await page.getOperatorList();
    hasRasterImage ||= operators.fnArray.some((operator) =>
      operator === OPS.paintImageXObject
      || operator === OPS.paintInlineImageXObject
      || operator === OPS.paintImageMaskXObject,
    );
    page.cleanup();
  }
  await loadingTask.destroy();
  return { items, hasRasterImage };
};

const fiveLayerSettings = (settings: VectorPdfSettings): VectorPdfSettings => ({
  ...settings,
  headerLeft: "",
  headerRight: "",
  footerLeft: "",
  footerRight: "",
  showLemma: true,
  showPos: true,
  hideIndeclinableDetails: false,
  showTranslation: false,
});

const sourceText = (token: VectorPdfToken) =>
  `${token.punctuationBefore ?? ""}${token.surface}${token.punctuationAfter}`;

const assertFiveLayers = async (
  project: CanonicalProject,
  token: VectorPdfToken,
  title: string,
) => {
  const result = await createVectorPdf({
    title,
    naturalTranslation: "",
    tokens: [token],
    settings: fiveLayerSettings(project.document.settings),
    unicodeSerifFontBase64: await notoSerifFonts,
    unicodeTimesSerifFontBase64: await liberationSerifFonts,
  });
  const inspected = await inspectPdf(result.bytes);
  assert.equal(inspected.hasRasterImage, false, "five-layer PDF must remain entirely vector");
  const searchableText = inspected.items.map((item) => item.str).join("\n");
  [
    sourceText(token),
    token.gloss,
    token.lemma,
    token.pos.toUpperCase(),
    token.morphology,
  ].forEach((value) => {
    assert.ok(
      searchableText.includes(value),
      `expected selectable five-layer text ${JSON.stringify(value)} in ${JSON.stringify(searchableText)}`,
    );
  });
};

test("canonical Ancient Greek fixture exports all five searchable vector layers", async () => {
  const project = await fixture("stoa-ancient-greek-20260819-184926.stoa.json");
  const token = project.document.analysis.tokens.find((item) => item.surface === "πολιτικὸν");
  assert.ok(token, "canonical Greek fixture should retain πολιτικὸν");
  await assertFiveLayers(project, token, "Canonical Ancient Greek five-layer export");
});

test("canonical Latin fixture exports all five searchable vector layers", async () => {
  const project = await fixture("stoa-latin-20260819-191723.stoa.json");
  const token = project.document.analysis.tokens.find((item) => item.surface === "mirari");
  assert.ok(token, "canonical Latin fixture should retain mirari");
  await assertFiveLayers(project, token, "Canonical Latin five-layer export");
});

test("stale frozen Greek browser geometry is rejected rather than exported with mismatched fonts", async () => {
  // The captured plan belongs to this frozen fixture, not to the replaceable
  // developer sample (which now contains a different and much longer passage).
  const project = await fixture("stoa-ancient-greek-20260819-184926.stoa.json");
  const plan = JSON.parse(await readFile(
    new URL("./fixtures/official-greek-preview-plan.json", import.meta.url),
    "utf8",
  )) as ResolvedInterlinearPaginationPlan;
  project.document.settings.lineGap = plan.rowGapBounds.preferredPx;
  plan.translationSources = [
    { sectionId: "literal", text: project.document.analysis.literalTranslation },
    { sectionId: "natural", text: project.document.analysis.naturalTranslation },
  ];
  const input: VectorPdfInput = {
    title: "Ancient Greek Interlinear Reading",
    tokens: project.document.analysis.tokens,
    literalTranslation: project.document.analysis.literalTranslation,
    naturalTranslation: project.document.analysis.naturalTranslation,
    settings: project.document.settings,
    unicodeSerifFontBase64: await notoSerifFonts,
    unicodeTimesSerifFontBase64: await liberationSerifFonts,
    paginationPlan: plan,
    layoutSourceKey: plan.sourceKey,
  };
  // This August capture predates current layer metrics. Keeping its geometry
  // silently would undermine Preview/PDF parity. Fresh accepted preview plans
  // are exercised by packaged-runtime QA; this retained fixture guards refusal.
  // The capture also used the retired Vusillus metrics, so the rows no longer
  // fit either; any layout mismatch must refuse the export.
  await assert.rejects(() => createVectorPdf(input), /Preview row (?:height differs|is [\d.]+ mm wide)/u);

  await assert.rejects(
    () => createVectorPdf({
      ...input,
      naturalTranslation: `${input.naturalTranslation} Changed after Preview.`,
    }),
    /Preview row (?:height differs|is [\d.]+ mm wide)|translation source changed/u,
  );
});

const findItem = (items: InspectedTextItem[], text: string) => {
  const item = items.find((candidate) => candidate.str === text);
  assert.ok(item, `expected extracted text item ${JSON.stringify(text)}`);
  return item;
};

const latinGeometryPdf = async (
  token: VectorPdfToken,
  settings: VectorPdfSettings,
) => inspectPdf((await createVectorPdf({
  title: "Latin token geometry",
  naturalTranslation: "",
  tokens: [token],
  settings,
  unicodeSerifFontBase64: await notoSerifFonts,
  unicodeTimesSerifFontBase64: await liberationSerifFonts,
})).bytes);

test("nested five-layer overrides change measured/drawn geometry consistently", async () => {
  const project = await fixture("stoa-latin-20260819-191723.stoa.json");
  const canonical = project.document.analysis.tokens.find((item) => item.surface === "mirari");
  assert.ok(canonical);
  const settings = fiveLayerSettings(project.document.settings);
  const base = await latinGeometryPdf(canonical, settings);
  const styled = await latinGeometryPdf({
    ...canonical,
    styleOverrides: {
      layers: {
        gloss: {
          sizePt: 27,
          color: "#2f5f8f",
          bold: false,
          italic: true,
          underline: true,
        },
      },
      gapAfterPx: { gloss: 26 },
    },
  }, settings);

  const baseGloss = findItem(base.items, canonical.gloss);
  const styledGloss = findItem(styled.items, canonical.gloss);
  const baseMorphology = findItem(base.items, canonical.morphology);
  const styledMorphology = findItem(styled.items, canonical.morphology);
  assert.ok(
    styledGloss.fontHeight > baseGloss.fontHeight * 1.8,
    `expected nested size override to affect vector text geometry (${baseGloss.fontHeight} → ${styledGloss.fontHeight})`,
  );
  assert.ok(
    styledGloss.y - styledMorphology.y > baseGloss.y - baseMorphology.y + 10,
    "measured layer gap must be used by the drawing pass",
  );
  assert.equal(styled.hasRasterImage, false);
});

test("hidden Lemma/POS gaps consume no PDF height while a visible Gloss gap does", async () => {
  const project = await fixture("stoa-latin-20260819-191723.stoa.json");
  const canonical = project.document.analysis.tokens.find((item) => item.surface === "mirari");
  assert.ok(canonical);
  const settings = {
    ...fiveLayerSettings(project.document.settings),
    showLemma: false,
    showPos: false,
  };
  const base = await latinGeometryPdf(canonical, settings);
  const hiddenGapOverrides = await latinGeometryPdf({
    ...canonical,
    styleOverrides: {
      gapAfterPx: { lemma: 48, pos: 48 },
    },
  }, settings);
  const visibleGapOverride = await latinGeometryPdf({
    ...canonical,
    styleOverrides: {
      gapAfterPx: { gloss: 30, lemma: 48, pos: 48 },
    },
  }, settings);

  const distance = (inspection: Awaited<ReturnType<typeof inspectPdf>>) =>
    findItem(inspection.items, canonical.gloss).y
      - findItem(inspection.items, canonical.morphology).y;
  assert.ok(
    Math.abs(distance(hiddenGapOverrides) - distance(base)) < 0.01,
    "gaps owned by hidden intermediate layers must not accumulate",
  );
  assert.ok(
    distance(visibleGapOverride) > distance(base) + 15,
    "the gap after the visible Gloss layer should change the drawn geometry",
  );
  assert.equal(hiddenGapOverrides.hasRasterImage, false);
  assert.equal(visibleGapOverride.hasRasterImage, false);
});

test("document-level tokenStyle defaults control vector layer geometry", async () => {
  const project = await fixture("stoa-latin-20260819-191723.stoa.json");
  const canonical = project.document.analysis.tokens.find((item) => item.surface === "mirari");
  assert.ok(canonical);
  const settings = fiveLayerSettings(project.document.settings);
  const defaults = deriveDocumentTokenStyleDefaults(settings);
  const base = await latinGeometryPdf(canonical, settings);
  const customized = await latinGeometryPdf(canonical, {
    ...settings,
    tokenStyle: {
      ...defaults,
      layers: {
        ...defaults.layers,
        morphology: {
          ...defaults.layers.morphology,
          sizePt: 21,
          color: "#376b5c",
          bold: true,
          italic: true,
          underline: true,
        },
      },
    },
  });
  assert.ok(
    findItem(customized.items, canonical.morphology).fontHeight
      > findItem(base.items, canonical.morphology).fontHeight * 1.8,
    "normalized document defaults should drive the same PDF measurement and drawing model",
  );
  assert.equal(customized.hasRasterImage, false);
});

test("empty visible annotation fields consume no PDF row or gap", async () => {
  const project = await fixture("stoa-latin-20260819-191723.stoa.json");
  const canonical = project.document.analysis.tokens.find((item) => item.surface === "mirari");
  assert.ok(canonical);
  const settings = fiveLayerSettings(project.document.settings);
  const empty = {
    ...canonical,
    lemma: "",
    pos: "",
    styleOverrides: { gapAfterPx: { lemma: 48, pos: 48 } },
  };
  const withEmptyVisibleLayers = await latinGeometryPdf(empty, settings);
  const explicitlyHidden = await latinGeometryPdf(empty, {
    ...settings,
    showLemma: false,
    showPos: false,
  });
  const sourceToMorphology = (inspection: Awaited<ReturnType<typeof inspectPdf>>) =>
    findItem(inspection.items, sourceText(canonical)).y
      - findItem(inspection.items, canonical.morphology).y;
  assert.ok(
    Math.abs(sourceToMorphology(withEmptyVisibleLayers) - sourceToMorphology(explicitlyHidden)) < 0.01,
    "empty layers and explicitly hidden layers must have identical vector geometry",
  );
  assert.equal(withEmptyVisibleLayers.hasRasterImage, false);
});
