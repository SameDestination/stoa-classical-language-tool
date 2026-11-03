// Use PDFKit's browser bundle so Vite never externalizes Node stream/zlib/fs modules.
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import {
  appendTrailingTextSections,
  paginateFlowLines,
  wrapMeasuredText,
  type ResolvedInterlinearPaginationPlan,
  type ResolvedNoteLinePlan,
} from "./lib/page-flow";
import {
  analysisNoteDestination,
  numberAnalysisNotes,
  tokenNoteDestination,
  type AnalysisNote,
} from "./lib/analysis-notes";
import {
  TOKEN_CARD_METRICS,
  TOKEN_LAYER_LINE_HEIGHT,
  deriveDocumentTokenStyleDefaults,
  deriveLegacyTokenLayerVisibility,
  maximumAtomicRowHeight,
  measureTokenLayerStackHeight,
  normalizeDocumentTokenStyle,
  resolveTokenStyle,
  resolveVisibleTokenLayers,
  type DocumentTokenStyle,
  type TokenStyleLayer,
  type TokenStyleOverride,
  type TokenTextStyle,
} from "./lib/token-style";
import type { UserFontFaceStyle, UserFontReference } from "./lib/user-fonts";
import {
  PRONUNCIATION_GAP_AFTER_PX,
  PRONUNCIATION_LINE_HEIGHT,
  containsNonLatinScriptLetters,
  resolvePronunciationStyle,
} from "./lib/pronunciation";
import { resolveTrailingTextMeasurePx } from "./lib/publication-layout";

type BreakAfter = "none" | "line" | "paragraph";

export type VectorPdfToken = {
  id: string;
  surface: string;
  punctuationBefore?: string;
  punctuationAfter: string;
  lemma: string;
  gloss: string;
  pos: string;
  morphology: string;
  /** Canonical local classification; explicit false overrides legacy POS fallback. */
  isIndeclinable?: boolean;
  breakAfter?: BreakAfter;
  blankLinesAfter?: number;
  blankLineSpacing?: number;
  wordFont?: string;
  wordSize?: number;
  wordColor?: string;
  wordBold?: boolean;
  wordItalic?: boolean;
  wordUnderline?: boolean;
  lemmaColor?: string;
  lemmaUnderline?: boolean;
  morphColor?: string;
  morphUnderline?: boolean;
  pinyin?: string;
  romanization?: string;
  pronunciationSize?: number;
  pronunciationColor?: string;
  /** STOA 5.1 sparse per-layer differences from the document defaults. */
  styleOverrides?: TokenStyleOverride;
};

export type VectorPdfSettings = {
  greekSize: number;
  glossSize: number;
  lemmaSize: number;
  posSize: number;
  morphSize: number;
  translationSize: number;
  translationFont?: string;
  translationColor?: string;
  translationBold?: boolean;
  translationItalic?: boolean;
  translationUnderline?: boolean;
  wordGap: number;
  lineGap: number;
  greekFont: string;
  englishFont: string;
  lemmaFont: string;
  morphFont: string;
  paperWidthMm: number;
  paperHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headerLeft: string;
  headerRight: string;
  footerLeft: string;
  footerRight: string;
  background: string;
  ink: string;
  accent: string;
  showLemma: boolean;
  showPos: boolean;
  hideIndeclinableDetails: boolean;
  showTranslation: boolean;
  /** STOA 5.8 scholarly endnotes rendered before translations. */
  showNotes?: boolean;
  /** Superscript note references attached to source tokens. */
  showNoteMarkers?: boolean;
  showPronunciation?: boolean;
  /** STOA 5.1 complete/partial five-layer document defaults. */
  tokenStyle?: DocumentTokenStyle;
};

export type VectorPdfFontFaces = Record<UserFontFaceStyle, string>;

export type VectorPdfCffFontFamily = {
  cssFamily: string;
  familyName: string;
  faces: Partial<Record<UserFontFaceStyle, string>> & { normal: string };
};

export type VectorPdfInput = {
  language?: string;
  title: string;
  literalTranslation?: string;
  naturalTranslation: string;
  notes?: AnalysisNote[];
  tokens: VectorPdfToken[];
  settings: VectorPdfSettings;
  notoSansScFontBase64?: string;
  notoSansJpFontBase64?: string;
  unicodeSerifFontBase64?: VectorPdfFontFaces;
  /** Times-compatible open font faces used for Times/Liberation Serif stacks. */
  unicodeTimesSerifFontBase64?: VectorPdfFontFaces;
  unicodeSansFontBase64?: VectorPdfFontFaces;
  classicalChineseFonts?: VectorPdfCffFontFamily[];
  importedFonts?: Array<UserFontReference & { dataBase64: string }>;
  literalTranslationLabel?: string;
  translationLabel?: string;
  /** Must match the browser plan fingerprint when supplied. */
  layoutSourceKey?: string;
  /** The browser-resolved pagination plan is authoritative when supplied. */
  paginationPlan?: ResolvedInterlinearPaginationPlan;
};

export type VectorPdfResult = {
  kind: "vector";
  bytes: Uint8Array;
  blob: Blob;
  pageCount: number;
  pageTokenIds: string[][];
  layoutPlanSource: "preview" | "vector";
};

type PdfLine = {
  tokens: VectorPdfToken[];
  paragraphSpacingBeforeMm: number;
  gapBeforeMm: number;
};

type PdfPage = {
  lines: PdfLine[];
  noteBlocks: Array<{
    lines: ResolvedNoteLinePlan[];
    lineStart: number;
    yTopMm?: number;
    continued: boolean;
    startsAtPageTop: boolean;
  }>;
  translationBlocks: Array<{
    sectionId: "literal" | "natural";
    lines: string[];
    yTopMm?: number;
    continued: boolean;
    startsAtPageTop: boolean;
  }>;
  breakReason?: "end" | "capacity" | "explicit" | "keep-with-next";
};

type RegisteredPdfFonts = {
  notoSansSc: boolean;
  notoSansJp: boolean;
  unicodeSerif: boolean;
  unicodeTimesSerif: boolean;
  unicodeSans: boolean;
  imported: Map<string, Partial<Record<UserFontFaceStyle, string>>>;
  classicalChinese: Map<string, Partial<Record<UserFontFaceStyle, string>>>;
  /** Source Han Serif SC is bundled as the deterministic missing-glyph fallback. */
  classicalChineseFallback?: Partial<Record<UserFontFaceStyle, string>>;
};

type ResolvedPdfTokenLayer = {
  layer: TokenStyleLayer | "pronunciation";
  text: string;
  style: TokenTextStyle;
  lineHeight: number;
  gapAfterPx: number;
};

type ResolvedPdfTokenLayout = {
  tokenId: string;
  layers: ResolvedPdfTokenLayer[];
  marker?: {
    fontSizePt: number;
    sourceWidthMm: number;
    parts: Array<{
      ordinal: number;
      noteId: string;
      text: string;
      widthMm: number;
      separatorWidthMm: number;
    }>;
    widthMm: number;
  };
  widthMm: number;
  heightMm: number;
};

const PT_TO_MM = 25.4 / 72;
const PX_TO_MM = 25.4 / 96;
const MM_TO_PT = 72 / 25.4;
const PAPER_LAYOUT_BORDER_MM = 2 * PX_TO_MM;
const PAPER_CONTENT_INSET_MM = PAPER_LAYOUT_BORDER_MM / 2;
const HEADER_RESERVE_MM = 41 * PX_TO_MM;
const FOOTER_RESERVE_MM = 26 * PX_TO_MM;
const TRANSLATION_GAP_MM = 30 * PX_TO_MM;
const TRANSLATION_CHROME_MM = 59 * PX_TO_MM;
export const ANALYSIS_NOTE_SIZE_RATIO = 0.86;
export const ANALYSIS_NOTE_MIN_SIZE_PT = 7;
export const ANALYSIS_NOTE_LINE_HEIGHT = 1.42;
export const ANALYSIS_NOTE_GAP_PX = 30;
export const ANALYSIS_NOTE_CHROME_PX = 52;
export const ANALYSIS_NOTE_NUMBER_COLUMN_PX = 22;
export const ANALYSIS_NOTE_MARKER_SIZE_RATIO = 0.48;
export const ANALYSIS_NOTE_MARKER_MIN_SIZE_PT = 5;
export const ANALYSIS_NOTE_MARKER_GAP_PX = 2;
const ANALYSIS_NOTE_GAP_MM = ANALYSIS_NOTE_GAP_PX * PX_TO_MM;
const ANALYSIS_NOTE_CHROME_MM = ANALYSIS_NOTE_CHROME_PX * PX_TO_MM;
const RUNNING_TEXT_GAP_MM = 12 * PX_TO_MM;
const SHARED_PLAN_TOLERANCE_MM = 0.75;
const INDECLINABLE_PARTS_OF_SPEECH = new Set(["ADV", "ADP", "CCONJ", "SCONJ", "PART", "INTJ"]);

export class VectorPdfLayoutMismatchError extends Error {
  readonly code = "STOA_VECTOR_LAYOUT_MISMATCH";

  constructor(message: string) {
    super(message);
    this.name = "VectorPdfLayoutMismatchError";
  }
}

