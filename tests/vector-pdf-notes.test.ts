import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  ANALYSIS_NOTE_GAP_PX,
  createVectorPdf,
  type VectorPdfInput,
  type VectorPdfSettings,
  type VectorPdfToken,
} from "../app/vector-pdf.ts";
import {
  analysisNotesForPublication,
  analysisNoteDestination,
  tokenNoteDestination,
  type AnalysisNote,
} from "../app/lib/analysis-notes.ts";
import {
  SMART_ROW_GAP_MAXIMUM_RATIO,
  SMART_ROW_GAP_MINIMUM_RATIO,
  type ResolvedInterlinearPaginationPlan,
} from "../app/lib/page-flow.ts";
import {
  deriveDocumentTokenStyleDefaults,
  deriveLegacyTokenLayerVisibility,
  measureTokenLayerStackHeight,
  resolveVisibleTokenLayers,
  TOKEN_LAYER_LINE_HEIGHT,
} from "../app/lib/token-style.ts";

const fontBase64 = (path: string) => readFile(new URL(path, import.meta.url), "base64");
const serifFaces = Promise.all([
  fontBase64("../public/fonts/NotoSerif-Regular.ttf"),
  fontBase64("../public/fonts/NotoSerif-Bold.ttf"),
  fontBase64("../public/fonts/NotoSerif-Italic.ttf"),
  fontBase64("../public/fonts/NotoSerif-BoldItalic.ttf"),
]).then(([normal, bold, italic, bolditalic]) => ({ normal, bold, italic, bolditalic }));

const settings = (): VectorPdfSettings => ({
  greekSize: 22,
  glossSize: 11,
  lemmaSize: 9,
  posSize: 8,
  morphSize: 9,
  translationSize: 10,
  wordGap: 14,
  lineGap: 18,
  greekFont: "'Noto Serif STOA', serif",
  englishFont: "'Noto Serif STOA', serif",
  lemmaFont: "'Noto Serif STOA', serif",
  morphFont: "'Noto Serif STOA', serif",
  paperWidthMm: 130,
  paperHeightMm: 115,
  marginTopMm: 9,
  marginRightMm: 9,
  marginBottomMm: 9,
  marginLeftMm: 9,
  headerLeft: "",
  headerRight: "",
  footerLeft: "",
  footerRight: "",
  background: "#f6f0e4",
  ink: "#29271f",
  accent: "#9e4a32",
  showLemma: true,
  showPos: true,
  hideIndeclinableDetails: false,
  showTranslation: true,
  showNotes: true,
  showNoteMarkers: true,
});

const token = (overrides: Partial<VectorPdfToken> = {}): VectorPdfToken => ({
  id: "token-alpha",
  surface: "verbum",
  punctuationBefore: "",
  punctuationAfter: ".",
  lemma: "verbum",
  gloss: "word",
  pos: "NOUN",
  morphology: "Nom. Sg. n.",
  ...overrides,
});

const note = (overrides: Partial<AnalysisNote> = {}): AnalysisNote => ({
  id: "note-alpha",
  tokenId: "token-alpha",
  text: "The form is used here in its ordinary predicative sense.",
  ...overrides,
});

const inspect = async (bytes: Uint8Array) => {
  const loadingTask = getDocument({ data: bytes.slice() });
  const document = await loadingTask.promise;
  const pageTexts: string[] = [];
  const linkDestinations: string[] = [];
  let hasRasterImage = false;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join("\n"));
    const annotations = await page.getAnnotations();
    annotations.forEach((annotation) => {
      if (typeof annotation.dest === "string") linkDestinations.push(annotation.dest);
    });
    const operators = await page.getOperatorList();
    hasRasterImage ||= operators.fnArray.some((operator) =>
      operator === OPS.paintImageXObject
      || operator === OPS.paintInlineImageXObject
      || operator === OPS.paintImageMaskXObject,
    );
    page.cleanup();
  }
  const destinations = await document.getDestinations();
  const pageCount = document.numPages;
  await loadingTask.destroy();
  return {
    pageCount,
    pageTexts,
    text: pageTexts.join("\n"),
    destinations,
    linkDestinations,
    hasRasterImage,
  };
};

const input = async (overrides: Partial<VectorPdfInput> = {}): Promise<VectorPdfInput> => ({
  title: "Scholarly notes regression",
  literalTranslation: "A word is present.",
  naturalTranslation: "There is a word.",
  notes: [note()],
  tokens: [token()],
  settings: settings(),
  unicodeSerifFontBase64: await serifFaces,
  ...overrides,
});

test("vector PDF places selectable scholarly Notes before translations with bidirectional links", async () => {
  const result = await createVectorPdf(await input({
    notes: [
      note(),
      note({
        id: "note-beta",
        text: "A second annotation confirms stable publication numbering.",
      }),
    ],
  }));
  const pdf = await inspect(result.bytes);
  assert.equal(pdf.hasRasterImage, false);
  assert.ok(pdf.text.includes("ANALYSIS NOTES"));
  assert.ok(pdf.text.includes("The form is used here in its ordinary predicative sense."));
  assert.ok(pdf.text.indexOf("ANALYSIS NOTES") < pdf.text.indexOf("LITERAL TRANSLATION"));
  assert.ok(pdf.text.indexOf("LITERAL TRANSLATION") < pdf.text.indexOf("IDIOMATIC TRANSLATION"));
  assert.ok(pdf.destinations.has(tokenNoteDestination("token-alpha")));
  assert.ok(pdf.destinations.has(analysisNoteDestination("note-alpha")));
  assert.ok(pdf.destinations.has(analysisNoteDestination("note-beta")));
  assert.ok(pdf.linkDestinations.includes(analysisNoteDestination("note-alpha")));
  assert.ok(pdf.linkDestinations.includes(analysisNoteDestination("note-beta")));
  assert.ok(pdf.linkDestinations.includes(tokenNoteDestination("token-alpha")));
});

test("Notes and superscript markers remain independently hideable", async () => {
  const notesHiddenSettings = settings();
  notesHiddenSettings.showNotes = false;
  notesHiddenSettings.showNoteMarkers = true;
  notesHiddenSettings.showTranslation = false;
  const notesHidden = await inspect((await createVectorPdf(await input({
    literalTranslation: "",
    naturalTranslation: "",
    settings: notesHiddenSettings,
  }))).bytes);
  assert.equal(notesHidden.text.includes("ordinary predicative sense"), false);
  assert.equal(notesHidden.destinations.has(analysisNoteDestination("note-alpha")), false);
  assert.equal(notesHidden.linkDestinations.includes(analysisNoteDestination("note-alpha")), false);
  assert.ok(notesHidden.text.split(/\s+/u).includes("1"), "the independently visible marker should remain searchable");

  const markersHiddenSettings = settings();
  markersHiddenSettings.showNotes = true;
  markersHiddenSettings.showNoteMarkers = false;
  markersHiddenSettings.showTranslation = false;
  const markersHidden = await inspect((await createVectorPdf(await input({
    literalTranslation: "",
    naturalTranslation: "",
    settings: markersHiddenSettings,
  }))).bytes);
  assert.ok(markersHidden.text.includes("ordinary predicative sense"));
  assert.ok(markersHidden.destinations.has(analysisNoteDestination("note-alpha")));
  assert.equal(markersHidden.linkDestinations.includes(analysisNoteDestination("note-alpha")), false);
  assert.ok(markersHidden.linkDestinations.includes(tokenNoteDestination("token-alpha")));
});

test("blank transient Notes do not consume vector PDF marker numbers or destinations", async () => {
  const documentSettings = settings();
  documentSettings.showTranslation = false;
  const result = await createVectorPdf(await input({
    literalTranslation: "",
    naturalTranslation: "",
    settings: documentSettings,
    notes: [
      note({ id: "blank-note", text: "   " }),
      note({ id: "visible-note", text: "The only visible scholarly note." }),
    ],
  }));
  const pdf = await inspect(result.bytes);
  assert.equal(pdf.destinations.has(analysisNoteDestination("blank-note")), false);
  assert.ok(pdf.destinations.has(analysisNoteDestination("visible-note")));
  assert.ok(pdf.text.includes("The only visible scholarly note."));
  assert.ok(pdf.text.split(/\s+/u).includes("1"));
  assert.equal(pdf.text.split(/\s+/u).includes("2"), false);
});