type SurfaceTextOptions = {
  align?: "left" | "center" | "right";
  baseline?: "alphabetic";
  renderingMode?: "fill" | "fillThenStroke";
  charSpace?: number;
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/**
 * A millimetre-based PDFKit surface. PDFKit is used because its fontkit
 * backend embeds both TrueType and OpenType/CFF fonts as selectable text.
 * Keeping this adapter below the canonical STOA layout model avoids a second
 * CJK-only layout implementation.
 */
class VectorPdfSurface {
  readonly document: PDFKit.PDFDocument;
  private readonly chunks: Uint8Array[] = [];
  private currentFontSizePt = 12;
  private currentTextColor = "#000000";
  private currentSyntheticBold = false;
  private currentSyntheticItalic = false;
  private lineHeightFactor = 1.15;

  constructor(widthMm: number, heightMm: number) {
    this.document = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      margin: 0,
      size: [widthMm * MM_TO_PT, heightMm * MM_TO_PT],
      bufferPages: false,
    });
    this.document.on("data", (chunk: Uint8Array) => this.chunks.push(new Uint8Array(chunk)));
  }

  registerFont(name: string, base64: string) {
    this.document.registerFont(name, base64ToBytes(base64));
  }

  addPage(widthMm: number, heightMm: number) {
    this.document.addPage({
      size: [widthMm * MM_TO_PT, heightMm * MM_TO_PT],
      margin: 0,
    });
  }

  setFont(name: string, syntheticBold = false, syntheticItalic = false) {
    this.document.font(name);
    this.currentSyntheticBold = syntheticBold;
    this.currentSyntheticItalic = syntheticItalic;
  }

  setFontSize(sizePt: number) {
    this.currentFontSizePt = sizePt;
    this.document.fontSize(sizePt);
  }

  setTextColor(color: string) {
    this.currentTextColor = color;
    this.document.fillColor(color);
  }

  setDrawColor(color: string) {
    this.document.strokeColor(color);
  }

  setFillColor(color: string) {
    this.document.fillColor(color);
  }

  setLineWidth(widthMm: number) {
    this.document.lineWidth(widthMm * MM_TO_PT);
  }

  setLineHeightFactor(factor: number) {
    this.lineHeightFactor = factor;
  }

  getTextWidth(text: string) {
    return this.document.widthOfString(text, {
      oblique: this.currentSyntheticItalic,
    }) / MM_TO_PT;
  }

  supportsText(text: string) {
    const activeFont = (this.document as PDFKit.PDFDocument & {
      _font?: { font?: { hasGlyphForCodePoint?: (codePoint: number) => boolean } };
    })._font?.font;
    if (!activeFont?.hasGlyphForCodePoint) return true;
    return [...text].every((character) => {
      const codePoint = character.codePointAt(0) as number;
      if (/\s/u.test(character) || codePoint < 0x20 || codePoint === 0x7f) return true;
      if ((codePoint >= 0xfe00 && codePoint <= 0xfe0f)
        || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)) return true;
      return activeFont.hasGlyphForCodePoint?.(codePoint) ?? true;
    });
  }

  text(value: string | string[], xMm: number, baselineMm: number, options: SurfaceTextOptions = {}) {
    const lines = Array.isArray(value) ? value : [value];
    lines.forEach((line, index) => {
      const content = line || " ";
      const widthPt = this.document.widthOfString(content, {
        oblique: this.currentSyntheticItalic,
        characterSpacing: options.charSpace ?? 0,
      });
      let xPt = xMm * MM_TO_PT;
      if (options.align === "center") xPt -= widthPt / 2;
      if (options.align === "right") xPt -= widthPt;
      const yPt = (baselineMm + index * this.currentFontSizePt * PT_TO_MM * this.lineHeightFactor) * MM_TO_PT;
      const syntheticStroke = this.currentSyntheticBold || options.renderingMode === "fillThenStroke";
      this.document.save();
      this.document.fillColor(this.currentTextColor).strokeColor(this.currentTextColor);
      if (syntheticStroke) this.document.lineWidth(Math.max(0.18, this.currentFontSizePt * 0.018));
      this.document.text(content, xPt, yPt, {
        lineBreak: false,
        baseline: options.baseline ?? "alphabetic",
        fill: true,
        stroke: syntheticStroke,
        oblique: this.currentSyntheticItalic,
        characterSpacing: options.charSpace ?? 0,
      });
      this.document.restore();
    });
  }

  line(x1Mm: number, y1Mm: number, x2Mm: number, y2Mm: number) {
    this.document
      .moveTo(x1Mm * MM_TO_PT, y1Mm * MM_TO_PT)
      .lineTo(x2Mm * MM_TO_PT, y2Mm * MM_TO_PT)
      .stroke();
  }

  rect(xMm: number, yMm: number, widthMm: number, heightMm: number, mode?: "F") {
    this.document.rect(xMm * MM_TO_PT, yMm * MM_TO_PT, widthMm * MM_TO_PT, heightMm * MM_TO_PT);
    if (mode === "F") this.document.fill();
    else this.document.stroke();
  }

  addNamedDestination(name: string, xMm: number, yMm: number) {
    this.document.addNamedDestination(
      name,
      "XYZ",
      xMm * MM_TO_PT,
      yMm * MM_TO_PT,
      null,
    );
  }

  goTo(xMm: number, yMm: number, widthMm: number, heightMm: number, destination: string) {
    this.document.goTo(
      xMm * MM_TO_PT,
      yMm * MM_TO_PT,
      Math.max(0.4, widthMm * MM_TO_PT),
      Math.max(0.4, heightMm * MM_TO_PT),
      destination,
    );
  }

  setProperties(properties: { title: string; subject: string; author: string; creator: string }) {
    this.document.info.Title = properties.title;
    this.document.info.Subject = properties.subject;
    this.document.info.Author = properties.author;
    this.document.info.Creator = properties.creator;
  }

  async finish() {
    const completed = new Promise<void>((resolve, reject) => {
      this.document.once("end", resolve);
      this.document.once("error", reject);
    });
    this.document.end();
    await completed;
    const length = this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
}

// Preserve the project's exact code-point sequence. Font shaping may choose a
// composed glyph, but STOA must not rewrite the source data before PDFKit builds
// the searchable text map.
const preservePdfText = (value: string) => value;

const getTokenSourceText = (token: VectorPdfToken) => preservePdfText(
  `${token.punctuationBefore ?? ""}${token.surface}${token.punctuationAfter}`,
);

const textLines = (value: string) => preservePdfText(value).split(/\r\n|\r|\n/);

const hideDetailsForToken = (token: VectorPdfToken, settings: VectorPdfSettings) =>
  settings.hideIndeclinableDetails && (
    typeof token.isIndeclinable === "boolean"
      ? token.isIndeclinable
      : INDECLINABLE_PARTS_OF_SPEECH.has(token.pos.trim().toUpperCase())
  );

const documentTokenStyleFor = (settings: VectorPdfSettings): DocumentTokenStyle => {
  const legacyDefaults = deriveDocumentTokenStyleDefaults(settings);
  return settings.tokenStyle
    ? normalizeDocumentTokenStyle(settings.tokenStyle, legacyDefaults)
    : legacyDefaults;
};

const tokenLayerText = (token: VectorPdfToken, layer: TokenStyleLayer) => {
  if (layer === "source") return getTokenSourceText(token);
  if (layer === "gloss") return preservePdfText(token.gloss);
  if (layer === "lemma") return preservePdfText(token.lemma);
  if (layer === "pos") return preservePdfText(token.pos.toUpperCase());
  return preservePdfText(token.morphology);
};

const pronunciationText = (token: VectorPdfToken, language?: string) => {
  if (language === "classical-chinese") return token.pinyin?.normalize("NFC") ?? "";
  if (language === "omni") {
    return containsNonLatinScriptLetters(token.surface)
      ? token.romanization?.normalize("NFC") ?? ""
      : "";
  }
  // Greek, Latin, and unknown direct callers never gain a reading row merely
  // because an imported token contains an unrelated future field.
  return "";
};

const formatPageText = (template: string, page: number, pages: number, tokens: number) => preservePdfText(
  template
    .replaceAll("{page:02}", String(page).padStart(2, "0"))
    .replaceAll("{page}", String(page))
    .replaceAll("{pages}", String(pages))
    .replaceAll("{tokens}", String(tokens)),
);

const normalizeHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : "#29271f";