const tokenHeightPx = (item: VectorPdfToken, documentSettings: VectorPdfSettings) => {
  const style = deriveDocumentTokenStyleDefaults(documentSettings);
  const visibility = deriveLegacyTokenLayerVisibility(documentSettings, { hideDetails: false });
  const text = {
    source: `${item.punctuationBefore ?? ""}${item.surface}${item.punctuationAfter}`,
    gloss: item.gloss,
    lemma: item.lemma,
    pos: item.pos.toUpperCase(),
    morphology: item.morphology,
  } as const;
  return measureTokenLayerStackHeight(
    resolveVisibleTokenLayers(style, visibility).map((layer) => ({
      ...layer,
      text: text[layer.layer],
      lineHeight: TOKEN_LAYER_LINE_HEIGHT[layer.layer],
    })),
    96 / 72,
    1,
  );
};

test("vector PDF consumes the Preview-resolved Notes block without repagination", async () => {
  const documentSettings = settings();
  documentSettings.showTranslation = false;
  const sourceToken = token();
  const sourceNote = note({ text: "A compact shared-plan note." });
  const rowHeight = tokenHeightPx(sourceToken, documentSettings);
  const plan: ResolvedInterlinearPaginationPlan = {
    unit: "css-px-96dpi",
    sourceKey: "notes-preview-plan",
    noteSources: [{ noteId: sourceNote.id, tokenId: sourceNote.tokenId, text: sourceNote.text }],
    translationSources: [],
    rowGapBounds: {
      minimumPx: documentSettings.lineGap * SMART_ROW_GAP_MINIMUM_RATIO,
      preferredPx: documentSettings.lineGap,
      maximumPx: documentSettings.lineGap * SMART_ROW_GAP_MAXIMUM_RATIO,
    },
    pages: [{
      pageIndex: 0,
      tokenRows: [{
        tokenIds: [sourceToken.id],
        yTopPx: 0,
        measuredHeightPx: rowHeight,
        gapBeforePx: 0,
        paragraphSpacingBeforePx: 0,
      }],
      noteBlocks: [{
        lines: [{
          noteId: sourceNote.id,
          tokenId: sourceNote.tokenId,
          ordinal: 1,
          text: sourceNote.text,
          firstLine: true,
        }],
        yTopPx: rowHeight + ANALYSIS_NOTE_GAP_PX,
        lineStart: 0,
        continued: false,
        startsAtPageTop: false,
      }],
      translationLines: [],
      translationYTopPx: null,
      translationContinued: false,
      translationStartsAtPageTop: false,
      translationBlocks: [],
      breakReason: "end",
      remainingBottomPx: 0,
    }],
  };
  const result = await createVectorPdf(await input({
    notes: [sourceNote],
    tokens: [sourceToken],
    settings: documentSettings,
    literalTranslation: "",
    naturalTranslation: "",
    paginationPlan: plan,
    layoutSourceKey: plan.sourceKey,
  }));
  assert.equal(result.layoutPlanSource, "preview");
  const pdf = await inspect(result.bytes);
  assert.ok(pdf.text.includes(sourceNote.text));
  assert.ok(pdf.destinations.has(analysisNoteDestination(sourceNote.id)));
});

test("vector-safe OMNI publication excludes nonempty legacy Notes without changing the project copy", async () => {
  const legacyProjectNotes = [note({
    id: "legacy-omni-note",
    tokenId: null,
    text: "Legacy OMNI analysis must remain outside publication pagination.",
  })];
  const publicationNotes = analysisNotesForPublication(legacyProjectNotes, false);
  assert.deepEqual(publicationNotes, []);
  assert.equal(legacyProjectNotes.length, 1);

  const result = await createVectorPdf(await input({
    title: "OMNI publication Notes isolation",
    notes: publicationNotes,
    settings: {
      ...settings(),
      showNotes: true,
      showNoteMarkers: true,
    },
  }));
  assert.equal(result.kind, "vector");
  const pdf = await inspect(result.bytes);
  assert.equal(pdf.hasRasterImage, false);
  assert.ok(!pdf.text.includes("ANALYSIS NOTES"));
  assert.ok(!pdf.text.includes(legacyProjectNotes[0].text));
  assert.ok(!pdf.destinations.has(analysisNoteDestination(legacyProjectNotes[0].id)));
});