const mixHex = (foreground: string, background: string, foregroundRatio: number) => {
  const parse = (value: string) => {
    const hex = normalizeHex(value).slice(1);
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  };
  const front = parse(foreground);
  const back = parse(background);
  return `#${front.map((channel, index) =>
    Math.round(channel * foregroundRatio + back[index] * (1 - foregroundRatio))
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
};

const usesJapaneseScript = (text: string) =>
  /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/u.test(text);

const usesHanScript = (text: string) =>
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/u.test(text);

const usesBopomofoScript = (text: string) => /[\u3100-\u312f\u31a0-\u31bf]/u.test(text);

const usesCjkScript = (text: string) =>
  usesJapaneseScript(text) || usesHanScript(text) || usesBopomofoScript(text);

const requestsNotoSansJp = (family: string) =>
  /Noto\s*Sans(?:\s*CJK)?\s*JP|NotoSansJP/iu.test(family);

const requestsNotoSansSc = (family: string) =>
  /Noto\s*Sans(?:\s*CJK)?\s*SC|NotoSansSC/iu.test(family);

const primaryCssFamily = (family: string) => family
  .split(",", 1)[0]
  .trim()
  .replace(/^['"]|['"]$/gu, "");

const requestsTimesCompatibleSerif = (family: string) =>
  /^(?:Times New Roman|Times|Liberation Serif(?: STOA)?)$/iu.test(primaryCssFamily(family));

const resolveClassicalChineseFamily = (
  family: string,
  fonts: RegisteredPdfFonts,
) => fonts.classicalChinese.get(family)
  ?? fonts.classicalChinese.get(primaryCssFamily(family));

const resolveCjkPdfFont = (
  family: string,
  text: string,
  fonts: RegisteredPdfFonts,
) => {
  const preferJapanese = requestsNotoSansJp(family) ||
    (!requestsNotoSansSc(family) && usesJapaneseScript(text));
  if (preferJapanese && fonts.notoSansJp) return "NotoSansJP";
  if (!preferJapanese && fonts.notoSansSc) return "NotoSansSC";
  if (fonts.notoSansJp) return "NotoSansJP";
  if (fonts.notoSansSc) return "NotoSansSC";
  throw new Error("The PDF contains CJK text, but no compatible Noto Sans SC or Noto Sans JP font was supplied.");
};

const resolveBundledCffFace = (
  faces: Partial<Record<UserFontFaceStyle, string>>,
  requestedStyle: UserFontFaceStyle,
) => {
  const wantsBold = requestedStyle === "bold" || requestedStyle === "bolditalic";
  const wantsItalic = requestedStyle === "italic" || requestedStyle === "bolditalic";
  const actualStyle: UserFontFaceStyle = faces[requestedStyle]
    ? requestedStyle
    : wantsBold && faces.bold
      ? "bold"
      : wantsItalic && faces.italic
        ? "italic"
        : "normal";
  const name = faces[actualStyle] ?? faces.normal;
  if (!name) throw new Error("The bundled Classical Chinese font has no usable upright face.");
  const actualBold = actualStyle === "bold" || actualStyle === "bolditalic";
  const actualItalic = actualStyle === "italic" || actualStyle === "bolditalic";
  return {
    name,
    syntheticBold: wantsBold && !actualBold,
    syntheticItalic: wantsItalic && !actualItalic,
  };
};

const resolvePdfFont = (
  family: string,
  text: string,
  fonts: RegisteredPdfFonts,
  requestedStyle: UserFontFaceStyle,
) => {
  const importedFamily = fonts.imported.get(family) ?? fonts.imported.get(primaryCssFamily(family));
  if (importedFamily) {
    const importedFace = importedFamily[requestedStyle];
    if (!importedFace) {
      throw new Error(`The imported font ${family} has no ${requestedStyle} face. Import that face or disable the matching bold/italic style.`);
    }
    return { name: importedFace, syntheticBold: false, syntheticItalic: false };
  }
  const classicalChineseFamily = resolveClassicalChineseFamily(family, fonts);
  if (classicalChineseFamily) {
    return resolveBundledCffFace(classicalChineseFamily, requestedStyle);
  }
  if (usesCjkScript(text) || requestsNotoSansJp(family) || requestsNotoSansSc(family)) {
    return {
      name: resolveCjkPdfFont(family, text, fonts),
      syntheticBold: requestedStyle === "bold" || requestedStyle === "bolditalic",
      syntheticItalic: requestedStyle === "italic" || requestedStyle === "bolditalic",
    };
  }
  if (/Arial|Inter|sans-serif/i.test(family)) {
    if (!fonts.unicodeSans) {
      throw new Error("The PDF contains Latin text, but the bundled Unicode sans-serif faces were not supplied.");
    }
    return { name: `LiberationSansSTOA-${requestedStyle}`, syntheticBold: false, syntheticItalic: false };
  }
  if (/^Times New Roman$/iu.test(primaryCssFamily(family))) {
    throw new Error("Times New Roman needs its original font files for vector PDF. Choose Load Times New Roman in Typography, or import its Regular/Bold/Italic/Bold Italic TTF/OTF files. STOA will not substitute another font.");
  }
  if (requestsTimesCompatibleSerif(family) && fonts.unicodeTimesSerif) {
    return { name: `LiberationSerifSTOA-${requestedStyle}`, syntheticBold: false, syntheticItalic: false };
  }
  if (!fonts.unicodeSerif) {
    throw new Error("The PDF contains Latin text, but the bundled Unicode serif faces were not supplied.");
  }
  return { name: `NotoSerifSTOA-${requestedStyle}`, syntheticBold: false, syntheticItalic: false };
};

const fontStyle = (bold = false, italic = false): UserFontFaceStyle => {
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
};

const selectFont = (
  pdf: VectorPdfSurface,
  family: string,
  text: string,
  fonts: RegisteredPdfFonts,
  bold = false,
  italic = false,
) => {
  const requestedStyle = fontStyle(bold, italic);
  let resolved = resolvePdfFont(family, text, fonts, requestedStyle);
  pdf.setFont(resolved.name, resolved.syntheticBold, resolved.syntheticItalic);
  const selectedChineseFamily = Boolean(resolveClassicalChineseFamily(family, fonts));
  if (!pdf.supportsText(text) && (selectedChineseFamily || usesCjkScript(text))) {
    const fallbackFaces = fonts.classicalChineseFallback;
    if (!fallbackFaces) {
      throw new Error(`The selected PDF font cannot render every character in “${text}”, and the bundled Source Han Serif fallback was not supplied.`);
    }
    resolved = resolveBundledCffFace(fallbackFaces, requestedStyle);
    pdf.setFont(resolved.name, resolved.syntheticBold, resolved.syntheticItalic);
    if (!pdf.supportsText(text)) {
      throw new Error(`The selected PDF font and bundled Source Han Serif fallback cannot render every character in “${text}”.`);
    }
  } else if (!pdf.supportsText(text)) {
    throw new Error(`The selected PDF font ${family} cannot render every character in “${text}”. Use a bundled Unicode font or allow STOA to use the raster PDF route.`);
  }
  return resolved.name;
};

const measurePdfText = (
  pdf: VectorPdfSurface,
  text: string,
  family: string,
  sizePt: number,
  fonts: RegisteredPdfFonts,
  bold = false,
  italic = false,
) => {
  selectFont(pdf, family, text, fonts, bold, italic);
  pdf.setFontSize(sizePt);
  return Math.max(0, ...textLines(text).map((line) => pdf.getTextWidth(line || " ")));
};

const resolvePdfTokenLayout = (
  pdf: VectorPdfSurface,
  token: VectorPdfToken,
  settings: VectorPdfSettings,
  documentStyle: DocumentTokenStyle,
  fonts: RegisteredPdfFonts,
  language?: string,
  noteMarkers: ReadonlyArray<{ noteId: string; ordinal: number }> = [],
): ResolvedPdfTokenLayout => {
  const resolvedStyle = resolveTokenStyle(documentStyle, token);
  const visibility = deriveLegacyTokenLayerVisibility(settings, {
    hideDetails: hideDetailsForToken(token, settings),
  });
  for (const layer of ["source", "gloss", "lemma", "pos", "morphology"] as const) {
    if (!tokenLayerText(token, layer).length) visibility[layer] = false;
  }
  const layers: ResolvedPdfTokenLayer[] = resolveVisibleTokenLayers(resolvedStyle, visibility).map((layer) => ({
    ...layer,
    text: tokenLayerText(token, layer.layer),
    lineHeight: TOKEN_LAYER_LINE_HEIGHT[layer.layer],
  }));
  const pronunciation = settings.showPronunciation !== false
    ? pronunciationText(token, language)
    : "";
  if (pronunciation) {
    layers.unshift({
      layer: "pronunciation",
      text: pronunciation,
      style: resolvePronunciationStyle(
        token,
        resolvedStyle.layers.source,
        documentStyle.pronunciation,
      ),
      lineHeight: PRONUNCIATION_LINE_HEIGHT,
      gapAfterPx: PRONUNCIATION_GAP_AFTER_PX,
    });
  }
  const layerWidths = new Map(layers.map(({ layer, text, style }) => [
    layer,
    measurePdfText(
      pdf,
      text,
      style.fontFamily,
      style.sizePt,
      fonts,
      style.bold,
      style.italic,
    ),
  ]));
  const sourceLayer = layers.find((layer) => layer.layer === "source");
  const marker = sourceLayer && noteMarkers.length
    ? (() => {
        const fontSizePt = Math.max(
          ANALYSIS_NOTE_MARKER_MIN_SIZE_PT,
          sourceLayer.style.sizePt * ANALYSIS_NOTE_MARKER_SIZE_RATIO,
        );
        const parts = noteMarkers.map((note, index) => {
          const text = String(note.ordinal);
          return {
            ...note,
            text,
            widthMm: measurePdfText(
              pdf,
              text,
              settings.englishFont,
              fontSizePt,
              fonts,
            ),
            separatorWidthMm: index
              ? measurePdfText(pdf, ",", settings.englishFont, fontSizePt, fonts)
              : 0,
          };
        });
        return {
          fontSizePt,
          sourceWidthMm: layerWidths.get("source") ?? 0,
          parts,
          widthMm: parts.reduce(
            (sum, part) => sum + part.separatorWidthMm + part.widthMm,
            ANALYSIS_NOTE_MARKER_GAP_PX * PX_TO_MM,
          ),
        };
      })()
    : undefined;
  const widthMm = Math.max(
    0,
    ...layerWidths.values(),
    marker ? marker.sourceWidthMm + marker.widthMm : 0,
  ) + TOKEN_CARD_METRICS.horizontalChromePx * PX_TO_MM;
  const heightMm = measureTokenLayerStackHeight(layers, PT_TO_MM, PX_TO_MM);
  return { tokenId: token.id, layers, marker, widthMm, heightMm };
};

const paragraphSpacingMm = (token: VectorPdfToken, settings: VectorPdfSettings) => {
  if ((token.breakAfter ?? "none") !== "paragraph") return 0;
  const blankLines = Number.isFinite(token.blankLinesAfter)
    ? Math.min(20, Math.max(1, Math.round(token.blankLinesAfter as number)))
    : 1;
  const defaultSpacingPx = Math.max(18, settings.greekSize * (96 / 72) * 0.65);
  const spacingPx = Number.isFinite(token.blankLineSpacing)
    ? Math.min(200, Math.max(1, token.blankLineSpacing as number))
    : defaultSpacingPx;
  return blankLines * spacingPx * PX_TO_MM;
};

const layoutPdfPages = (
  pdf: VectorPdfSurface,
  tokens: VectorPdfToken[],
  notes: AnalysisNote[],
  literalTranslation: string,
  naturalTranslation: string,
  settings: VectorPdfSettings,
  fonts: RegisteredPdfFonts,
  language?: string,
  paginationPlan?: ResolvedInterlinearPaginationPlan,
  layoutSourceKey?: string,
) => {
  const documentStyle = documentTokenStyleFor(settings);
  const indexedNotes = numberAnalysisNotes(notes)
    .map(({ number, ...note }) => ({ note, ordinal: number }));
  // Notes and their source markers are independently hideable. Keep the full
  // ordered set whenever either surface is visible so numbering never changes
  // merely because one presentation layer was toggled off.
  const visibleNotes = (settings.showNotes === false && settings.showNoteMarkers === false)
    ? []
    : indexedNotes;
  const tokenIdSet = new Set(tokens.map((token) => token.id));
  const markersByToken = new Map<string, Array<{ noteId: string; ordinal: number }>>();
  if (settings.showNoteMarkers !== false) {
    visibleNotes.forEach(({ note, ordinal }) => {
      if (!note.tokenId || !tokenIdSet.has(note.tokenId)) return;
      const markers = markersByToken.get(note.tokenId) ?? [];
      markers.push({ noteId: note.id, ordinal });
      markersByToken.set(note.tokenId, markers);
    });
  }
  const tokenLayouts = new Map(tokens.map((token) => [
    token,
    resolvePdfTokenLayout(
      pdf,
      token,
      settings,
      documentStyle,
      fonts,
      language,
      markersByToken.get(token.id),
    ),
  ]));
  const usableWidth = Math.max(
    PX_TO_MM,
    settings.paperWidthMm - settings.marginLeftMm - settings.marginRightMm - PAPER_LAYOUT_BORDER_MM,
  );
  const headerReserve = settings.headerLeft.trim() || settings.headerRight.trim() ? HEADER_RESERVE_MM : 0;
  const footerReserve = settings.footerLeft.trim() || settings.footerRight.trim() ? FOOTER_RESERVE_MM : 0;
  const availableHeight = Math.max(
    PX_TO_MM,
    settings.paperHeightMm - settings.marginTopMm - settings.marginBottomMm -
      headerReserve - footerReserve - PAPER_LAYOUT_BORDER_MM,
  );
  const wordGapMm = settings.wordGap * PX_TO_MM;
  const lineGapMm = settings.lineGap * PX_TO_MM;
  const lines: PdfLine[] = [];
  let line: VectorPdfToken[] = [];
  let lineWidth = 0;
  let lineParagraphSpacing = 0;
  let nextParagraphSpacing = 0;

  const pushLine = () => {
    if (!line.length) return;
    lines.push({
      tokens: line,
      paragraphSpacingBeforeMm: lineParagraphSpacing,
      gapBeforeMm: 0,
    });
    line = [];
    lineWidth = 0;
    lineParagraphSpacing = 0;
  };

  tokens.forEach((token) => {
    const width = tokenLayouts.get(token)?.widthMm ?? 0;
    const proposed = line.length ? lineWidth + wordGapMm + width : width;
    if (line.length && proposed > usableWidth) pushLine();
    if (!line.length) {
      lineParagraphSpacing = nextParagraphSpacing;
      nextParagraphSpacing = 0;
    }
    line.push(token);
    lineWidth = line.length === 1 ? width : lineWidth + wordGapMm + width;
    if ((token.breakAfter ?? "none") !== "none") {
      pushLine();
      nextParagraphSpacing = paragraphSpacingMm(token, settings);
    }
  });
  pushLine();

  const measuredLines = lines.map((currentLine) => ({
    value: currentLine,
    height: maximumAtomicRowHeight(
      currentLine.tokens,
      (token) => tokenLayouts.get(token)?.heightMm ?? 0,
    ),
    spacingBefore: currentLine.paragraphSpacingBeforeMm,
  }));
  const tokenPages = paginateFlowLines(measuredLines, availableHeight, lineGapMm, {
    smart: true,
    stretchFinalPage: false,
    nearbyBreakSearch: 3,
  });

  // Preview and both PDF routes share one explicit scholarly prose measure.
  const trailingTextMeasurePx = resolveTrailingTextMeasurePx(usableWidth / PX_TO_MM);
  const translationWidth = trailingTextMeasurePx * PX_TO_MM;
  const wrapTranslation = (text: string) => {
    const normalized = preservePdfText(text);
    if (!settings.showTranslation || !normalized.trim()) return [];
    selectFont(pdf, settings.translationFont ?? settings.englishFont, normalized, fonts, settings.translationBold, settings.translationItalic !== false);
    pdf.setFontSize(settings.translationSize);
    return wrapMeasuredText(
      normalized,
      translationWidth,
      (value) => {
        selectFont(pdf, settings.translationFont ?? settings.englishFont, value, fonts, settings.translationBold, settings.translationItalic !== false);
        pdf.setFontSize(settings.translationSize);
        return pdf.getTextWidth(value || " ");
      },
    );
  };
  const noteSizePt = Math.max(
    ANALYSIS_NOTE_MIN_SIZE_PT,
    settings.translationSize * ANALYSIS_NOTE_SIZE_RATIO,
  );
  const noteLineHeightMm = noteSizePt * PT_TO_MM * ANALYSIS_NOTE_LINE_HEIGHT;
  const noteTextWidth = Math.max(
    PX_TO_MM,
    translationWidth - ANALYSIS_NOTE_NUMBER_COLUMN_PX * PX_TO_MM,
  );
  const noteSources = settings.showNotes === false
    ? []
    : indexedNotes.map(({ note }) => ({
        noteId: note.id,
        tokenId: note.tokenId,
        text: preservePdfText(note.text),
      }));
  const noteLines: ResolvedNoteLinePlan[] = settings.showNotes === false
    ? []
    : indexedNotes.flatMap(({ note, ordinal }) => {
        const normalized = preservePdfText(note.text);
        selectFont(pdf, settings.englishFont, normalized, fonts);
        pdf.setFontSize(noteSizePt);
        const lines = wrapMeasuredText(
          normalized,
          noteTextWidth,
          (value) => {
            selectFont(pdf, settings.englishFont, value || " ", fonts);
            pdf.setFontSize(noteSizePt);
            return pdf.getTextWidth(value || " ");
          },
        );
        return lines.map((text, lineIndex) => ({
          noteId: note.id,
          tokenId: note.tokenId,
          ordinal,
          text,
          firstLine: lineIndex === 0,
        }));
      });
  const translationSections = ([
    ["literal", wrapTranslation(literalTranslation)],
    ["natural", wrapTranslation(naturalTranslation)],
  ] as const).filter(([, sectionLines]) => sectionLines.length);
  let layoutPlanSource: "preview" | "vector" = "vector";
  let pages: PdfPage[];

  if (paginationPlan) {
    if (paginationPlan.unit !== "css-px-96dpi" || !paginationPlan.pages.length) {
      throw new VectorPdfLayoutMismatchError("The Preview pagination plan is empty or uses an unsupported unit.");
    }
    if (layoutSourceKey && paginationPlan.sourceKey !== layoutSourceKey) {
      throw new VectorPdfLayoutMismatchError("The Preview pagination plan is stale for the current document layout.");
    }
    if (
      paginationPlan.contentWidthPx !== undefined
      && Math.abs(paginationPlan.contentWidthPx * PX_TO_MM - usableWidth) > SHARED_PLAN_TOLERANCE_MM
    ) {
      throw new VectorPdfLayoutMismatchError("Preview and vector PDF use different content widths.");
    }
    if (
      paginationPlan.contentHeightPx !== undefined
      && Math.abs(paginationPlan.contentHeightPx * PX_TO_MM - availableHeight) > SHARED_PLAN_TOLERANCE_MM
    ) {
      throw new VectorPdfLayoutMismatchError("Preview and vector PDF use different content heights.");
    }
    if (
      paginationPlan.trailingTextMeasurePx !== undefined
      && Math.abs(paginationPlan.trailingTextMeasurePx - trailingTextMeasurePx) > 0.01
    ) {
      throw new VectorPdfLayoutMismatchError("Preview and vector PDF use different Notes/translation measures.");
    }
    const gapBounds = paginationPlan.rowGapBounds;
    if (
      !gapBounds
      || gapBounds.minimumPx < 0
      || gapBounds.minimumPx > gapBounds.preferredPx
      || gapBounds.preferredPx > gapBounds.maximumPx
    ) {
      throw new VectorPdfLayoutMismatchError("The Preview row-gap bounds are invalid.");
    }
    if (Math.abs(gapBounds.preferredPx * PX_TO_MM - lineGapMm) > 0.01) {
      throw new VectorPdfLayoutMismatchError("Preview and vector PDF use different preferred row spacing.");
    }
    const tokenById = new Map(tokens.map((token) => [token.id, token]));
    const plannedTokenIds = paginationPlan.pages.flatMap((page) =>
      page.tokenRows.flatMap((row) => row.tokenIds));
    const expectedTokenIds = tokens.map((token) => token.id);
    if (
      plannedTokenIds.length !== expectedTokenIds.length
      || plannedTokenIds.some((tokenId, index) => tokenId !== expectedTokenIds[index])
      || new Set(plannedTokenIds).size !== plannedTokenIds.length
    ) {
      throw new VectorPdfLayoutMismatchError("Preview and vector export do not contain the same ordered token IDs.");
    }
    const plannedNoteBlocks = paginationPlan.pages.flatMap((page) => page.noteBlocks ?? []);
    const plannedNoteLines = plannedNoteBlocks.flatMap((block) => block.lines);
    if (JSON.stringify(paginationPlan.noteSources ?? []) !== JSON.stringify(noteSources)) {
      throw new VectorPdfLayoutMismatchError("The Preview scholarly-note sources changed before vector export.");
    }
    let expectedNoteLineStart = 0;
    plannedNoteBlocks.forEach((block, blockIndex) => {
      if (block.lineStart !== expectedNoteLineStart) {
        throw new VectorPdfLayoutMismatchError("Preview scholarly-note fragments are missing, duplicated, or out of order.");
      }
      if (block.continued !== (blockIndex > 0)) {
        throw new VectorPdfLayoutMismatchError("Preview scholarly-note continuation metadata is inconsistent.");
      }
      expectedNoteLineStart += block.lines.length;
    });
    const noteSourceById = new Map(noteSources.map((note, index) => [
      note.noteId,
      { ...note, ordinal: index + 1 },
    ]));
    const plannedNoteStarts: string[] = [];
    let previousNoteId: string | null = null;
    plannedNoteLines.forEach((line) => {
      const source = noteSourceById.get(line.noteId);
      if (
        !source
        || source.tokenId !== line.tokenId
        || source.ordinal !== line.ordinal
        || line.firstLine !== (previousNoteId !== line.noteId)
      ) {
        throw new VectorPdfLayoutMismatchError("Preview scholarly-note line metadata does not match its ordered sources.");
      }
      if (line.firstLine) plannedNoteStarts.push(line.noteId);
      previousNoteId = line.noteId;
    });
    if (
      plannedNoteLines.length !== expectedNoteLineStart
      || JSON.stringify(plannedNoteStarts) !== JSON.stringify(noteSources.map((note) => note.noteId))
    ) {
      throw new VectorPdfLayoutMismatchError("Preview and vector PDF contain different scholarly-note order.");
    }
    const plannedTranslationFragments = paginationPlan.pages.flatMap((page) =>
      page.translationBlocks?.length
        ? page.translationBlocks.map((block) => ({ sectionId: block.sectionId, lines: block.lines }))
        : page.translationLines.length
          ? [{ sectionId: "natural", lines: page.translationLines }]
          : []);
    const plannedTranslationSections: Array<{ sectionId: string; lines: string[] }> = [];
    plannedTranslationFragments.forEach((fragment) => {
      const previous = plannedTranslationSections.at(-1);
      if (previous?.sectionId === fragment.sectionId) previous.lines.push(...fragment.lines);
      else plannedTranslationSections.push({ sectionId: fragment.sectionId, lines: [...fragment.lines] });
    });
    const expectedTranslationSources = (settings.showTranslation
      ? ([
          ["literal", preservePdfText(literalTranslation)],
          ["natural", preservePdfText(naturalTranslation)],
        ] as const).filter(([, text]) => text.trim())
      : []).map(([sectionId, text]) => ({ sectionId, text }));
    const plannedSectionIds = plannedTranslationSections.map(({ sectionId }) => sectionId);
    const expectedSectionIds = expectedTranslationSources.map(({ sectionId }) => sectionId);
    if (JSON.stringify(plannedSectionIds) !== JSON.stringify(expectedSectionIds)) {
      throw new VectorPdfLayoutMismatchError("Preview and vector PDF contain different translation section order.");
    }
    if (paginationPlan.translationSources) {
      if (JSON.stringify(paginationPlan.translationSources) !== JSON.stringify(expectedTranslationSources)) {
        throw new VectorPdfLayoutMismatchError("The Preview translation source changed before vector export.");
      }
    } else {
      // Legacy plans lack exact source metadata, so retain their stricter
      // line-array validation. New browser plans avoid false raster fallback
      // caused by Canvas and PDFKit choosing adjacent safe wrap points.
      const expectedTranslationSections = translationSections.map(([sectionId, sectionLines]) => ({
        sectionId,
        lines: sectionLines,
      }));
      if (JSON.stringify(plannedTranslationSections) !== JSON.stringify(expectedTranslationSections)) {
        throw new VectorPdfLayoutMismatchError("Preview and vector PDF contain different translation text or section order.");
      }
    }

    pages = paginationPlan.pages.map((plannedPage, pageIndex): PdfPage => {
      if (plannedPage.pageIndex !== pageIndex) {
        throw new VectorPdfLayoutMismatchError("Preview page indices are not contiguous.");
      }
      let expectedYTopMm = 0;
      const plannedLines = plannedPage.tokenRows.map((row, rowIndex): PdfLine => {
        const rowTokens = row.tokenIds.map((tokenId) => tokenById.get(tokenId)).filter(
          (token): token is VectorPdfToken => Boolean(token),
        );
        if (rowTokens.length !== row.tokenIds.length || !rowTokens.length) {
          throw new VectorPdfLayoutMismatchError("A Preview row references a missing or empty token group.");
        }
        const rowWidth = rowTokens.reduce(
          (sum, token, index) => sum + (tokenLayouts.get(token)?.widthMm ?? 0) + (index ? wordGapMm : 0),
          0,
        );
        if (rowWidth > usableWidth + SHARED_PLAN_TOLERANCE_MM) {
          throw new VectorPdfLayoutMismatchError(
            `A Preview row is ${rowWidth.toFixed(2)} mm wide but the vector page allows ${usableWidth.toFixed(2)} mm.`,
          );
        }
        const actualHeight = maximumAtomicRowHeight(
          rowTokens,
          (token) => tokenLayouts.get(token)?.heightMm ?? 0,
        );
        const plannedHeight = row.measuredHeightPx * PX_TO_MM;
        if (Math.abs(actualHeight - plannedHeight) > SHARED_PLAN_TOLERANCE_MM) {
          throw new VectorPdfLayoutMismatchError(
            `A Preview row height differs from vector measurement by ${Math.abs(actualHeight - plannedHeight).toFixed(2)} mm.`,
          );
        }
        if (
          rowIndex > 0
          && (
            row.gapBeforePx < gapBounds.minimumPx - 0.01
            || row.gapBeforePx > gapBounds.maximumPx + 0.01
          )
        ) {
          throw new VectorPdfLayoutMismatchError("A resolved Preview row gap falls outside its safe bounds.");
        }
        expectedYTopMm += (row.gapBeforePx + row.paragraphSpacingBeforePx) * PX_TO_MM;
        if (Math.abs(expectedYTopMm - row.yTopPx * PX_TO_MM) > SHARED_PLAN_TOLERANCE_MM) {
          throw new VectorPdfLayoutMismatchError("A Preview row Y position is inconsistent with its resolved gaps.");
        }
        expectedYTopMm += plannedHeight;
        return {
          tokens: rowTokens,
          paragraphSpacingBeforeMm: row.paragraphSpacingBeforePx * PX_TO_MM,
          gapBeforeMm: row.gapBeforePx * PX_TO_MM,
        };
      });
      const rowHeight = plannedLines.reduce((sum, currentLine) => sum
        + currentLine.gapBeforeMm
        + currentLine.paragraphSpacingBeforeMm
        + maximumAtomicRowHeight(
          currentLine.tokens,
          (token) => tokenLayouts.get(token)?.heightMm ?? 0,
        ), 0);
      const legacyTranslationBlock = plannedPage.translationLines.length
        ? [{
            sectionId: "natural",
            lines: plannedPage.translationLines,
            yTopPx: plannedPage.translationYTopPx ?? 0,
            continued: plannedPage.translationContinued,
            startsAtPageTop: plannedPage.translationStartsAtPageTop,
          }]
        : [];
      const plannedTranslationBlocks = plannedPage.translationBlocks?.length
        ? plannedPage.translationBlocks
        : legacyTranslationBlock;
      let expectedContentBottomMm = rowHeight;
      const noteBlocks: PdfPage["noteBlocks"] = (plannedPage.noteBlocks ?? []).map((block, blockIndex) => {
        if (block.startsAtPageTop && (plannedLines.length > 0 || blockIndex > 0)) {
          throw new VectorPdfLayoutMismatchError("A non-first Preview scholarly-note block cannot start at the page top.");
        }
        const expectedYTopMm = block.startsAtPageTop
          ? 0
          : expectedContentBottomMm + ANALYSIS_NOTE_GAP_MM;
        if (Math.abs(expectedYTopMm - block.yTopPx * PX_TO_MM) > SHARED_PLAN_TOLERANCE_MM) {
          throw new VectorPdfLayoutMismatchError("A Preview scholarly-note Y position is inconsistent with preceding content.");
        }
        block.lines.forEach((noteLine) => {
          selectFont(pdf, settings.englishFont, noteLine.text || " ", fonts);
          pdf.setFontSize(noteSizePt);
          if (pdf.getTextWidth(noteLine.text || " ") > noteTextWidth + SHARED_PLAN_TOLERANCE_MM) {
            throw new VectorPdfLayoutMismatchError(
              `A Preview scholarly-note line is too wide for vector page ${pageIndex + 1}.`,
            );
          }
        });
        expectedContentBottomMm = expectedYTopMm
          + ANALYSIS_NOTE_CHROME_MM
          + block.lines.length * noteLineHeightMm;
        return {
          lines: block.lines.map((line) => ({ ...line })),
          lineStart: block.lineStart,
          yTopMm: block.yTopPx * PX_TO_MM,
          continued: block.continued,
          startsAtPageTop: block.startsAtPageTop,
        };
      });
      const translationBlocks: PdfPage["translationBlocks"] = plannedTranslationBlocks.map((block, blockIndex): PdfPage["translationBlocks"][number] => {
        const sectionId = block.sectionId;
        if (sectionId !== "literal" && sectionId !== "natural") {
          throw new VectorPdfLayoutMismatchError("A Preview translation block uses an unknown section ID.");
        }
        if (block.startsAtPageTop && (plannedLines.length > 0 || noteBlocks.length > 0 || blockIndex > 0)) {
          throw new VectorPdfLayoutMismatchError("A non-first Preview translation block cannot start at the page top.");
        }
        const expectedYTopMm = block.startsAtPageTop
          ? 0
          : expectedContentBottomMm + TRANSLATION_GAP_MM;
        if (Math.abs(expectedYTopMm - block.yTopPx * PX_TO_MM) > SHARED_PLAN_TOLERANCE_MM) {
          throw new VectorPdfLayoutMismatchError("A Preview translation Y position is inconsistent with preceding content.");
        }
        block.lines.forEach((translationLine) => {
          selectFont(pdf, settings.translationFont ?? settings.englishFont, translationLine || " ", fonts, settings.translationBold, settings.translationItalic !== false);
          pdf.setFontSize(settings.translationSize);
          if (pdf.getTextWidth(translationLine || " ") > translationWidth + SHARED_PLAN_TOLERANCE_MM) {
            throw new VectorPdfLayoutMismatchError(
              `A Preview translation line is too wide for vector page ${pageIndex + 1}.`,
            );
          }
        });
        expectedContentBottomMm = expectedYTopMm
          + TRANSLATION_CHROME_MM
          + block.lines.length * settings.translationSize * PT_TO_MM * 1.55;
        return {
          sectionId,
          lines: [...block.lines],
          yTopMm: block.yTopPx * PX_TO_MM,
          continued: block.continued,
          startsAtPageTop: block.startsAtPageTop,
        };
      });
      if (expectedContentBottomMm > availableHeight + SHARED_PLAN_TOLERANCE_MM) {
        throw new VectorPdfLayoutMismatchError(
          `Preview page ${pageIndex + 1} exceeds the vector content area by ${(expectedContentBottomMm - availableHeight).toFixed(2)} mm.`,
        );
      }
      return {
        lines: plannedLines,
        noteBlocks,
        translationBlocks,
        breakReason: plannedPage.breakReason,
      };
    });
    layoutPlanSource = "preview";
  } else {
    const translationLineHeight = settings.translationSize * PT_TO_MM * 1.55;
    const trailingSections = [
      ...(noteLines.length
        ? [{
            id: "notes",
            lines: noteLines.map((noteLine) => noteLine.text),
            lineHeight: noteLineHeightMm,
            blockChromeHeight: ANALYSIS_NOTE_CHROME_MM,
            gapAfterContent: ANALYSIS_NOTE_GAP_MM,
            minimumFirstFragmentLines: 2,
          }]
        : []),
      ...translationSections.map(([id, sectionLines]) => ({
        id,
        lines: sectionLines,
        lineHeight: translationLineHeight,
        blockChromeHeight: TRANSLATION_CHROME_MM,
        gapAfterContent: TRANSLATION_GAP_MM,
        minimumFirstFragmentLines: 2,
      })),
    ];
    const documentPages = appendTrailingTextSections(tokenPages, trailingSections, {
      pageCapacity: availableHeight,
    });
    pages = documentPages.map((page): PdfPage => {
      const resolvedLines = page.lines.map((lineItem) => ({
        ...lineItem.value,
        paragraphSpacingBeforeMm: lineItem.spacingBefore,
        gapBeforeMm: lineItem.gapBefore ?? 0,
      }));
      let contentBottomMm = resolvedLines.reduce((sum, currentLine) => sum
        + currentLine.gapBeforeMm
        + currentLine.paragraphSpacingBeforeMm
        + maximumAtomicRowHeight(
          currentLine.tokens,
          (token) => tokenLayouts.get(token)?.heightMm ?? 0,
        ), 0);
      const noteBlocks: PdfPage["noteBlocks"] = [];
      const translationBlocks: PdfPage["translationBlocks"] = [];
      page.trailingTextSections.forEach((fragment) => {
        if (fragment.sectionId === "notes") {
          const lineStart = fragment.lineStart ?? 0;
          const lines = noteLines
            .slice(lineStart, lineStart + fragment.lines.length)
            .map((line) => ({ ...line }));
          if (lines.length !== fragment.lines.length) {
            throw new Error("The vector scholarly-note paginator produced an invalid line range.");
          }
          const yTopMm = fragment.startsAtPageTop ? 0 : contentBottomMm + ANALYSIS_NOTE_GAP_MM;
          contentBottomMm = yTopMm
            + ANALYSIS_NOTE_CHROME_MM
            + lines.length * noteLineHeightMm;
          noteBlocks.push({
            lines,
            lineStart,
            yTopMm,
            continued: fragment.continued,
            startsAtPageTop: fragment.startsAtPageTop,
          });
          return;
        }
        if (fragment.sectionId !== "literal" && fragment.sectionId !== "natural") {
          throw new Error(`The vector paginator produced an unknown trailing section: ${fragment.sectionId}.`);
        }
        const yTopMm = fragment.startsAtPageTop ? 0 : contentBottomMm + TRANSLATION_GAP_MM;
        contentBottomMm = yTopMm + TRANSLATION_CHROME_MM + fragment.lines.length * translationLineHeight;
        translationBlocks.push({
          sectionId: fragment.sectionId,
          lines: fragment.lines,
          yTopMm,
          continued: fragment.continued,
          startsAtPageTop: fragment.startsAtPageTop,
        });
      });
      return {
        lines: resolvedLines,
        noteBlocks,
        translationBlocks,
        breakReason: page.breakReason,
      };
    });
  }
  return {
    pages,
    headerReserve,
    footerReserve,
    wordGapMm,
    lineGapMm,
    tokenLayouts,
    layoutPlanSource,
  };
};

const drawCenteredLines = (
  pdf: VectorPdfSurface,
  text: string,
  centerX: number,
  topY: number,
  family: string,
  sizePt: number,
  color: string,
  leading: number,
  fonts: RegisteredPdfFonts,
  bold = false,
  italic = false,
  underline = false,
) => {
  selectFont(pdf, family, text, fonts, bold, italic);
  pdf.setFontSize(sizePt);
  pdf.setTextColor(color);
  pdf.setDrawColor(color);
  const lineHeight = sizePt * PT_TO_MM * leading;
  const baselines: number[] = [];
  textLines(text).forEach((line, index) => {
    const baseline = topY + index * lineHeight + sizePt * PT_TO_MM * 0.84;
    const content = line || " ";
    pdf.text(content, centerX, baseline, {
      align: "center",
      baseline: "alphabetic",
      renderingMode: "fill",
    });
    if (underline) {
      const width = pdf.getTextWidth(content);
      pdf.setLineWidth(Math.max(0.12, sizePt * PT_TO_MM * 0.025));
      pdf.line(centerX - width / 2, baseline + sizePt * PT_TO_MM * 0.12, centerX + width / 2, baseline + sizePt * PT_TO_MM * 0.12);
    }
    baselines.push(baseline);
  });
  return topY + textLines(text).length * lineHeight;
};

const drawToken = (
  pdf: VectorPdfSurface,
  layout: ResolvedPdfTokenLayout,
  centerX: number,
  topY: number,
  settings: VectorPdfSettings,
  fonts: RegisteredPdfFonts,
) => {
  // Every anchored note links back here. Defining destinations for all tokens
  // is inexpensive and keeps later note editing from requiring a separate
  // destination-discovery pass.
  pdf.addNamedDestination(
    tokenNoteDestination(layout.tokenId),
    centerX - layout.widthMm / 2,
    topY,
  );
  let y = topY + (TOKEN_CARD_METRICS.borderPx + TOKEN_CARD_METRICS.paddingTopPx) * PX_TO_MM;
  layout.layers.forEach((layer) => {
    const layerTop = y;
    const layerCenterX = layer.layer === "source" && layout.marker
      ? centerX - layout.marker.widthMm / 2
      : centerX;
    y = drawCenteredLines(
      pdf,
      layer.text,
      layerCenterX,
      y,
      layer.style.fontFamily,
      layer.style.sizePt,
      layer.style.color,
      layer.lineHeight,
      fonts,
      layer.style.bold,
      layer.style.italic,
      layer.style.underline,
    );
    if (layer.layer === "source" && layout.marker) {
      const marker = layout.marker;
      const sourceBaseline = layerTop + layer.style.sizePt * PT_TO_MM * 0.84;
      const markerBaseline = sourceBaseline - layer.style.sizePt * PT_TO_MM * 0.42;
      let markerX = layerCenterX
        + marker.sourceWidthMm / 2
        + ANALYSIS_NOTE_MARKER_GAP_PX * PX_TO_MM;
      selectFont(pdf, settings.englishFont, marker.parts.map((part) => part.text).join(","), fonts);
      pdf.setFontSize(marker.fontSizePt);
      pdf.setTextColor(settings.accent);
      marker.parts.forEach((part) => {
        if (part.separatorWidthMm) {
          pdf.text(",", markerX, markerBaseline, { baseline: "alphabetic" });
          markerX += part.separatorWidthMm;
        }
        pdf.text(part.text, markerX, markerBaseline, { baseline: "alphabetic" });
        if (settings.showNotes !== false) {
          pdf.goTo(
            markerX,
            markerBaseline - marker.fontSizePt * PT_TO_MM,
            part.widthMm,
            marker.fontSizePt * PT_TO_MM * 1.25,
            analysisNoteDestination(part.noteId),
          );
        }
        markerX += part.widthMm;
      });
    }
    y += layer.gapAfterPx * PX_TO_MM;
  });
};

const drawPageFrame = (
  pdf: VectorPdfSurface,
  settings: VectorPdfSettings,
  pageNumber: number,
  pageCount: number,
  tokenCount: number,
  headerReserve: number,
  fonts: RegisteredPdfFonts,
) => {
  pdf.setFillColor(settings.background);
  pdf.rect(0, 0, settings.paperWidthMm, settings.paperHeightMm, "F");
  pdf.setDrawColor(mixHex(settings.ink, settings.background, 0.08));
  pdf.setLineWidth(0.18);
  pdf.rect(2.4, 2.4, settings.paperWidthMm - 4.8, settings.paperHeightMm - 4.8);

  const muted = mixHex(settings.ink, settings.background, 0.58);
  const runningTextLeft = settings.marginLeftMm + PAPER_CONTENT_INSET_MM;
  const runningTextRight = settings.paperWidthMm - settings.marginRightMm - PAPER_CONTENT_INSET_MM;
  const runningTextColumnWidth = Math.max(
    0,
    (runningTextRight - runningTextLeft - RUNNING_TEXT_GAP_MM) / 2,
  );
  const ellipsizeRunningText = (text: string) => {
    if (pdf.getTextWidth(text) <= runningTextColumnWidth) return text;
    const ellipsis = "…";
    if (pdf.getTextWidth(ellipsis) > runningTextColumnWidth) return "";
    const characters = [...text];
    let low = 0;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (pdf.getTextWidth(`${characters.slice(0, middle).join("")}${ellipsis}`) <= runningTextColumnWidth) low = middle;
      else high = middle - 1;
    }
    return `${characters.slice(0, low).join("")}${ellipsis}`;
  };
  const drawRunningText = (text: string, x: number, y: number, align: "left" | "right") => {
    selectFont(pdf, settings.englishFont, text, fonts, true);
    pdf.setFontSize(6);
    pdf.setTextColor(muted);
    pdf.text(ellipsizeRunningText(text), x, y, {
      align,
      baseline: "alphabetic",
      // Tracking is avoided so common readers preserve exact searchable text.
      charSpace: 0,
    });
  };

  if (headerReserve) {
    const y = settings.marginTopMm + PAPER_CONTENT_INSET_MM + 2.2;
    drawRunningText(
      formatPageText(settings.headerLeft, pageNumber, pageCount, tokenCount),
      runningTextLeft,
      y,
      "left",
    );
    drawRunningText(
      formatPageText(settings.headerRight, pageNumber, pageCount, tokenCount),
      runningTextRight,
      y,
      "right",
    );
    pdf.setDrawColor(mixHex(settings.ink, settings.background, 0.14));
    pdf.setLineWidth(0.2);
    pdf.line(
      settings.marginLeftMm + PAPER_CONTENT_INSET_MM,
      settings.marginTopMm + PAPER_CONTENT_INSET_MM + 5.7,
      settings.paperWidthMm - settings.marginRightMm - PAPER_CONTENT_INSET_MM,
      settings.marginTopMm + PAPER_CONTENT_INSET_MM + 5.7,
    );
  }

  if (settings.footerLeft.trim() || settings.footerRight.trim()) {
    const y = settings.paperHeightMm - settings.marginBottomMm - PAPER_CONTENT_INSET_MM - 0.65;
    drawRunningText(
      formatPageText(settings.footerLeft, pageNumber, pageCount, tokenCount),
      runningTextLeft,
      y,
      "left",
    );
    drawRunningText(
      formatPageText(settings.footerRight, pageNumber, pageCount, tokenCount),
      runningTextRight,
      y,
      "right",
    );
  }
};

const drawTranslation = (
  pdf: VectorPdfSurface,
  lines: string[],
  label: string,
  topY: number,
  settings: VectorPdfSettings,
  fonts: RegisteredPdfFonts,
) => {
  if (!settings.showTranslation || !lines.length) return;
  const left = settings.marginLeftMm + PAPER_CONTENT_INSET_MM + 5.8;
  const ruleColor = mixHex(settings.ink, settings.background, 0.14);
  pdf.setDrawColor(ruleColor);
  pdf.setLineWidth(0.2);
  pdf.line(
    settings.marginLeftMm + PAPER_CONTENT_INSET_MM,
    topY,
    settings.paperWidthMm - settings.marginRightMm - PAPER_CONTENT_INSET_MM,
    topY,
  );
  selectFont(pdf, settings.englishFont, label, fonts, true);
  pdf.setFontSize(6);
  pdf.setTextColor(settings.accent);
  pdf.text(label, left, topY + 5.2, { charSpace: 0 });
  selectFont(pdf, settings.translationFont ?? settings.englishFont, lines.join("\n"), fonts, settings.translationBold, settings.translationItalic !== false);
  pdf.setFontSize(settings.translationSize);
  pdf.setTextColor(settings.translationColor ?? settings.ink);
  pdf.setLineHeightFactor(1.55);
  pdf.text(lines, left, topY + 10.2, { baseline: "alphabetic" });
  if (settings.translationUnderline) {
    pdf.setDrawColor(settings.translationColor ?? settings.ink);
    pdf.setLineWidth(Math.max(0.12, settings.translationSize * PT_TO_MM * 0.045));
    lines.forEach((line, index) => {
      const y = topY + 10.2 + index * settings.translationSize * PT_TO_MM * 1.55 + settings.translationSize * PT_TO_MM * 0.12;
      pdf.line(left, y, left + pdf.getTextWidth(line), y);
    });
  }
  const bottomY = topY + TRANSLATION_CHROME_MM
    + lines.length * settings.translationSize * PT_TO_MM * 1.55;
  pdf.setDrawColor(ruleColor);
  pdf.line(
    settings.marginLeftMm + PAPER_CONTENT_INSET_MM,
    bottomY,
    settings.paperWidthMm - settings.marginRightMm - PAPER_CONTENT_INSET_MM,
    bottomY,
  );
};

const drawAnalysisNotes = (
  pdf: VectorPdfSurface,
  block: PdfPage["noteBlocks"][number],
  topY: number,
  settings: VectorPdfSettings,
  fonts: RegisteredPdfFonts,
) => {
  if (settings.showNotes === false || !block.lines.length) return;
  const left = settings.marginLeftMm + PAPER_CONTENT_INSET_MM + 5.8;
  const right = settings.paperWidthMm - settings.marginRightMm - PAPER_CONTENT_INSET_MM;
  const numberColumnMm = ANALYSIS_NOTE_NUMBER_COLUMN_PX * PX_TO_MM;
  const noteSizePt = Math.max(
    ANALYSIS_NOTE_MIN_SIZE_PT,
    settings.translationSize * ANALYSIS_NOTE_SIZE_RATIO,
  );
  const lineHeightMm = noteSizePt * PT_TO_MM * ANALYSIS_NOTE_LINE_HEIGHT;
  const ruleColor = mixHex(settings.ink, settings.background, 0.14);
  pdf.setDrawColor(ruleColor);
  pdf.setLineWidth(0.2);
  pdf.line(
    settings.marginLeftMm + PAPER_CONTENT_INSET_MM,
    topY,
    right,
    topY,
  );

  const label = block.continued ? "ANALYSIS NOTES - CONTINUED" : "ANALYSIS NOTES";
  selectFont(pdf, settings.englishFont, label, fonts, true);
  pdf.setFontSize(6);
  pdf.setTextColor(settings.accent);
  pdf.text(label, left, topY + 5.2, { baseline: "alphabetic" });

  block.lines.forEach((line, lineIndex) => {
    const baseline = topY + 10.2 + lineIndex * lineHeightMm;
    if (line.firstLine) {
      const numberText = String(line.ordinal);
      pdf.addNamedDestination(
        analysisNoteDestination(line.noteId),
        left,
        baseline - noteSizePt * PT_TO_MM,
      );
      selectFont(pdf, settings.englishFont, numberText, fonts);
      pdf.setFontSize(noteSizePt);
      pdf.setTextColor(settings.accent);
      pdf.text(numberText, left + numberColumnMm - 1.4, baseline, {
        align: "right",
        baseline: "alphabetic",
      });
      if (line.tokenId) {
        const numberWidth = pdf.getTextWidth(numberText);
        pdf.goTo(
          left + numberColumnMm - 1.4 - numberWidth,
          baseline - noteSizePt * PT_TO_MM,
          numberWidth,
          noteSizePt * PT_TO_MM * 1.25,
          tokenNoteDestination(line.tokenId),
        );
      }
    }
    selectFont(pdf, settings.englishFont, line.text || " ", fonts);
    pdf.setFontSize(noteSizePt);
    pdf.setTextColor(settings.ink);
    pdf.text(line.text || " ", left + numberColumnMm, baseline, {
      baseline: "alphabetic",
    });
  });

  const bottomY = topY
    + ANALYSIS_NOTE_CHROME_MM
    + block.lines.length * lineHeightMm;
  pdf.setDrawColor(ruleColor);
  pdf.line(
    settings.marginLeftMm + PAPER_CONTENT_INSET_MM,
    bottomY,
    right,
    bottomY,
  );
};

export const createVectorPdf = async (input: VectorPdfInput): Promise<VectorPdfResult> => {
  const { settings, tokens } = input;
  const pdf = new VectorPdfSurface(settings.paperWidthMm, settings.paperHeightMm);
  pdf.addPage(settings.paperWidthMm, settings.paperHeightMm);
  const fonts: RegisteredPdfFonts = {
    notoSansSc: Boolean(input.notoSansScFontBase64),
    notoSansJp: Boolean(input.notoSansJpFontBase64),
    unicodeSerif: Boolean(input.unicodeSerifFontBase64),
    unicodeTimesSerif: Boolean(input.unicodeTimesSerifFontBase64),
    unicodeSans: Boolean(input.unicodeSansFontBase64),
    imported: new Map(),
    classicalChinese: new Map(),
    classicalChineseFallback: undefined,
  };
  const registerFontFaces = (
    name: string,
    faces: VectorPdfFontFaces | undefined,
  ) => {
    if (!faces) return;
    (Object.entries(faces) as Array<[UserFontFaceStyle, string]>).forEach(([style, base64]) => {
      pdf.registerFont(`${name}-${style}`, base64);
    });
  };
  registerFontFaces("NotoSerifSTOA", input.unicodeSerifFontBase64);
  registerFontFaces("LiberationSerifSTOA", input.unicodeTimesSerifFontBase64);
  registerFontFaces("LiberationSansSTOA", input.unicodeSansFontBase64);
  if (input.notoSansScFontBase64) {
    pdf.registerFont("NotoSansSC", input.notoSansScFontBase64);
  }
  if (input.notoSansJpFontBase64) {
    pdf.registerFont("NotoSansJP", input.notoSansJpFontBase64);
  }
  for (const [index, font] of (input.classicalChineseFonts ?? []).entries()) {
    const family: Partial<Record<UserFontFaceStyle, string>> = {};
    for (const [style, base64] of Object.entries(font.faces) as Array<[UserFontFaceStyle, string]>) {
      const pdfName = `STOAClassicalChinese${index + 1}-${style}`;
      pdf.registerFont(pdfName, base64);
      family[style] = pdfName;
    }
    fonts.classicalChinese.set(font.cssFamily, family);
    fonts.classicalChinese.set(primaryCssFamily(font.cssFamily), family);
    fonts.classicalChinese.set(font.familyName, family);
    if (font.familyName === "Source Han Serif SC") fonts.classicalChineseFallback = family;
  }
  for (const [index, font] of (input.importedFonts ?? []).entries()) {
    const pdfName = `STOAImported${index + 1}-${font.faceStyle}`;
    try {
      pdf.registerFont(pdfName, font.dataBase64);
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(`The imported ${font.format.toUpperCase()} font “${font.familyName} ${font.subfamilyName}” cannot be embedded in this PDF${detail}`);
    }
    const family = fonts.imported.get(font.cssFamily) ?? {};
    family[font.faceStyle] = pdfName;
    fonts.imported.set(font.cssFamily, family);
    if (/^Times New Roman$/i.test(font.familyName)) fonts.imported.set("Times New Roman", family);
  }
  pdf.setProperties({
    title: preservePdfText(input.title),
    subject: "Searchable vector interlinear text",
    author: "STOA Interlinear Studio",
    creator: "STOA Interlinear Studio",
  });

  const layout = layoutPdfPages(
    pdf,
    tokens,
    input.notes ?? [],
    input.literalTranslation ?? "",
    input.naturalTranslation,
    settings,
    fonts,
    input.language,
    input.paginationPlan,
    input.layoutSourceKey,
  );
  const pageCount = layout.pages.length;
  layout.pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) pdf.addPage(settings.paperWidthMm, settings.paperHeightMm);
    drawPageFrame(pdf, settings, pageIndex + 1, pageCount, tokens.length, layout.headerReserve, fonts);
    let y = settings.marginTopMm + PAPER_CONTENT_INSET_MM + layout.headerReserve;
    page.lines.forEach((line) => {
      y += line.gapBeforeMm;
      y += line.paragraphSpacingBeforeMm;
      let x = settings.marginLeftMm + PAPER_CONTENT_INSET_MM;
      line.tokens.forEach((token) => {
        const tokenLayout = layout.tokenLayouts.get(token);
        if (!tokenLayout) return;
        const width = tokenLayout.widthMm;
        drawToken(pdf, tokenLayout, x + width / 2, y, settings, fonts);
        x += width + layout.wordGapMm;
      });
      y += maximumAtomicRowHeight(
        line.tokens,
        (token) => layout.tokenLayouts.get(token)?.heightMm ?? 0,
      );
    });
    page.noteBlocks.forEach((block) => {
      drawAnalysisNotes(
        pdf,
        block,
        settings.marginTopMm + PAPER_CONTENT_INSET_MM + layout.headerReserve
          + (block.yTopMm ?? (block.startsAtPageTop ? 0 : y + ANALYSIS_NOTE_GAP_MM)),
        settings,
        fonts,
      );
    });
    page.translationBlocks.forEach((block) => {
      const configuredLabel = block.sectionId === "literal"
        ? input.literalTranslationLabel
        : input.translationLabel;
      const baseLabel = preservePdfText(
        configuredLabel?.trim()
        || (block.sectionId === "literal" ? "LITERAL TRANSLATION" : "IDIOMATIC TRANSLATION"),
      );
      drawTranslation(
        pdf,
        block.lines,
        block.continued ? `${baseLabel} — CONTINUED` : baseLabel,
        settings.marginTopMm + PAPER_CONTENT_INSET_MM + layout.headerReserve
          + (block.yTopMm ?? (block.startsAtPageTop ? 0 : y + TRANSLATION_GAP_MM)),
        settings,
        fonts,
      );
    });
  });

  const bytes = await pdf.finish();
  return {
    kind: "vector",
    bytes,
    blob: new Blob([bytes.slice().buffer], { type: "application/pdf" }),
    pageCount,
    pageTokenIds: layout.pages.map((page) => page.lines.flatMap((line) =>
      line.tokens.map((token) => token.id))),
    layoutPlanSource: layout.layoutPlanSource,
  };
};
