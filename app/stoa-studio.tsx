"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import DictionaryPopover, { type DictionaryPopoverState } from "./dictionary-popover";
import { parseAiJsonResponse } from "./lib/ai-pipeline";
import {
  activateManualChunk,
  activateAvailableManualChunks,
  createManualAnalysisSession,
  getManualChunkPrompt,
  mergeManualAnalysisSession,
  restoreManualAnalysisSession,
  serializeManualAnalysisSession,
  submitManualChunkResponse,
  type ManualAnalysisChunk,
  type ManualAnalysisSession,
} from "./lib/manual-ai-session";
import {
  ANALYSIS_NOTE_CHROME_PX,
  ANALYSIS_NOTE_GAP_PX,
  ANALYSIS_NOTE_LINE_HEIGHT,
  ANALYSIS_NOTE_MIN_SIZE_PT,
  ANALYSIS_NOTE_NUMBER_COLUMN_PX,
  ANALYSIS_NOTE_SIZE_RATIO,
  createVectorPdf,
  VectorPdfLayoutMismatchError,
  type VectorPdfCffFontFamily,
  type VectorPdfFontFaces,
} from "./vector-pdf";
import {
  LANGUAGE_GROUPS,
  ANNOTATION_STRATEGIES,
  getLanguageConfig,
  isStoaLanguageId,
  buildLanguageAnalysisPrompts,
  resolveAnnotationTarget,
  type AnnotationTargetId,
} from "./language-config";
import { CLASSICAL_CHINESE_MODEL_RECOMMENDATION } from "./lib/classical-chinese";
import {
  OMNI_EXPERIMENTAL_WARNING,
  OMNI_LANGUAGE_PROFILE_REGISTRY,
  OMNI_LANGUAGE_PROFILE,
  STOA_OMNI_LANGUAGE_ID,
  buildOmniAnalysisPrompts,
  createOmniDocumentConfig,
  getOmniLanguageProfile,
  getOmniWritingOrientation,
  getOmniWritingStyle,
  isOmniTokenIndeclinable,
  isOmniLanguageId,
  isStoaWorkspaceLanguageId,
  resolveOmniLanguageProfile,
  type OmniAnalysisProfile,
  type OmniDocumentConfig,
  type OmniLanguageDetection,
  type StoaWorkspaceLanguageId,
} from "./lib/omni-language";
import {
  createDefaultOmniPreferences,
  readOmniPreferences,
  resetOmniPreferences,
  setOmniExperimentalWarningSuppressed,
  writeOmniPreferences,
} from "./lib/omni-preferences";
import {
  assertOmniExportSupported,
  getOmniExportCapabilities,
  omniExportPreflightInput,
  OMNI_RASTER_STATUS,
  OMNI_VECTOR_STATUS,
  type OmniExportFormat,
  type OmniExportFontUse,
} from "./lib/omni-export";
import { createRasterPdfFromPreview } from "./lib/raster-pdf";
import {
  applyPermissiveJsonWorkspaceBatch,
  beginNewJsonWorkspaceBatch,
  cloneJsonWorkspace,
  createJsonWorkspace,
  loadPermissiveOmniAnalysis,
  removeJsonWorkspaceBatch,
  removeJsonWorkspaceTokens,
  resetJsonWorkspace,
  selectJsonWorkspaceBatch,
  updateJsonWorkspaceDraft,
  updateJsonWorkspaceTokenStyles,
  type JsonWorkspace,
  type PermissiveAnalysisImportSummary,
  type JsonWorkspaceTokenStylePatch,
} from "./lib/json-workspace";
import {
  appendTrailingTextSections,
  paginateFlowLines,
  SMART_ROW_GAP_MAXIMUM_RATIO,
  SMART_ROW_GAP_MINIMUM_RATIO,
  wrapMeasuredText,
  type FlowPage,
  type ResolvedInterlinearPaginationPlan,
  type ResolvedNoteLinePlan,
} from "./lib/page-flow";
import { resolveTrailingTextMeasurePx } from "./lib/publication-layout";
import { documentRevision } from "./lib/document-revision";
import {
  omniManualOverrideForProjectOpen,
  type StoaProjectOpenOrigin,
} from "./lib/project-open-policy";
import { getDesktopDocumentsBridge } from "./lib/desktop-platform";
import { confirmLeavingPage, createSavedRevisionTracker } from "./lib/unsaved-changes";
import {
  resolveHistoryCoalescing,
  type HistoryCoalescingState,
} from "./lib/history-coalescing";
import {
  analysisNotesForPublication,
  analysisNoteDestination,
  cloneAnalysisNotes,
  deleteAnalysisNote,
  insertAnalysisNote,
  moveAnalysisNote,
  nextAnalysisNoteId,
  numberAnalysisNotes,
  normalizeAnalysisNotes,
  notesForToken,
  tokenNoteDestination,
  type AnalysisNote,
} from "./lib/analysis-notes";
import {
  assertExportRuntimeAvailable,
  fetchExportAssetBytes,
  formatExportFailure,
  getExportRuntimeWarning,
  isExportAssetFailure,
  resolveExportAssetUrl,
} from "./lib/export-assets";
import {
  createStoaProject,
  migrateStoaProjectToLatest,
  parseStoaProject,
  serializeStoaProject,
  stringifyStoaProject,
  type ParsedStoaProject,
  type StoaJsonObject,
  type StoaProjectAnalysis,
  type StoaProjectSettings,
  type StoaProjectToken,
  STOA_PROJECT_V6_SCHEMA,
} from "./lib/stoa-project";
import {
  createDeveloperDefaultProject,
  createDeveloperWebBlankProject,
} from "./developer-defaults";
import {
  pushWorkspaceHistory,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  type WorkspaceHistories,
} from "./lib/workspace-history";
import {
  aggregateSelectedValue,
  applyPointerSelection,
  clearTokenSelection,
  createTokenSelection,
  moveTokenSelectionFocus,
  removeSelectedItems,
  sanitizeTokenSelection,
  selectedItemsInDocumentOrder,
  toggleFocusedToken,
  updateSelectedItems,
  type TokenFocusDirection,
  type TokenSelectionState,
} from "./lib/token-selection";
import {
  TOKEN_CARD_METRICS,
  TOKEN_LAYER_LINE_HEIGHT,
  deriveDocumentTokenStyleDefaults,
  deriveLegacyTokenLayerVisibility,
  maximumAtomicRowHeight,
  measureTokenLayerStackHeight,
  normalizeDocumentTokenStyle,
  normalizeTokenStyleOverride,
  resolveTokenStyle,
  resolveVisibleTokenLayers,
  tokenStyleOverrideFor,
  type DocumentTokenStyle,
  type TokenStyleLayer,
  type TokenStyleOverride,
} from "./lib/token-style";
import {
  PRONUNCIATION_FONT_FAMILY,
  PRONUNCIATION_GAP_AFTER_PX,
  PRONUNCIATION_LINE_HEIGHT,
  pronunciationLabelFor,
  pronunciationTextFor,
  resolvePronunciationStyle,
  withAcademicPronunciationDefault,
} from "./lib/pronunciation";
import { buildStoaLatex } from "./lib/latex-export";
import TokenEditor, { type TokenEditorToken } from "./token-editor";
import CompositionStyleEditor from "./composition-style-editor";
import {
  applyUserDefaultTokenStyleToImport,
  createEmptyUserTokenStyleDefaults,
  getUserTokenStyleDefault,
  readUserTokenStyleDefaults,
  removeUserTokenStyleDefault,
  setUserTokenStyleDefault,
  writeUserTokenStyleDefaults,
  type BuiltInTokenStyles,
  type UserTokenStyleDefaults,
} from "./lib/user-token-style-defaults";
import {
  deleteUserFont,
  listUserFonts,
  loadLocalTimesNewRoman,
  missingUserFontReferences,
  parseUserFont,
  registerUserFont,
  saveUserFont,
  userFontOptions,
  userFontReference,
  type UserFontRecord,
  type UserFontReference,
} from "./lib/user-fonts";
import {
  deleteUserDictionary,
  importUserDictionary,
  listUserDictionaries,
  type DictionaryImportProgress,
  type UserDictionarySummary,
} from "./lib/user-dictionaries";
import {
  CLASSICAL_CHINESE_BUILTIN_FONTS,
} from "./lib/classical-chinese-fonts";
import {
  STOA_BUILTIN_FONTS,
  findFontByCssFamily,
  fontAvailableInWorkspace,
  replaceRetiredFontFamilies,
} from "./lib/font-registry";

// Public assets deliberately stay external in local/portable builds. Importing
// these files with `?url` made the single-file build embed ~104 MB of fonts as
// Base64 while also copying the same files into `fonts/`.
const notoSansScFontUrl = "fonts/NotoSansSC-Variable.ttf";
const notoSerifRegularFontUrl = "fonts/NotoSerif-Regular.ttf";
const notoSerifBoldFontUrl = "fonts/NotoSerif-Bold.ttf";
const notoSerifItalicFontUrl = "fonts/NotoSerif-Italic.ttf";
const notoSerifBoldItalicFontUrl = "fonts/NotoSerif-BoldItalic.ttf";
const liberationSerifRegularFontUrl = "fonts/LiberationSerif-Regular.ttf";
const liberationSerifBoldFontUrl = "fonts/LiberationSerif-Bold.ttf";
const liberationSerifItalicFontUrl = "fonts/LiberationSerif-Italic.ttf";
const liberationSerifBoldItalicFontUrl = "fonts/LiberationSerif-BoldItalic.ttf";
const liberationSansRegularFontUrl = "fonts/LiberationSans-Regular.ttf";
const liberationSansBoldFontUrl = "fonts/LiberationSans-Bold.ttf";
const liberationSansItalicFontUrl = "fonts/LiberationSans-Italic.ttf";
const liberationSansBoldItalicFontUrl = "fonts/LiberationSans-BoldItalic.ttf";
const liberationSansLicenseUrl = "fonts/OFL-LiberationSans.txt";
const sourceHanSerifScFontUrl = "fonts/classical-chinese/SourceHanSerifSC-Regular.otf";
const sourceHanSerifTcFontUrl = "fonts/classical-chinese/SourceHanSerifTC-Regular.otf";
const fandolSongRegularFontUrl = "fonts/classical-chinese/FandolSong-Regular.otf";
const fandolSongBoldFontUrl = "fonts/classical-chinese/FandolSong-Bold.otf";
const fandolHeiRegularFontUrl = "fonts/classical-chinese/FandolHei-Regular.otf";
const fandolHeiBoldFontUrl = "fonts/classical-chinese/FandolHei-Bold.otf";
const fandolFangFontUrl = "fonts/classical-chinese/FandolFang-Regular.otf";
const fandolKaiFontUrl = "fonts/classical-chinese/FandolKai-Regular.otf";
const sourceHanSerifLicenseUrl = "fonts/classical-chinese/OFL-SourceHanSerif.txt";
const fandolLicenseUrl = "fonts/classical-chinese/GPL-Fandol-with-font-exception.txt";
const fandolReadmeUrl = "fonts/classical-chinese/README-Fandol.txt";

type MorphFeatures = {
  case?: string;
  number?: string;
  gender?: string;
  person?: string;
  tense?: string;
  mood?: string;
  voice?: string;
  degree?: string;
  reading?: string;
  transliteration?: string;
  particleRole?: string;
  aspect?: string;
  classifier?: string;
  conjugation?: string;
  polarity?: string;
  politeness?: string;
  honorific?: string;
  auxiliaryRole?: string;
  syntaxRole?: string;
  register?: string;
  [key: string]: string | undefined;
};

type TextLanguage = StoaWorkspaceLanguageId;

type BreakAfter = "none" | "line" | "paragraph";

type GreekToken = {
  id: string;
  surface: string;
  punctuationBefore: string;
  punctuationAfter: string;
  lemma: string;
  gloss: string;
  pos: string;
  morphology: string;
  features?: MorphFeatures;
  confidence: number;
  alternatives: string[];
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
  styleOverrides?: TokenStyleOverride;
  /** Exact whitespace between this token and the next one when locally tokenized. */
  separatorAfter?: string;
  sourceStart?: number;
  sourceEnd?: number;
  /** Preview-only ordinals derived from analysis.notes; never serialized. */
  noteNumbers?: number[];
};

type TokenLine = {
  tokens: GreekToken[];
  paragraphSpacingBefore: number;
  resolvedGapBefore: number;
  measuredHeight: number;
};

type PreviewPage = {
  tokenLines: TokenLine[];
  noteBlocks: Array<{
    lines: ResolvedNoteLinePlan[];
    lineStart: number;
    continued: boolean;
    startsAtPageTop: boolean;
  }>;
  translationBlocks: Array<{
    sectionId: "literal" | "natural";
    lines: string[];
    continued: boolean;
    startsAtPageTop: boolean;
  }>;
  breakReason?: FlowPage<unknown>["breakReason"];
  remainingBottomPx: number;
};

type PreviewPagination = {
  pages: PreviewPage[];
  plan: ResolvedInterlinearPaginationPlan;
};

type Analysis = {
  language: TextLanguage;
  sourceText: string;
  literalTranslation: string;
  naturalTranslation: string;
  tokens: GreekToken[];
  notes: AnalysisNote[];
  languageDetection?: OmniLanguageDetection;
  analysisProfile?: OmniAnalysisProfile;
  morphologyStandard?: string;
};

type DocumentSnapshot = {
  analysis: Analysis;
  selection: TokenSelectionState;
  language: TextLanguage;
  settings: StudioSettings;
  jsonWorkspace?: JsonWorkspace;
  projectBase?: ParsedStoaProject;
};

type StudioSettings = {
  annotationTarget: AnnotationTargetId;
  fontReferences: UserFontReference[];
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
  paperPreset: string;
  orientation: "portrait" | "landscape";
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
  showNotes: boolean;
  showNoteMarkers: boolean;
  showPronunciation: boolean;
  /** Experimental OMNI document metadata; absent in official classical workspaces. */
  omni?: OmniDocumentConfig;
  /** Explicit five-layer document style used by schema v2 and Composition → More. */
  tokenStyle?: DocumentTokenStyle;
};

type ImportedProjectState = {
  language: TextLanguage;
  analysis: Analysis;
  settings: StudioSettings;
  selectedTokenId: string | null;
  projectBase: ParsedStoaProject;
};

type PendingOmniTransition =
  | { kind: "language" }
  | { kind: "project"; imported: ImportedProjectState };

type LayoutDiagnostics = {
  pageCount: number;
  lineCount: number;
  linesPerPage: number[];
  averageLineFill: number;
  averagePageFill: number;
  lastPageFill: number;
  singleTokenLines: number;
  widestTokenPx: number;
};

type AutoLayoutResult = {
  settings: StudioSettings;
  diagnostics: LayoutDiagnostics;
};

const STOA_VERSION = "5.9.7";
const MANUAL_AI_SESSION_STORAGE_KEY = "stoa-manual-ai-session-v1";
const MANUAL_AI_DRAFT_STORAGE_KEY = "stoa-manual-ai-drafts-v1";

const cloneAnalysis = (value: Analysis): Analysis => ({
  ...value,
  languageDetection: value.languageDetection ? { ...value.languageDetection } : undefined,
  tokens: value.tokens.map((item) => ({
    ...item,
    styleOverrides: item.styleOverrides ? {
      layers: item.styleOverrides.layers
        ? Object.fromEntries(Object.entries(item.styleOverrides.layers).map(([layer, style]) => [
            layer,
            style ? { ...style } : style,
          ])) as TokenStyleOverride["layers"]
        : undefined,
      gapAfterPx: item.styleOverrides.gapAfterPx
        ? { ...item.styleOverrides.gapAfterPx }
        : undefined,
    } : undefined,
    features: { ...(item.features ?? {}) },
    alternatives: [...item.alternatives],
  })),
  notes: cloneAnalysisNotes(value.notes),
});

const getLanguageSample = (language: TextLanguage): Analysis => {
  if (isStoaLanguageId(language)) return cloneAnalysis(createOfficialSampleState(language).analysis);
  return cloneAnalysis(createOmniSampleState().analysis);
};

const DEFAULT_SETTINGS: StudioSettings = {
  annotationTarget: "english",
  fontReferences: [],
  greekSize: 28,
  glossSize: 11.5,
  lemmaSize: 9,
  posSize: 7.5,
  morphSize: 9,
  translationSize: 10.5,
  wordGap: 18,
  lineGap: 22,
  greekFont: "'Noto Serif STOA', 'Times New Roman', Times, serif",
  englishFont: "'Noto Serif STOA', 'Times New Roman', Times, serif",
  lemmaFont: "'Noto Serif STOA', 'Times New Roman', Times, serif",
  morphFont: "'Noto Serif STOA', 'Times New Roman', Times, serif",
  paperPreset: "A4",
  orientation: "portrait",
  paperWidthMm: 210,
  paperHeightMm: 297,
  marginTopMm: 16,
  marginRightMm: 16,
  marginBottomMm: 16,
  marginLeftMm: 16,
  headerLeft: "INTERLINEAR READING · {page:02}",
  headerRight: "Classical text · Interlinear reading",
  footerLeft: "STOA INTERLINEAR STUDIO",
  footerRight: "{tokens} TOKENS · PAGE {page} OF {pages}",
  background: "#f6f0e4",
  ink: "#29271f",
  accent: "#9e4a32",
  showLemma: false,
  showPos: false,
  hideIndeclinableDetails: false,
  showTranslation: false,
  showNotes: true,
  showNoteMarkers: true,
  showPronunciation: true,
};

const OMNI_WORKSPACE_CONFIG = {
  id: STOA_OMNI_LANGUAGE_ID,
  group: "experimental",
  autonym: "OMNI",
  englishLabel: "OMNI",
  sourceLanguageLabel: "OMNI source",
  annotationTargetLabel: "English",
  sourceLocale: "und",
  sourceScript: "Zyyy",
  brandMark: "∞",
  fonts: {
    source: "'Noto Serif STOA', 'Times New Roman', Times, serif",
    lemma: "'Noto Serif STOA', 'Times New Roman', Times, serif",
    annotation: "'Noto Serif STOA', 'Times New Roman', Times, serif",
    morphology: "'Noto Serif STOA', 'Times New Roman', Times, serif",
  },
  tokenization: {
    sourceUsesSpaces: false,
    previewWordSeparator: "none",
    guidance: "Use language-appropriate model or user-provided tokens; never assume that whitespace delimits words.",
  },
  newTokenDefaults: {
    surface: "token",
    lemma: "",
    gloss: "meaning",
    pos: "X",
    morphology: "",
  },
} as const;

const getWorkspaceLanguageConfig = (language: TextLanguage) =>
  isOmniLanguageId(language) ? OMNI_WORKSPACE_CONFIG : getLanguageConfig(language);

const settingsForLanguage = (
  language: TextLanguage,
  base: StudioSettings = DEFAULT_SETTINGS,
): StudioSettings => {
  const config = getWorkspaceLanguageConfig(language);
  const next: StudioSettings = {
    ...base,
    annotationTarget: isOmniLanguageId(language)
      ? "english"
      : resolveAnnotationTarget(language, base.annotationTarget),
    greekFont: config.fonts.source,
    englishFont: config.fonts.annotation,
    lemmaFont: config.fonts.lemma,
    morphFont: config.fonts.morphology,
    tokenStyle: undefined,
    omni: isOmniLanguageId(language)
      ? createOmniDocumentConfig(base.omni)
      : undefined,
    headerRight: `${config.englishLabel} · Interlinear reading`,
    hideIndeclinableDetails: language === "ancient-greek" || language === "latin"
      ? base.hideIndeclinableDetails
      : false,
  };
  if (language === "classical-chinese" || language === "omni") {
    next.tokenStyle = withAcademicPronunciationDefault(
      next.tokenStyle
        ? normalizeDocumentTokenStyle(next.tokenStyle, deriveDocumentTokenStyleDefaults(next))
        : deriveDocumentTokenStyleDefaults(next),
    );
  }
  return next;
};

const cloneSettings = (value: StudioSettings): StudioSettings => ({
  ...value,
  fontReferences: value.fontReferences.map((font) => ({ ...font })),
  tokenStyle: value.tokenStyle ? {
    layers: Object.fromEntries(Object.entries(value.tokenStyle.layers).map(([layer, style]) => [
      layer,
      { ...style },
    ])) as DocumentTokenStyle["layers"],
    gapAfterPx: { ...value.tokenStyle.gapAfterPx },
    ...(value.tokenStyle.pronunciation
      ? { pronunciation: { ...value.tokenStyle.pronunciation } }
      : {}),
  } : undefined,
  omni: value.omni ? {
    ...value.omni,
    languageDetection: { ...value.omni.languageDetection },
    manualLanguageOverride: value.omni.manualLanguageOverride
      ? { ...value.omni.manualLanguageOverride }
      : null,
  } : undefined,
});

const documentTokenStyleFor = (settings: StudioSettings): DocumentTokenStyle => {
  const legacyDefaults = deriveDocumentTokenStyleDefaults(settings);
  return settings.tokenStyle
    ? normalizeDocumentTokenStyle(settings.tokenStyle, legacyDefaults)
    : legacyDefaults;
};

const usedDocumentFontFamilies = (
  settings: StudioSettings,
  tokens: readonly GreekToken[],
) => {
  const families = new Set([
    settings.greekFont,
    settings.englishFont,
    settings.lemmaFont,
    settings.morphFont,
    settings.translationFont ?? settings.englishFont,
  ]);
  for (const style of Object.values(documentTokenStyleFor(settings).layers)) {
    families.add(style.fontFamily);
  }
  for (const token of tokens) {
    if (token.wordFont) families.add(token.wordFont);
    for (const style of Object.values(token.styleOverrides?.layers ?? {})) {
      if (style?.fontFamily) families.add(style.fontFamily);
    }
  }
  return families;
};

const referencedUserFontsForDocument = (
  settings: StudioSettings,
  tokens: readonly GreekToken[],
  available: readonly UserFontReference[],
) => {
  const usedFamilies = usedDocumentFontFamilies(settings, tokens);
  const byId = new Map<string, UserFontReference>();
  for (const font of [...settings.fontReferences, ...available]) {
    if (usedFamilies.has(font.cssFamily) || (/^Times New Roman$/i.test(font.familyName) && [...usedFamilies].some((family) => /^['"]?Times New Roman['"]?(?:,|$)/i.test(family)))) byId.set(font.id, userFontReference(font));
  }
  return [...byId.values()].sort((left, right) =>
    left.familyName.localeCompare(right.familyName)
    || left.faceStyle.localeCompare(right.faceStyle)
    || left.id.localeCompare(right.id));
};

/**
 * Installs one complete five-layer document style while keeping the legacy
 * Composition controls as compatibility mirrors. The nested style remains the
 * only source of truth for emphasis, colours, and inter-layer gaps.
 */
const withDocumentTokenStyle = (
  settings: StudioSettings,
  value: DocumentTokenStyle,
): StudioSettings => {
  const tokenStyle = normalizeDocumentTokenStyle(
    value,
    settings.tokenStyle
      ? normalizeDocumentTokenStyle(settings.tokenStyle, deriveDocumentTokenStyleDefaults(settings))
      : deriveDocumentTokenStyleDefaults(settings),
  );
  return {
    ...settings,
    tokenStyle,
    greekSize: tokenStyle.layers.source.sizePt,
    glossSize: tokenStyle.layers.gloss.sizePt,
    lemmaSize: tokenStyle.layers.lemma.sizePt,
    posSize: tokenStyle.layers.pos.sizePt,
    morphSize: tokenStyle.layers.morphology.sizePt,
    greekFont: tokenStyle.layers.source.fontFamily,
    englishFont: tokenStyle.layers.gloss.fontFamily,
    lemmaFont: tokenStyle.layers.lemma.fontFamily,
    morphFont: tokenStyle.layers.morphology.fontFamily,
  };
};

const BUILT_IN_TOKEN_STYLES: BuiltInTokenStyles = {
  "ancient-greek": deriveDocumentTokenStyleDefaults(
    settingsForLanguage("ancient-greek", DEFAULT_SETTINGS),
  ),
  latin: deriveDocumentTokenStyleDefaults(
    settingsForLanguage("latin", DEFAULT_SETTINGS),
  ),
  "classical-chinese": withAcademicPronunciationDefault(deriveDocumentTokenStyleDefaults(
    settingsForLanguage("classical-chinese", DEFAULT_SETTINGS),
  )),
  omni: withAcademicPronunciationDefault(deriveDocumentTokenStyleDefaults(
    settingsForLanguage("omni", DEFAULT_SETTINGS),
  )),
};

const builtInTokenStyleFor = (language: TextLanguage): DocumentTokenStyle =>
  BUILT_IN_TOKEN_STYLES[language] ?? deriveDocumentTokenStyleDefaults(
    settingsForLanguage(language, DEFAULT_SETTINGS),
  );

const settingsForNewDocument = (
  language: TextLanguage,
  base: StudioSettings,
  userDefaults: UserTokenStyleDefaults,
): StudioSettings => withDocumentTokenStyle(
  settingsForLanguage(language, base),
  getUserTokenStyleDefault(userDefaults, language) ?? builtInTokenStyleFor(language),
);

const LEGACY_TOKEN_STYLE_SETTING_KEYS = [
  "greekSize",
  "glossSize",
  "lemmaSize",
  "posSize",
  "morphSize",
  "greekFont",
  "englishFont",
  "lemmaFont",
  "morphFont",
] as const satisfies readonly (keyof StudioSettings)[];

/**
 * Keeps the legacy Composition controls useful for imported schema-v2
 * documents. Only explicitly changed properties are copied into the nested
 * document style; colors, emphasis, gaps, and sparse token overrides survive.
 */
const synchronizeExplicitTokenStyle = (
  current: StudioSettings,
  next: StudioSettings,
  changedKeys: ReadonlySet<keyof StudioSettings>,
): StudioSettings => {
  if (!current.tokenStyle) return next;
  const tokenStyle = documentTokenStyleFor(current);
  const layers = Object.fromEntries(Object.entries(tokenStyle.layers).map(([layer, style]) => [
    layer,
    { ...style },
  ])) as DocumentTokenStyle["layers"];
  if (changedKeys.has("greekSize")) layers.source.sizePt = next.greekSize;
  if (changedKeys.has("glossSize")) layers.gloss.sizePt = next.glossSize;
  if (changedKeys.has("lemmaSize")) layers.lemma.sizePt = next.lemmaSize;
  if (changedKeys.has("posSize")) layers.pos.sizePt = next.posSize;
  if (changedKeys.has("morphSize")) layers.morphology.sizePt = next.morphSize;
  if (changedKeys.has("greekFont")) layers.source.fontFamily = next.greekFont;
  if (changedKeys.has("englishFont")) {
    layers.gloss.fontFamily = next.englishFont;
    layers.pos.fontFamily = next.englishFont;
  }
  if (changedKeys.has("lemmaFont")) layers.lemma.fontFamily = next.lemmaFont;
  if (changedKeys.has("morphFont")) layers.morphology.fontFamily = next.morphFont;
  return {
    ...next,
    tokenStyle: {
      layers,
      gapAfterPx: { ...tokenStyle.gapAfterPx },
    },
  };
};

const PAPER_SIZES: Record<string, [number, number]> = {
  A5: [148, 210],
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

const MM_TO_PX = 96 / 25.4;
const PT_TO_PX = 96 / 72;
const PAPER_LAYOUT_BORDER_PX = 2;
// 10 px running-text line + 18 px margin + 12 px padding + 1 px rule.
const HEADER_RESERVE_PX = 41;
// 10 px running-text line + 16 px margin.
const FOOTER_RESERVE_PX = 26;
const TRANSLATION_GAP_PX = 30;
const TRANSLATION_CHROME_PX = 59;

const measureTextWidth = (
  text: string,
  sizePt: number,
  family: string,
  fontsReady: boolean,
  weight = "400",
  style = "normal",
) => {
  const lines = text.split(/\r\n|\r|\n/);
  if (fontsReady && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      context.font = `${style} ${weight} ${sizePt * PT_TO_PX}px ${family}`;
      return Math.max(...lines.map((line) => context.measureText(line).width));
    }
  }
  return Math.max(
    1,
    ...lines.map((line) => Array.from(line).length),
  ) * sizePt * PT_TO_PX * 0.58 * (weight === "700" ? 1.06 : 1);
};

const getBreakAfter = (token: GreekToken): BreakAfter => token.breakAfter ?? "none";

const INDECLINABLE_PARTS_OF_SPEECH = new Set(["ADV", "ADP", "CCONJ", "SCONJ", "PART", "INTJ"]);

const isIndeclinableToken = (token: GreekToken, settings: StudioSettings) => {
  if (settings.omni) {
    if (settings.omni.analysisProfile !== "rich-inflectional") return false;
    const selectedLanguage = settings.omni.manualLanguageOverride?.confirmed
      ? settings.omni.manualLanguageOverride.languageId
      : settings.omni.languageDetection.languageId;
    return isOmniTokenIndeclinable(token, getOmniLanguageProfile(selectedLanguage));
  }
  if (typeof token.isIndeclinable === "boolean") return token.isIndeclinable;
  return INDECLINABLE_PARTS_OF_SPEECH.has(token.pos.trim().toUpperCase());
};

const hideDetailsForToken = (token: GreekToken, settings: StudioSettings) =>
  settings.hideIndeclinableDetails && isIndeclinableToken(token, settings);

/**
 * Publication renderers receive an explicit decision for every token. This
 * keeps project data intact while preventing PDF/LaTeX from re-implementing
 * OMNI profile rules or guessing from a morphology string.
 */
const publicationAnalysisFor = (
  analysis: Analysis,
  settings: StudioSettings,
): Analysis => {
  const noteNumbersByToken = new Map<string, number[]>();
  if (isStoaLanguageId(analysis.language) && settings.showNoteMarkers) {
    numberAnalysisNotes(analysis.notes).forEach((note) => {
      if (!note.tokenId) return;
      const current = noteNumbersByToken.get(note.tokenId) ?? [];
      current.push(note.number);
      noteNumbersByToken.set(note.tokenId, current);
    });
  }
  return {
    ...analysis,
    notes: analysisNotesForPublication(
      analysis.notes,
      isStoaLanguageId(analysis.language),
    ),
    tokens: analysis.tokens.map((item) => ({
      ...item,
      isIndeclinable: isIndeclinableToken(item, settings),
      noteNumbers: noteNumbersByToken.get(item.id) ?? [],
    })),
  };
};

const publicationRenderedText = (
  analysis: Analysis,
  settings: StudioSettings,
) => {
  const visible: string[] = [
    settings.headerLeft,
    settings.headerRight,
    settings.footerLeft,
    settings.footerRight,
  ];
  for (const item of analysis.tokens) {
    const hideDetails = hideDetailsForToken(item, settings);
    if (settings.showPronunciation) {
      visible.push(pronunciationTextFor(item, analysis.language));
    }
    visible.push(getTokenSourceText(item), item.gloss);
    if (!hideDetails && settings.showLemma) visible.push(item.lemma);
    if (!hideDetails && settings.showPos) visible.push(item.pos);
    if (!hideDetails) visible.push(item.morphology);
  }
  if (isStoaLanguageId(analysis.language) && settings.showNotes) {
    visible.push("ANALYSIS NOTES", ...analysis.notes.map((note) => note.text));
  }
  if (settings.showTranslation) {
    visible.push(analysis.literalTranslation, analysis.naturalTranslation);
  }
  return visible.filter(Boolean).join("\n");
};

const visibleDocumentFontText = (
  language: TextLanguage,
  settings: StudioSettings,
  tokens: readonly GreekToken[],
  literalTranslation = "",
  naturalTranslation = "",
) => {
  const families = new Map<string, string>();
  const append = (family: string, text: string) => {
    if (!text) return;
    families.set(family, `${families.get(family) ?? ""}\n${text}`);
  };
  const documentStyle = documentTokenStyleFor(settings);
  for (const item of tokens) {
    const hideDetails = hideDetailsForToken(item, settings);
    const resolved = resolveTokenStyle(documentStyle, item);
    if (settings.showPronunciation) {
      append(
        PRONUNCIATION_FONT_FAMILY,
        pronunciationTextFor(item, language),
      );
    }
    append(resolved.layers.source.fontFamily, getTokenSourceText(item));
    append(resolved.layers.gloss.fontFamily, item.gloss);
    if (!hideDetails && settings.showLemma) append(resolved.layers.lemma.fontFamily, item.lemma);
    if (!hideDetails && settings.showPos) append(resolved.layers.pos.fontFamily, item.pos);
    if (!hideDetails) append(resolved.layers.morphology.fontFamily, item.morphology);
  }
  append(settings.englishFont, [
    settings.showTranslation ? "LITERAL TRANSLATION" : "",
    settings.showTranslation ? literalTranslation : "",
    settings.showTranslation ? "IDIOMATIC TRANSLATION" : "",
    settings.showTranslation ? naturalTranslation : "",
    settings.headerLeft,
    settings.headerRight,
    settings.footerLeft,
    settings.footerRight,
  ].filter(Boolean).join("\n"));
  if (settings.showTranslation) append(settings.translationFont ?? settings.englishFont, literalTranslation + "\n" + naturalTranslation);
  return families;
};

const omniExportFontUsesFor = (
  language: TextLanguage,
  settings: StudioSettings,
  tokens: readonly GreekToken[],
  availableUserFonts: readonly UserFontRecord[],
  literalTranslation = "",
  naturalTranslation = "",
): OmniExportFontUse[] => {
  const references = new Map(
    settings.fontReferences.map((reference) => [reference.cssFamily, reference]),
  );
  const available = new Set(availableUserFonts.map((font) => font.id));
  return [...visibleDocumentFontText(language, settings, tokens, literalTranslation, naturalTranslation)].map(([cssFamily, renderedText]) => {
    const availableReference = availableUserFonts.find((font) => font.cssFamily === cssFamily);
    if (availableReference) return { cssFamily, source: "user", available: true, embeddable: "unknown", coverageKnown: false, renderedText } satisfies OmniExportFontUse;
    const bundled = findFontByCssFamily(cssFamily);
    if (bundled) {
      const coverageId = bundled.id === "bundled:noto-serif-stoa"
        ? "noto-serif-stoa-unicode"
        : bundled.id === "bundled:liberation-sans-stoa"
          ? "liberation-sans-stoa-unicode"
          : undefined;
      return {
        cssFamily,
        source: bundled.source,
        available: true,
        embeddable: bundled.source === "bundled" ? true : "unknown",
        coverageKnown: coverageId !== undefined,
        renderedText,
        coverageId,
      } satisfies OmniExportFontUse;
    }
    const reference = references.get(cssFamily)
      ?? availableUserFonts.find((font) => font.cssFamily === cssFamily);
    if (reference) {
      return {
        cssFamily,
        source: "user",
        available: available.has(reference.id),
        embeddable: "unknown",
        coverageKnown: false,
        renderedText,
      } satisfies OmniExportFontUse;
    }
    return {
      cssFamily,
      source: "unknown",
      available: true,
      embeddable: "unknown",
      coverageKnown: false,
      renderedText,
    } satisfies OmniExportFontUse;
  });
};

const compactLayoutKey = (value: string) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 33);
  }
  return `${value.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
};

const documentFontRequests = (
  analysis: Analysis,
  settings: StudioSettings,
  documentStyle: DocumentTokenStyle,
) => {
  const requestedFaces = new Map<string, string>();
  analysis.tokens.forEach((token) => {
    resolvedTokenLayers(token, settings, analysis.language).forEach((layer) => {
      const font = `${layer.style.italic ? "italic" : "normal"} ${layer.style.bold ? "700" : "400"} ${layer.style.sizePt}pt ${layer.style.fontFamily}`;
      const existing = requestedFaces.get(font) ?? "";
      requestedFaces.set(font, `${existing} ${layer.text}`.trim().slice(0, 4_096));
    });
  });
  if (isStoaLanguageId(analysis.language) && settings.showNoteMarkers && analysis.notes.some((note) => note.tokenId)) {
    requestedFaces.set(
      `normal 700 ${Math.max(5.5, documentStyle.layers.source.sizePt * 0.58)}pt ${settings.englishFont}`,
      analysis.notes.map((_, index) => String(index + 1)).join(","),
    );
  }
  if (settings.showTranslation) {
    const translationText = `${analysis.literalTranslation}\n${analysis.naturalTranslation}`.trim();
    if (translationText) {
      requestedFaces.set(
        `${settings.translationItalic === false ? "normal" : "italic"} ${settings.translationBold ? "700" : "400"} ${settings.translationSize}pt ${settings.translationFont ?? settings.englishFont}`,
        translationText.slice(0, 4_096),
      );
      requestedFaces.set(
        `normal 700 6pt ${settings.englishFont}`,
        "LITERAL TRANSLATION IDIOMATIC TRANSLATION CONTINUED",
      );
    }
  }
  if (isStoaLanguageId(analysis.language) && settings.showNotes && analysis.notes.length) {
    requestedFaces.set(
      `normal 400 ${settings.translationSize}pt ${settings.englishFont}`,
      `NOTES CONTINUED ${analysis.notes.map((note) => note.text).join("\n")}`.slice(0, 8_192),
    );
  }
  if (!requestedFaces.size) {
    Object.values(documentStyle.layers).forEach((style) => {
      requestedFaces.set(
        `${style.italic ? "italic" : "normal"} ${style.bold ? "700" : "400"} ${style.sizePt}pt ${style.fontFamily}`,
        "STOA interlinear λόγος amō 民為貴",
      );
    });
  }
  return Array.from(requestedFaces.entries()).sort(([left], [right]) => left.localeCompare(right));
};

const getTokenSourceText = (token: GreekToken) =>
  `${token.punctuationBefore ?? ""}${token.surface}${token.punctuationAfter}`;

const paragraphGapPx = (settings: StudioSettings) =>
  Math.max(18, settings.greekSize * PT_TO_PX * 0.65);

const getBlankLinesAfter = (token: GreekToken) =>
  Number.isFinite(token.blankLinesAfter)
    ? Math.min(20, Math.max(1, Math.round(token.blankLinesAfter as number)))
    : 1;

const getBlankLineSpacing = (token: GreekToken, settings: StudioSettings) =>
  Number.isFinite(token.blankLineSpacing)
    ? Math.min(200, Math.max(1, token.blankLineSpacing as number))
    : paragraphGapPx(settings);

const getParagraphSpacingAfter = (token: GreekToken, settings: StudioSettings) =>
  getBreakAfter(token) === "paragraph"
    ? getBlankLinesAfter(token) * getBlankLineSpacing(token, settings)
    : 0;

const hasHeader = (settings: StudioSettings) =>
  Boolean(settings.headerLeft.trim() || settings.headerRight.trim());

const hasFooter = (settings: StudioSettings) =>
  Boolean(settings.footerLeft.trim() || settings.footerRight.trim());

const formatPageText = (
  template: string,
  page: number,
  pages: number,
  tokens: number,
) => template
  .replaceAll("{page:02}", String(page).padStart(2, "0"))
  .replaceAll("{page}", String(page))
  .replaceAll("{pages}", String(pages))
  .replaceAll("{tokens}", String(tokens));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const hexWithAlpha = (value: string, alpha: number) => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(value);
  if (!match) return `rgba(41, 39, 31, ${alpha})`;
  return `rgba(${Number.parseInt(match[1], 16)}, ${Number.parseInt(match[2], 16)}, ${Number.parseInt(match[3], 16)}, ${alpha})`;
};

const roundHalf = (value: number) => Math.round(value * 2) / 2;

const tokenLayerText = (item: GreekToken, layer: TokenStyleLayer) => {
  if (layer === "source") return getTokenSourceText(item);
  if (layer === "gloss") return item.gloss;
  if (layer === "lemma") return item.lemma;
  if (layer === "pos") return item.pos.toUpperCase();
  return item.morphology;
};

type RenderedTokenLayerName = TokenStyleLayer | "pronunciation";

const resolvedTokenLayers = (
  item: GreekToken,
  settings: StudioSettings,
  language: TextLanguage,
) => {
  const style = resolveTokenStyle(documentTokenStyleFor(settings), item);
  const visibility = deriveLegacyTokenLayerVisibility(settings, {
    hideDetails: hideDetailsForToken(item, settings),
  });
  for (const layer of ["source", "gloss", "lemma", "pos", "morphology"] as const) {
    if (!tokenLayerText(item, layer).length) visibility[layer] = false;
  }
  const layers: Array<{
    layer: RenderedTokenLayerName;
    text: string;
    style: typeof style.layers.source;
    lineHeight: number;
    gapAfterPx: number;
  }> = resolveVisibleTokenLayers(style, visibility).map((layer) => ({
    ...layer,
    text: tokenLayerText(item, layer.layer),
    lineHeight: TOKEN_LAYER_LINE_HEIGHT[layer.layer],
  }));
  const pronunciation = settings.showPronunciation
    ? pronunciationTextFor(item, language)
    : "";
  if (pronunciation) {
    layers.unshift({
      layer: "pronunciation",
      text: pronunciation,
      style: resolvePronunciationStyle(item, style.layers.source, documentTokenStyleFor(settings).pronunciation),
      lineHeight: PRONUNCIATION_LINE_HEIGHT,
      gapAfterPx: PRONUNCIATION_GAP_AFTER_PX,
    });
  }
  return layers;
};

const getTokenBlockWidth = (
  item: GreekToken,
  settings: StudioSettings,
  fontsReady: boolean,
  language: TextLanguage,
) => Math.max(
  0,
  ...resolvedTokenLayers(item, settings, language).map(({ layer, text, style }) => {
    const textWidth = measureTextWidth(
      text,
      style.sizePt,
      style.fontFamily,
      fontsReady,
      style.bold ? "700" : "400",
      style.italic ? "italic" : "normal",
    );
    if (layer !== "source" || !item.noteNumbers?.length) return textWidth;
    const markerText = item.noteNumbers.join(",");
    return textWidth + 1 + measureTextWidth(
      markerText,
      Math.max(5.5, style.sizePt * 0.58),
      settings.englishFont,
      fontsReady,
      "700",
    );
  }),
) + TOKEN_CARD_METRICS.horizontalChromePx;

const getTokenBlockHeight = (
  item: GreekToken,
  settings: StudioSettings,
  language: TextLanguage,
) => {
  const layers = resolvedTokenLayers(item, settings, language);
  return measureTokenLayerStackHeight(layers, PT_TO_PX, 1);
};

const getLayoutBounds = (settings: StudioSettings) => {
  const usableWidth = Math.max(
    1,
    (settings.paperWidthMm - settings.marginLeftMm - settings.marginRightMm) * MM_TO_PX
      - PAPER_LAYOUT_BORDER_PX,
  );
  const usableHeight = Math.max(
    1,
    (settings.paperHeightMm - settings.marginTopMm - settings.marginBottomMm) * MM_TO_PX
      - PAPER_LAYOUT_BORDER_PX,
  );
  const headerReserve = hasHeader(settings) ? HEADER_RESERVE_PX : 0;
  const footerReserve = hasFooter(settings) ? FOOTER_RESERVE_PX : 0;
  return {
    usableWidth,
    availableLineHeight: Math.max(1, usableHeight - headerReserve - footerReserve),
  };
};

const paginateTokenFlowPages = (
  tokens: GreekToken[],
  settings: StudioSettings,
  fontsReady: boolean,
  language: TextLanguage,
) => {
  const { usableWidth, availableLineHeight } = getLayoutBounds(settings);

  const lines: TokenLine[] = [];
  let line: GreekToken[] = [];
  let lineWidth = 0;
  let lineParagraphSpacingBefore = 0;
  let nextLineParagraphSpacing = 0;

  const pushLine = () => {
    if (!line.length) return;
    lines.push({
      tokens: line,
      paragraphSpacingBefore: lineParagraphSpacingBefore,
      resolvedGapBefore: 0,
      measuredHeight: 0,
    });
    line = [];
    lineWidth = 0;
    lineParagraphSpacingBefore = 0;
  };

  for (const item of tokens) {
    const width = getTokenBlockWidth(item, settings, fontsReady, language);
    const proposed = line.length ? lineWidth + settings.wordGap + width : width;
    if (line.length && proposed > usableWidth) {
      pushLine();
    }

    if (!line.length) {
      lineParagraphSpacingBefore = nextLineParagraphSpacing;
      nextLineParagraphSpacing = 0;
    }
    line.push(item);
    lineWidth = line.length === 1 ? width : lineWidth + settings.wordGap + width;

    const breakAfter = getBreakAfter(item);
    if (breakAfter !== "none") {
      pushLine();
      nextLineParagraphSpacing = getParagraphSpacingAfter(item, settings);
    }
  }
  pushLine();

  let paragraphIndex = 0;
  const measuredLines = lines.map((tokenLine, index) => {
    if (index && tokenLine.paragraphSpacingBefore > 0) paragraphIndex += 1;
    return {
      value: tokenLine,
      height: maximumAtomicRowHeight(
        tokenLine.tokens,
        (item) => getTokenBlockHeight(item, settings, language),
      ),
      spacingBefore: tokenLine.paragraphSpacingBefore,
      paragraphId: `paragraph-${paragraphIndex}`,
    };
  });
  return paginateFlowLines(measuredLines, availableLineHeight, settings.lineGap, {
    smart: true,
    stretchFinalPage: false,
    nearbyBreakSearch: 3,
  });
};

const paginateTokens = (
  tokens: GreekToken[],
  settings: StudioSettings,
  fontsReady: boolean,
  language: TextLanguage,
) => {
  const flowPages = paginateTokenFlowPages(tokens, settings, fontsReady, language);
  const pages = flowPages.map((page) => page.lines.map((lineItem) => ({
    ...lineItem.value,
    paragraphSpacingBefore: lineItem.spacingBefore,
    resolvedGapBefore: lineItem.gapBefore ?? 0,
    measuredHeight: lineItem.height,
  })));
  return pages.length ? pages : [[]];
};

export const paginatePreviewDocument = (
  tokens: GreekToken[],
  notes: readonly AnalysisNote[],
  literalTranslation: string,
  naturalTranslation: string,
  settings: StudioSettings,
  fontsReady: boolean,
  sourceKey: string,
  language: TextLanguage,
): PreviewPagination => {
  const basePages = paginateTokenFlowPages(tokens, settings, fontsReady, language);
  const { usableWidth, availableLineHeight } = getLayoutBounds(settings);
  const translationWidth = resolveTrailingTextMeasurePx(usableWidth);
  const translationLineHeight = settings.translationSize * PT_TO_PX * 1.55;
  const noteSizePt = Math.max(
    ANALYSIS_NOTE_MIN_SIZE_PT,
    settings.translationSize * ANALYSIS_NOTE_SIZE_RATIO,
  );
  const noteLineHeight = noteSizePt * PT_TO_PX * ANALYSIS_NOTE_LINE_HEIGHT;
  const noteTextWidth = Math.max(1, translationWidth - ANALYSIS_NOTE_NUMBER_COLUMN_PX);
  const visibleNotes = !settings.omni && settings.showNotes
    ? numberAnalysisNotes(notes)
    : [];
  const noteLines: ResolvedNoteLinePlan[] = visibleNotes.flatMap((note) => {
    const lines = wrapMeasuredText(
      note.text,
      noteTextWidth,
      (value) => measureTextWidth(
        value || " ",
        noteSizePt,
        settings.englishFont,
        fontsReady,
        "400",
        "normal",
      ),
    );
    return lines.map((text, lineIndex) => ({
      noteId: note.id,
      tokenId: note.tokenId,
      ordinal: note.number,
      text,
      firstLine: lineIndex === 0,
    }));
  });
  const translationSources = settings.showTranslation
    ? ([
        ["literal", literalTranslation],
        ["natural", naturalTranslation],
      ] as const)
      .filter(([, text]) => text.trim())
      .map(([id, text]) => ({ id, text }))
    : [];
  const translationSections = translationSources.map(({ id, text }) => ({
        id,
        lines: wrapMeasuredText(
          text,
          translationWidth,
          (value) => measureTextWidth(
            value || " ",
            settings.translationSize,
            settings.translationFont ?? settings.englishFont,
            fontsReady,
            settings.translationBold ? "700" : "400",
            settings.translationItalic === false ? "normal" : "italic",
          ),
        ),
        lineHeight: translationLineHeight,
        blockChromeHeight: TRANSLATION_CHROME_PX,
        gapAfterContent: TRANSLATION_GAP_PX,
        minimumFirstFragmentLines: 2,
      }));
  const noteSections = noteLines.length
    ? [{
        id: "analysis-notes",
        lines: noteLines.map((line) => line.text),
        lineHeight: noteLineHeight,
        blockChromeHeight: ANALYSIS_NOTE_CHROME_PX,
        gapAfterContent: ANALYSIS_NOTE_GAP_PX,
        minimumFirstFragmentLines: 2,
      }]
    : [];
  const documentPages = appendTrailingTextSections(basePages, [
    ...noteSections,
    ...translationSections,
  ], {
    pageCapacity: availableLineHeight,
  });
  const pages = documentPages.map((page): PreviewPage => {
    const noteBlocks = page.trailingTextSections
      .filter((fragment) => fragment.sectionId === "analysis-notes")
      .map((fragment) => {
        const lineStart = fragment.lineStart ?? 0;
        return {
          lines: noteLines.slice(lineStart, lineStart + fragment.lines.length),
          lineStart,
          continued: fragment.continued,
          startsAtPageTop: fragment.startsAtPageTop,
        };
      });
    const translationBlocks = page.trailingTextSections
      .filter((fragment) => fragment.sectionId === "literal" || fragment.sectionId === "natural")
      .map((fragment) => ({
        sectionId: fragment.sectionId as "literal" | "natural",
        lines: fragment.lines,
        continued: fragment.continued,
        startsAtPageTop: fragment.startsAtPageTop,
      }));
    return {
      tokenLines: page.lines.map((line) => ({
        ...line.value,
        paragraphSpacingBefore: line.spacingBefore,
        resolvedGapBefore: line.gapBefore ?? 0,
        measuredHeight: line.height,
      })),
      noteBlocks,
      translationBlocks,
      breakReason: page.breakReason,
      remainingBottomPx: Math.max(0, availableLineHeight - page.usedHeight),
    };
  });
  const plan: ResolvedInterlinearPaginationPlan = {
    unit: "css-px-96dpi",
    sourceKey,
    translationSources: translationSources.map(({ id, text }) => ({
      sectionId: id,
      text,
    })),
    noteSources: visibleNotes.map((note) => ({
      noteId: note.id,
      tokenId: note.tokenId,
      text: note.text,
    })),
    contentWidthPx: usableWidth,
    contentHeightPx: availableLineHeight,
    trailingTextMeasurePx: translationWidth,
    rowGapBounds: {
      minimumPx: settings.lineGap * SMART_ROW_GAP_MINIMUM_RATIO,
      preferredPx: settings.lineGap,
      maximumPx: settings.lineGap * SMART_ROW_GAP_MAXIMUM_RATIO,
    },
    pages: pages.map((page, pageIndex) => {
      let yTopPx = 0;
      const tokenRows = page.tokenLines.map((line) => {
        yTopPx += line.resolvedGapBefore + line.paragraphSpacingBefore;
        const row = {
          tokenIds: line.tokens.map((token) => token.id),
          yTopPx,
          measuredHeightPx: line.measuredHeight,
          gapBeforePx: line.resolvedGapBefore,
          paragraphSpacingBeforePx: line.paragraphSpacingBefore,
        };
        yTopPx += line.measuredHeight;
        return row;
      });
      let trailingBottomPx = yTopPx;
      const noteBlocks = page.noteBlocks.map((block) => {
        const blockYTopPx = block.startsAtPageTop
          ? 0
          : trailingBottomPx + ANALYSIS_NOTE_GAP_PX;
        trailingBottomPx = blockYTopPx
          + ANALYSIS_NOTE_CHROME_PX
          + block.lines.length * noteLineHeight;
        return {
          lines: block.lines.map((line) => ({ ...line })),
          yTopPx: blockYTopPx,
          lineStart: block.lineStart,
          continued: block.continued,
          startsAtPageTop: block.startsAtPageTop,
        };
      });
      const translationBlocks = page.translationBlocks.map((block) => {
        const blockYTopPx = block.startsAtPageTop
          ? 0
          : trailingBottomPx + TRANSLATION_GAP_PX;
        trailingBottomPx = blockYTopPx
          + TRANSLATION_CHROME_PX
          + block.lines.length * translationLineHeight;
        return {
          sectionId: block.sectionId,
          lines: [...block.lines],
          yTopPx: blockYTopPx,
          continued: block.continued,
          startsAtPageTop: block.startsAtPageTop,
        };
      });
      const legacyNatural = translationBlocks.find((block) => block.sectionId === "natural");
      return {
        pageIndex,
        tokenRows,
        translationLines: legacyNatural ? [...legacyNatural.lines] : [],
        translationYTopPx: legacyNatural?.yTopPx ?? null,
        translationContinued: legacyNatural?.continued ?? false,
        translationStartsAtPageTop: legacyNatural?.startsAtPageTop ?? false,
        noteBlocks,
        translationBlocks,
        breakReason: page.breakReason,
        remainingBottomPx: page.remainingBottomPx,
      };
    }),
  };
  return { pages, plan };
};

const getLayoutDiagnostics = (
  tokens: GreekToken[],
  settings: StudioSettings,
  fontsReady: boolean,
  language: TextLanguage,
): LayoutDiagnostics => {
  if (!tokens.length) {
    return {
      pageCount: 0,
      lineCount: 0,
      linesPerPage: [],
      averageLineFill: 0,
      averagePageFill: 0,
      lastPageFill: 0,
      singleTokenLines: 0,
      widestTokenPx: 0,
    };
  }
  const pages = paginateTokens(tokens, settings, fontsReady, language);
  const { usableWidth, availableLineHeight } = getLayoutBounds(settings);
  const allLines = pages.flat();
  const lineFills = allLines.map((line) => {
    const contentWidth = line.tokens.reduce(
      (total, item, index) => total + getTokenBlockWidth(item, settings, fontsReady, language) + (index ? settings.wordGap : 0),
      0,
    );
    return clamp(contentWidth / usableWidth, 0, 1.5);
  });
  const pageFills = pages.map((page) => {
    const contentHeight = page.reduce((total, line, index) => {
      const lineHeight = maximumAtomicRowHeight(
        line.tokens,
        (item) => getTokenBlockHeight(item, settings, language),
      );
      return total + lineHeight + line.paragraphSpacingBefore + (index ? line.resolvedGapBefore : 0);
    }, 0);
    return clamp(contentHeight / availableLineHeight, 0, 1.5);
  });
  const average = (values: number[]) =>
    values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
  return {
    pageCount: pages.length,
    lineCount: allLines.length,
    linesPerPage: pages.map((page) => page.length),
    averageLineFill: average(lineFills),
    averagePageFill: average(pageFills),
    lastPageFill: pageFills.at(-1) ?? 0,
    singleTokenLines: allLines.filter((line) => line.tokens.length === 1).length,
    widestTokenPx: Math.max(...tokens.map((item) => getTokenBlockWidth(item, settings, fontsReady, language))),
  };
};

const createAutoLayout = (
  tokens: GreekToken[],
  current: StudioSettings,
  fontsReady: boolean,
  language: TextLanguage,
): AutoLayoutResult => {
  if (!tokens.length) {
    return { settings: current, diagnostics: getLayoutDiagnostics(tokens, current, fontsReady, language) };
  }
  const shortEdge = Math.min(current.paperWidthMm, current.paperHeightMm);
  const targetMargin = clamp(Math.round(shortEdge * 0.075), 10, 20);
  const idealSourceSize = shortEdge < 160 ? 21 : shortEdge > 250 ? 28 : 24;
  const maximumSourceSize = shortEdge < 160 ? 27 : shortEdge > 250 ? 36 : 32;
  let best: AutoLayoutResult | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let sourceSize = 16; sourceSize <= maximumSourceSize; sourceSize += 1) {
    const rawCandidate: StudioSettings = {
      ...current,
      greekSize: sourceSize,
      glossSize: roundHalf(clamp(sourceSize * 0.43, 8.5, 13.5)),
      lemmaSize: roundHalf(clamp(sourceSize * 0.36, 7.5, 11.5)),
      posSize: roundHalf(clamp(sourceSize * 0.29, 6.5, 9)),
      morphSize: roundHalf(clamp(sourceSize * 0.36, 7.5, 11.5)),
      translationSize: roundHalf(clamp(sourceSize * 0.42, 9, 12)),
      wordGap: Math.round(clamp(sourceSize * 0.52, 8, 20)),
      lineGap: Math.round(clamp(sourceSize * 0.68, 10, 26)),
      marginTopMm: targetMargin,
      marginRightMm: targetMargin,
      marginBottomMm: targetMargin,
      marginLeftMm: targetMargin,
    };
    const candidate = synchronizeExplicitTokenStyle(
      current,
      rawCandidate,
      new Set<keyof StudioSettings>(["greekSize", "glossSize", "lemmaSize", "posSize", "morphSize"]),
    );
    const diagnostics = getLayoutDiagnostics(tokens, candidate, fontsReady, language);
    const sparseLastPagePenalty = diagnostics.pageCount > 1
      ? Math.max(0, 0.42 - diagnostics.lastPageFill) * 180
      : Math.max(0, 0.24 - diagnostics.lastPageFill) * 35;
    const crowdedLinePenalty = Math.max(0, diagnostics.averageLineFill - 0.9) * 180;
    const looseLinePenalty = Math.abs(diagnostics.averageLineFill - 0.78) * 62;
    const pageRhythmPenalty = Math.abs(Math.min(diagnostics.averagePageFill, 1) - 0.76) * 45;
    const readabilityPenalty = Math.abs(sourceSize - idealSourceSize) * 1.8 + Math.max(0, 18 - sourceSize) * 12;
    const orphanPenalty = diagnostics.singleTokenLines * 2.4;
    const score = sparseLastPagePenalty + crowdedLinePenalty + looseLinePenalty +
      pageRhythmPenalty + readabilityPenalty + orphanPenalty + diagnostics.pageCount * 0.8;
    if (score < bestScore) {
      bestScore = score;
      best = { settings: candidate, diagnostics };
    }
  }
  return best ?? { settings: current, diagnostics: getLayoutDiagnostics(tokens, current, fontsReady, language) };
};

const makeLayoutPrompt = (
  analysis: Analysis,
  settings: StudioSettings,
  fontsReady: boolean,
) => {
  const diagnostics = getLayoutDiagnostics(analysis.tokens, settings, fontsReady, analysis.language);
  const widestTokens = analysis.tokens
    .map((item) => ({
      token: getTokenSourceText(item),
      gloss: item.gloss,
      morphology: item.morphology,
      widthPx: Math.round(getTokenBlockWidth(item, settings, fontsReady, analysis.language)),
      breakAfter: getBreakAfter(item),
    }))
    .sort((left, right) => right.widthPx - left.widthPx)
    .slice(0, 16);
  const layoutSettings = {
    greekSize: settings.greekSize,
    glossSize: settings.glossSize,
    lemmaSize: settings.lemmaSize,
    posSize: settings.posSize,
    morphSize: settings.morphSize,
    translationSize: settings.translationSize,
    translationFont: settings.translationFont ?? settings.englishFont,
    translationColor: settings.translationColor ?? settings.ink,
    translationBold: settings.translationBold ?? false,
    translationItalic: settings.translationItalic ?? true,
    translationUnderline: settings.translationUnderline ?? false,
    wordGap: settings.wordGap,
    lineGap: settings.lineGap,
    greekFont: settings.greekFont,
    englishFont: settings.englishFont,
    lemmaFont: settings.lemmaFont,
    morphFont: settings.morphFont,
    paperPreset: settings.paperPreset,
    orientation: settings.orientation,
    paperWidthMm: settings.paperWidthMm,
    paperHeightMm: settings.paperHeightMm,
    marginTopMm: settings.marginTopMm,
    marginRightMm: settings.marginRightMm,
    marginBottomMm: settings.marginBottomMm,
    marginLeftMm: settings.marginLeftMm,
    showLemma: settings.showLemma,
    showPos: settings.showPos,
    hideIndeclinableDetails: settings.hideIndeclinableDetails,
    showTranslation: settings.showTranslation,
    showNotes: settings.showNotes,
    showNoteMarkers: settings.showNoteMarkers,
    showPronunciation: settings.showPronunciation,
    tokenStyle: documentTokenStyleFor(settings),
    importedFontReferences: settings.fontReferences.map((font) => ({
      id: font.id,
      familyName: font.familyName,
      subfamilyName: font.subfamilyName,
      cssFamily: font.cssFamily,
      faceStyle: font.faceStyle,
      format: font.format,
      deviceLocal: true,
    })),
    bundledClassicalChineseFonts: analysis.language === "classical-chinese"
      ? CLASSICAL_CHINESE_BUILTIN_FONTS.map((font) => ({
          id: font.id,
          label: font.label,
          cssFamily: font.cssFamily,
          availableFaces: Object.keys(font.faces),
          classicalChineseOnly: true,
          embeddedForVectorPdf: true,
        }))
      : [],
  };
  const effectiveOverrides = analysis.tokens.map((item) => ({
    token: item,
    override: tokenStyleOverrideFor(item, documentTokenStyleFor(settings)),
  }));
  const overrideProfile = {
    tokensWithOverrides: effectiveOverrides.filter((item) => item.override).length,
    layerOverrides: Object.fromEntries((["source", "gloss", "lemma", "pos", "morphology"] as const).map((layer) => [
      layer,
      effectiveOverrides.filter((item) => item.override?.layers?.[layer]).length,
    ])),
    gapOverrides: Object.fromEntries((["source", "gloss", "lemma", "pos"] as const).map((layer) => [
      layer,
      effectiveOverrides.filter((item) => item.override?.gapAfterPx?.[layer] !== undefined).length,
    ])),
  };

  const omniGuidance = isOmniLanguageId(analysis.language)
    ? `OMNI EXPERIMENTAL LIMITS
- Preserve the language hint, logical token order, direction, writing mode, and tokenization origin.
- Never reverse an RTL token array or impose Ancient Greek/Latin morphology.
- Current direction: ${settings.omni?.direction ?? "ltr"}; writing mode: ${settings.omni?.writingMode ?? "horizontal-tb"}; tokenization: ${settings.omni?.tokenizationOrigin ?? "model"}.
- Do not recommend an export that STOA marks unsupported. Vertical page-flow optimization is unavailable.`
    : "";

  return `You are a professional book typographer specializing in scholarly interlinear editions. Propose a balanced layout for this ${getWorkspaceLanguageConfig(analysis.language).englishLabel} document. Return JSON only, with no Markdown fences.

${omniGuidance}

TYPOGRAPHIC GOALS
- Preserve every token, gloss, lemma, morphology value, explicit line break and paragraph break. You are changing layout settings only.
- Favor readable scholarly-book proportions over fitting the maximum number of words on a page.
- Aim for average line occupancy around 70–88%, consistent vertical rhythm, and no nearly empty final page when a modest adjustment can avoid it.
- Keep the source text clearly dominant. Annotation text should remain readable; do not reduce gloss or morphology below 7.5 pt.
- Keep margins sufficient for print handling: normally 10–22 mm depending on paper size.
- Respect the actual measured width of every layer font. Sparse per-token overrides across Source, Gloss, Lemma, POS, Morphology, and their vertical gaps remain authoritative.
- Imported font references are device-local and authoritative. Keep their exact cssFamily values; never invent, rename, or substitute an imported family.
- The six bundled Classical Chinese families are document-safe only in the Classical Chinese workspace. Preserve their exact cssFamily values so Preview, vector PDF, PDF-derived PNG, project transfer, and LaTeX remain synchronized.
- You may optimize document-level layer sizes and gaps, but never emit or overwrite token-level overrides.
- Do not change colors, emphasis, header/footer text, translations, token data or breakAfter values.

DOCUMENT PROFILE
${JSON.stringify({
    language: analysis.language,
    tokenCount: analysis.tokens.length,
    explicitLineBreaks: analysis.tokens.filter((item) => getBreakAfter(item) === "line").length,
    paragraphBreaks: analysis.tokens.filter((item) => getBreakAfter(item) === "paragraph").length,
    tokenStyleOverrides: overrideProfile,
    diagnostics: {
      ...diagnostics,
      averageLineFill: Number(diagnostics.averageLineFill.toFixed(3)),
      averagePageFill: Number(diagnostics.averagePageFill.toFixed(3)),
      lastPageFill: Number(diagnostics.lastPageFill.toFixed(3)),
    },
    widestTokenBlocks: widestTokens,
  }, null, 2)}

CURRENT SETTINGS
${JSON.stringify(layoutSettings, null, 2)}

ALLOWED RANGES
- type sizes: source 12–72 pt; gloss/lemma/morphology/translation 7.5–36 pt; POS 6–24 pt
- wordGap 0–80 px; lineGap 0–100 px
- document token-layer gaps 0–48 px
- each margin 0–60 mm; paper width/height 80–500 mm
- orientation: "portrait" or "landscape"
- paperPreset: "A5", "A4", "A3", "Letter", "Legal", or "Custom"
- fonts may remain unchanged or use one of the families already present in CURRENT SETTINGS

RETURN EXACTLY THIS SHAPE
{
  "schemaVersion": 1,
  "reasoningSummary": "one concise sentence explaining the layout decision",
  "settings": {
    "greekSize": 24,
    "glossSize": 10.5,
    "lemmaSize": 9,
    "posSize": 7.5,
    "morphSize": 9,
    "translationSize": 10,
    "wordGap": 13,
    "lineGap": 16,
    "greekFont": ${JSON.stringify(settings.greekFont)},
    "englishFont": ${JSON.stringify(settings.englishFont)},
    "lemmaFont": ${JSON.stringify(settings.lemmaFont)},
    "morphFont": ${JSON.stringify(settings.morphFont)},
    "paperPreset": ${JSON.stringify(settings.paperPreset)},
    "orientation": ${JSON.stringify(settings.orientation)},
    "paperWidthMm": ${settings.paperWidthMm},
    "paperHeightMm": ${settings.paperHeightMm},
    "marginTopMm": 16,
    "marginRightMm": 16,
    "marginBottomMm": 16,
    "marginLeftMm": 16,
    "showLemma": ${settings.showLemma},
    "showPos": ${settings.showPos},
    "hideIndeclinableDetails": ${settings.hideIndeclinableDetails},
    "showTranslation": ${settings.showTranslation},
    "showNotes": ${settings.showNotes},
    "showNoteMarkers": ${settings.showNoteMarkers},
    "tokenStyle": {
      "layers": {
        "source": { "sizePt": ${documentTokenStyleFor(settings).layers.source.sizePt} },
        "gloss": { "sizePt": ${documentTokenStyleFor(settings).layers.gloss.sizePt} },
        "lemma": { "sizePt": ${documentTokenStyleFor(settings).layers.lemma.sizePt} },
        "pos": { "sizePt": ${documentTokenStyleFor(settings).layers.pos.sizePt} },
        "morphology": { "sizePt": ${documentTokenStyleFor(settings).layers.morphology.sizePt} }
      },
      "gapAfterPx": ${JSON.stringify(documentTokenStyleFor(settings).gapAfterPx)}
    }
  }
}`;
};

const normalizeLayoutPlan = (value: unknown, current: StudioSettings): StudioSettings => {
  if (!value || typeof value !== "object") throw new Error("The layout plan must be a JSON object.");
  const root = value as Record<string, unknown>;
  const raw = (root.settings ?? root.layoutSettings ?? root.layout ?? root) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("No settings object was found in the layout plan.");
  }
  const candidate = raw as Partial<Record<keyof StudioSettings, unknown>>;
  const next = { ...current };
  let recognized = 0;
  const changedKeys = new Set<keyof StudioSettings>();
  const numericLimits: Partial<Record<keyof StudioSettings, [number, number]>> = {
    greekSize: [12, 72],
    glossSize: [7.5, 36],
    lemmaSize: [7.5, 36],
    posSize: [6, 24],
    morphSize: [7.5, 36],
    translationSize: [7.5, 36],
    wordGap: [0, 80],
    lineGap: [0, 100],
    paperWidthMm: [80, 500],
    paperHeightMm: [80, 500],
    marginTopMm: [0, 60],
    marginRightMm: [0, 60],
    marginBottomMm: [0, 60],
    marginLeftMm: [0, 60],
  };
  (Object.keys(numericLimits) as Array<keyof StudioSettings>).forEach((key) => {
    const limits = numericLimits[key];
    const proposed = candidate[key];
    if (!limits || typeof proposed !== "number" || !Number.isFinite(proposed)) return;
    (next as unknown as Record<string, unknown>)[key] = roundHalf(clamp(proposed, limits[0], limits[1]));
    changedKeys.add(key);
    recognized += 1;
  });
  (["greekFont", "englishFont", "lemmaFont", "morphFont", "translationFont"] as const).forEach((key) => {
    const proposed = candidate[key];
    if (typeof proposed !== "string" || !proposed.trim() || proposed.length > 180 || /[;{}\r\n]/.test(proposed)) return;
    next[key] = proposed.trim();
    changedKeys.add(key);
    recognized += 1;
  });
  (["showLemma", "showPos", "hideIndeclinableDetails", "showTranslation", "showNotes", "showNoteMarkers", "showPronunciation"] as const).forEach((key) => {
    const proposed = candidate[key];
    if (typeof proposed !== "boolean") return;
    next[key] = proposed;
    recognized += 1;
  });
  (["translationBold", "translationItalic", "translationUnderline"] as const).forEach((key) => {
    if (typeof candidate[key] !== "boolean") return;
    next[key] = candidate[key];
    recognized += 1;
  });
  if (typeof candidate.translationColor === "string" && /^#[0-9a-f]{6}$/i.test(candidate.translationColor)) {
    next.translationColor = candidate.translationColor;
    recognized += 1;
  }
  if (candidate.orientation === "portrait" || candidate.orientation === "landscape") {
    next.orientation = candidate.orientation;
    recognized += 1;
  }
  if (typeof candidate.paperPreset === "string" && (candidate.paperPreset === "Custom" || PAPER_SIZES[candidate.paperPreset])) {
    next.paperPreset = candidate.paperPreset;
    recognized += 1;
  }
  const paperSize = PAPER_SIZES[next.paperPreset];
  const suppliedWidth = typeof candidate.paperWidthMm === "number";
  const suppliedHeight = typeof candidate.paperHeightMm === "number";
  if (paperSize && !suppliedWidth && !suppliedHeight) {
    [next.paperWidthMm, next.paperHeightMm] = next.orientation === "portrait"
      ? paperSize
      : [paperSize[1], paperSize[0]];
  } else if (paperSize && (suppliedWidth || suppliedHeight)) {
    const expected = next.orientation === "portrait" ? paperSize : [paperSize[1], paperSize[0]];
    if (Math.abs(next.paperWidthMm - expected[0]) > 0.2 || Math.abs(next.paperHeightMm - expected[1]) > 0.2) {
      next.paperPreset = "Custom";
    }
  } else if (suppliedWidth || suppliedHeight) {
    next.paperPreset = "Custom";
  }
  let resolved = synchronizeExplicitTokenStyle(current, next, changedKeys);
  if (candidate.tokenStyle && typeof candidate.tokenStyle === "object" && !Array.isArray(candidate.tokenStyle)) {
    const source = candidate.tokenStyle as Record<string, unknown>;
    const sourceLayers = source.layers && typeof source.layers === "object" && !Array.isArray(source.layers)
      ? source.layers as Record<string, unknown>
      : {};
    const sourceGaps = source.gapAfterPx && typeof source.gapAfterPx === "object" && !Array.isArray(source.gapAfterPx)
      ? source.gapAfterPx as Record<string, unknown>
      : {};
    const stylePatch: { layers: Record<string, unknown>; gapAfterPx: Record<string, unknown> } = {
      layers: {},
      gapAfterPx: {},
    };
    const layerSizeLimits = {
      source: [12, 72],
      gloss: [7.5, 36],
      lemma: [7.5, 36],
      pos: [6, 24],
      morphology: [7.5, 36],
    } as const;
    for (const layer of ["source", "gloss", "lemma", "pos", "morphology"] as const) {
      const layerValue = sourceLayers[layer];
      if (!layerValue || typeof layerValue !== "object" || Array.isArray(layerValue)) continue;
      const sizePt = (layerValue as Record<string, unknown>).sizePt;
      if (typeof sizePt !== "number" || !Number.isFinite(sizePt)) continue;
      const [minimum, maximum] = layerSizeLimits[layer];
      stylePatch.layers[layer] = { sizePt: roundHalf(clamp(sizePt, minimum, maximum)) };
      recognized += 1;
    }
    for (const anchor of ["source", "gloss", "lemma", "pos"] as const) {
      const gap = sourceGaps[anchor];
      if (typeof gap !== "number" || !Number.isFinite(gap)) continue;
      stylePatch.gapAfterPx[anchor] = gap;
      recognized += 1;
    }
    if (Object.keys(stylePatch.layers).length || Object.keys(stylePatch.gapAfterPx).length) {
      const tokenStyle = normalizeDocumentTokenStyle(stylePatch, documentTokenStyleFor(resolved));
      resolved = {
        ...resolved,
        tokenStyle,
        greekSize: tokenStyle.layers.source.sizePt,
        glossSize: tokenStyle.layers.gloss.sizePt,
        lemmaSize: tokenStyle.layers.lemma.sizePt,
        posSize: tokenStyle.layers.pos.sizePt,
        morphSize: tokenStyle.layers.morphology.sizePt,
      };
    }
  }
  if (!recognized) throw new Error("The plan contains no recognized layout settings.");
  return resolved;
};

const makeUserPrompt = (
  text: string,
  language: TextLanguage,
  omniDocument?: OmniDocumentConfig,
  tokens: readonly GreekToken[] = [],
  annotationTarget: AnnotationTargetId = "english",
) => {
  if (!text.trim()) return "Paste source text to generate a complete AI request.";
  if (isOmniLanguageId(language) && omniDocument?.tokenizationOrigin === "user" && !tokens.length) {
    return "Add or import at least one OMNI token before generating a user-tokenized AI request, or switch Tokenization to Model-provided.";
  }
  const prompts = isOmniLanguageId(language)
    ? omniDocument?.tokenizationOrigin === "user"
      ? buildOmniAnalysisPrompts(text, {
          mode: "user-full",
          document: omniDocument,
          lockedTokens: tokens.map((item) => ({
            id: item.id,
            surface: item.surface,
            punctuationBefore: item.punctuationBefore,
            punctuationAfter: item.punctuationAfter,
            breakAfter: getBreakAfter(item),
            blankLinesAfter: getBlankLinesAfter(item),
          })),
        })
      : buildOmniAnalysisPrompts(text, { mode: "model-full", document: omniDocument })
    : buildLanguageAnalysisPrompts(language, text, {
        mode: "full-text",
        annotationTarget,
      });
  const filename = `stoa-${language}-analysis.stoa.json`;
  const userPrompt = language === "classical-chinese"
    ? `${prompts.userPrompt}\n\nMODEL CHOICE NOTE\n${CLASSICAL_CHINESE_MODEL_RECOMMENDATION}`
    : prompts.userPrompt;
  const importLabel = "Import Analysis";
  return `${prompts.systemPrompt}\n\n${userPrompt}\n\nDELIVERY\n- If this AI interface supports downloadable-file creation, save only the required JSON object as ${filename} and make the file available to download. In STOA, open it through ${importLabel} → Open analysis .stoa.json.\n- If file creation is unavailable, return only the valid JSON object so it can be copied and pasted into ${importLabel}.`;
};

const detectLanguage = (text: string, fallback: TextLanguage): TextLanguage => {
  if (isOmniLanguageId(fallback)) return fallback;
  if (/\p{Script=Han}/u.test(text)) return "classical-chinese";
  return /[\u0370-\u03ff\u1f00-\u1fff]/u.test(text) ? "ancient-greek" : fallback;
};

const countSourceUnits = (text: string, language: TextLanguage) => {
  if (!text.trim()) return 0;
  const config = getWorkspaceLanguageConfig(language);
  if (config.tokenization.sourceUsesSpaces) return text.trim().split(/\s+/u).filter(Boolean).length;
  return Array.from(new Intl.Segmenter(config.sourceLocale, { granularity: "word" }).segment(text))
    .filter((segment) => segment.isWordLike).length;
};

const reconstructSourceText = (tokens: GreekToken[]) => {
  const defaultSeparator = tokens.some((item) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(item.surface))
    ? ""
    : " ";
  return tokens
  .map((item) => {
    const separator = getBreakAfter(item) === "paragraph"
      ? "\n".repeat(getBlankLinesAfter(item) + 1)
      : getBreakAfter(item) === "line"
        ? "\n"
        : item.separatorAfter ?? defaultSeparator;
    return `${getTokenSourceText(item)}${separator}`;
  })
  .join("")
  .trim();
};

const separateAttachedPunctuation = (
  surface: string,
  punctuationBefore: string | undefined,
  punctuationAfter: string | undefined,
) => {
  let normalizedSurface = surface;
  let before = punctuationBefore ?? "";
  let after = punctuationAfter ?? "";
  if (punctuationBefore === undefined) {
    const leading = normalizedSurface.match(/^([^\p{L}\p{N}]+)(?=[\p{L}\p{N}])/u);
    if (leading) {
      before = leading[1];
      normalizedSurface = normalizedSurface.slice(leading[1].length);
    }
  }
  if (punctuationAfter === undefined || punctuationAfter === "") {
    const trailing = normalizedSurface.match(/(?<=[\p{L}\p{N}\p{M}])([^\p{L}\p{N}\p{M}]+)$/u);
    if (trailing) {
      after = `${trailing[1]}${after}`;
      normalizedSurface = normalizedSurface.slice(0, -trailing[1].length);
    }
  }
  return { surface: normalizedSurface, punctuationBefore: before, punctuationAfter: after };
};

export const normalizeImportedAnalysis = (
  value: unknown,
  fallbackLanguage: TextLanguage,
  options: { allowEmptyTokens?: boolean; preserveTokenText?: boolean } = {},
): Analysis => {
  if (!value || typeof value !== "object") {
    throw new Error("The JSON root must be an analysis object or a token array.");
  }
  const candidate: Partial<Analysis> = Array.isArray(value)
    ? { tokens: value as GreekToken[] }
    : value as Partial<Analysis>;
  if (!Array.isArray(candidate.tokens) || (!options.allowEmptyTokens && candidate.tokens.length === 0)) {
    throw new Error("No tokens array was found.");
  }
  const tokens = candidate.tokens.map<GreekToken>((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Token ${index + 1} must be an object.`);
    }
    const next = item as Partial<GreekToken>;
    if (typeof next.surface !== "string" || typeof next.gloss !== "string") {
      throw new Error(`Token ${index + 1} is missing a string surface or gloss field.`);
    }
    const separated = options.preserveTokenText ? {
      surface: next.surface,
      punctuationBefore: next.punctuationBefore ?? "",
      punctuationAfter: next.punctuationAfter ?? "",
    } : separateAttachedPunctuation(
      next.surface,
      next.punctuationBefore,
      next.punctuationAfter,
    );
    return {
      id: next.id || `imported-${index + 1}`,
      surface: separated.surface,
      punctuationBefore: separated.punctuationBefore,
      punctuationAfter: separated.punctuationAfter,
      lemma: next.lemma || "",
      gloss: next.gloss,
      pos: options.preserveTokenText ? next.pos ?? "" : next.pos || "X",
      morphology: next.morphology || "",
      features: next.features || {},
      confidence:
        typeof next.confidence === "number" ? next.confidence : 0.8,
      alternatives: Array.isArray(next.alternatives) ? next.alternatives : [],
      isIndeclinable: typeof next.isIndeclinable === "boolean"
        ? next.isIndeclinable
        : undefined,
      breakAfter:
        next.breakAfter === "line" || next.breakAfter === "paragraph"
          ? next.breakAfter
          : "none",
      blankLinesAfter: Number.isFinite(next.blankLinesAfter)
        ? Math.min(20, Math.max(1, Math.round(next.blankLinesAfter as number)))
        : undefined,
      blankLineSpacing: Number.isFinite(next.blankLineSpacing)
        ? Math.min(200, Math.max(1, next.blankLineSpacing as number))
        : undefined,
      wordFont: typeof next.wordFont === "string" && next.wordFont.trim()
        ? next.wordFont
        : undefined,
      wordSize: Number.isFinite(next.wordSize)
        ? Math.min(144, Math.max(4, next.wordSize as number))
        : undefined,
      wordColor: typeof next.wordColor === "string" && /^#[0-9a-f]{6}$/i.test(next.wordColor)
        ? next.wordColor
        : undefined,
      wordBold: typeof next.wordBold === "boolean" ? next.wordBold : undefined,
      wordItalic: typeof next.wordItalic === "boolean" ? next.wordItalic : undefined,
      wordUnderline: typeof next.wordUnderline === "boolean" ? next.wordUnderline : undefined,
      lemmaColor: typeof next.lemmaColor === "string" && /^#[0-9a-f]{6}$/i.test(next.lemmaColor)
        ? next.lemmaColor
        : undefined,
      lemmaUnderline: typeof next.lemmaUnderline === "boolean" ? next.lemmaUnderline : undefined,
      morphColor: typeof next.morphColor === "string" && /^#[0-9a-f]{6}$/i.test(next.morphColor)
        ? next.morphColor
        : undefined,
      morphUnderline: typeof next.morphUnderline === "boolean" ? next.morphUnderline : undefined,
      pinyin: typeof next.pinyin === "string" ? next.pinyin.normalize("NFC") : undefined,
      romanization: typeof next.romanization === "string"
        ? next.romanization.normalize("NFC")
        : undefined,
      pronunciationSize: Number.isFinite(next.pronunciationSize)
        ? Math.min(144, Math.max(7, next.pronunciationSize as number))
        : undefined,
      pronunciationColor: typeof next.pronunciationColor === "string"
        && /^#[0-9a-f]{6}$/i.test(next.pronunciationColor)
        ? next.pronunciationColor.toLowerCase()
        : undefined,
      styleOverrides: normalizeTokenStyleOverride(next.styleOverrides),
      separatorAfter: typeof next.separatorAfter === "string" ? next.separatorAfter : undefined,
      sourceStart: Number.isFinite(next.sourceStart) ? next.sourceStart : undefined,
      sourceEnd: Number.isFinite(next.sourceEnd) ? next.sourceEnd : undefined,
    };
  });
  const reconstructedSource = reconstructSourceText(tokens);
  const sourceText = candidate.sourceText || reconstructedSource;
  // An OMNI import stays in the OMNI workspace. A JSON author cannot escape
  // the local capability policy by changing the root language field.
  const importedLanguage = isOmniLanguageId(fallbackLanguage)
    ? STOA_OMNI_LANGUAGE_ID
    : isStoaWorkspaceLanguageId(candidate.language)
      ? candidate.language
      : detectLanguage(sourceText, fallbackLanguage);
  const omniResolution = isOmniLanguageId(importedLanguage)
    ? resolveOmniLanguageProfile({
        sourceText,
        detection: candidate.languageDetection,
        aiClaims: {
          analysisProfile: candidate.analysisProfile,
          morphologyStandard: candidate.morphologyStandard,
        },
      })
    : null;
  return {
    language: importedLanguage,
    sourceText,
    literalTranslation: candidate.literalTranslation || "",
    naturalTranslation: candidate.naturalTranslation || "",
    tokens,
    notes: normalizeAnalysisNotes(candidate.notes, tokens.map((token) => token.id)),
    ...(omniResolution
      ? {
          languageDetection: omniResolution.detection,
          analysisProfile: omniResolution.analysisProfile,
          morphologyStandard: omniResolution.morphologyStandard,
        }
      : {}),
  };
};

const normalizeProjectSettings = (
  value: unknown,
  language: TextLanguage = "ancient-greek",
  userDefaults?: UserTokenStyleDefaults,
): StudioSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The project file does not contain a valid settings object.");
  }
  const prepared = userDefaults
    ? applyUserDefaultTokenStyleToImport(value, language, userDefaults)
    : value;
  const candidate = prepared as Partial<Record<keyof StudioSettings, unknown>>;
  const next: StudioSettings = settingsForLanguage(language);
  next.annotationTarget = isStoaLanguageId(language)
    ? resolveAnnotationTarget(
        language,
        candidate.annotationTarget === "english" || candidate.annotationTarget === "chinese"
          ? candidate.annotationTarget
          : undefined,
      )
    : "english";
  if (Array.isArray(candidate.fontReferences)) {
    next.fontReferences = candidate.fontReferences.map((font) => ({
      ...(font as UserFontReference),
    }));
  }
  const numericLimits: Partial<Record<keyof StudioSettings, [number, number]>> = {
    greekSize: [4, 144],
    glossSize: [4, 72],
    lemmaSize: [4, 72],
    posSize: [4, 48],
    morphSize: [4, 72],
    translationSize: [4, 72],
    wordGap: [0, 80],
    lineGap: [0, 100],
    paperWidthMm: [60, 1000],
    paperHeightMm: [60, 1000],
    marginTopMm: [0, 100],
    marginRightMm: [0, 100],
    marginBottomMm: [0, 100],
    marginLeftMm: [0, 100],
  };
  (Object.keys(numericLimits) as Array<keyof StudioSettings>).forEach((key) => {
    const limits = numericLimits[key];
    const proposed = candidate[key];
    if (!limits || typeof proposed !== "number" || !Number.isFinite(proposed)) return;
    (next as unknown as Record<string, unknown>)[key] = clamp(proposed, limits[0], limits[1]);
  });
  (["greekFont", "englishFont", "lemmaFont", "morphFont", "translationFont"] as const).forEach((key) => {
    const proposed = candidate[key];
    if (typeof proposed !== "string" || !proposed.trim() || proposed.length > 300 || /[;{}\r\n]/.test(proposed)) return;
    next[key] = proposed;
  });
  (["headerLeft", "headerRight", "footerLeft", "footerRight"] as const).forEach((key) => {
    const proposed = candidate[key];
    // These fields are editable without a length limit and the Project codec
    // accepts strings. Never silently replace a saved long header/footer.
    if (typeof proposed === "string") next[key] = proposed;
  });
  (["background", "ink", "accent", "translationColor"] as const).forEach((key) => {
    const proposed = candidate[key];
    if (typeof proposed === "string" && /^#[0-9a-f]{6}$/i.test(proposed)) next[key] = proposed;
  });
  (["showLemma", "showPos", "hideIndeclinableDetails", "showTranslation", "showNotes", "showNoteMarkers", "showPronunciation"] as const).forEach((key) => {
    const proposed = candidate[key];
    if (typeof proposed === "boolean") next[key] = proposed;
  });
  if (candidate.orientation === "portrait" || candidate.orientation === "landscape") {
    next.orientation = candidate.orientation;
  }
  (["translationBold", "translationItalic", "translationUnderline"] as const).forEach((key) => {
    if (typeof candidate[key] === "boolean") next[key] = candidate[key];
  });
  if (
    typeof candidate.paperPreset === "string" &&
    (candidate.paperPreset === "Custom" || Object.hasOwn(PAPER_SIZES, candidate.paperPreset))
  ) {
    next.paperPreset = candidate.paperPreset;
  }
  if (candidate.tokenStyle && typeof candidate.tokenStyle === "object" && !Array.isArray(candidate.tokenStyle)) {
    const fallbackStyle = next.tokenStyle ?? deriveDocumentTokenStyleDefaults(next);
    const normalizedStyle = normalizeDocumentTokenStyle(
      candidate.tokenStyle,
      { ...fallbackStyle, pronunciation: undefined },
    );
    // Old projects have no pronunciation default. Derive it from their actual
    // imported source style, not the generic startup template's source size.
    const tokenStyle = language === "classical-chinese" || language === "omni"
      ? withAcademicPronunciationDefault(normalizedStyle)
      : normalizedStyle;
    next.tokenStyle = tokenStyle;
    // Schema v2 intentionally omits the old duplicate style settings. Mirror
    // the nested source of truth into legacy controls for a coherent UI.
    next.greekSize = tokenStyle.layers.source.sizePt;
    next.glossSize = tokenStyle.layers.gloss.sizePt;
    next.lemmaSize = tokenStyle.layers.lemma.sizePt;
    next.posSize = tokenStyle.layers.pos.sizePt;
    next.morphSize = tokenStyle.layers.morphology.sizePt;
    next.greekFont = tokenStyle.layers.source.fontFamily;
    next.englishFont = tokenStyle.layers.gloss.fontFamily;
    next.lemmaFont = tokenStyle.layers.lemma.fontFamily;
    next.morphFont = tokenStyle.layers.morphology.fontFamily;
  }
  next.omni = isOmniLanguageId(language)
    ? createOmniDocumentConfig(
        candidate.omni && typeof candidate.omni === "object" && !Array.isArray(candidate.omni)
          ? candidate.omni as Partial<OmniDocumentConfig>
          : undefined,
      )
    : undefined;
  return next;
};

export const normalizeImportedProject = (
  value: unknown,
  fallbackLanguage: TextLanguage,
  userDefaults?: UserTokenStyleDefaults,
  origin: StoaProjectOpenOrigin = "exchange",
): ImportedProjectState => {
  // Fonts STOA no longer bundles are replaced before validation, so Preview,
  // export and the next save all use the same, available font.
  const parsed = parseStoaProject(replaceRetiredFontFamilies(value));
  const documentData = parsed.project.document;
  const preferredLanguage = isStoaWorkspaceLanguageId(documentData.language)
    ? documentData.language
    : fallbackLanguage;
  // A validated project may intentionally be empty (New, or a saved blank
  // document). AI analysis responses still require usable tokens.
  const importedAnalysis = normalizeImportedAnalysis(documentData.analysis, preferredLanguage, {
    allowEmptyTokens: true,
    preserveTokenText: true,
  });
  const language = isStoaWorkspaceLanguageId(documentData.language)
    ? documentData.language
    : importedAnalysis.language;
  const source = documentData.sourceText;
  const analysis: Analysis = {
    ...importedAnalysis,
    language,
    sourceText: source,
  };
  const settings = normalizeProjectSettings(documentData.settings, language, userDefaults);
  if (isOmniLanguageId(language)) {
    const omni = createOmniDocumentConfig({
      ...settings.omni,
      // Exchange JSON is untrusted and cannot assert an already-confirmed
      // profile. Native desktop documents and bundled developer samples are
      // trusted lifecycle inputs and must retain their saved configuration.
      manualLanguageOverride: omniManualOverrideForProjectOpen(
        origin,
        settings.omni?.manualLanguageOverride ?? null,
      ),
      languageDetection: analysis.languageDetection ?? settings.omni?.languageDetection,
      analysisProfile: analysis.analysisProfile ?? settings.omni?.analysisProfile,
      morphologyStandard: analysis.morphologyStandard ?? settings.omni?.morphologyStandard,
    }, source);
    settings.omni = omni;
    settings.hideIndeclinableDetails = omni.analysisProfile === "rich-inflectional"
      ? settings.hideIndeclinableDetails
      : false;
    analysis.languageDetection = omni.languageDetection;
    analysis.analysisProfile = omni.analysisProfile;
    analysis.morphologyStandard = omni.morphologyStandard;
  }
  const requestedSelection = documentData.selectedTokenId;
  const selectedTokenId = requestedSelection && analysis.tokens.some((token) => token.id === requestedSelection)
    ? requestedSelection
    : null;
  return { language, analysis, settings, selectedTokenId, projectBase: parsed };
};

const importedStateFromParsedProject = (
  project: ParsedStoaProject,
  fallbackLanguage: TextLanguage,
): ImportedProjectState => normalizeImportedProject(
  serializeStoaProject(project),
  fallbackLanguage,
  undefined,
  "bundled",
);

const createOfficialSampleState = (
  language: "ancient-greek" | "latin" | "classical-chinese",
): ImportedProjectState => importedStateFromParsedProject(
  createDeveloperDefaultProject(language),
  language,
);

const createOmniSampleState = (): ImportedProjectState =>
  importedStateFromParsedProject(
    createDeveloperDefaultProject("omni"),
    "omni",
  );

const projectFeatures = (features: MorphFeatures | undefined): StoaJsonObject =>
  Object.fromEntries(
    Object.entries(features ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

const toProjectToken = (
  token: GreekToken,
  baseToken?: StoaProjectToken,
  v2Defaults?: DocumentTokenStyle,
): StoaProjectToken => {
  const result: StoaProjectToken = {
    ...token,
    features: {
    ...(baseToken?.features ?? {}),
    ...projectFeatures(token.features),
    },
    alternatives: [...token.alternatives],
  };
  if (v2Defaults) {
    const styleOverrides = tokenStyleOverrideFor(token, v2Defaults);
    delete result.wordFont;
    delete result.wordSize;
    delete result.wordColor;
    delete result.wordBold;
    delete result.wordItalic;
    delete result.wordUnderline;
    delete result.lemmaColor;
    delete result.lemmaUnderline;
    delete result.morphColor;
    delete result.morphUnderline;
    if (styleOverrides) result.styleOverrides = styleOverrides;
    else delete result.styleOverrides;
  }
  return result;
};

const toProjectAnalysis = (
  language: TextLanguage,
  sourceText: string,
  analysis: Analysis,
  base?: ParsedStoaProject,
  v2Defaults?: DocumentTokenStyle,
  omni?: OmniDocumentConfig,
): StoaProjectAnalysis => ({
  language,
  sourceText,
  literalTranslation: analysis.literalTranslation,
  naturalTranslation: analysis.naturalTranslation,
  tokens: analysis.tokens.map((token) => toProjectToken(
    token,
    base?.project.document.analysis.tokens.find((candidate) => candidate.id === token.id),
    v2Defaults,
  )),
  notes: cloneAnalysisNotes(analysis.notes),
  ...(omni
    ? {
        languageDetection: omni.languageDetection,
        analysisProfile: omni.analysisProfile,
        morphologyStandard: omni.morphologyStandard,
      }
    : {}),
});

export const createProjectFile = (
  language: TextLanguage,
  sourceText: string,
  analysis: Analysis,
  settings: StudioSettings,
  selectedTokenId: string | null,
  base?: ParsedStoaProject,
): ParsedStoaProject => {
  const exportedAt = new Date().toISOString();
  const preparedBase = base ? migrateStoaProjectToLatest(base) : undefined;
  const v2Defaults = documentTokenStyleFor(settings);
  const canonicalOmni = isOmniLanguageId(language)
    ? createOmniDocumentConfig({
        ...settings.omni,
        languageDetection: analysis.languageDetection ?? settings.omni?.languageDetection,
        analysisProfile: analysis.analysisProfile ?? settings.omni?.analysisProfile,
        morphologyStandard: analysis.morphologyStandard ?? settings.omni?.morphologyStandard,
      }, analysis.sourceText)
    : undefined;
  const projectSettings: StoaProjectSettings = {
    ...settings,
    ...(v2Defaults
      ? { tokenStyle: v2Defaults }
      : {}),
    ...(canonicalOmni
      ? { omni: canonicalOmni }
      : {}),
  };
  for (const key of LEGACY_TOKEN_STYLE_SETTING_KEYS) delete projectSettings[key];
  const projectAnalysis = toProjectAnalysis(
    language,
    sourceText,
    analysis,
    preparedBase,
    v2Defaults,
    canonicalOmni,
  );
  if (preparedBase) {
    return {
      ...preparedBase,
      project: {
        ...preparedBase.project,
        appVersion: STOA_VERSION,
        exportedAt,
        document: {
          ...preparedBase.project.document,
          language,
          sourceText,
          selectedTokenId,
          analysis: projectAnalysis,
          settings: projectSettings,
        },
      },
    };
  }
  const document = {
    language,
    sourceText,
    selectedTokenId,
    analysis: projectAnalysis,
    settings: projectSettings,
  };
  return createStoaProject({
    format: "stoa-project",
    schemaVersion: STOA_PROJECT_V6_SCHEMA,
    appVersion: STOA_VERSION,
    exportedAt,
    document,
  });
};

const download = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  downloadBlob(blob, filename);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

let notoSansScFontBase64Promise: Promise<string> | null = null;
let unicodePdfFontsBase64Promise: Promise<{
  serif: VectorPdfFontFaces;
  timesSerif: VectorPdfFontFaces;
  sans: VectorPdfFontFaces;
}> | null = null;
const classicalChineseFontBase64Promises = new Map<string, Promise<string>>();

const CLASSICAL_CHINESE_FONT_URLS: Record<string, Partial<Record<keyof VectorPdfFontFaces, string>> & { normal: string }> = {
  "bundled:source-han-serif-sc": { normal: sourceHanSerifScFontUrl },
  "bundled:source-han-serif-tc": { normal: sourceHanSerifTcFontUrl },
  "bundled:fandol-song": { normal: fandolSongRegularFontUrl, bold: fandolSongBoldFontUrl },
  "bundled:fandol-hei": { normal: fandolHeiRegularFontUrl, bold: fandolHeiBoldFontUrl },
  "bundled:fandol-fang": { normal: fandolFangFontUrl },
  "bundled:fandol-kai": { normal: fandolKaiFontUrl },
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
};

const loadExportAssetBase64 = async (url: string, label: string) =>
  arrayBufferToBase64(await fetchExportAssetBytes(url, label, {
    protocol: window.location.protocol,
    baseUri: document.baseURI,
  }));

const loadNotoSansScFontBase64 = () => {
  if (!notoSansScFontBase64Promise) {
    notoSansScFontBase64Promise = loadExportAssetBase64(notoSansScFontUrl, "Noto Sans SC font")
      .catch((error) => {
        notoSansScFontBase64Promise = null;
        throw error;
      });
  }
  return notoSansScFontBase64Promise;
};

const loadUnicodePdfFontsBase64 = () => {
  if (!unicodePdfFontsBase64Promise) {
    const pending = Promise.all([
      loadExportAssetBase64(notoSerifRegularFontUrl, "Noto Serif regular font"),
      loadExportAssetBase64(notoSerifBoldFontUrl, "Noto Serif bold font"),
      loadExportAssetBase64(notoSerifItalicFontUrl, "Noto Serif italic font"),
      loadExportAssetBase64(notoSerifBoldItalicFontUrl, "Noto Serif bold italic font"),
      loadExportAssetBase64(liberationSerifRegularFontUrl, "Liberation Serif regular font"),
      loadExportAssetBase64(liberationSerifBoldFontUrl, "Liberation Serif bold font"),
      loadExportAssetBase64(liberationSerifItalicFontUrl, "Liberation Serif italic font"),
      loadExportAssetBase64(liberationSerifBoldItalicFontUrl, "Liberation Serif bold italic font"),
      loadExportAssetBase64(liberationSansRegularFontUrl, "Liberation Sans regular font"),
      loadExportAssetBase64(liberationSansBoldFontUrl, "Liberation Sans bold font"),
      loadExportAssetBase64(liberationSansItalicFontUrl, "Liberation Sans italic font"),
      loadExportAssetBase64(liberationSansBoldItalicFontUrl, "Liberation Sans bold italic font"),
    ]).then(([
      serifNormal,
      serifBold,
      serifItalic,
      serifBoldItalic,
      timesSerifNormal,
      timesSerifBold,
      timesSerifItalic,
      timesSerifBoldItalic,
      sansNormal,
      sansBold,
      sansItalic,
      sansBoldItalic,
    ]) => ({
      serif: {
        normal: serifNormal,
        bold: serifBold,
        italic: serifItalic,
        bolditalic: serifBoldItalic,
      },
      timesSerif: {
        normal: timesSerifNormal,
        bold: timesSerifBold,
        italic: timesSerifItalic,
        bolditalic: timesSerifBoldItalic,
      },
      sans: {
        normal: sansNormal,
        bold: sansBold,
        italic: sansItalic,
        bolditalic: sansBoldItalic,
      },
    }));
    unicodePdfFontsBase64Promise = pending.catch((error) => {
      unicodePdfFontsBase64Promise = null;
      throw error;
    });
  }
  return unicodePdfFontsBase64Promise;
};

const loadClassicalChinesePdfFonts = async (
  usedFamilies: ReadonlySet<string>,
): Promise<VectorPdfCffFontFamily[]> => {
  const primaryFamily = (family: string) => family
    .split(",", 1)[0]
    .trim()
    .replace(/^['"]|['"]$/gu, "");
  const usedPrimaryFamilies = new Set([...usedFamilies].map(primaryFamily));
  const selected = CLASSICAL_CHINESE_BUILTIN_FONTS.filter((font) =>
    usedFamilies.has(font.cssFamily)
    || usedPrimaryFamilies.has(primaryFamily(font.cssFamily))
    || usedPrimaryFamilies.has(font.familyName));
  const sourceHanSc = CLASSICAL_CHINESE_BUILTIN_FONTS.find((font) =>
    font.id === "bundled:source-han-serif-sc");
  const fontsToLoad = selected.length && sourceHanSc && !selected.includes(sourceHanSc)
    ? [sourceHanSc, ...selected]
    : selected;
  return Promise.all(
    fontsToLoad
    .map(async (font) => {
      const urls = CLASSICAL_CHINESE_FONT_URLS[font.id];
      if (!urls) throw new Error(`The bundled ${font.familyName} asset map is missing.`);
      const faces = Object.fromEntries(await Promise.all(
        (Object.entries(urls) as Array<[keyof VectorPdfFontFaces, string]>).map(async ([style, url]) => {
          let pending = classicalChineseFontBase64Promises.get(url);
          if (!pending) {
            pending = loadExportAssetBase64(url, `${font.familyName} ${style} font`)
              .catch((error) => {
                classicalChineseFontBase64Promises.delete(url);
                throw error;
              });
            classicalChineseFontBase64Promises.set(url, pending);
          }
          return [style, await pending] as const;
        }),
      )) as VectorPdfCffFontFamily["faces"];
      return {
        cssFamily: font.cssFamily,
        familyName: font.familyName,
        faces,
      };
    }),
  );
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("The browser could not encode the rendered PDF page as PNG."));
  }, "image/png");
});

const copyToClipboard = async (content: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return;
    } catch {
      // Local file URLs may not receive Clipboard API permission.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

export default function Home() {
  const [initialProject] = useState<ImportedProjectState>(
    () => createOfficialSampleState("ancient-greek"),
  );
  const [language, setLanguage] = useState<TextLanguage>("ancient-greek");
  const [sourceText, setSourceText] = useState(initialProject.analysis.sourceText);
  const [analysis, setAnalysis] = useState<Analysis>(() => cloneAnalysis(initialProject.analysis));
  const [selection, setSelection] = useState<TokenSelectionState>(() =>
    createTokenSelection(
      initialProject.analysis.tokens.map((token) => token.id),
      initialProject.selectedTokenId ? [initialProject.selectedTokenId] : [],
      initialProject.selectedTokenId,
      initialProject.selectedTokenId,
    ),
  );
  const [settings, setSettings] = useState<StudioSettings>(() => cloneSettings(initialProject.settings));
  const [promptOpen, setPromptOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [analysisImportFilename, setAnalysisImportFilename] = useState("");
  const [analysisImportFeedback, setAnalysisImportFeedback] = useState<{
    tone: "success" | "partial" | "error";
    text: string;
    permissiveSummary?: PermissiveAnalysisImportSummary;
  } | null>(null);
  const [jsonWorkspaces, setJsonWorkspaces] = useState<Partial<Record<TextLanguage, JsonWorkspace>>>({});
  const [projectBases, setProjectBases] = useState<Partial<Record<TextLanguage, ParsedStoaProject>>>(() => ({
    "ancient-greek": initialProject.projectBase,
  }));
  const [manualSessionOpen, setManualSessionOpen] = useState(false);
  const [manualSession, setManualSession] = useState<ManualAnalysisSession | null>(null);
  const [manualResponseDrafts, setManualResponseDrafts] = useState<Record<string, string>>({});
  const [manualSessionLoaded, setManualSessionLoaded] = useState(false);
  const [manualSessionNotice, setManualSessionNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const [manualRecoveryWarning, setManualRecoveryWarning] = useState("");
  const [projectImportOpen, setProjectImportOpen] = useState(false);
  const [projectImportValue, setProjectImportValue] = useState("");
  const [projectImportFilename, setProjectImportFilename] = useState("");
  const [layoutAiOpen, setLayoutAiOpen] = useState(false);
  const [tokenEditorOpen, setTokenEditorOpen] = useState(false);
  const [compositionStyleOpen, setCompositionStyleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [omniWarningDismissed, setOmniWarningDismissed] = useState(false);
  const [omniWarningPending, setOmniWarningPending] = useState<PendingOmniTransition | null>(null);
  const [suppressOmniWarning, setSuppressOmniWarning] = useState(false);
  const [userTokenStyleDefaults, setUserTokenStyleDefaults] = useState<UserTokenStyleDefaults>(
    createEmptyUserTokenStyleDefaults,
  );
  const [localPreferencesHydrated, setLocalPreferencesHydrated] = useState(false);
  const [layoutPlanValue, setLayoutPlanValue] = useState("");
  const [desktopDocumentsAvailable, setDesktopDocumentsAvailable] = useState(false);
  const [desktopDocumentState, setDesktopDocumentState] = useState<StoaDesktopDocumentState | null>(null);
  const [desktopSavedRevisionGeneration, setDesktopSavedRevisionGeneration] = useState(0);
  const [desktopHelpOpen, setDesktopHelpOpen] = useState(false);
  const [toast, setToast] = useState("");
  const exportBusyRef = useRef(false);
  const [activeDocumentExport, setActiveDocumentExport] = useState<"pdf" | "png" | null>(null);
  const [runtimeAssetWarning, setRuntimeAssetWarning] = useState("");
  const [dictionaryPopover, setDictionaryPopover] = useState<DictionaryPopoverState | null>(null);
  const [dictionaryTrigger, setDictionaryTrigger] = useState<HTMLElement | null>(null);
  const [readyFontRequestKey, setReadyFontRequestKey] = useState("");
  const [userFonts, setUserFonts] = useState<UserFontRecord[]>([]);
  const [fontLibraryReady, setFontLibraryReady] = useState(false);
  const [fontImportBusy, setFontImportBusy] = useState(false);
  const [fontImportError, setFontImportError] = useState("");
  const [userDictionaries, setUserDictionaries] = useState<UserDictionarySummary[]>([]);
  const [dictionaryLibraryReady, setDictionaryLibraryReady] = useState(false);
  const [dictionaryImportBusy, setDictionaryImportBusy] = useState(false);
  const [dictionaryImportError, setDictionaryImportError] = useState("");
  const [dictionaryImportProgress, setDictionaryImportProgress] = useState<DictionaryImportProgress | null>(null);
  const dictionaryInputRef = useRef<HTMLInputElement>(null);
  const [workspaceHistories, setWorkspaceHistories] = useState<
    WorkspaceHistories<TextLanguage, DocumentSnapshot>
  >({});
  const workspaceHistoriesRef = useRef<WorkspaceHistories<TextLanguage, DocumentSnapshot>>({});
  const historyCoalescingRef = useRef<HistoryCoalescingState<TextLanguage> | null>(null);
  const latestLayoutSourceKey = useRef("");
  const latestSettings = useRef(settings);
  const activeLanguageRef = useRef<TextLanguage>(language);
  const languageDocuments = useRef<Partial<Record<TextLanguage, DocumentSnapshot>>>({});
  const desktopSavedRevisions = useRef<Partial<Record<TextLanguage, string>>>({});
  const [browserSaves] = useState(() => createSavedRevisionTracker<TextLanguage>());
  const browserHasUnsavedChanges = useRef<() => boolean>(() => false);
  const desktopCommandHandler = useRef<(
    command: StoaDesktopDocumentCommand,
  ) => Promise<Record<string, unknown>>>(async () => ({ ok: false }));
  const desktopSerializeHandler = useRef<(
    request: StoaDesktopSerializeRequest,
  ) => Promise<Record<string, unknown>>>(async () => ({ ok: false }));
  const languageConfig = getWorkspaceLanguageConfig(language);
  const pronunciationLabel = pronunciationLabelFor(
    language,
    analysis.tokens.map((token) => token.surface).join(""),
  );
  const pronunciationAvailable = pronunciationLabel !== null;
  const annotationTarget = isStoaLanguageId(language)
    ? resolveAnnotationTarget(language, settings.annotationTarget)
    : "english";
  const annotationTargetLabel = ANNOTATION_STRATEGIES[annotationTarget].englishLabel;
  const omniDocument = useMemo(() => isOmniLanguageId(language)
    ? createOmniDocumentConfig({
        ...settings.omni,
        languageDetection: analysis.languageDetection ?? settings.omni?.languageDetection,
        analysisProfile: analysis.analysisProfile ?? settings.omni?.analysisProfile,
        morphologyStandard: analysis.morphologyStandard ?? settings.omni?.morphologyStandard,
      }, analysis.sourceText)
    : null, [
      analysis.analysisProfile,
      analysis.languageDetection,
      analysis.morphologyStandard,
      language,
      settings.omni,
      analysis.sourceText,
    ]);
  const omniProfileResolution = useMemo(() => omniDocument
    ? resolveOmniLanguageProfile({
        sourceText: analysis.sourceText,
        detection: omniDocument.languageDetection,
        manualOverride: omniDocument.manualLanguageOverride,
      })
    : null, [analysis.sourceText, omniDocument]);
  const effectiveSettings = useMemo<StudioSettings>(() => omniDocument
    ? {
        ...settings,
        omni: omniDocument,
        hideIndeclinableDetails: omniProfileResolution?.capabilities.hideIndeclinableDetails
          ? settings.hideIndeclinableDetails
          : false,
      }
    : settings, [omniDocument, omniProfileResolution, settings]);
  const omniWritingStyle = omniDocument ? getOmniWritingStyle(omniDocument) : null;
  const omniWritingOrientation = omniDocument
    ? getOmniWritingOrientation(omniDocument.writingMode)
    : "horizontal";
  const omniVertical = omniWritingOrientation === "vertical";
  const jsonWorkspace = jsonWorkspaces[language] ?? null;
  const hasClassicalDictionary = language === "ancient-greek" || language === "latin";
  const supportsUserDictionary = isStoaLanguageId(language);
  const languageDictionaries = supportsUserDictionary
    ? userDictionaries.filter((dictionary) => dictionary.language === language)
    : [];
  const dictionaryLookupEnabled = supportsUserDictionary && languageDictionaries.length > 0;
  const activeHistory = workspaceHistories[language] ?? { undo: [], redo: [] };
  const undoStack = activeHistory.undo;
  const redoStack = activeHistory.redo;
  const canHideIndeclinableDetails = hasClassicalDictionary
    || omniProfileResolution?.capabilities.hideIndeclinableDetails === true;
  const tokenIds = useMemo(() => analysis.tokens.map((item) => item.id), [analysis.tokens]);
  const selectedIdSet = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds]);
  const selectedTokens = useMemo(
    () => selectedItemsInDocumentOrder(analysis.tokens, selection.selectedIds),
    [analysis.tokens, selection.selectedIds],
  );
  const selectedId = selection.focusId && selectedIdSet.has(selection.focusId)
    ? selection.focusId
    : selectedTokens.at(-1)?.id ?? null;
  const selectedToken = selectedTokens.find((item) => item.id === selectedId) ?? selectedTokens[0];
  const singleSelectedToken = selectedTokens.length === 1 ? selectedTokens[0] : undefined;
  const selectedTokenNotes = useMemo(
    () => singleSelectedToken ? notesForToken(analysis.notes, singleSelectedToken.id) : [],
    [analysis.notes, singleSelectedToken],
  );
  const selectionTailId = selectedTokens.at(-1)?.id ?? null;
  const selectedBreakAfter = aggregateSelectedValue(
    analysis.tokens,
    selection.selectedIds,
    getBreakAfter,
  );
  const selectedBlankLines = aggregateSelectedValue(
    analysis.tokens,
    selection.selectedIds,
    getBlankLinesAfter,
  );
  const selectedBlankLineSpacing = aggregateSelectedValue(
    analysis.tokens,
    selection.selectedIds,
    (item) => Math.round(getBlankLineSpacing(item, effectiveSettings)),
  );
  const selectedBreakAfterValue = selectedBreakAfter.kind === "uniform"
    ? selectedBreakAfter.value
    : "__mixed__";
  const selectedBlankLinesValue = selectedBlankLines.kind === "uniform"
    ? selectedBlankLines.value
    : selectedToken ? getBlankLinesAfter(selectedToken) : 1;
  const selectedBlankLineSpacingValue = selectedBlankLineSpacing.kind === "uniform"
    ? selectedBlankLineSpacing.value
    : selectedToken ? Math.round(getBlankLineSpacing(selectedToken, effectiveSettings)) : Math.round(paragraphGapPx(effectiveSettings));
  const showSelectedParagraphControls = selectedBreakAfter.kind === "mixed"
    || (selectedBreakAfter.kind === "uniform" && selectedBreakAfter.value === "paragraph");
  const documentTokenStyle = useMemo(() => documentTokenStyleFor(effectiveSettings), [effectiveSettings]);
  const importedFontOptions = useMemo(() => userFontOptions(userFonts), [userFonts]);
  const scopedBuiltinFontOptions = useMemo(
    () => STOA_BUILTIN_FONTS.filter((font) =>
      Boolean(font.workspaces?.length) && fontAvailableInWorkspace(font, language)),
    [language],
  );
  const projectFontReferences = useMemo(
    () => referencedUserFontsForDocument(effectiveSettings, analysis.tokens, userFonts),
    [analysis.tokens, effectiveSettings, userFonts],
  );
  const currentProjectSettings = useMemo<StudioSettings>(() => ({
    ...effectiveSettings,
    fontReferences: projectFontReferences,
  }), [effectiveSettings, projectFontReferences]);
  const publicationAnalysis = useMemo(
    () => publicationAnalysisFor(analysis, currentProjectSettings),
    [analysis, currentProjectSettings],
  );
  const fontRequestEntries = useMemo(
    () => documentFontRequests(publicationAnalysis, currentProjectSettings, documentTokenStyle),
    [currentProjectSettings, documentTokenStyle, publicationAnalysis],
  );
  const fontRequestKey = useMemo(() => compactLayoutKey(JSON.stringify({
    requests: fontRequestEntries,
    referencedFonts: projectFontReferences.map(({ id, sha256, faceStyle }) => ({ id, sha256, faceStyle })),
  })), [fontRequestEntries, projectFontReferences]);
  const fontsReady = fontLibraryReady && readyFontRequestKey === fontRequestKey;
  const layoutSourceKey = useMemo(() => compactLayoutKey(JSON.stringify({
    fontRequestKey,
    fontMetricsStatus: fontsReady ? "ready" : "loading",
    settings: currentProjectSettings,
    tokens: publicationAnalysis.tokens,
    literalTranslation: publicationAnalysis.literalTranslation,
    naturalTranslation: publicationAnalysis.naturalTranslation,
    notes: publicationAnalysis.notes,
  })), [currentProjectSettings, fontRequestKey, fontsReady, publicationAnalysis]);
  useLayoutEffect(() => {
    activeLanguageRef.current = language;
  }, [language]);
  useLayoutEffect(() => {
    latestLayoutSourceKey.current = layoutSourceKey;
  }, [layoutSourceKey]);
  const missingDocumentFonts = useMemo(
    () => missingUserFontReferences(projectFontReferences, userFonts),
    [projectFontReferences, userFonts],
  );
  const documentLayoutReady = fontsReady && missingDocumentFonts.length === 0;
  const omniExportPreflight = useMemo(() => omniDocument
    ? omniExportPreflightInput(analysis.sourceText, omniDocument, {
        renderedText: publicationRenderedText(publicationAnalysis, currentProjectSettings),
        layoutParityVerified: documentLayoutReady,
        fontUses: omniExportFontUsesFor(
          analysis.language,
          currentProjectSettings,
          publicationAnalysis.tokens,
          userFonts,
          publicationAnalysis.literalTranslation,
          publicationAnalysis.naturalTranslation,
        ),
      })
    : null, [analysis.language, analysis.sourceText, currentProjectSettings, documentLayoutReady, omniDocument, publicationAnalysis, userFonts]);
  const omniExportCapabilities = useMemo(
    () => omniExportPreflight ? getOmniExportCapabilities(omniExportPreflight) : null,
    [omniExportPreflight],
  );
  const sourceUnitCount = useMemo(() => countSourceUnits(sourceText, language), [sourceText, language]);
  const prompt = useMemo(
    () => makeUserPrompt(sourceText, language, omniDocument ?? undefined, analysis.tokens, annotationTarget),
    [sourceText, language, omniDocument, analysis.tokens, annotationTarget],
  );
  const manualMerge = useMemo(
    () => manualSession ? mergeManualAnalysisSession(manualSession) : null,
    [manualSession],
  );
  const manualSessionMatchesSource = Boolean(
    manualSession
    && manualSession.sourceText === sourceText
    && manualSession.language === language
    && (manualSession.annotationTarget ?? "english") === annotationTarget,
  );
  const manualCompletedChunks = manualSession?.chunks.filter((chunk) => chunk.status === "valid").length ?? 0;
  const layoutPrompt = useMemo(
    () => makeLayoutPrompt(analysis, currentProjectSettings, fontsReady),
    [analysis, currentProjectSettings, fontsReady],
  );
  const latex = useMemo(
    () => buildStoaLatex(publicationAnalysis, currentProjectSettings),
    [publicationAnalysis, currentProjectSettings],
  );
  const previewPagination = useMemo(
    () => paginatePreviewDocument(
      publicationAnalysis.tokens,
      publicationAnalysis.notes,
      analysis.literalTranslation,
      analysis.naturalTranslation,
      currentProjectSettings,
      fontsReady,
      layoutSourceKey,
      analysis.language,
    ),
    [analysis.language, analysis.literalTranslation, analysis.naturalTranslation, currentProjectSettings, fontsReady, layoutSourceKey, publicationAnalysis.notes, publicationAnalysis.tokens],
  );
  const pages = previewPagination.pages;
  const pageStyle = useMemo(
    () =>
      ({
        width: `${currentProjectSettings.paperWidthMm}mm`,
        height: `${currentProjectSettings.paperHeightMm}mm`,
        padding: `${currentProjectSettings.marginTopMm}mm ${currentProjectSettings.marginRightMm}mm ${currentProjectSettings.marginBottomMm}mm ${currentProjectSettings.marginLeftMm}mm`,
        backgroundColor: currentProjectSettings.background,
        color: currentProjectSettings.ink,
        ["--word-gap" as string]: `${currentProjectSettings.wordGap}px`,
        ["--line-gap" as string]: `${currentProjectSettings.lineGap}px`,
        ["--greek-size" as string]: `${currentProjectSettings.greekSize}pt`,
        ["--gloss-size" as string]: `${currentProjectSettings.glossSize}pt`,
        ["--lemma-size" as string]: `${currentProjectSettings.lemmaSize}pt`,
        ["--pos-size" as string]: `${currentProjectSettings.posSize}pt`,
        ["--morph-size" as string]: `${currentProjectSettings.morphSize}pt`,
        ["--translation-size" as string]: `${currentProjectSettings.translationSize}pt`,
        ["--note-size" as string]: `${Math.max(ANALYSIS_NOTE_MIN_SIZE_PT, currentProjectSettings.translationSize * ANALYSIS_NOTE_SIZE_RATIO)}pt`,
        ["--note-line-height" as string]: String(ANALYSIS_NOTE_LINE_HEIGHT),
        ["--trailing-text-measure" as string]: `${resolveTrailingTextMeasurePx(
          Math.max(
            1,
            (currentProjectSettings.paperWidthMm
              - currentProjectSettings.marginLeftMm
              - currentProjectSettings.marginRightMm) * MM_TO_PX
              - PAPER_LAYOUT_BORDER_PX,
          ),
        )}px`,
        ["--greek-font" as string]: currentProjectSettings.greekFont,
        ["--annotation-font" as string]: currentProjectSettings.englishFont,
        ["--lemma-font" as string]: currentProjectSettings.lemmaFont,
        ["--morph-font" as string]: currentProjectSettings.morphFont,
        ["--accent" as string]: currentProjectSettings.accent,
        ["--ink-muted-58" as string]: hexWithAlpha(currentProjectSettings.ink, 0.58),
        ["--ink-muted-66" as string]: hexWithAlpha(currentProjectSettings.ink, 0.66),
        ["--ink-muted-72" as string]: hexWithAlpha(currentProjectSettings.ink, 0.72),
        ["--ink-rule-14" as string]: hexWithAlpha(currentProjectSettings.ink, 0.14),
      }) as CSSProperties,
    [currentProjectSettings],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setRuntimeAssetWarning(getExportRuntimeWarning(window.location.protocol) ?? "");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await listUserFonts();
        const available: UserFontRecord[] = [];
        const failed: string[] = [];
        for (const font of stored) {
          try {
            await registerUserFont(font);
            available.push(font);
          } catch {
            failed.push(`${font.familyName} ${font.subfamilyName}`);
          }
        }
        if (!active) return;
        setUserFonts(available);
        if (failed.length) {
          setFontImportError(`Could not activate ${failed.join(", ")}. Re-import a valid TTF or OTF file.`);
        }
      } catch (error) {
        if (active) {
          setFontImportError(error instanceof Error ? error.message : "The device-local font library is unavailable.");
        }
      } finally {
        if (active) setFontLibraryReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void listUserDictionaries()
      .then((dictionaries) => {
        if (active) setUserDictionaries(dictionaries);
      })
      .catch((error) => {
        if (active) {
          setDictionaryImportError(
            error instanceof Error ? error.message : "The local dictionary library is unavailable.",
          );
        }
      })
      .finally(() => {
        if (active) setDictionaryLibraryReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const decodedOmniPreferences = readOmniPreferences(window.localStorage);
      const warningDismissed = decodedOmniPreferences.value.experimentalWarningSuppressed;
      setOmniWarningDismissed(warningDismissed);
      if (decodedOmniPreferences.issues.length) {
        setToast("The saved OMNI warning preference was invalid, so the experimental warning was safely restored");
      }
      const decodedDefaults = readUserTokenStyleDefaults(
        window.localStorage,
        BUILT_IN_TOKEN_STYLES,
      );
      setUserTokenStyleDefaults(decodedDefaults.value);
      if (decodedDefaults.issues.length) {
        setToast("One saved style default was invalid and was safely ignored");
      }
      // A browser launch is a fresh editing session. Document content,
      // typography, paper, and the active workspace always come from the
      // developer-controlled bundled sample; only true device preferences
      // such as dictionaries, fonts, saved style presets, and warning choices
      // persist across launches.
      const imported = createOfficialSampleState("ancient-greek");
      const importedSelection = createTokenSelection(
        imported.analysis.tokens.map((token) => token.id),
        imported.selectedTokenId ? [imported.selectedTokenId] : [],
        imported.selectedTokenId,
        imported.selectedTokenId,
      );
      activeLanguageRef.current = imported.language;
      languageDocuments.current = {};
      workspaceHistoriesRef.current = {};
      setWorkspaceHistories({});
      setLanguage(imported.language);
      setSourceText(imported.analysis.sourceText);
      setAnalysis(imported.analysis);
      setSelection(importedSelection);
      setSettings(imported.settings);
      latestSettings.current = imported.settings;
      setProjectBases({ "ancient-greek": imported.projectBase });
      setJsonWorkspaces({});
      setLocalPreferencesHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
      const stored = window.sessionStorage.getItem(MANUAL_AI_SESSION_STORAGE_KEY);
      if (stored) {
        try {
            const restored = restoreManualAnalysisSession(stored);
            setManualSession(restored);
          } catch {
            window.sessionStorage.removeItem(MANUAL_AI_SESSION_STORAGE_KEY);
          }
        }
        const storedDrafts = window.sessionStorage.getItem(MANUAL_AI_DRAFT_STORAGE_KEY);
        if (storedDrafts) {
          try {
            const parsed = JSON.parse(storedDrafts) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              setManualResponseDrafts(Object.fromEntries(
                Object.entries(parsed)
                  .filter((entry): entry is [string, string] => typeof entry[1] === "string")
                  .map(([key, value]) => [key, value.slice(0, 2_000_000)]),
              ));
            }
          } catch {
            window.sessionStorage.removeItem(MANUAL_AI_DRAFT_STORAGE_KEY);
          }
        }
      } catch {
        // Some file:// browser modes disable web storage; the live session still works in memory.
        setManualRecoveryWarning("Browser recovery storage is unavailable. Keep this tab open until the session is complete.");
      }
      setManualSessionLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!manualSessionLoaded) return;
    try {
      if (manualSession) {
        window.sessionStorage.setItem(
          MANUAL_AI_SESSION_STORAGE_KEY,
          serializeManualAnalysisSession(manualSession),
        );
      } else {
        window.sessionStorage.removeItem(MANUAL_AI_SESSION_STORAGE_KEY);
      }
    } catch {
      // The session stays usable in memory when browser storage is unavailable or full.
      queueMicrotask(() => setManualRecoveryWarning("This session could not be saved for refresh recovery. Keep this tab open until the session is complete."));
    }
  }, [manualSession, manualSessionLoaded]);

  useEffect(() => {
    if (!manualSessionLoaded) return;
    try {
      const serialized = JSON.stringify(manualResponseDrafts);
      if (serialized.length <= 4_000_000) {
        window.sessionStorage.setItem(MANUAL_AI_DRAFT_STORAGE_KEY, serialized);
      } else {
        window.sessionStorage.removeItem(MANUAL_AI_DRAFT_STORAGE_KEY);
        queueMicrotask(() => setManualRecoveryWarning("Response drafts exceed the browser recovery limit. Keep this tab open; validated token data is still retained."));
      }
    } catch {
      // Draft recovery is best-effort; validation still works in the open tab.
      queueMicrotask(() => setManualRecoveryWarning("Response drafts could not be saved for refresh recovery. Keep this tab open."));
    }
  }, [manualResponseDrafts, manualSessionLoaded]);

  useEffect(() => {
    if (!fontLibraryReady) return;
    let active = true;
    const requestKey = fontRequestKey;
    const styleRequests = fontRequestEntries.map(([font, text]) =>
      document.fonts.load(font, text || "STOA"));
    void Promise.all(styleRequests)
      .then(() => document.fonts.ready)
      .then(() => {
        if (active) setReadyFontRequestKey(requestKey);
      })
      .catch(() => {
        if (active) {
          setReadyFontRequestKey("");
          setFontImportError("One or more document fonts could not be loaded. Re-import missing fonts before exporting.");
        }
      });
    return () => {
      active = false;
    };
  }, [fontLibraryReady, fontRequestEntries, fontRequestKey]);

  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const createDocumentSnapshot = (
    snapshotAnalysis: Analysis,
    snapshotSelection: TokenSelectionState,
    snapshotLanguage: TextLanguage,
    snapshotSettings: StudioSettings,
    snapshotJsonWorkspace = jsonWorkspaces[snapshotLanguage],
    snapshotProjectBase = projectBases[snapshotLanguage],
  ): DocumentSnapshot => ({
    analysis: cloneAnalysis(snapshotAnalysis),
    selection: {
      selectedIds: [...snapshotSelection.selectedIds],
      anchorId: snapshotSelection.anchorId,
      focusId: snapshotSelection.focusId,
    },
    language: snapshotLanguage,
    settings: cloneSettings(snapshotSettings),
    ...(snapshotJsonWorkspace
      ? { jsonWorkspace: cloneJsonWorkspace(snapshotJsonWorkspace) }
      : {}),
    ...(snapshotProjectBase ? { projectBase: snapshotProjectBase } : {}),
  });

  const currentSnapshot = (): DocumentSnapshot => createDocumentSnapshot(
    analysis,
    selection,
    language,
    settings,
  );

  const snapshotFromImportedState = (
    imported: ImportedProjectState,
  ): DocumentSnapshot => {
    const selectedTokenId = imported.selectedTokenId
      && imported.analysis.tokens.some((token) => token.id === imported.selectedTokenId)
      ? imported.selectedTokenId
      : null;
    return createDocumentSnapshot(
      imported.analysis,
      createTokenSelection(
        imported.analysis.tokens.map((token) => token.id),
        selectedTokenId ? [selectedTokenId] : [],
        selectedTokenId,
        selectedTokenId,
      ),
      imported.language,
      imported.settings,
      undefined,
      imported.projectBase,
    );
  };

  const createBlankWorkspaceSnapshot = (
    workspace: TextLanguage,
  ): DocumentSnapshot => {
    const imported = isStoaLanguageId(workspace)
      ? createOfficialSampleState(workspace)
      : createOmniSampleState();
    let blankSettings = cloneSettings(imported.settings);
    const blankAnalysis: Analysis = {
      ...cloneAnalysis(imported.analysis),
      language: workspace,
      sourceText: "",
      literalTranslation: "",
      naturalTranslation: "",
      tokens: [],
      notes: [],
    };
    if (isOmniLanguageId(workspace)) {
      const omni = createOmniDocumentConfig(undefined, "");
      blankSettings = {
        ...blankSettings,
        omni,
        hideIndeclinableDetails: false,
      };
      blankAnalysis.languageDetection = omni.languageDetection;
      blankAnalysis.analysisProfile = omni.analysisProfile;
      blankAnalysis.morphologyStandard = omni.morphologyStandard;
    }
    return createDocumentSnapshot(
      blankAnalysis,
      createTokenSelection([], [], null, null),
      workspace,
      blankSettings,
      undefined,
      undefined,
    );
  };

  const projectFromWorkspaceSnapshot = (
    snapshot: DocumentSnapshot,
  ): ParsedStoaProject => {
    const settingsWithFonts: StudioSettings = {
      ...snapshot.settings,
      fontReferences: referencedUserFontsForDocument(
        snapshot.settings,
        snapshot.analysis.tokens,
        userFonts,
      ),
    };
    return createProjectFile(
      snapshot.language,
      snapshot.analysis.sourceText,
      snapshot.analysis,
      settingsWithFonts,
      snapshot.selection.focusId,
      snapshot.projectBase,
    );
  };

  const snapshotForWorkspace = (workspace: TextLanguage): DocumentSnapshot => {
    if (workspace === activeLanguageRef.current) return currentSnapshot();
    const existing = languageDocuments.current[workspace];
    if (existing) return existing;
    const imported = isStoaLanguageId(workspace)
      ? createOfficialSampleState(workspace)
      : createOmniSampleState();
    return snapshotFromImportedState(imported);
  };

  const revisionForSnapshot = (snapshot: DocumentSnapshot): string =>
    documentRevision(projectFromWorkspaceSnapshot(snapshot));

  const replaceWorkspaceHistories = (
    next: WorkspaceHistories<TextLanguage, DocumentSnapshot>,
  ) => {
    workspaceHistoriesRef.current = next;
    setWorkspaceHistories(next);
  };

  const recordWorkspaceEdit = (
    targetLanguage: TextLanguage,
    snapshot: DocumentSnapshot,
  ) => {
    replaceWorkspaceHistories(pushWorkspaceHistory(
      workspaceHistoriesRef.current,
      targetLanguage,
      snapshot,
    ));
  };

  const applySnapshot = (snapshot: DocumentSnapshot, switchLanguage = false) => {
    if (!switchLanguage && snapshot.language !== activeLanguageRef.current) return;
    historyCoalescingRef.current = null;
    const restoredSettings = cloneSettings(snapshot.settings);
    const restoredAnalysis = cloneAnalysis(snapshot.analysis);
    const restoredSelection = sanitizeTokenSelection(
      snapshot.selection,
      restoredAnalysis.tokens.map((item) => item.id),
    );
    latestSettings.current = restoredSettings;
    activeLanguageRef.current = snapshot.language;
    languageDocuments.current[snapshot.language] = createDocumentSnapshot(
      restoredAnalysis,
      restoredSelection,
      snapshot.language,
      restoredSettings,
      snapshot.jsonWorkspace,
      snapshot.projectBase,
    );
    setAnalysis(restoredAnalysis);
    if (switchLanguage) setLanguage(snapshot.language);
    setSettings(restoredSettings);
    setJsonWorkspaces((current) => {
      const next = { ...current };
      if (snapshot.jsonWorkspace) {
        next[snapshot.language] = cloneJsonWorkspace(snapshot.jsonWorkspace);
      } else {
        delete next[snapshot.language];
      }
      return next;
    });
    setProjectBases((current) => {
      const next = { ...current };
      if (snapshot.projectBase) next[snapshot.language] = snapshot.projectBase;
      else delete next[snapshot.language];
      return next;
    });
    setSourceText(restoredAnalysis.sourceText);
    setSelection(restoredSelection);
  };

  const replaceDesktopWorkspace = (
    snapshot: DocumentSnapshot,
    clean: boolean,
  ): string => {
    const detached = createDocumentSnapshot(
      cloneAnalysis(snapshot.analysis),
      snapshot.selection,
      snapshot.language,
      cloneSettings(snapshot.settings),
      snapshot.jsonWorkspace,
      snapshot.projectBase,
    );
    languageDocuments.current[snapshot.language] = detached;
    const nextHistories = { ...workspaceHistoriesRef.current };
    delete nextHistories[snapshot.language];
    replaceWorkspaceHistories(nextHistories);
    applySnapshot(detached, true);
    setPromptOpen(false);
    setImportOpen(false);
    setProjectImportOpen(false);
    setManualSessionOpen(false);
    setTokenEditorOpen(false);
    setCompositionStyleOpen(false);
    const revision = revisionForSnapshot(detached);
    if (clean) desktopSavedRevisions.current[snapshot.language] = revision;
    return revision;
  };

  const commitDocument = (
    nextAnalysis: Analysis,
    nextSelection: TokenSelectionState | string | null | undefined = undefined,
    nextLanguage: TextLanguage = language,
    nextSettings: StudioSettings = settings,
    options: { historyCoalescingKey?: string } = {},
  ) => {
    const previousActiveSnapshot = currentSnapshot();
    const historySnapshot = nextLanguage === language
      ? previousActiveSnapshot
      : languageDocuments.current[nextLanguage];
    if (nextLanguage !== language) {
      languageDocuments.current[language] = previousActiveSnapshot;
      activeLanguageRef.current = nextLanguage;
    }
    const historyDecision = resolveHistoryCoalescing(
      historyCoalescingRef.current,
      nextLanguage,
      options.historyCoalescingKey,
    );
    historyCoalescingRef.current = historyDecision.state;
    if (historySnapshot && historyDecision.recordSnapshot) {
      recordWorkspaceEdit(nextLanguage, historySnapshot);
    }
    setAnalysis(nextAnalysis);
    setLanguage(nextLanguage);
    latestSettings.current = nextSettings;
    setSettings(nextSettings);
    setSourceText(nextAnalysis.sourceText);
    const nextIds = nextAnalysis.tokens.map((item) => item.id);
    const resolvedSelection = nextSelection === undefined
      ? sanitizeTokenSelection(selection, nextIds)
      : typeof nextSelection === "object" && nextSelection !== null
        ? sanitizeTokenSelection(nextSelection, nextIds)
        : createTokenSelection(
        nextIds,
        nextSelection ? [nextSelection] : [],
        nextSelection,
        nextSelection,
      );
    setSelection(resolvedSelection);
    languageDocuments.current[nextLanguage] = createDocumentSnapshot(
      nextAnalysis,
      resolvedSelection,
      nextLanguage,
      nextSettings,
    );
  };

  const detachProjectBase = (targetLanguage: TextLanguage) => {
    setProjectBases((current) => {
      if (!current[targetLanguage]) return current;
      const next = { ...current };
      delete next[targetLanguage];
      return next;
    });
  };

  const undo = () => {
    historyCoalescingRef.current = null;
    const step = undoWorkspaceHistory(
      workspaceHistoriesRef.current,
      language,
      currentSnapshot(),
    );
    if (!step) return;
    replaceWorkspaceHistories(step.histories);
    applySnapshot(step.snapshot);
    setToast("Undid the last action");
  };

  const redo = () => {
    historyCoalescingRef.current = null;
    const step = redoWorkspaceHistory(
      workspaceHistoriesRef.current,
      language,
      currentSnapshot(),
    );
    if (!step) return;
    replaceWorkspaceHistories(step.histories);
    applySnapshot(step.snapshot);
    setToast("Redid the last action");
  };

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || target.matches("input, textarea, select"))
      ) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  });

  const updateSetting = <K extends keyof StudioSettings>(
    key: K,
    value: StudioSettings[K],
  ) => {
    if (
      key === "hideIndeclinableDetails"
      && value === true
      && isOmniLanguageId(language)
      && !canHideIndeclinableDetails
    ) {
      setToast("Available only for validated inflectional-language profiles.");
      return;
    }
    const next = { ...settings, [key]: value };
    const synchronized = (LEGACY_TOKEN_STYLE_SETTING_KEYS as readonly (keyof StudioSettings)[]).includes(key)
      ? synchronizeExplicitTokenStyle(settings, next, new Set<keyof StudioSettings>([key]))
      : next;
    commitDocument(analysis, selection, language, synchronized, {
      historyCoalescingKey: `setting:${String(key)}`,
    });
  };

  const importUserFontFile = async (file?: File) => {
    if (!file || fontImportBusy) return;
    setFontImportBusy(true);
    setFontImportError("");
    try {
      const record = await parseUserFont(file.name, await file.arrayBuffer());
      await registerUserFont(record);
      await saveUserFont(record);
      setUserFonts((current) => [
        ...current.filter((font) => font.id !== record.id),
        record,
      ]);
      setToast(`${record.familyName} ${record.subfamilyName} imported to this device`);
    } catch (error) {
      setFontImportError(error instanceof Error ? error.message : "The font could not be imported.");
    } finally {
      setFontImportBusy(false);
    }
  };

  const importInstalledTimes = async () => {
    if (fontImportBusy) return;
    setFontImportBusy(true);
    setFontImportError("");
    try {
      const records = await loadLocalTimesNewRoman();
      setUserFonts((current) => [...current.filter((font) => !records.some((item) => item.id === font.id)), ...records]);
      setToast(`Times New Roman loaded · ${records.length} faces available for Preview and PDF`);
    } catch (error) {
      setFontImportError(error instanceof Error ? error.message : "Unable to load installed fonts.");
    } finally {
      setFontImportBusy(false);
    }
  };

  const removeUserFont = async (font: UserFontRecord) => {
    if (fontImportBusy) return;
    if (usedDocumentFontFamilies(settings, analysis.tokens).has(font.cssFamily)) {
      setFontImportError(`“${font.familyName}” is used by this document. Choose another font for every affected layer before removing it.`);
      return;
    }
    setFontImportBusy(true);
    setFontImportError("");
    try {
      await deleteUserFont(font.id);
      setUserFonts((current) => current.filter((item) => item.id !== font.id));
      setToast(`${font.familyName} ${font.subfamilyName} removed from this device`);
    } catch (error) {
      setFontImportError(error instanceof Error ? error.message : "The font could not be removed.");
    } finally {
      setFontImportBusy(false);
    }
  };

  const importDictionaryFiles = async (files: readonly File[]) => {
    if (!isStoaLanguageId(language) || dictionaryImportBusy || !files.length) return;
    setDictionaryImportBusy(true);
    setDictionaryImportError("");
    setDictionaryImportProgress({ stage: "Preparing dictionary files", processed: 0, total: 1 });
    try {
      const imported = await importUserDictionary(language, files, setDictionaryImportProgress);
      const refreshed = await listUserDictionaries();
      setUserDictionaries(refreshed);
      setDictionaryPopover(null);
      setDictionaryTrigger(null);
      setToast(`${imported.title} imported for ${languageName}`);
    } catch (error) {
      setDictionaryImportError(
        error instanceof Error ? error.message : "The MDict dictionary could not be imported.",
      );
    } finally {
      setDictionaryImportBusy(false);
      setDictionaryImportProgress(null);
    }
  };

  const removeUserDictionary = async (dictionary: UserDictionarySummary) => {
    if (dictionaryImportBusy) return;
    if (!window.confirm(`Remove “${dictionary.title}” and its local index from this browser? The original MDX/MDD files will not be changed.`)) return;
    setDictionaryImportBusy(true);
    setDictionaryImportError("");
    try {
      await deleteUserDictionary(dictionary.id);
      setUserDictionaries((current) => current.filter((item) => item.id !== dictionary.id));
      setDictionaryPopover(null);
      setDictionaryTrigger(null);
      setToast(`${dictionary.title} removed from this device`);
    } catch (error) {
      setDictionaryImportError(
        error instanceof Error ? error.message : "The dictionary could not be removed.",
      );
    } finally {
      setDictionaryImportBusy(false);
    }
  };

  const updateOmniDocument = (patch: Partial<OmniDocumentConfig>) => {
    if (!isOmniLanguageId(language)) return;
    const current = createOmniDocumentConfig(settings.omni, analysis.sourceText);
    const omni = createOmniDocumentConfig({ ...current, ...patch }, analysis.sourceText);
    const nextAnalysis: Analysis = {
      ...analysis,
      languageDetection: omni.languageDetection,
      analysisProfile: omni.analysisProfile,
      morphologyStandard: omni.morphologyStandard,
    };
    commitDocument(nextAnalysis, selection, language, {
      ...settings,
      omni,
      hideIndeclinableDetails: omni.analysisProfile === "rich-inflectional"
        ? settings.hideIndeclinableDetails
        : false,
    }, {
      historyCoalescingKey: `omni:${Object.keys(patch).sort().join("+") || "document"}`,
    });
  };

  const updateCompositionDocumentStyle = (nextStyle: DocumentTokenStyle) => {
    commitDocument(
      analysis,
      selection,
      language,
      withDocumentTokenStyle(settings, nextStyle),
    );
  };

  const saveCompositionStyleAsDefault = (nextStyle: DocumentTokenStyle) => {
    try {
      const nextDefaults = setUserTokenStyleDefault(
        userTokenStyleDefaults,
        language,
        nextStyle,
        builtInTokenStyleFor(language),
      );
      const result = writeUserTokenStyleDefaults(
        window.localStorage,
        nextDefaults,
        BUILT_IN_TOKEN_STYLES,
      );
      if (!result.ok) throw new Error(result.issue.message);
      setUserTokenStyleDefaults(nextDefaults);
      setToast(`${languageConfig.englishLabel} style saved for future documents`);
    } catch (error) {
      setToast(error instanceof Error
        ? `Unable to save the default style: ${error.message}`
        : "Unable to save the default style");
    }
  };

  const clearCompositionStyleDefault = () => {
    const nextDefaults = removeUserTokenStyleDefault(userTokenStyleDefaults, language);
    const result = writeUserTokenStyleDefaults(
      window.localStorage,
      nextDefaults,
      BUILT_IN_TOKEN_STYLES,
    );
    if (!result.ok) {
      setToast(`Unable to clear the default style: ${result.issue.message}`);
      return;
    }
    setUserTokenStyleDefaults(nextDefaults);
    setToast(`${languageConfig.englishLabel} future documents now use STOA defaults`);
  };

  const updatePaperPreset = (preset: string) => {
    const size = PAPER_SIZES[preset];
    const nextSettings = !size
      ? { ...settings, paperPreset: preset }
      : {
          ...settings,
          paperPreset: preset,
          paperWidthMm: settings.orientation === "portrait" ? size[0] : size[1],
          paperHeightMm: settings.orientation === "portrait" ? size[1] : size[0],
        };
    commitDocument(analysis, selection, language, nextSettings);
  };

  const updateOrientation = (orientation: "portrait" | "landscape") => {
    if (settings.orientation === orientation) return;
    const preset = PAPER_SIZES[settings.paperPreset];
    const nextSettings = preset
      ? {
          ...settings,
          orientation,
          paperWidthMm: orientation === "portrait" ? preset[0] : preset[1],
          paperHeightMm: orientation === "portrait" ? preset[1] : preset[0],
        }
      : {
          ...settings,
          orientation,
          paperWidthMm: settings.paperHeightMm,
          paperHeightMm: settings.paperWidthMm,
        };
    commitDocument(analysis, selection, language, nextSettings);
  };

  const updateToken = (
    key: "surface" | "punctuationBefore" | "punctuationAfter" | "gloss" | "lemma" | "pos" | "morphology" | "pinyin" | "romanization",
    value: string,
  ) => {
    if (!singleSelectedToken) return;
    const tokens = analysis.tokens.map((item) =>
      item.id === singleSelectedToken.id
        ? { ...item, [key]: key === "pinyin" || key === "romanization" ? value.normalize("NFC") : value }
        : item,
    );
    const nextSource = reconstructSourceText(tokens);
    commitDocument({ ...analysis, sourceText: nextSource, tokens }, undefined, language, settings, {
      historyCoalescingKey: `token:${singleSelectedToken.id}:${key}`,
    });
  };

  const addSelectedTokenNote = (text: string, requestedPosition: number) => {
    if (!singleSelectedToken || omniDocument) return;
    const normalizedText = text.trim();
    if (!normalizedText) return;
    const noteId = nextAnalysisNoteId(analysis.notes);
    const notes = insertAnalysisNote(analysis.notes, {
      id: noteId,
      tokenId: singleSelectedToken.id,
      text: normalizedText,
    }, requestedPosition);
    commitDocument({ ...analysis, notes });
    setToast(`Added scholarly note ${notes.findIndex((note) => note.id === noteId) + 1}`);
  };

  const updateSelectedTokenNote = (noteId: string, text: string) => {
    if (omniDocument) return;
    const normalizedText = text.trim();
    if (!normalizedText) return;
    const notes = analysis.notes.map((note) => note.id === noteId
      ? { ...note, text: normalizedText }
      : note);
    commitDocument({ ...analysis, notes }, undefined, language, settings, {
      historyCoalescingKey: `note:${noteId}:text`,
    });
  };

  const moveSelectedTokenNote = (noteId: string, requestedPosition: number) => {
    if (omniDocument) return;
    const notes = moveAnalysisNote(analysis.notes, noteId, requestedPosition);
    commitDocument({ ...analysis, notes });
  };

  const removeSelectedTokenNote = (noteId: string) => {
    if (omniDocument) return;
    const notes = deleteAnalysisNote(analysis.notes, noteId);
    commitDocument({ ...analysis, notes });
    setToast("Scholarly note deleted; following note numbers were updated");
  };

  const performLanguageChange = (nextLanguage: TextLanguage) => {
    const activeLanguage = activeLanguageRef.current;
    if (nextLanguage === activeLanguage) return;
    // Native File/Edit menu commands are routed by the main process's active
    // workspace. Announce navigation before painting the next workspace so an
    // immediate Command-S/Command-Z cannot target the page that was just left.
    void getDesktopDocumentsBridge()?.setActiveWorkspace(nextLanguage).catch(() => {
      // The regular state-sync effect will retry if the desktop window remains.
    });
    if (activeLanguage === language) {
      languageDocuments.current[activeLanguage] = currentSnapshot();
    }
    const saved = languageDocuments.current[nextLanguage];
    if (!saved && isStoaLanguageId(nextLanguage)) {
      const imported = createOfficialSampleState(nextLanguage);
      const sampleSnapshot = snapshotFromImportedState(imported);
      if (getDesktopDocumentsBridge()) {
        desktopSavedRevisions.current[nextLanguage] = revisionForSnapshot(sampleSnapshot);
      }
      applySnapshot(sampleSnapshot, true);
      setDictionaryPopover(null);
      setDictionaryTrigger(null);
      setToast(`Switched to the ${getWorkspaceLanguageConfig(nextLanguage).englishLabel} workspace`);
      return;
    }
    if (!saved && isOmniLanguageId(nextLanguage)) {
      const imported = createOmniSampleState();
      const sampleSnapshot = snapshotFromImportedState(imported);
      if (getDesktopDocumentsBridge()) {
        desktopSavedRevisions.current[nextLanguage] = revisionForSnapshot(sampleSnapshot);
      }
      applySnapshot(sampleSnapshot, true);
      setDictionaryPopover(null);
      setDictionaryTrigger(null);
      setToast(`Switched to the ${getWorkspaceLanguageConfig(nextLanguage).englishLabel} workspace`);
      return;
    }
    const nextAnalysis = saved?.analysis ?? getLanguageSample(nextLanguage);
    let nextSettings = saved?.settings ?? settingsForNewDocument(
      nextLanguage,
      settings,
      userTokenStyleDefaults,
    );
    if (isOmniLanguageId(nextLanguage)) {
      const omni = createOmniDocumentConfig({
        ...nextSettings.omni,
        languageDetection: nextAnalysis.languageDetection ?? nextSettings.omni?.languageDetection,
        analysisProfile: nextAnalysis.analysisProfile ?? nextSettings.omni?.analysisProfile,
        morphologyStandard: nextAnalysis.morphologyStandard ?? nextSettings.omni?.morphologyStandard,
      }, nextAnalysis.sourceText);
      nextSettings = {
        ...nextSettings,
        omni,
        hideIndeclinableDetails: omni.analysisProfile === "rich-inflectional"
          ? nextSettings.hideIndeclinableDetails
          : false,
      };
    }
    const nextSelection = saved?.selection ?? createTokenSelection(
      nextAnalysis.tokens.map((token) => token.id),
      nextAnalysis.tokens[0]?.id ? [nextAnalysis.tokens[0].id] : [],
      nextAnalysis.tokens[0]?.id ?? null,
      nextAnalysis.tokens[0]?.id ?? null,
    );
    applySnapshot(createDocumentSnapshot(
      nextAnalysis,
      nextSelection,
      nextLanguage,
      nextSettings,
      saved?.jsonWorkspace,
      saved?.projectBase,
    ), true);
    setDictionaryPopover(null);
    setDictionaryTrigger(null);
    setToast(`Switched to the ${getWorkspaceLanguageConfig(nextLanguage).englishLabel} workspace`);
  };

  const changeLanguage = (nextLanguage: TextLanguage) => {
    if (nextLanguage === activeLanguageRef.current) return;
    if (
      isOmniLanguageId(nextLanguage)
      && !isOmniLanguageId(activeLanguageRef.current)
      && !omniWarningDismissed
    ) {
      setSuppressOmniWarning(false);
      setOmniWarningPending({ kind: "language" });
      return;
    }
    performLanguageChange(nextLanguage);
  };

  const insertTokenAfter = (afterId?: string | null) => {
    const defaults = languageConfig.newTokenDefaults;
    const idPrefix = language.replace(/[^a-z]/g, "").slice(0, 5) || "token";
    const existingIds = new Set(analysis.tokens.map((item) => item.id));
    let idOrdinal = analysis.tokens.length + 1;
    while (existingIds.has(`${idPrefix}-manual-${idOrdinal}`)) idOrdinal += 1;
    const id = `${idPrefix}-manual-${idOrdinal}`;
    const newToken: GreekToken = {
      id,
      surface: defaults.surface,
      punctuationBefore: "",
      punctuationAfter: "",
      lemma: defaults.lemma,
      gloss: defaults.gloss,
      pos: defaults.pos,
      morphology: defaults.morphology,
      ...(language === "classical-chinese"
        ? { pinyin: "" }
        : language === "omni"
          ? { romanization: "" }
          : {}),
      features: {},
      confidence: 1,
      alternatives: [],
      breakAfter: "none",
      separatorAfter: languageConfig.tokenization.previewWordSeparator === "space" ? " " : "",
    };
    const insertionIndex = afterId
      ? Math.max(0, analysis.tokens.findIndex((item) => item.id === afterId) + 1)
      : analysis.tokens.length;
    const tokens = [...analysis.tokens];
    tokens.splice(insertionIndex, 0, newToken);
    const nextSource = reconstructSourceText(tokens);
    commitDocument({
      ...analysis,
      language,
      sourceText: nextSource,
      tokens,
    }, id);
    setToast(`New ${languageConfig.sourceLanguageLabel} token added. Edit it in the left panel.`);
  };

  const syncJsonWorkspaceTokenPatch = (
    tokenIdsToPatch: readonly string[],
    patch: Partial<JsonWorkspaceTokenStylePatch>,
  ) => {
    setJsonWorkspaces((current) => {
      const workspace = current[language];
      if (!workspace) return current;
      const updated = tokenIdsToPatch.reduce(
        (next, tokenId) => updateJsonWorkspaceTokenStyles(next, tokenId, patch),
        workspace,
      );
      return { ...current, [language]: updated };
    });
  };

  const updateBreakAfter = (value: BreakAfter) => {
    if (!selectedTokens.length) return;
    const tokens = updateSelectedItems(analysis.tokens, selection.selectedIds, (item) =>
      ({ ...item, breakAfter: value }),
    );
    commitDocument({ ...analysis, sourceText: reconstructSourceText(tokens), tokens });
    syncJsonWorkspaceTokenPatch(selection.selectedIds, { breakAfter: value });
  };

  const updateBlankLinesAfter = (value: number) => {
    if (!selectedTokens.length) return;
    const nextValue = Math.min(20, Math.max(1, Math.round(value)));
    const tokens = updateSelectedItems(analysis.tokens, selection.selectedIds, (item) =>
      ({ ...item, blankLinesAfter: nextValue }),
    );
    commitDocument({ ...analysis, sourceText: reconstructSourceText(tokens), tokens }, undefined, language, settings, {
      historyCoalescingKey: `tokens:${selection.selectedIds.join(",")}:blank-lines`,
    });
    syncJsonWorkspaceTokenPatch(selection.selectedIds, { blankLinesAfter: nextValue });
  };

  const updateBlankLineSpacing = (value: number) => {
    if (!selectedTokens.length) return;
    const nextValue = Math.min(200, Math.max(1, value));
    const tokens = updateSelectedItems(analysis.tokens, selection.selectedIds, (item) =>
      ({ ...item, blankLineSpacing: nextValue }),
    );
    commitDocument({ ...analysis, tokens }, undefined, language, settings, {
      historyCoalescingKey: `tokens:${selection.selectedIds.join(",")}:blank-line-spacing`,
    });
    syncJsonWorkspaceTokenPatch(selection.selectedIds, { blankLineSpacing: nextValue });
  };

  const applyTokenEditorDraft = (draftTokens: readonly TokenEditorToken[]) => {
    if (!selectedTokens.length) return;
    const draftsById = new Map(draftTokens.map((token) => [token.id, token]));
    const tokens = analysis.tokens.map((token) => {
      const draft = draftsById.get(token.id);
      return draft ? { ...token, ...draft } as GreekToken : token;
    });
    commitDocument({ ...analysis, tokens });
    setJsonWorkspaces((current) => {
      const workspace = current[language];
      if (!workspace) return current;
      const byId = new Map(tokens.map((token) => [token.id, token]));
      const updated = selection.selectedIds.reduce((next, tokenId) => {
        const token = byId.get(tokenId);
        if (!token) return next;
        return updateJsonWorkspaceTokenStyles(next, tokenId, {
          wordFont: undefined,
          wordSize: undefined,
          wordColor: undefined,
          wordBold: undefined,
          wordItalic: undefined,
          wordUnderline: undefined,
          lemmaColor: undefined,
          lemmaUnderline: undefined,
          morphColor: undefined,
          morphUnderline: undefined,
          pronunciationSize: token.pronunciationSize,
          pronunciationColor: token.pronunciationColor,
          styleOverrides: token.styleOverrides,
        });
      }, workspace);
      return { ...current, [language]: updated };
    });
    setTokenEditorOpen(false);
    setToast(`Applied token styles to ${draftTokens.length} selected token${draftTokens.length === 1 ? "" : "s"}`);
  };

  const deleteSelectedToken = () => {
    if (!selectedTokens.length) return;
    const removal = removeSelectedItems(analysis.tokens, selection);
    const tokens = removal.items;
    const nextSource = reconstructSourceText(tokens);
    const removedTokenIds = new Set(removal.removedIds);
    const notes = analysis.notes.filter((note) => !note.tokenId || !removedTokenIds.has(note.tokenId));
    commitDocument({ ...analysis, sourceText: nextSource, tokens, notes }, removal.selection);
    setJsonWorkspaces((current) => {
      const workspace = current[language];
      return workspace
        ? { ...current, [language]: removeJsonWorkspaceTokens(workspace, removal.removedIds) }
        : current;
    });
    setToast(`Deleted ${selectedTokens.length} selected token${selectedTokens.length === 1 ? "" : "s"}. Use Undo to restore them.`);
  };

  const focusPreviewToken = (tokenId: string | null) => {
    if (!tokenId) return;
    window.requestAnimationFrame(() => {
      const tokenButton = Array.from(
        document.querySelectorAll<HTMLElement>("[data-stoa-token-id]"),
      ).find((element) => element.dataset.stoaTokenId === tokenId);
      tokenButton?.focus();
    });
  };

  const selectTokenFromPointer = (
    tokenId: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    const macLikePlatform = /Mac|iPhone|iPad|iPod/i.test(window.navigator.platform);
    if (macLikePlatform && event.ctrlKey && !event.metaKey) return;
    setSelection((current) => applyPointerSelection(current, tokenIds, tokenId, {
      toggle: event.metaKey || (event.ctrlKey && !macLikePlatform),
      range: event.shiftKey,
    }));
  };

  const selectTokenFromKeyboard = (
    tokenId: string,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if ((event.metaKey || event.ctrlKey) && (event.key === " " || event.key === "Spacebar")) {
      event.preventDefault();
      setSelection((current) => toggleFocusedToken(
        { ...current, focusId: tokenId },
        tokenIds,
      ));
      return;
    }

    let direction: TokenFocusDirection | null = null;
    if (omniVertical) {
      if (event.key === "ArrowUp") direction = "previous";
      else if (event.key === "ArrowDown") direction = "next";
    } else if (omniDocument?.direction === "rtl") {
      if (event.key === "ArrowRight" || event.key === "ArrowUp") direction = "previous";
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown") direction = "next";
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") direction = "previous";
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") direction = "next";
    else if (event.key === "Home") direction = "first";
    else if (event.key === "End") direction = "last";
    if (!direction) return;

    event.preventDefault();
    const currentIndex = tokenIds.indexOf(tokenId);
    const nextFocusId = direction === "first"
      ? tokenIds[0] ?? null
      : direction === "last"
        ? tokenIds.at(-1) ?? null
        : direction === "previous"
          ? tokenIds[Math.max(0, currentIndex - 1)] ?? null
          : tokenIds[Math.min(tokenIds.length - 1, currentIndex + 1)] ?? null;
    setSelection((current) => {
      const next = moveTokenSelectionFocus(
        { ...current, focusId: tokenId },
        tokenIds,
        direction,
        { extend: event.shiftKey },
      );
      return next;
    });
    focusPreviewToken(nextFocusId);
  };

  const clearSelectionFromPaper = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-stoa-token-id], button, a, input, textarea, select, [role='dialog']")) return;
    setSelection(clearTokenSelection());
  };

  const copyPrompt = async () => {
    await copyToClipboard(prompt);
    setToast("AI analysis prompt copied");
  };

  const openGuidedManualSession = (restart = false) => {
    if (!isStoaLanguageId(language)) {
      setToast("OMNI uses one concise AI request and Import Analysis so the model can apply language-appropriate tokenization.");
      return;
    }
    if (!sourceText.trim()) {
      setToast(`Paste ${languageConfig.sourceLanguageLabel} text first`);
      return;
    }
    try {
      if (
        restart
        && manualSession
        && (
          manualSession.chunks.some((chunk) => chunk.acceptedTokens.length > 0)
          || Object.values(manualResponseDrafts).some((draft) => draft.trim())
        )
        && !window.confirm("Start a new guided session and discard the currently saved chunk progress and response drafts?")
      ) return;
      const savedSession = !restart ? manualSession : null;
      const nextSession = savedSession
        ? savedSession
        : createManualAnalysisSession({
            text: sourceText,
            language,
            annotationTarget,
            chunkMinTokens: 50,
            chunkMaxTokens: 80,
            initialActiveChunks: 2,
          });
      setManualSession(nextSession);
      if (!savedSession) setManualResponseDrafts({});
      setManualSessionNotice({
        tone: "info",
        text: savedSession
          ? manualSessionMatchesSource
            ? "Resumed the locally saved session. Continue with the active work slots."
            : "Opened a saved session from an older source snapshot. Restore that source or start a new session before continuing."
          : `Created ${nextSession.chunks.length} sentence-aware chunk${nextSession.chunks.length === 1 ? "" : "s"} from ${nextSession.sourceTokens.length} locked source tokens.`,
      });
      setManualSessionOpen(true);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to create the guided analysis session");
    }
  };

  const restoreManualSessionSource = () => {
    if (!manualSession) return;
    if (!window.confirm("Replace the current source text and language with the source snapshot saved in this guided session?")) return;
    const targetLanguage = manualSession.language;
    const targetSnapshot = snapshotForWorkspace(targetLanguage);
    const restoredSnapshot = createDocumentSnapshot(
      { ...targetSnapshot.analysis, sourceText: manualSession.sourceText },
      targetSnapshot.selection,
      targetLanguage,
      targetSnapshot.settings,
      targetSnapshot.jsonWorkspace,
      targetSnapshot.projectBase,
    );
    if (targetLanguage === language) {
      commitDocument(
        restoredSnapshot.analysis,
        restoredSnapshot.selection,
        targetLanguage,
        restoredSnapshot.settings,
      );
    } else {
      languageDocuments.current[language] = currentSnapshot();
      recordWorkspaceEdit(targetLanguage, targetSnapshot);
      historyCoalescingRef.current = null;
      void getDesktopDocumentsBridge()?.setActiveWorkspace(targetLanguage).catch(() => {
        // The normal active-workspace effect retries while desktop is open.
      });
      applySnapshot(restoredSnapshot, true);
    }
    setManualSessionNotice({
      tone: "success",
      text: "Restored the saved source snapshot. The existing chunk IDs and validated results are current again.",
    });
  };

  const updateManualResponseDraft = (chunkId: string, value: string) => {
    setManualResponseDrafts((current) => ({ ...current, [chunkId]: value }));
  };

  const updateRawSourceText = (value: string) => {
    if (value === analysis.sourceText) return;
    commitDocument(
      { ...analysis, sourceText: value },
      selection,
      language,
      settings,
      { historyCoalescingKey: "source:text" },
    );
  };

  const copyManualChunkPrompt = async (chunkId: string) => {
    if (!manualSession) return;
    if (!manualSessionMatchesSource) {
      setManualSessionNotice({ tone: "error", text: "The source changed. Start a new session before copying another prompt." });
      return;
    }
    try {
      const chunk = manualSession.chunks.find((item) => item.id === chunkId);
      const chunkPrompt = getManualChunkPrompt(manualSession, chunkId);
      await copyToClipboard(chunkPrompt.copyText);
      setManualSessionNotice({
        tone: "success",
        text: `Chunk ${(chunk?.index ?? 0) + 1} prompt copied. Paste it into the AI of your choice.`,
      });
    } catch (error) {
      setManualSessionNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to copy this chunk prompt",
      });
    }
  };

  const downloadManualChunkPrompt = (chunkId: string) => {
    if (!manualSession) return;
    if (!manualSessionMatchesSource) {
      setManualSessionNotice({ tone: "error", text: "The source changed. Start a new session before downloading another prompt." });
      return;
    }
    try {
      const chunkPrompt = getManualChunkPrompt(manualSession, chunkId);
      download(
        chunkPrompt.copyText,
        `stoa-${manualSession.language}-chunk-${chunkPrompt.chunkIndex + 1}${chunkPrompt.isRetry ? "-retry" : ""}.txt`,
        "text/plain;charset=utf-8",
      );
    } catch (error) {
      setManualSessionNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to download this chunk prompt",
      });
    }
  };

  const submitManualResponse = (chunkId: string) => {
    if (!manualSession) return;
    if (!manualSessionMatchesSource) {
      setManualSessionNotice({
        tone: "error",
        text: "The source text or language changed after this session began. The response was not accepted.",
      });
      return;
    }
    const rawResponse = manualResponseDrafts[chunkId]?.trim();
    if (!rawResponse) {
      setManualSessionNotice({ tone: "error", text: "Paste the complete AI response into this slot first." });
      return;
    }
    const currentChunk = manualSession.chunks.find((chunk) => chunk.id === chunkId);
    if (!currentChunk) return;
    try {
      const result = submitManualChunkResponse(manualSession, chunkId, rawResponse);
      const likelyOtherChunk = result.diagnostics.unknownTokenIds.length
        && result.diagnostics.missingTokenIds.length === currentChunk.targetTokenIds.length
        ? manualSession.chunks.find((candidate) =>
            candidate.id !== chunkId
            && result.diagnostics.unknownTokenIds.every((id) =>
              candidate.tokens.some((token) => token.id === id),
            ))
        : undefined;
      if (likelyOtherChunk) {
        setManualSessionNotice({
          tone: "error",
          text: `This response belongs to Chunk ${likelyOtherChunk.index + 1}, not Chunk ${currentChunk.index + 1}. Nothing was changed; paste it into the matching slot.`,
        });
        return;
      }

      const nextSession = result.ok
        ? result.session
        : activateManualChunk(result.session, chunkId);
      setManualSession(nextSession);
      if (result.ok) {
        setManualResponseDrafts((current) => {
          const next = { ...current };
          delete next[chunkId];
          return next;
        });
      }
      if (result.ok) {
        const warnings = [
          result.diagnostics.repairedJson ? "safe JSON repair applied" : "",
          result.diagnostics.outOfOrderTokenIds.length ? "token order corrected by ID" : "",
          result.diagnostics.unknownTokenIds.length ? "unrequested IDs ignored" : "",
        ].filter(Boolean);
        setManualSessionNotice({
          tone: "success",
          text: `Chunk ${currentChunk.index + 1} validated${warnings.length ? ` · ${warnings.join(" · ")}` : ""}.`,
        });
      } else {
        setManualSessionNotice({
          tone: "error",
          text: result.error?.message || `Chunk ${currentChunk.index + 1} needs a targeted retry.`,
        });
      }
    } catch (error) {
      setManualSessionNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to validate this chunk response",
      });
    }
  };

  const openNextManualChunks = () => {
    if (!manualSession) return;
    try {
      const nextSession = activateAvailableManualChunks(manualSession);
      const opened = nextSession.chunks.filter((chunk) =>
        chunk.status === "active"
        && !manualSession.chunks.some((previous) => previous.id === chunk.id && previous.status === "active"),
      );
      setManualSession(nextSession);
      setManualSessionNotice({
        tone: "info",
        text: opened.length
          ? `Opened ${opened.map((chunk) => `Chunk ${chunk.index + 1}`).join(" and ")}. No more than two work slots can be active.`
          : "Both manual work slots are already occupied, or every chunk is complete.",
      });
    } catch (error) {
      setManualSessionNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to open the next chunk",
      });
    }
  };

  const buildPreviewFromManualSession = () => {
    if (!manualSession || !manualMerge) return;
    if (manualSession.sourceText !== sourceText || manualSession.language !== language) {
      setManualSessionNotice({
        tone: "error",
        text: "The source text or language changed after this session began. Start a new session so older results cannot replace newer work.",
      });
      return;
    }
    if (!manualMerge.complete) {
      setManualSessionNotice({
        tone: "error",
        text: `${manualMerge.unresolvedTokenIds.length} source token${manualMerge.unresolvedTokenIds.length === 1 ? " is" : "s are"} still unresolved. Complete the active chunk slots first.`,
      });
      return;
    }
    try {
      const next = normalizeImportedAnalysis(manualMerge.analysis, manualSession.language);
      commitDocument(next, next.tokens[0]?.id ?? null, next.language);
      detachProjectBase(next.language);
      setManualSessionOpen(false);
      setManualSession(null);
      setManualResponseDrafts({});
      setToast(`Guided analysis merged safely · ${next.tokens.length} tokens · ${manualSession.chunks.length} chunks`);
    } catch (error) {
      setManualSessionNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to build the STOA preview",
      });
    }
  };

  const applyAutoTypesetting = async () => {
    if (omniVertical) {
      setToast("Auto Typeset is unavailable for vertical OMNI documents because the current paginator measures horizontal lines. Your project data remains unchanged.");
      return;
    }
    if (!analysis.tokens.length) {
      setToast("Import or add a token first");
      return;
    }
    if (!documentLayoutReady) {
      setToast(missingDocumentFonts.length
        ? `Re-import the missing font file${missingDocumentFonts.length === 1 ? "" : "s"}: ${missingDocumentFonts.map((font) => font.filename).join(", ")}`
        : "Waiting for document fonts and final pagination…");
      return;
    }
    setToast("Measuring fonts and page density…");
    await document.fonts.ready;
    const result = createAutoLayout(analysis.tokens, settings, true, analysis.language);
    commitDocument(analysis, selection, language, result.settings);
    setToast(
      `Auto-typeset: ${result.settings.greekSize}pt · ${result.diagnostics.pageCount} pages · ${result.diagnostics.lineCount} lines`,
    );
  };

  const copyLayoutPrompt = async () => {
    if (omniVertical) {
      setToast("AI Layout Plan is unavailable for vertical OMNI documents until vertical pagination is supported.");
      return;
    }
    await copyToClipboard(layoutPrompt);
    setToast("AI layout prompt copied");
  };

  const importLayoutPlan = () => {
    if (omniVertical) {
      setToast("A horizontal layout plan cannot be applied to a vertical OMNI document.");
      return;
    }
    try {
      const nextSettings = normalizeLayoutPlan(JSON.parse(layoutPlanValue), settings);
      const diagnostics = getLayoutDiagnostics(analysis.tokens, nextSettings, fontsReady, analysis.language);
      commitDocument(analysis, selection, language, nextSettings);
      setLayoutPlanValue("");
      setLayoutAiOpen(false);
      setToast(`AI layout plan applied: ${diagnostics.pageCount} pages · ${diagnostics.lineCount} lines`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to import the AI layout plan");
    }
  };

  const openJsonImport = () => {
    setJsonWorkspaces((current) => {
      if (current[language]) return current;
      const sample = getLanguageSample(language);
      const untouchedSample = analysis.sourceText === sample.sourceText
        && analysis.tokens.length === sample.tokens.length
        && analysis.tokens.every((item, index) => item.id === sample.tokens[index]?.id);
      const workspace = untouchedSample
        ? resetJsonWorkspace(language).workspace
        : createJsonWorkspace(analysis);
      return { ...current, [language]: workspace };
    });
    setImportOpen(true);
  };

  const updateJsonDraft = (value: string) => {
    setAnalysisImportFeedback(null);
    setJsonWorkspaces((current) => {
      const workspace = current[language] ?? createJsonWorkspace(analysis);
      return { ...current, [language]: updateJsonWorkspaceDraft(workspace, value) };
    });
  };

  const applyImportedAnalysisBatch = (
    next: Analysis,
    workspace: JsonWorkspace,
    message: string,
  ) => {
    setJsonWorkspaces((current) => ({ ...current, [next.language]: workspace }));
    const nextSettings = isOmniLanguageId(next.language)
      ? (() => {
          const base = isOmniLanguageId(language)
            ? settings
            : settingsForLanguage(next.language, settings);
          const omni = createOmniDocumentConfig({
            ...base.omni,
            languageDetection: next.languageDetection ?? base.omni?.languageDetection,
            analysisProfile: next.analysisProfile ?? base.omni?.analysisProfile,
            morphologyStandard: next.morphologyStandard ?? base.omni?.morphologyStandard,
          }, next.sourceText);
          return {
            ...base,
            omni,
            hideIndeclinableDetails: omni.analysisProfile === "rich-inflectional"
              ? base.hideIndeclinableDetails
              : false,
          };
        })()
      : next.language === language
        ? settings
        : settingsForLanguage(next.language, settings);
    commitDocument(next, next.tokens[0]?.id ?? null, next.language, nextSettings);
    setToast(message);
  };

  const loadAnalysisJsonFile = async (file?: File) => {
    if (!file) return;
    setAnalysisImportFilename("");
    setAnalysisImportFeedback(null);
    if (file.size > 25 * 1024 * 1024) {
      setToast("Analysis JSON files must be smaller than 25 MB");
      return;
    }
    try {
      const rawText = await file.text();
      if (!rawText.trim()) throw new Error("The selected analysis file is empty.");
      updateJsonDraft(rawText);
      setAnalysisImportFilename(file.name);
      setToast(`Loaded ${file.name} into the JSON draft · load it to update the preview`);
    } catch (error) {
      setToast(error instanceof Error ? `Unable to read analysis JSON: ${error.message}` : "Unable to read analysis JSON file");
    }
  };

  const importJson = () => {
    try {
      const workspace = jsonWorkspaces[language] ?? createJsonWorkspace(analysis);
      if (new TextEncoder().encode(workspace.draftText).byteLength > 25 * 1024 * 1024) {
        throw new Error("Analysis JSON must be smaller than 25 MB.");
      }
      const parsed = parseAiJsonResponse(workspace.draftText);
      if (isOmniLanguageId(language)) {
        const result = loadPermissiveOmniAnalysis(parsed.value);
        const next = result.analysis as Analysis;
        const summary = result.summary;
        const sourceReplaced = Boolean(sourceText.trim()) && sourceText !== next.sourceText;
        const retainedWorkspace = updateJsonWorkspaceDraft(createJsonWorkspace(next), workspace.draftText);
        const warnings = [
          sourceReplaced ? "existing source replaced" : "",
          summary.reconstructedSourceText ? "sourceText reconstructed from tokens" : "",
          summary.ignoredDeclaredLanguage ? `declared ${summary.ignoredDeclaredLanguage} language ignored` : "",
          summary.generatedIdCount ? `${summary.generatedIdCount} safe ID${summary.generatedIdCount === 1 ? "" : "s"} generated` : "",
          summary.duplicateIdCount ? `${summary.duplicateIdCount} duplicate ID${summary.duplicateIdCount === 1 ? "" : "s"} repaired` : "",
          summary.skippedEntryCount ? `${summary.skippedEntryCount} unusable entr${summary.skippedEntryCount === 1 ? "y" : "ies"} skipped` : "",
          summary.invalidFields.length ? `${summary.invalidFields.length} optional field warning${summary.invalidFields.length === 1 ? "" : "s"}` : "",
          parsed.repaired ? "safe JSON repair applied" : "",
        ].filter(Boolean);
        const message = `Loaded ${summary.importedTokenCount} OMNI token${summary.importedTokenCount === 1 ? "" : "s"}${warnings.length ? ` · ${warnings.join(" · ")}` : ""}.`;
        setAnalysisImportFeedback({
          tone: warnings.length ? "partial" : "success",
          text: sourceReplaced
            ? `Loaded ${summary.importedTokenCount} tokens and replaced the previous OMNI source. Undo restores it.`
            : `Loaded ${summary.importedTokenCount} tokens into the preview.`,
          permissiveSummary: summary,
        });
        applyImportedAnalysisBatch(next, retainedWorkspace, message);
        return;
      }
      const result = applyPermissiveJsonWorkspaceBatch(workspace, {
        value: parsed.value,
        rawText: workspace.draftText,
      });
      const next = result.analysis as Analysis;
      const summary = result.importSummary;
      const warnings = [
        summary.reconstructedSourceText ? "sourceText reconstructed from tokens" : "",
        summary.ignoredDeclaredLanguage ? `declared ${summary.ignoredDeclaredLanguage} language ignored` : "",
        summary.generatedIdCount ? `${summary.generatedIdCount} safe ID${summary.generatedIdCount === 1 ? "" : "s"} generated` : "",
        summary.duplicateIdCount ? `${summary.duplicateIdCount} duplicate ID${summary.duplicateIdCount === 1 ? "" : "s"} repaired` : "",
        summary.skippedEntryCount ? `${summary.skippedEntryCount} unusable entr${summary.skippedEntryCount === 1 ? "y" : "ies"} skipped` : "",
        summary.invalidFields.length ? `${summary.invalidFields.length} optional field warning${summary.invalidFields.length === 1 ? "" : "s"}` : "",
        parsed.repaired ? "safe JSON repair applied" : "",
      ].filter(Boolean);
      const action = result.mode === "replace" ? "Updated" : "Loaded";
      const message = `${action} ${summary.importedTokenCount} usable token${summary.importedTokenCount === 1 ? "" : "s"} · preview now contains ${next.tokens.length}${warnings.length ? ` · ${warnings.join(" · ")}` : ""}.`;
      setAnalysisImportFeedback({
        tone: warnings.length ? "partial" : "success",
        text: `${action} ${summary.importedTokenCount} usable token${summary.importedTokenCount === 1 ? "" : "s"} ${result.mode === "replace" ? "in the selected retained batch" : "as a retained batch"}. Undo restores the previous preview.`,
        permissiveSummary: summary,
      });
      applyImportedAnalysisBatch(next, result.workspace, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import JSON";
      setAnalysisImportFeedback({ tone: "error", text: message });
      setToast(message);
    }
  };

  const startAdditionalJsonBatch = () => {
    setAnalysisImportFilename("");
    setAnalysisImportFeedback(null);
    setJsonWorkspaces((current) => {
      const workspace = current[language] ?? createJsonWorkspace(analysis);
      return { ...current, [language]: beginNewJsonWorkspaceBatch(workspace) };
    });
  };

  const editJsonBatch = (batchId: string) => {
    setAnalysisImportFilename("");
    setAnalysisImportFeedback(null);
    setJsonWorkspaces((current) => {
      const workspace = current[language];
      if (!workspace) return current;
      return { ...current, [language]: selectJsonWorkspaceBatch(workspace, batchId) };
    });
  };

  const deleteJsonBatch = (batchId: string) => {
    const workspace = jsonWorkspaces[language];
    if (!workspace) return;
    const result = removeJsonWorkspaceBatch(workspace, batchId);
    const next = result.analysis.tokens.length
      ? normalizeImportedAnalysis(result.analysis, language)
      : result.analysis as Analysis;
    if (next.tokens.length) {
      applyImportedAnalysisBatch(next, result.workspace, "JSON batch removed · remaining content rebuilt safely");
    } else {
      setJsonWorkspaces((current) => ({ ...current, [language]: result.workspace }));
      commitDocument(next, null, language);
    }
    if (!next.tokens.length) detachProjectBase(language);
    if (!next.tokens.length) setToast("JSON batch removed · remaining content rebuilt safely");
  };

  const deleteAllImportedJson = () => {
    const workspace = jsonWorkspaces[language];
    const hasContent = Boolean(workspace?.batches.length || analysis.tokens.length || sourceText.trim());
    if (hasContent && !window.confirm("Delete every imported JSON batch and open a completely blank document? You can still use Undo to restore the preview.")) return;
    const result = resetJsonWorkspace(language);
    setAnalysisImportFilename("");
    setAnalysisImportFeedback(null);
    setJsonWorkspaces((current) => ({ ...current, [language]: result.workspace }));
    setProjectBases((current) => {
      const next = { ...current };
      delete next[language];
      return next;
    });
    commitDocument(
      result.analysis as Analysis,
      null,
      language,
      settingsForNewDocument(language, settings, userTokenStyleDefaults),
    );
    setToast("All imported JSON removed · blank workspace ready");
  };

  const loadProjectFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setToast("Project files must be smaller than 25 MB");
      return;
    }
    try {
      setProjectImportValue(await file.text());
      setProjectImportFilename(file.name);
      setToast(`Loaded ${file.name}. Validate it to restore the project.`);
    } catch (error) {
      setToast(error instanceof Error ? `Unable to read project: ${error.message}` : "Unable to read project file");
    }
  };

  /** Web and Portable: replacing a clean document moves its saved point to the
   * replacement. Unsaved changes stay flagged, since Undo can bring them back. */
  const moveBrowserSavedPointIfClean = (workspace: TextLanguage) => {
    if (getDesktopDocumentsBridge()) return;
    const dirty = browserSaves.isDirty(
      workspace,
      () => revisionForSnapshot(snapshotForWorkspace(workspace)),
    );
    if (!dirty) browserSaves.forget(workspace);
  };

  const applyImportedProject = (imported: ImportedProjectState) => {
    moveBrowserSavedPointIfClean(imported.language);
    if (
      getDesktopDocumentsBridge()
      && !desktopSavedRevisions.current[imported.language]
    ) {
      const defaultState = isStoaLanguageId(imported.language)
        ? createOfficialSampleState(imported.language)
        : createOmniSampleState();
      desktopSavedRevisions.current[imported.language] = revisionForSnapshot(
        snapshotFromImportedState(defaultState),
      );
    }
    commitDocument(
      imported.analysis,
      imported.selectedTokenId,
      imported.language,
      imported.settings,
    );
    setJsonWorkspaces((current) => ({
      ...current,
      [imported.language]: createJsonWorkspace(imported.analysis),
    }));
    setProjectBases((current) => ({
      ...current,
      [imported.language]: imported.projectBase,
    }));
    setProjectImportOpen(false);
    setProjectImportValue("");
    setProjectImportFilename("");
    const unavailable = missingUserFontReferences(imported.settings.fontReferences, userFonts);
    setToast(unavailable.length
      ? `Project restored · re-import ${unavailable.length} missing device-local font${unavailable.length === 1 ? "" : "s"}`
      : `STOA project restored · ${imported.analysis.tokens.length} tokens · all layout settings applied`);
  };

  const importProject = () => {
    try {
      const imported = normalizeImportedProject(
        JSON.parse(projectImportValue),
        language,
        userTokenStyleDefaults,
      );
      if (
        isOmniLanguageId(imported.language)
        && !isOmniLanguageId(language)
        && !omniWarningDismissed
      ) {
        setSuppressOmniWarning(false);
        setOmniWarningPending({ kind: "project", imported });
        return;
      }
      applyImportedProject(imported);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to import STOA project");
    }
  };

  const cancelOmniTransition = () => {
    setOmniWarningPending(null);
    setSuppressOmniWarning(false);
  };

  const continueOmniTransition = () => {
    const pending = omniWarningPending;
    if (!pending) return;
    if (suppressOmniWarning) {
      const nextPreferences = setOmniExperimentalWarningSuppressed(
        createDefaultOmniPreferences(),
        true,
      );
      const result = writeOmniPreferences(window.localStorage, nextPreferences);
      if (result.ok) {
        setOmniWarningDismissed(true);
      } else {
        setToast("The warning preference could not be saved on this device; OMNI will ask again next time");
      }
    }
    setOmniWarningPending(null);
    setSuppressOmniWarning(false);
    if (pending.kind === "language") {
      performLanguageChange(STOA_OMNI_LANGUAGE_ID);
      return;
    }
    if (pending.kind === "project") {
      applyImportedProject(pending.imported);
    }
  };

  const restoreOmniWarning = () => {
    const result = resetOmniPreferences(window.localStorage);
    if (result.ok) {
      setOmniWarningDismissed(false);
      setToast("OMNI experimental warnings restored");
    } else {
      setToast("This browser does not allow the warning preference to be changed");
    }
  };

  const exportProject = () => {
    try {
      assertCurrentExportSupported("project");
      const project = createProjectFile(
        language,
        analysis.sourceText,
        analysis,
        currentProjectSettings,
        selectedId,
        projectBases[language],
      );
      const timestamp = project.project.exportedAt
        .replace(/[-:]/g, "")
        .replace("T", "-")
        .slice(0, 15);
      download(
        stringifyStoaProject(project),
        `stoa-${language}-${timestamp}.stoa.json`,
        "application/json;charset=utf-8",
      );
      if (!getDesktopDocumentsBridge()) {
        browserSaves.markSaved(language, revisionForSnapshot(currentSnapshot()));
      }
      setToast(projectFontReferences.length
        ? "Project exported with device-local font references; licensed font files are not embedded"
        : "STOA project exported with tokens, typography, colors, paper, breaks, and per-word styles");
    } catch (error) {
      setToast(`Project export unavailable: ${formatExportFailure(error)}`);
    }
  };

  const resetSample = () => {
    moveBrowserSavedPointIfClean(language);
    setJsonWorkspaces((current) => {
      const next = { ...current };
      delete next[language];
      return next;
    });
    if (isStoaLanguageId(language)) {
      const sample = createOfficialSampleState(language);
      setProjectBases((current) => ({
        ...current,
        [language]: sample.projectBase,
      }));
      commitDocument(
        sample.analysis,
        sample.selectedTokenId,
        language,
        sample.settings,
      );
      setToast("Official sample restored");
      return;
    }
    const sample = createOmniSampleState();
    setProjectBases((current) => ({
      ...current,
      omni: sample.projectBase,
    }));
    commitDocument(
      sample.analysis,
      sample.selectedTokenId ?? sample.analysis.tokens[0]?.id ?? null,
      language,
      sample.settings,
    );
    setToast("Official OMNI sample restored");
  };

  const newBlankDocument = () => {
    try {
      const blank = createDeveloperWebBlankProject(language);
      applyImportedProject(importedStateFromParsedProject(blank, language));
      setAnalysisImportFilename("");
      setAnalysisImportFeedback(null);
      setDictionaryPopover(null);
      setDictionaryTrigger(null);
      setToast("New blank document · Undo restores the previous document");
    } catch (error) {
      setToast(error instanceof Error ? `Unable to create blank document: ${error.message}` : "Unable to create blank document");
    }
  };

  const assertCurrentExportSupported = (format: OmniExportFormat) => {
    if (!omniDocument) return;
    if (!omniExportPreflight) throw new Error("OMNI export preflight is not ready.");
    assertOmniExportSupported(format, omniExportPreflight);
  };

  const assertLayoutSnapshotCurrent = (expectedLayoutKey: string) => {
    if (
      latestLayoutSourceKey.current !== expectedLayoutKey
      || previewPagination.plan.sourceKey !== expectedLayoutKey
    ) {
      const error = new Error("The document changed while export was preparing. Review the updated Preview and export again.");
      error.name = "StaleLayoutExportError";
      throw error;
    }
  };

  const generateCurrentVectorPdf = async (expectedLayoutKey = layoutSourceKey) => {
    assertCurrentExportSupported("pdf");
    assertExportRuntimeAvailable(window.location.protocol);
    if (!fontsReady) {
      throw new Error("Document fonts are still loading. Wait for the Preview to finish repaginating, then export again.");
    }
    if (missingDocumentFonts.length) {
      throw new Error(`Re-import the missing font file${missingDocumentFonts.length === 1 ? "" : "s"}: ${missingDocumentFonts.map((font) => font.filename).join(", ")}`);
    }
    assertLayoutSnapshotCurrent(expectedLayoutKey);
    await document.fonts.ready;
    const usedFamilies = usedDocumentFontFamilies(currentProjectSettings, publicationAnalysis.tokens);
    const [notoSansScFontBase64, unicodePdfFonts, classicalChineseFonts] = await Promise.all([
      language === "classical-chinese" ? loadNotoSansScFontBase64() : Promise.resolve(undefined),
      loadUnicodePdfFontsBase64(),
      language === "classical-chinese"
        ? loadClassicalChinesePdfFonts(usedFamilies)
        : Promise.resolve([]),
    ]);
    assertLayoutSnapshotCurrent(expectedLayoutKey);
    return createVectorPdf({
      language,
      title: `${languageConfig.englishLabel} Interlinear Reading`,
      naturalTranslation: analysis.naturalTranslation,
      tokens: publicationAnalysis.tokens,
      notes: publicationAnalysis.notes,
      settings: currentProjectSettings,
      notoSansScFontBase64,
      unicodeSerifFontBase64: unicodePdfFonts.serif,
      unicodeTimesSerifFontBase64: unicodePdfFonts.timesSerif,
      unicodeSansFontBase64: unicodePdfFonts.sans,
      classicalChineseFonts,
      importedFonts: projectFontReferences.map((reference) => {
        const record = userFonts.find((font) => font.id === reference.id);
        if (!record) throw new Error(`Re-import the missing font file: ${reference.filename}`);
        return {
          ...userFontReference(record),
          dataBase64: arrayBufferToBase64(record.bytes),
        };
      }),
      literalTranslation: analysis.literalTranslation,
      translationLabel: `IDIOMATIC ${annotationTargetLabel.toUpperCase()} TRANSLATION`,
      literalTranslationLabel: `LITERAL ${annotationTargetLabel.toUpperCase()} TRANSLATION`,
      paginationPlan: previewPagination.plan,
      layoutSourceKey: expectedLayoutKey,
    });
  };

  const generateCurrentRasterPdf = async (expectedLayoutKey = layoutSourceKey) => {
    assertLayoutSnapshotCurrent(expectedLayoutKey);
    const previewPages = Array.from(
      document.querySelectorAll<HTMLElement>(".paper-preview.export-page"),
    );
    if (
      previewPages.length !== previewPagination.plan.pages.length
      || previewPages.some((page) => page.dataset.paginationKey !== expectedLayoutKey)
    ) {
      const error = new Error("The rendered Preview changed while export was preparing. Export again after pagination settles.");
      error.name = "StaleLayoutExportError";
      throw error;
    }
    const usedFamilies = usedDocumentFontFamilies(
      currentProjectSettings,
      publicationAnalysis.tokens,
    );
    const fontFaces = userFonts
      .filter((font) => usedFamilies.has(font.cssFamily))
      .map((font) => ({
        family: font.cssFamily.replace(/^['"]|['"]$/gu, ""),
        bytes: font.bytes.slice(0),
        style: font.faceStyle === "italic" || font.faceStyle === "bolditalic"
          ? "italic" as const
          : "normal" as const,
        weight: font.faceStyle === "bold" || font.faceStyle === "bolditalic"
          ? "700" as const
          : "400" as const,
      }));
    const result = await createRasterPdfFromPreview({
      pages: previewPages,
      paperWidthMm: currentProjectSettings.paperWidthMm,
      paperHeightMm: currentProjectSettings.paperHeightMm,
      backgroundColor: currentProjectSettings.background,
      title: `${languageConfig.englishLabel} Interlinear Reading`,
      fontFaces,
      onProgress: ({ pageNumber, pageCount, pixelRatio }) => {
        setToast(`Capturing preview page ${pageNumber} of ${pageCount} at ${pixelRatio}×…`);
      },
    });
    assertLayoutSnapshotCurrent(expectedLayoutKey);
    return result;
  };

  const generateCurrentPdf = async (expectedLayoutKey = layoutSourceKey) => {
    assertCurrentExportSupported("pdf");
    const pdfRoute = omniExportCapabilities?.pdf;
    if (
      pdfRoute?.supported
      && pdfRoute.pdf?.outputType === "raster"
    ) {
      return generateCurrentRasterPdf(expectedLayoutKey);
    }
    try {
      const vectorPdf = await generateCurrentVectorPdf(expectedLayoutKey);
      assertLayoutSnapshotCurrent(expectedLayoutKey);
      const expectedTokenPages = previewPagination.plan.pages.map((page) =>
        page.tokenRows.flatMap((row) => row.tokenIds));
      if (
        vectorPdf.layoutPlanSource !== "preview"
        || vectorPdf.pageCount !== previewPagination.plan.pages.length
        || JSON.stringify(vectorPdf.pageTokenIds) !== JSON.stringify(expectedTokenPages)
      ) {
        throw new VectorPdfLayoutMismatchError(
          "Vector PDF did not preserve the Preview page plan.",
        );
      }
      return vectorPdf;
    } catch (error) {
      if (error instanceof Error && error.name === "StaleLayoutExportError") throw error;
      if (!omniDocument) throw error;
      setToast("Vector layout verification failed; capturing the exact preview instead…");
      return generateCurrentRasterPdf(expectedLayoutKey);
    }
  };

  const exportPdf = async () => {
    if (!analysis.tokens.length || exportBusyRef.current || !documentLayoutReady) {
      if (exportBusyRef.current) setToast("A document export is already in progress.");
      else if (missingDocumentFonts.length) setToast(`Re-import the missing font file${missingDocumentFonts.length === 1 ? "" : "s"}: ${missingDocumentFonts.map((font) => font.filename).join(", ")}`);
      else if (!fontsReady) setToast("Waiting for document fonts and final pagination…");
      return;
    }
    exportBusyRef.current = true;
    setActiveDocumentExport("pdf");
    setRuntimeAssetWarning(getExportRuntimeWarning(window.location.protocol) ?? "");
    const plannedStatus = omniExportCapabilities?.pdf?.supported
      ? omniExportCapabilities.pdf.pdf?.status
      : undefined;
    setToast(plannedStatus ?? "Generating a searchable vector PDF…");
    try {
      const exportLayoutKey = layoutSourceKey;
      assertLayoutSnapshotCurrent(exportLayoutKey);
      const result = await generateCurrentPdf(exportLayoutKey);
      assertLayoutSnapshotCurrent(exportLayoutKey);
      downloadBlob(result.blob, `${language}-interlinear.pdf`);
      setToast(`${result.kind === "raster" ? OMNI_RASTER_STATUS : OMNI_VECTOR_STATUS} · ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}`);
    } catch (error) {
      const detail = formatExportFailure(error);
      if (isExportAssetFailure(error)) setRuntimeAssetWarning(detail);
      setToast(`PDF export failed: ${detail}`);
    } finally {
      exportBusyRef.current = false;
      setActiveDocumentExport(null);
    }
  };

  const exportPng = async () => {
    if (!analysis.tokens.length || exportBusyRef.current || !documentLayoutReady) {
      if (exportBusyRef.current) setToast("A document export is already in progress.");
      else if (missingDocumentFonts.length) setToast(`Re-import the missing font file${missingDocumentFonts.length === 1 ? "" : "s"}: ${missingDocumentFonts.map((font) => font.filename).join(", ")}`);
      else if (!fontsReady) setToast("Waiting for document fonts and final pagination…");
      return;
    }
    exportBusyRef.current = true;
    setActiveDocumentExport("png");
    setRuntimeAssetWarning(getExportRuntimeWarning(window.location.protocol) ?? "");
    setToast("Building the final PDF for PNG conversion…");
    try {
      const exportLayoutKey = layoutSourceKey;
      assertLayoutSnapshotCurrent(exportLayoutKey);
      assertCurrentExportSupported("png");
      const finalPdf = await generateCurrentPdf(exportLayoutKey);
      assertLayoutSnapshotCurrent(exportLayoutKey);
      const [pdfJs, zipModule] = await Promise.all([
        import("pdfjs-dist/legacy/build/pdf.mjs"),
        import("jszip"),
      ]);
      pdfJs.GlobalWorkerOptions.workerSrc = resolveExportAssetUrl(
        "vendor/pdf.worker.min.mjs",
        document.baseURI,
      );
      const loadingTask = pdfJs.getDocument({ data: finalPdf.bytes.slice() });
      const documentProxy = await loadingTask.promise;
      const pageBlobs: Blob[] = [];
      let exportDpi = 300;
      for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
        assertLayoutSnapshotCurrent(exportLayoutKey);
        setToast(`Rendering PDF page ${pageNumber} of ${documentProxy.numPages} as PNG…`);
        const page = await documentProxy.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetScale = 300 / 72;
        const largestTargetDimension = Math.max(baseViewport.width, baseViewport.height) * targetScale;
        const safeScale = largestTargetDimension > 8192
          ? targetScale * (8192 / largestTargetDimension)
          : targetScale;
        exportDpi = Math.round(safeScale * 72);
        const viewport = page.getViewport({ scale: safeScale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport, background: settings.background }).promise;
        pageBlobs.push(await canvasToPngBlob(canvas));
        page.cleanup();
        canvas.width = 1;
        canvas.height = 1;
      }
      await loadingTask.destroy();
      assertLayoutSnapshotCurrent(exportLayoutKey);
      const basename = `${language}-interlinear`;
      if (pageBlobs.length === 1) {
        downloadBlob(pageBlobs[0], `${basename}.png`);
      } else {
        const zip = new zipModule.default();
        const digits = Math.max(2, String(pageBlobs.length).length);
        pageBlobs.forEach((blob, index) => {
          zip.file(`${basename}-page-${String(index + 1).padStart(digits, "0")}.png`, blob);
        });
        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        assertLayoutSnapshotCurrent(exportLayoutKey);
        downloadBlob(zipBlob, `${basename}-png.zip`);
      }
      setToast(
        pageBlobs.length === 1
          ? `PNG exported from the ${finalPdf.kind} PDF · ${exportDpi} DPI`
          : `${pageBlobs.length} PNG pages exported from the ${finalPdf.kind} PDF as a ZIP · ${exportDpi} DPI`,
      );
    } catch (error) {
      const detail = formatExportFailure(error);
      if (isExportAssetFailure(error)) setRuntimeAssetWarning(detail);
      setToast(`PNG export failed: ${detail}`);
    } finally {
      exportBusyRef.current = false;
      setActiveDocumentExport(null);
    }
  };

  const exportTex = async () => {
    setRuntimeAssetWarning(getExportRuntimeWarning(window.location.protocol) ?? "");
    try {
      assertCurrentExportSupported("latex");
      const usedFamilies = usedDocumentFontFamilies(currentProjectSettings, analysis.tokens);
      const selectedBundledChineseFonts = CLASSICAL_CHINESE_BUILTIN_FONTS.filter((font) =>
        usedFamilies.has(font.cssFamily));
      const latexFallback = CLASSICAL_CHINESE_BUILTIN_FONTS.find((font) =>
        font.id === "bundled:source-han-serif-sc");
      const bundledChineseFonts = selectedBundledChineseFonts.length
        && latexFallback
        && !selectedBundledChineseFonts.includes(latexFallback)
        ? [latexFallback, ...selectedBundledChineseFonts]
        : selectedBundledChineseFonts;
      const includePinyinFont = language === "classical-chinese"
        && currentProjectSettings.showPronunciation
        && analysis.tokens.some((token) => Boolean(token.pinyin?.trim()));
      if (bundledChineseFonts.length || includePinyinFont) {
        const zipModule = await import("jszip");
        const zip = new zipModule.default();
        zip.file(`${language}-interlinear.tex`, latex);
        for (const font of bundledChineseFonts) {
          const urls = CLASSICAL_CHINESE_FONT_URLS[font.id];
          for (const [style, assetPath] of Object.entries(font.faces)) {
            const url = urls?.[style as keyof VectorPdfFontFaces];
            if (!url) throw new Error(`The bundled ${font.familyName} ${style} asset is unavailable.`);
            const bytes = await fetchExportAssetBytes(url, `${font.familyName} ${style} font`, {
              protocol: window.location.protocol,
              baseUri: document.baseURI,
            });
            zip.file(`fonts/${assetPath.split("/").at(-1)}`, bytes);
          }
        }
        if (includePinyinFont) {
          const [fontBytes, licenseBytes] = await Promise.all([
            fetchExportAssetBytes(liberationSansRegularFontUrl, "Liberation Sans Pinyin font", {
              protocol: window.location.protocol,
              baseUri: document.baseURI,
            }),
            fetchExportAssetBytes(liberationSansLicenseUrl, "Liberation Sans font notice", {
              protocol: window.location.protocol,
              baseUri: document.baseURI,
            }),
          ]);
          zip.file("fonts/LiberationSans-Regular.ttf", fontBytes);
          zip.file("licenses/OFL-LiberationSans.txt", licenseBytes);
        }
        const licenseAssets = bundledChineseFonts.length ? [
          [sourceHanSerifLicenseUrl, "licenses/OFL-SourceHanSerif.txt"],
          [fandolLicenseUrl, "licenses/GPL-Fandol-with-font-exception.txt"],
          [fandolReadmeUrl, "licenses/README-Fandol.txt"],
        ] as const : [];
        for (const [url, filename] of licenseAssets) {
          const bytes = await fetchExportAssetBytes(url, `font notice ${filename}`, {
            protocol: window.location.protocol,
            baseUri: document.baseURI,
          });
          zip.file(filename, bytes);
        }
        downloadBlob(
          await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
          `${language}-interlinear-latex.zip`,
        );
        setToast(`LaTeX package exported with ${bundledChineseFonts.length + (includePinyinFont ? 1 : 0)} open-font famil${bundledChineseFonts.length + (includePinyinFont ? 1 : 0) === 1 ? "y" : "ies"}`);
        return;
      }
      download(latex, `${language}-interlinear.tex`, "text/x-tex;charset=utf-8");
      setToast("LaTeX source exported");
    } catch (error) {
      const detail = formatExportFailure(error);
      if (isExportAssetFailure(error)) setRuntimeAssetWarning(detail);
      setToast(`LaTeX export unavailable: ${detail}`);
    }
  };

  const initializeDesktopSamples = (
    requestedWorkspace: TextLanguage = "ancient-greek",
  ): string => {
    const snapshots = Object.fromEntries(
      (["ancient-greek", "latin", "classical-chinese", "omni"] as const).map((workspace) => {
        const imported = isStoaLanguageId(workspace)
          ? createOfficialSampleState(workspace)
          : createOmniSampleState();
        return [workspace, snapshotFromImportedState(imported)];
      }),
    ) as Record<TextLanguage, DocumentSnapshot>;
    languageDocuments.current = snapshots;
    const revisions = Object.fromEntries(
      Object.entries(snapshots).map(([workspace, snapshot]) => [
        workspace,
        revisionForSnapshot(snapshot),
      ]),
    ) as Record<TextLanguage, string>;
    desktopSavedRevisions.current = revisions;
    replaceWorkspaceHistories({});
    setJsonWorkspaces({});
    setProjectBases(Object.fromEntries(
      Object.entries(snapshots)
        .filter((entry): entry is [TextLanguage, DocumentSnapshot & { projectBase: ParsedStoaProject }] =>
          Boolean(entry[1].projectBase))
        .map(([workspace, snapshot]) => [workspace, snapshot.projectBase]),
    ));
    const workspace = snapshots[requestedWorkspace] ? requestedWorkspace : "ancient-greek";
    applySnapshot(snapshots[workspace], true);
    return revisions[workspace];
  };

  const serializeDesktopWorkspace = async (
    { workspace }: StoaDesktopSerializeRequest,
  ): Promise<Record<string, unknown>> => {
    try {
      const snapshot = snapshotForWorkspace(workspace);
      const project = projectFromWorkspaceSnapshot(snapshot);
      return {
        ok: true,
        workspace,
        contents: stringifyStoaProject(project),
        revision: documentRevision(project),
        suggestedName: `stoa-${workspace}.stoa.json`,
      };
    } catch (error) {
      return {
        ok: false,
        workspace,
        error: error instanceof Error ? error.message : "Unable to serialize this STOA document.",
      };
    }
  };

  const handleDesktopDocumentCommand = async (
    command: StoaDesktopDocumentCommand,
  ): Promise<Record<string, unknown>> => {
    const workspace = command.workspace ?? activeLanguageRef.current;
    try {
      if (command.type === "startup-first-launch") {
        return {
          ok: true,
          workspace,
          revision: initializeDesktopSamples(workspace),
        };
      }
      if (command.type === "new-document" || command.type === "close-document") {
        const snapshot = command.type === "new-document" && command.kind === "sample"
          ? snapshotFromImportedState(
              isStoaLanguageId(workspace)
                ? createOfficialSampleState(workspace)
                : createOmniSampleState(),
            )
          : createBlankWorkspaceSnapshot(workspace);
        return {
          ok: true,
          workspace,
          revision: replaceDesktopWorkspace(snapshot, true),
        };
      }
      if (command.type === "open-project") {
        const imported = normalizeImportedProject(
          JSON.parse(command.contents),
          workspace,
          // Native Open must be deterministic across devices. A style-less
          // legacy file migrates against STOA's built-in schema defaults, not
          // the current Mac's optional "use for future documents" preference.
          undefined,
          "desktop",
        );
        const snapshot = snapshotFromImportedState(imported);
        const revision = replaceDesktopWorkspace(snapshot, true);
        setOmniWarningPending(null);
        setToast(`${command.displayName} opened`);
        return { ok: true, workspace: imported.language, revision };
      }
      if (command.type === "undo") {
        undo();
        return { ok: true, workspace };
      }
      if (command.type === "redo") {
        redo();
        return { ok: true, workspace };
      }
      if (command.type === "export-project") {
        exportProject();
        return { ok: true, workspace };
      }
      if (command.type === "show-help") {
        setDesktopHelpOpen(true);
        return { ok: true, workspace };
      }
      return { ok: false, error: "Unsupported desktop document command." };
    } catch (error) {
      return {
        ok: false,
        workspace,
        error: error instanceof Error ? error.message : "The desktop document command failed.",
      };
    }
  };

  useLayoutEffect(() => {
    // Listener registration is intentionally stable for the lifetime of the
    // renderer. Swap only its implementation so IPC always observes the
    // latest React document state without assigning refs during render.
    desktopSerializeHandler.current = serializeDesktopWorkspace;
    desktopCommandHandler.current = handleDesktopDocumentCommand;
    browserHasUnsavedChanges.current = () => browserSaves.hasUnsavedChanges(
      (workspace) => revisionForSnapshot(snapshotForWorkspace(workspace)),
    );
  });

  useEffect(() => {
    if (!localPreferencesHydrated || getDesktopDocumentsBridge()) return;
    browserSaves.observe(language, () => revisionForSnapshot(currentSnapshot()));
  // Runs after every document change so a forgotten saved point is set again
  // once the replacement document is in state. observe() ignores the rest.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, language, localPreferencesHydrated, projectBases, settings, userFonts]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      // Desktop asks in its own close dialog; a prompt here would block quitting.
      if (getDesktopDocumentsBridge()) return;
      if (browserHasUnsavedChanges.current()) confirmLeavingPage(event);
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);

  useEffect(() => {
    if (!localPreferencesHydrated) return;
    const bridge = getDesktopDocumentsBridge();
    if (!bridge) return;
    let active = true;
    const current = currentSnapshot();
    const initialRevision = revisionForSnapshot(current);
    desktopSavedRevisions.current[language] ??= initialRevision;

    const updateFromMain = (state: StoaDesktopDocumentState) => {
      if (!active) return;
      setDesktopDocumentsAvailable(true);
      let savedRevisionChanged = false;
      for (const workspace of Object.keys(state.workspaces) as TextLanguage[]) {
        const savedRevision = state.workspaces[workspace].savedRevision;
        if (
          savedRevision
          && desktopSavedRevisions.current[workspace] !== savedRevision
        ) {
          desktopSavedRevisions.current[workspace] = savedRevision;
          savedRevisionChanged = true;
        }
      }
      // A successful Save establishes a new comparison baseline without
      // changing analysis/settings React state. Force exactly one dirty-state
      // reconciliation so a stale pre-save update cannot leave the native
      // window marked Edited after the saved revision is already current.
      if (savedRevisionChanged) {
        // Save is a document-history boundary. Without this reset, a slider
        // event arriving just after Save could merge into the pre-save burst,
        // leaving no Undo snapshot at the newly saved revision.
        historyCoalescingRef.current = null;
        setDesktopSavedRevisionGeneration((generation) => generation + 1);
      }
      setDesktopDocumentState(state);
    };
    const removeStateListener = bridge.onStateChanged(updateFromMain);
    const removeCommandListener = bridge.onCommand((command) =>
      desktopCommandHandler.current(command));
    const removeSerializeListener = bridge.onSerializeRequest((request) =>
      desktopSerializeHandler.current(request));

    void bridge.updateWorkspaceState({
      workspace: language,
      revision: initialRevision,
      dirty: false,
      displayName: `${getWorkspaceLanguageConfig(language).englishLabel} — Untitled`,
    }).then(() => bridge.rendererReady())
      .then(updateFromMain)
      .catch((error) => {
        if (!active) return;
        setDesktopDocumentsAvailable(false);
        setToast(error instanceof Error
          ? `Desktop document services are unavailable: ${error.message}`
          : "Desktop document services are unavailable");
      });

    return () => {
      active = false;
      removeStateListener();
      removeCommandListener();
      removeSerializeListener();
    };
    // The platform listeners must remain registered exactly once. Their refs
    // are refreshed by the layout effect above with the latest document state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPreferencesHydrated]);

  useEffect(() => {
    const bridge = getDesktopDocumentsBridge();
    if (!desktopDocumentsAvailable || !bridge || !localPreferencesHydrated) return;
    const snapshot = currentSnapshot();
    const revision = revisionForSnapshot(snapshot);
    const savedRevision = desktopSavedRevisions.current[language] ?? revision;
    desktopSavedRevisions.current[language] ??= savedRevision;
    void bridge.updateWorkspaceState({
      workspace: language,
      revision,
      dirty: revision !== savedRevision,
      displayName: `${getWorkspaceLanguageConfig(language).englishLabel} — Untitled`,
    }).catch(() => {
      // A disappearing desktop bridge means the window is already closing.
    });
  // currentSnapshot/revisionForSnapshot intentionally read the latest render;
  // unstable function identities here would echo native state notifications.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    analysis,
    desktopDocumentsAvailable,
    desktopSavedRevisionGeneration,
    language,
    localPreferencesHydrated,
    projectBases,
    settings,
    userFonts,
  ]);

  useEffect(() => {
    const bridge = getDesktopDocumentsBridge();
    if (!desktopDocumentsAvailable || !bridge) return;
    if (desktopDocumentState?.activeWorkspace === language) return;
    void bridge.setActiveWorkspace(language).then(setDesktopDocumentState).catch(() => {
      // Main may be shutting down; renderer state remains intact.
    });
  }, [desktopDocumentState?.activeWorkspace, desktopDocumentsAvailable, language]);

  const saveDesktopDocument = async (saveAs = false) => {
    const bridge = getDesktopDocumentsBridge();
    if (!bridge) return;
    const result = await bridge.saveDocument(language, saveAs);
    if (result.status === "saved") setToast(saveAs ? "STOA project saved with a new name" : "STOA project saved");
  };

  const openDesktopDocument = async () => {
    const bridge = getDesktopDocumentsBridge();
    if (bridge) await bridge.openDocument();
  };

  const languageName = languageConfig.englishLabel;
  const languageAutonym = languageConfig.autonym;
  const activeDesktopDocument = desktopDocumentState?.workspaces[language] ?? null;
  const projectExportCapability = omniExportCapabilities?.project ?? null;
  const pdfExportCapability = omniExportCapabilities?.pdf ?? null;
  const pngExportCapability = omniExportCapabilities?.png ?? null;
  const latexExportCapability = omniExportCapabilities?.latex ?? null;
  const omniUsesManualProfile = Boolean(
    omniDocument?.manualLanguageOverride?.confirmed
    && omniProfileResolution?.selectedLanguageId !== "und",
  );
  const omniStatusLanguageName = omniUsesManualProfile
    ? omniProfileResolution?.profile?.languageName ?? omniProfileResolution?.selectedLanguageId ?? "Manual override"
    : omniProfileResolution?.detection.languageName ?? "Undetermined";
  const omniStatusEvidence = omniUsesManualProfile
    ? "Manual override"
    : `${Math.round((omniProfileResolution?.detection.confidence ?? 0) * 100)}%`;
  const pdfExportReason = pdfExportCapability && !pdfExportCapability.supported
    ? pdfExportCapability.reason.message
    : pdfExportCapability?.supported
      ? pdfExportCapability.pdf?.status ?? "Export PDF"
      : "Export a searchable vector PDF";
  const pngExportReason = pngExportCapability && !pngExportCapability.supported
    ? pngExportCapability.reason.message
    : "Render PNG pages from the final PDF";
  const latexExportReason = latexExportCapability && !latexExportCapability.supported
    ? latexExportCapability.reason.message
    : "Export Unicode LaTeX source";

  return (
    <main className="studio-shell" data-language={language}>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">{languageConfig.brandMark}</div>
          <div>
            <div className="brand-line">
              <span>STOA</span>
              <span className="version-badge">{STOA_VERSION}</span>
            </div>
            <p>{isOmniLanguageId(language) ? "Experimental multilingual workspace" : "Classical Interlinear Studio"}</p>
          </div>
        </div>
        <div className="language-catalog" aria-label="STOA language workspaces">
          <div className="language-family classical-family">
            <span>Classical languages</span>
            <div className="language-switch" role="group" aria-label="Classical languages">
              {LANGUAGE_GROUPS[0].languageIds.map((id) => {
                const config = getLanguageConfig(id);
                return (
                  <button
                    key={id}
                    className={language === id ? "active" : ""}
                    onClick={() => changeLanguage(id)}
                    aria-pressed={language === id}
                  >
                    <b>{config.autonym}</b><span>{config.englishLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="language-family omni-family">
            <span>Experimental</span>
            <div className="language-switch omni-switch" role="group" aria-label="Experimental language workspaces">
              <button
                className={isOmniLanguageId(language) ? "active" : ""}
                onClick={() => changeLanguage(STOA_OMNI_LANGUAGE_ID)}
                aria-pressed={isOmniLanguageId(language)}
                aria-describedby="omni-catalog-description"
              >
                <b>OMNI</b><span>Any language</span>
              </button>
            </div>
            <span id="omni-catalog-description" className="visually-hidden">
              {OMNI_LANGUAGE_PROFILE.status} multilingual workspace with limited export support
            </span>
          </div>
        </div>
        <button
          className="settings-button"
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open STOA settings"
        >⚙ Settings</button>
        <div className="topbar-status">
          <span className="language-chip">{languageAutonym}</span>
          <span className="local-badge">
            <i /> {desktopDocumentsAvailable ? "Local documents" : "Offline studio"}
          </span>
        </div>
      </header>

      {runtimeAssetWarning && (
        <div className="portable-runtime-warning" role="alert">
          <b>STOA export resources are unavailable</b>
          <span>{runtimeAssetWarning}</span>
        </div>
      )}

      <div className="studio-layout">
        <aside className="control-panel">
          <section className="panel-section source-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">01 · SOURCE · {languageAutonym}</span>
                <h2>{languageName} text</h2>
              </div>
              <span className="count-pill">{sourceUnitCount} token{sourceUnitCount === 1 ? "" : "s"}</span>
            </div>
            <textarea
              className={`greek-input script-${languageConfig.sourceScript.toLowerCase()}`}
              value={sourceText}
              onChange={(event) => updateRawSourceText(event.target.value)}
              aria-label={`${languageName} source text`}
              spellCheck={false}
              lang={languageConfig.sourceLocale}
            />
            {language === "classical-chinese" && (
              <div className="classical-chinese-workflow" role="note">
                <div>
                  <b>Annotation & translation language</b>
                  <span>Source characters, punctuation and philological segmentation always remain Classical Chinese.</span>
                </div>
                <div className="annotation-target-switch" role="group" aria-label="Classical Chinese annotation language">
                  <button
                    type="button"
                    className={annotationTarget === "english" ? "active" : ""}
                    aria-pressed={annotationTarget === "english"}
                    onClick={() => updateSetting("annotationTarget", "english")}
                  >English</button>
                  <button
                    type="button"
                    className={annotationTarget === "chinese" ? "active" : ""}
                    aria-pressed={annotationTarget === "chinese"}
                    onClick={() => updateSetting("annotationTarget", "chinese")}
                  >中文</button>
                </div>
                <p>{CLASSICAL_CHINESE_MODEL_RECOMMENDATION}</p>
              </div>
            )}
            {omniDocument && (
              <div className="omni-source-notice">
                <b>Experimental OMNI · {omniDocument.tokenizationOrigin === "model" ? "model-provided tokens" : "user-provided tokens"}</b>
                <span>Generate a concise AI request, then use Import Analysis. STOA will not force Ancient Greek or Latin morphology onto this text.</span>
              </div>
            )}
            {desktopDocumentsAvailable && !isOmniLanguageId(language) && (
              <button
                className="manual-workflow-launch"
                type="button"
                onClick={() => openGuidedManualSession(false)}
                disabled={!sourceText.trim()}
              >
                <span className="manual-workflow-icon">≡</span>
                <span>
                  <b>{manualSessionMatchesSource ? "Resume guided chunk analysis" : manualSession ? "Review saved chunk session" : "Guided chunk analysis"}</b>
                  <small>
                    {manualSessionMatchesSource
                      ? `${manualCompletedChunks}/${manualSession?.chunks.length ?? 0} chunks validated · saved locally`
                      : manualSession
                        ? `${manualCompletedChunks}/${manualSession.chunks.length} chunks saved from an earlier source snapshot`
                        : "Recommended for long text · stable IDs · two manual work slots"}
                  </small>
                </span>
                <i>›</i>
              </button>
            )}
            <div className="manual-legacy-label"><span>JSON-first manual workflow</span></div>
            <div className="action-grid">
              <button className="primary-action" onClick={() => setPromptOpen(true)}>
                <span className="button-glyph">✦</span>
                {isOmniLanguageId(language) ? "Generate OMNI prompt" : "Full AI Prompt"}
              </button>
              <button className="secondary-action" onClick={openJsonImport}>
                <span className="button-glyph">↳</span>
                Import Analysis
              </button>
            </div>
            {jsonWorkspace && (jsonWorkspace.batches.length > 0 || (isOmniLanguageId(language) && jsonWorkspace.draftText.trim())) && (
              <button className="json-workspace-status" type="button" onClick={openJsonImport}>
                <span>{isOmniLanguageId(language)
                  ? `${analysis.tokens.length} imported preview tokens`
                  : `${jsonWorkspace.batches.length} imported JSON batch${jsonWorkspace.batches.length === 1 ? "" : "es"}`}</span>
                <b>{isOmniLanguageId(language) ? "Edit retained analysis →" : "Edit retained JSON →"}</b>
              </button>
            )}
            <div className="provider-strip">
              <span>{languageName}</span>
              <b>{isOmniLanguageId(language) ? "Flexible model/user tokens · experimental" : "AI tokenization · safe JSON import"}</b>
              <button onClick={resetSample}>Restore sample</button>
              <button className="new-blank-document" onClick={desktopDocumentsAvailable
                ? () => { void getDesktopDocumentsBridge()?.newDocument(language, "blank"); }
                : newBlankDocument}>New blank document</button>
            </div>
            {supportsUserDictionary && (
              <div className="dictionary-library" aria-label={`${languageName} dictionary library`}>
                <div className="dictionary-library-heading">
                  <div>
                    <span>LOCAL DICTIONARY</span>
                    <b>MDX / MDD lookup</b>
                  </div>
                  <input
                    ref={dictionaryInputRef}
                    className="visually-hidden"
                    type="file"
                    accept=".mdx,.mdd"
                    multiple
                    disabled={dictionaryImportBusy}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = "";
                      void importDictionaryFiles(files);
                    }}
                  />
                  <button
                    type="button"
                    disabled={dictionaryImportBusy || !dictionaryLibraryReady}
                    onClick={() => dictionaryInputRef.current?.click()}
                  >{dictionaryImportBusy ? "Indexing…" : "Import dictionary"}</button>
                </div>
                <p className="dictionary-library-help">
                  Select one MDX and its same-basename MDD sidecars together. Files and indexes stay in this browser; OMNI intentionally has no dictionary library.
                </p>
                {dictionaryImportProgress && (
                  <div className="dictionary-import-progress" role="status" aria-live="polite">
                    <span>{dictionaryImportProgress.stage}</span>
                    <progress
                      value={dictionaryImportProgress.processed}
                      max={Math.max(1, dictionaryImportProgress.total)}
                    />
                  </div>
                )}
                {languageDictionaries.length > 0 ? (
                  <div className="dictionary-library-list">
                    {languageDictionaries.map((dictionary) => (
                      <div key={dictionary.id}>
                        <span>
                          <b>{dictionary.title}</b>
                          <small>
                            {dictionary.entryCount.toLocaleString()} headwords · {(dictionary.byteLength / 1_048_576).toFixed(1)} MB
                            {dictionary.mddNames.length ? ` · ${dictionary.mddNames.length} MDD` : ""}
                          </small>
                        </span>
                        <button
                          type="button"
                          disabled={dictionaryImportBusy}
                          onClick={() => void removeUserDictionary(dictionary)}
                        >Remove</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dictionary-library-empty">
                    No dictionary installed. Import one to enable token right-click lookup.
                  </p>
                )}
                {dictionaryImportError && (
                  <div className="dictionary-library-error" role="alert">{dictionaryImportError}</div>
                )}
              </div>
            )}
          </section>

          <section className="panel-section inspector-section">
            <div className="section-heading compact-heading">
              <div>
                <span className="eyebrow">02 · TOKEN EDITOR</span>
                <h2>{selectedTokens.length > 1 ? `${selectedTokens.length} words selected` : "Edit selected word"}</h2>
                {singleSelectedToken && (
                  <span className={`confidence ${singleSelectedToken.confidence < 0.95 ? "medium" : ""}`}>
                    {Math.round(singleSelectedToken.confidence * 100)}%
                  </span>
                )}
              </div>
              <button
                className="composition-more-button token-editor-more-button"
                type="button"
                onClick={() => setTokenEditorOpen(true)}
                disabled={!selectedTokens.length}
                aria-expanded={tokenEditorOpen}
                title={pronunciationLabel
                  ? `Edit ${pronunciationLabel} plus all five interlinear layers for the selected tokens`
                  : "Edit all five interlinear layers for the selected tokens"}
              >More · Token Editor</button>
            </div>
            {selectedToken && (
              <div className="field-grid">
                {singleSelectedToken ? (
                  <>
                    <div className="token-source-fields">
                      <label className="punctuation-field">
                        <span>Before</span>
                        <input
                          value={singleSelectedToken.punctuationBefore}
                          onChange={(event) => updateToken("punctuationBefore", event.target.value)}
                          aria-label="Punctuation before token"
                        />
                      </label>
                      <label className="token-surface-field">
                        <span>{languageConfig.sourceLanguageLabel}</span>
                        <input value={singleSelectedToken.surface} onChange={(event) => updateToken("surface", event.target.value)} />
                      </label>
                      <label className="punctuation-field">
                        <span>After</span>
                        <input
                          value={singleSelectedToken.punctuationAfter}
                          onChange={(event) => updateToken("punctuationAfter", event.target.value)}
                          aria-label="Punctuation after token"
                        />
                      </label>
                    </div>
                    {pronunciationAvailable && pronunciationLabel && (
                      <label className="pronunciation-field">
                        <span>{pronunciationLabel}</span>
                        <input
                          value={pronunciationLabel === "Pinyin"
                            ? singleSelectedToken.pinyin ?? ""
                            : singleSelectedToken.romanization ?? ""}
                          onChange={(event) => updateToken(
                            pronunciationLabel === "Pinyin" ? "pinyin" : "romanization",
                            event.target.value,
                          )}
                          dir="ltr"
                          spellCheck={false}
                        />
                      </label>
                    )}
                    <label>
                      <span>{annotationTargetLabel} gloss</span>
                      <input value={singleSelectedToken.gloss} onChange={(event) => updateToken("gloss", event.target.value)} />
                    </label>
                    <label className="lemma-field">
                      <span>Lemma</span>
                      <input value={singleSelectedToken.lemma} onChange={(event) => updateToken("lemma", event.target.value)} />
                    </label>
                    <label>
                      <span>POS</span>
                      <input value={singleSelectedToken.pos} onChange={(event) => updateToken("pos", event.target.value)} />
                    </label>
                    <label>
                      <span>Morphology</span>
                      <input value={singleSelectedToken.morphology} onChange={(event) => updateToken("morphology", event.target.value)} />
                    </label>
                    {!omniDocument && (
                      <TokenNotesEditor
                        key={`${singleSelectedToken.id}:${analysis.notes.map((note) => `${note.id}:${note.tokenId ?? ""}:${note.text}`).join("|")}`}
                        tokenId={singleSelectedToken.id}
                        allNotes={analysis.notes}
                        tokenNotes={selectedTokenNotes}
                        onAdd={addSelectedTokenNote}
                        onUpdate={updateSelectedTokenNote}
                        onMove={moveSelectedTokenNote}
                        onDelete={removeSelectedTokenNote}
                      />
                    )}
                  </>
                ) : (
                  <div className="multi-selection-summary" role="status">
                    <b>{selectedTokens.length} tokens selected in document order</b>
                    <span>Text fields remain single-token only. Styles, breaks, spacing, reset, and delete apply to the full selection in one undoable action.</span>
                  </div>
                )}
                <label className="select-control break-after-control">
                  <span>After token</span>
                  <select
                    value={selectedBreakAfterValue}
                    onChange={(event) => updateBreakAfter(event.target.value as BreakAfter)}
                  >
                    {selectedBreakAfter.kind === "mixed" && <option value="__mixed__" disabled>Mixed break settings</option>}
                    <option value="none">None</option>
                    <option value="line">Line break</option>
                    <option value="paragraph">Paragraph break</option>
                  </select>
                </label>
                {showSelectedParagraphControls && (
                  <div className="break-spacing-controls">
                    <NumberControl
                      label="Blank lines"
                      value={selectedBlankLinesValue}
                      min={1}
                      max={20}
                      step={1}
                      suffix="lines"
                      mixed={selectedBlankLines.kind === "mixed"}
                      onChange={updateBlankLinesAfter}
                    />
                    <RangeControl
                      label="Blank-line height"
                      value={selectedBlankLineSpacingValue}
                      min={1}
                      max={200}
                      step={1}
                      suffix="px"
                      mixed={selectedBlankLineSpacing.kind === "mixed"}
                      onChange={updateBlankLineSpacing}
                    />
                  </div>
                )}
                <div className="token-danger-zone">
                  <div>
                    <b>Delete {selectedTokens.length === 1 ? "token" : `${selectedTokens.length} tokens`}</b>
                    <span>One Undo restores the selection, words, and formatting.</span>
                  </div>
                  <button type="button" onClick={deleteSelectedToken}>Delete selected {selectedTokens.length === 1 ? "word" : "words"}</button>
                </div>
              </div>
            )}
            {!selectedToken && (
              <div className="no-token-selection">
                <b>No token selected</b>
                <span>Click a token to edit it. Use Cmd/Ctrl-click to toggle tokens and Shift-click to select a range.</span>
              </div>
            )}
          </section>

          <section className="panel-section style-section">
            <div className="section-heading compact-heading">
              <div>
                <span className="eyebrow">03 · COMPOSITION</span>
                <h2>Typography & page</h2>
              </div>
              <button
                className="composition-more-button"
                type="button"
                onClick={() => setCompositionStyleOpen(true)}
                aria-expanded={compositionStyleOpen}
                title="Edit all five document-default token layers and future-document defaults"
              >More · Default styles</button>
            </div>
            <div className="style-controls">
              <div className="control-subhead"><span>Typography</span><i /></div>
              <div className="font-library" data-font-library-ready={fontLibraryReady ? "true" : "false"}>
                <div className="font-library-heading">
                  <div>
                    <b>Device-local font library</b>
                    <span>TTF and OTF · 25 MB maximum per file</span>
                  </div>
                  <label className={fontImportBusy ? "disabled" : ""}>
                    <input
                      type="file"
                      accept=".ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-opentype"
                      disabled={fontImportBusy}
                      onChange={(event) => {
                        const input = event.currentTarget;
                        const file = input.files?.[0];
                        input.value = "";
                        void importUserFontFile(file);
                      }}
                    />
                    <span>{fontImportBusy ? "Working…" : "Import font"}</span>
                  </label>
                </div>
                <p>Font bytes stay only in this browser. STOA project files save identity and layout references, never licensed font data; another device must import the same font file.</p>
                <button type="button" onClick={() => void importInstalledTimes()} disabled={fontImportBusy}>Load Times New Roman from this device</button>
                {userFonts.length > 0 && (
                  <div className="font-library-list">
                    {userFonts.map((font) => (
                      <div key={font.id}>
                        <span style={{ fontFamily: font.cssFamily }}>
                          <b>{font.familyName}</b>
                          <small>{font.subfamilyName} · {font.format.toUpperCase()} · {(font.byteLength / 1024 / 1024).toFixed(1)} MB</small>
                        </span>
                        <button type="button" disabled={fontImportBusy} onClick={() => void removeUserFont(font)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                {missingDocumentFonts.length > 0 && (
                  <div className="font-library-warning" role="alert">
                    <b>Missing document font{missingDocumentFonts.length === 1 ? "" : "s"}</b>
                    <span>Re-import the exact file{missingDocumentFonts.length === 1 ? "" : "s"}: {missingDocumentFonts.map((font) => font.filename).join(", ")}. Preview fallback is temporary; PDF export is blocked to prevent silent substitution.</span>
                  </div>
                )}
                {fontImportError && <div className="font-library-error" role="alert">{fontImportError}</div>}
              </div>
              <label className="select-control">
                <span>Source typeface</span>
                <select value={settings.greekFont} onChange={(event) => updateSetting("greekFont", event.target.value)}>
                  <option value="'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif">Palatino Greek</option>
                  <option value="Georgia, 'Times New Roman', serif">Georgia</option>
                  <option value="'Noto Serif STOA', 'Times New Roman', Times, serif">Noto Serif STOA — Unicode PDF</option>
                  <option value="'Liberation Sans STOA', Arial, sans-serif">Liberation Sans STOA — Unicode PDF</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman</option>
                  <option value="'Arial Unicode MS', Arial, sans-serif">Arial Unicode</option>
                  <option value="'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif">Noto Sans SC — Chinese</option>
                  <option value="'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif">Noto Sans JP — Japanese</option>
                  {scopedBuiltinFontOptions.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                  {importedFontOptions.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                </select>
              </label>
              <label className="select-control">
                <span>{annotationTargetLabel} typeface</span>
                <select value={settings.englishFont} onChange={(event) => updateSetting("englishFont", event.target.value)}>
                  <option value="'Noto Serif STOA', 'Times New Roman', Times, serif">Noto Serif STOA — Unicode PDF</option>
                  <option value="'Liberation Sans STOA', Arial, sans-serif">Liberation Sans STOA — Unicode PDF</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman</option>
                  <option value="Georgia, 'Times New Roman', serif">Georgia</option>
                  <option value="Inter, ui-sans-serif, system-ui, sans-serif">Inter / System Sans</option>
                  <option value="Arial, Helvetica, sans-serif">Arial</option>
                  <option value="'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif">Noto Sans SC — Chinese</option>
                  <option value="'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif">Noto Sans JP — Japanese</option>
                  {scopedBuiltinFontOptions.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                  {importedFontOptions.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                </select>
              </label>
              <RangeControl label="Source size" value={settings.greekSize} min={4} max={144} step={0.5} suffix="pt" onChange={(value) => updateSetting("greekSize", value)} />
              <RangeControl label={`${annotationTargetLabel} gloss`} value={settings.glossSize} min={4} max={72} step={0.5} suffix="pt" onChange={(value) => updateSetting("glossSize", value)} />

              <div className="control-subhead secondary-subhead"><span>Lemma</span><i /></div>
              <label className="select-control">
                <span>Lemma typeface</span>
                <select value={settings.lemmaFont} onChange={(event) => updateSetting("lemmaFont", event.target.value)}>
                  <option value="'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif">Palatino Greek</option>
                  <option value="'Noto Serif STOA', 'Times New Roman', Times, serif">Noto Serif STOA — Unicode PDF</option>
                  <option value="'Liberation Sans STOA', Arial, sans-serif">Liberation Sans STOA — Unicode PDF</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman</option>
                  <option value="Georgia, 'Times New Roman', serif">Georgia</option>
                  <option value="'Arial Unicode MS', Arial, sans-serif">Arial Unicode</option>
                  <option value="Inter, ui-sans-serif, system-ui, sans-serif">Inter / System Sans</option>
                  <option value="'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif">Noto Sans SC — Chinese</option>
                  <option value="'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif">Noto Sans JP — Japanese</option>
                  {scopedBuiltinFontOptions.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                  {importedFontOptions.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                </select>
              </label>
              <RangeControl label="Lemma size" value={settings.lemmaSize} min={4} max={72} step={0.5} suffix="pt" onChange={(value) => updateSetting("lemmaSize", value)} />

              <div className="control-subhead secondary-subhead"><span>Morphology</span><i /></div>
              <label className="select-control">
                <span>Morphology typeface</span>
                <select value={settings.morphFont} onChange={(event) => updateSetting("morphFont", event.target.value)}>
                  <option value="'Noto Serif STOA', 'Times New Roman', Times, serif">Noto Serif STOA — Unicode PDF</option>
                  <option value="'Liberation Sans STOA', Arial, sans-serif">Liberation Sans STOA — Unicode PDF</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman</option>
                  <option value="Georgia, 'Times New Roman', serif">Georgia</option>
                  <option value="'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif">Palatino</option>
                  <option value="Inter, ui-sans-serif, system-ui, sans-serif">Inter / System Sans</option>
                  <option value="Arial, Helvetica, sans-serif">Arial</option>
                  <option value="'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif">Noto Sans SC — Chinese</option>
                  <option value="'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif">Noto Sans JP — Japanese</option>
                  {scopedBuiltinFontOptions.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                  {importedFontOptions.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                </select>
              </label>
              <RangeControl label="Morphology size" value={settings.morphSize} min={4} max={72} step={0.5} suffix="pt" onChange={(value) => updateSetting("morphSize", value)} />

              <div className="mini-control-grid">
                <NumberControl label="POS" value={settings.posSize} min={4} max={48} step={0.5} suffix="pt" onChange={(value) => updateSetting("posSize", value)} />
                <NumberControl label="Translation" value={settings.translationSize} min={4} max={72} step={0.5} suffix="pt" onChange={(value) => updateSetting("translationSize", value)} />
              </div>

              {omniDocument && (
                <div className="omni-writing-controls">
                  <div className="control-subhead"><span>OMNI language & writing</span><i /></div>
                  <div className="omni-profile-grid" aria-label="Detected OMNI language profile">
                    <span>Detected</span>
                    <b>{omniProfileResolution?.detection.languageName ?? "Undetermined"} · {omniProfileResolution?.detection.languageId ?? "und"}</b>
                    {omniUsesManualProfile && (
                      <>
                        <span>Active</span>
                        <b>{omniStatusLanguageName} · manual override</b>
                      </>
                    )}
                    <span>Script</span>
                    <b>{omniProfileResolution?.sourceScript.script ?? "Zzzz"}</b>
                    <span>Confidence</span>
                    <b>{Math.round((omniProfileResolution?.detection.confidence ?? 0) * 100)}%</b>
                    <span>Mode</span>
                    <b>{omniDocument.analysisProfile === "rich-inflectional" ? "Rich Inflectional" : "Generic"}</b>
                    <span>Standard</span>
                    <b className="omni-standard-id">{omniDocument.morphologyStandard}</b>
                  </div>
                  <label className="select-control">
                    <span>Manual language override</span>
                    <select
                      value={omniDocument.manualLanguageOverride?.confirmed
                        ? omniDocument.manualLanguageOverride.languageId
                        : ""}
                      onChange={(event) => updateOmniDocument({
                        manualLanguageOverride: event.target.value
                          ? { languageId: event.target.value, confirmed: true }
                          : null,
                      })}
                    >
                      <option value="">Automatic detection</option>
                      {Object.values(OMNI_LANGUAGE_PROFILE_REGISTRY)
                        .sort((left, right) => left.languageName.localeCompare(right.languageName))
                        .map((profile) => (
                          <option key={profile.languageId} value={profile.languageId}>
                            {profile.languageName} · {profile.languageId}
                          </option>
                        ))}
                    </select>
                  </label>
                  {omniProfileResolution?.warnings.length ? (
                    <p className="omni-profile-warning">{omniProfileResolution.warnings[0]}</p>
                  ) : null}
                  <div className="split-selects">
                    <label className="select-control">
                      <span>Direction</span>
                      <select
                        value={omniDocument.direction}
                        onChange={(event) => updateOmniDocument({ direction: event.target.value as OmniDocumentConfig["direction"] })}
                      >
                        <option value="ltr">Left to right</option>
                        <option value="rtl">Right to left</option>
                      </select>
                    </label>
                    <label className="select-control">
                      <span>Writing mode</span>
                      <select
                        value={omniDocument.writingMode}
                        onChange={(event) => updateOmniDocument({ writingMode: event.target.value as OmniDocumentConfig["writingMode"] })}
                      >
                        <option value="horizontal-tb">Horizontal</option>
                        <option value="vertical-rl">Vertical · columns right to left</option>
                        <option value="vertical-lr">Vertical · columns left to right</option>
                      </select>
                    </label>
                  </div>
                  <label className="select-control">
                    <span>Tokenization source</span>
                    <select
                      value={omniDocument.tokenizationOrigin}
                      onChange={(event) => updateOmniDocument({ tokenizationOrigin: event.target.value as OmniDocumentConfig["tokenizationOrigin"] })}
                    >
                      <option value="model">Model-provided tokens</option>
                      <option value="user">User-provided tokens</option>
                    </select>
                  </label>
                  <details className="omni-technical-details">
                    <summary>Technical details</summary>
                    <p>Local route: {omniProfileResolution?.reason ?? "undetermined-language"}. Tokens stay in logical source order. PDF output is selected by deterministic local preflight.</p>
                    <label>
                      <span>Legacy language hint</span>
                      <input
                        value={omniDocument.languageHint ?? ""}
                        onChange={(event) => updateOmniDocument({ languageHint: event.target.value || null })}
                        placeholder="Optional legacy BCP 47 hint"
                        spellCheck={false}
                      />
                    </label>
                  </details>
                </div>
              )}

              <div className="control-subhead"><span>Page setup</span><i /></div>
              <div className="split-selects">
                <label className="select-control">
                  <span>Paper</span>
                  <select value={settings.paperPreset} onChange={(event) => updatePaperPreset(event.target.value)}>
                    <option value="A5">A5</option>
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                    <option value="Letter">US Letter</option>
                    <option value="Legal">US Legal</option>
                    <option value="Custom">Custom</option>
                  </select>
                </label>
                <label className="select-control">
                  <span>Orientation</span>
                  <select value={settings.orientation} onChange={(event) => updateOrientation(event.target.value as "portrait" | "landscape")}>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
              </div>
              <div className="mini-control-grid dimensions-grid">
                <NumberControl label="Width" value={settings.paperWidthMm} min={60} max={1000} step={0.1} suffix="mm" onChange={(value) => commitDocument(analysis, selection, language, { ...settings, paperPreset: "Custom", paperWidthMm: value }, { historyCoalescingKey: "setting:paperWidthMm" })} />
                <NumberControl label="Height" value={settings.paperHeightMm} min={60} max={1000} step={0.1} suffix="mm" onChange={(value) => commitDocument(analysis, selection, language, { ...settings, paperPreset: "Custom", paperHeightMm: value }, { historyCoalescingKey: "setting:paperHeightMm" })} />
              </div>
              <div className="margin-control-grid">
                <NumberControl label="Top" value={settings.marginTopMm} min={0} max={100} step={0.5} suffix="mm" onChange={(value) => updateSetting("marginTopMm", value)} />
                <NumberControl label="Right" value={settings.marginRightMm} min={0} max={100} step={0.5} suffix="mm" onChange={(value) => updateSetting("marginRightMm", value)} />
                <NumberControl label="Bottom" value={settings.marginBottomMm} min={0} max={100} step={0.5} suffix="mm" onChange={(value) => updateSetting("marginBottomMm", value)} />
                <NumberControl label="Left" value={settings.marginLeftMm} min={0} max={100} step={0.5} suffix="mm" onChange={(value) => updateSetting("marginLeftMm", value)} />
              </div>
              <RangeControl label="Word spacing" value={settings.wordGap} min={0} max={80} step={1} suffix="px" onChange={(value) => updateSetting("wordGap", value)} />
              <RangeControl label="Line spacing" value={settings.lineGap} min={0} max={100} step={1} suffix="px" onChange={(value) => updateSetting("lineGap", value)} />

              <div className="control-subhead"><span>Header & footer</span><i /></div>
              <div className="field-grid header-footer-grid">
                <label>
                  <span>Header left</span>
                  <input value={settings.headerLeft} onChange={(event) => updateSetting("headerLeft", event.target.value)} placeholder="Leave blank to hide" />
                </label>
                <label>
                  <span>Header right</span>
                  <input value={settings.headerRight} onChange={(event) => updateSetting("headerRight", event.target.value)} placeholder="Leave blank to hide" />
                </label>
                <label>
                  <span>Footer left</span>
                  <input value={settings.footerLeft} onChange={(event) => updateSetting("footerLeft", event.target.value)} placeholder="Leave blank to hide" />
                </label>
                <label>
                  <span>Footer right</span>
                  <input value={settings.footerRight} onChange={(event) => updateSetting("footerRight", event.target.value)} placeholder="Leave blank to hide" />
                </label>
              </div>
              <p className="page-template-hint">Variables: {'{page}'}, {'{page:02}'}, {'{pages}'}, {'{tokens}'}. Clear both fields to remove that area.</p>

              <div className="style-row">
                <label className="color-control">
                  <span>Paper</span>
                  <input type="color" value={settings.background} onChange={(event) => updateSetting("background", event.target.value)} />
                  <code>{settings.background}</code>
                </label>
                <label className="color-control">
                  <span>Ink</span>
                  <input type="color" value={settings.ink} onChange={(event) => updateSetting("ink", event.target.value)} />
                  <code>{settings.ink}</code>
                </label>
              </div>
              <div className="toggle-row">
                {pronunciationAvailable && (
                  <Toggle
                    label={pronunciationLabel}
                    checked={settings.showPronunciation}
                    onChange={(value) => updateSetting("showPronunciation", value)}
                  />
                )}
                <Toggle label="Lemma" checked={settings.showLemma} onChange={(value) => updateSetting("showLemma", value)} />
                <Toggle label="POS" checked={settings.showPos} onChange={(value) => updateSetting("showPos", value)} />
                {(hasClassicalDictionary || omniDocument) && (
                  <Toggle
                    label="Hide indeclinable details"
                    checked={effectiveSettings.hideIndeclinableDetails}
                    disabled={!canHideIndeclinableDetails}
                    title={!canHideIndeclinableDetails
                      ? "Available only for validated inflectional-language profiles."
                      : undefined}
                    onChange={(value) => updateSetting("hideIndeclinableDetails", value)}
                  />
                )}
                <Toggle label="Translation" checked={settings.showTranslation} onChange={(value) => updateSetting("showTranslation", value)} />
                {isStoaLanguageId(language) && (
                  <>
                    <Toggle label="Notes" checked={settings.showNotes} onChange={(value) => updateSetting("showNotes", value)} />
                    <Toggle
                      label="Note markers"
                      checked={settings.showNoteMarkers}
                      onChange={(value) => updateSetting("showNoteMarkers", value)}
                    />
                  </>
                )}
              </div>
              <details className="translation-style-controls">
                <summary>Literal &amp; idiomatic translation style</summary>
                <label><span>Typeface</span>
                  <select value={settings.translationFont ?? settings.englishFont} onChange={(event) => updateSetting("translationFont", event.target.value)}>
                    {[...STOA_BUILTIN_FONTS, ...importedFontOptions].filter((font) => fontAvailableInWorkspace(font, language)).map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
                  </select>
                </label>
                <NumberControl label="Translation size" value={settings.translationSize} min={4} max={72} step={0.5} suffix="pt" onChange={(value) => updateSetting("translationSize", value)} />
                <label className="color-control"><span>Translation color</span>
                  <input type="color" value={settings.translationColor ?? settings.ink} onChange={(event) => updateSetting("translationColor", event.target.value)} />
                </label>
                <div className="toggle-row">
                  <Toggle label="Bold" checked={settings.translationBold ?? false} onChange={(value) => updateSetting("translationBold", value)} />
                  <Toggle label="Italic" checked={settings.translationItalic ?? true} onChange={(value) => updateSetting("translationItalic", value)} />
                  <Toggle label="Underline" checked={settings.translationUnderline ?? false} onChange={(value) => updateSetting("translationUnderline", value)} />
                </div>
              </details>
              {(hasClassicalDictionary || omniDocument) && (
                <p className="indeclinable-hint">
                  {canHideIndeclinableDetails
                    ? "Hides Lemma, POS, and Morphology only for tokens classified as indeclinable. Source and English gloss always remain visible."
                    : "Available only for validated inflectional-language profiles."}
                </p>
              )}
            </div>
          </section>
        </aside>

        <section className="preview-workspace">
          <div className="workspace-toolbar">
            <div className="workspace-title">
              <span className="eyebrow">LIVE COMPOSITION · {languageAutonym}</span>
              <h1>{languageName} interlinear</h1>
            </div>
            <div className="layout-assistant" aria-label="Adaptive typesetting tools">
              <span>TYPESETTING ASSISTANT</span>
              <div>
                <button
                  className="auto-layout-button"
                  type="button"
                  onClick={applyAutoTypesetting}
                  disabled={omniVertical || !documentLayoutReady}
                  title={omniVertical
                    ? "Vertical OMNI preview uses browser writing-mode; the horizontal auto-paginator is intentionally disabled"
                    : missingDocumentFonts.length
                      ? "Re-import missing document fonts before automatic typesetting"
                      : !fontsReady
                      ? "Waiting for document fonts and final pagination"
                      : "Measure the current fonts and tokens, then optimize type sizes, margins, and spacing"}
                >✦ Auto Typeset</button>
                <button
                  className="ai-layout-button"
                  type="button"
                  onClick={() => setLayoutAiOpen(true)}
                  disabled={omniVertical}
                  title={omniVertical
                    ? "AI layout plans are disabled until STOA has an axis-aware vertical paginator"
                    : "Export a layout diagnostic prompt and import the plan returned by your own AI"}
                >AI Layout Plan</button>
              </div>
            </div>
            <div className="toolbar-actions">
              <span className="page-meta">{pages.length} page{pages.length === 1 ? "" : "s"} · {settings.paperWidthMm} × {settings.paperHeightMm} mm</span>
              {desktopDocumentsAvailable && activeDesktopDocument && (
                <span
                  className={`desktop-document-status ${activeDesktopDocument.dirty ? "is-dirty" : ""}`}
                  title={activeDesktopDocument.filePath ?? "This document has not been saved to a file yet"}
                >{activeDesktopDocument.dirty ? "Edited · " : ""}{activeDesktopDocument.displayName}</span>
              )}
              <button
                className="history-action"
                type="button"
                onClick={undo}
                disabled={!undoStack.length}
                title="Undo · Command/Ctrl + Z"
              >↶ Undo</button>
              <button
                className="history-action"
                type="button"
                onClick={redo}
                disabled={!redoStack.length}
                title="Redo · Command/Ctrl + Y or Command/Ctrl + Shift + Z"
              >↷ Redo</button>
              <button className="add-word-main" onClick={() => insertTokenAfter(selectionTailId)}>
                ＋ Add word {selectionTailId ? "after selection" : "at end"}
              </button>
              {desktopDocumentsAvailable && (
                <>
                  <button type="button" onClick={openDesktopDocument}>Open…</button>
                  <button type="button" onClick={() => saveDesktopDocument(false)}>Save</button>
                  <button type="button" onClick={() => saveDesktopDocument(true)}>Save As…</button>
                </>
              )}
              {!desktopDocumentsAvailable && <><button
                onClick={() => setProjectImportOpen(true)}
                title="Restore a complete STOA project from another device or user"
              >↑ Import Project</button>
              <button
                onClick={exportProject}
                disabled={projectExportCapability?.supported === false}
                title={projectExportCapability?.supported === false
                  ? projectExportCapability.reason.message
                  : "Transfer all tokens, translations, typography, colors, paper settings, breaks, and word styles"}
              >↓ Export Project</button></>}
              {(!omniDocument || latexExportCapability?.supported) && (
                <button className="export-latex" onClick={exportTex} title={latexExportReason}>↓ LaTeX</button>
              )}
              <button
                onClick={exportPng}
                className="export-png"
                disabled={!analysis.tokens.length || pngExportCapability?.supported === false || activeDocumentExport !== null || !documentLayoutReady}
                aria-busy={activeDocumentExport === "png"}
                title={!analysis.tokens.length ? "Add or import tokens before exporting PNG."
                  : activeDocumentExport
                  ? "A document export is already in progress."
                  : missingDocumentFonts.length
                    ? `Re-import missing document fonts: ${missingDocumentFonts.map((font) => font.filename).join(", ")}`
                    : !fontsReady
                    ? "Waiting for document fonts and final pagination."
                    : pngExportReason}
              >{activeDocumentExport === "png" ? "Exporting PNG…" : "Export PNG"}</button>
              <button
                className="export-main"
                onClick={exportPdf}
                disabled={!analysis.tokens.length || pdfExportCapability?.supported === false || activeDocumentExport !== null || !documentLayoutReady}
                aria-busy={activeDocumentExport === "pdf"}
                title={!analysis.tokens.length ? "Add or import tokens before exporting PDF."
                  : activeDocumentExport
                  ? "A document export is already in progress."
                  : missingDocumentFonts.length
                    ? `Re-import missing document fonts: ${missingDocumentFonts.map((font) => font.filename).join(", ")}`
                    : !fontsReady
                    ? "Waiting for document fonts and final pagination."
                    : pdfExportReason}
              >{activeDocumentExport === "pdf" ? "Exporting PDF…" : "Export PDF"}</button>
            </div>
          </div>

          {omniDocument && (
            <div className={`omni-preview-status ${omniVertical ? "is-vertical" : ""}`} role="status">
              <b>
                {omniStatusLanguageName}
                {` · ${omniProfileResolution?.sourceScript.script ?? "Zzzz"}`}
                {` · ${omniStatusEvidence}`}
                {` · ${omniDocument.analysisProfile === "rich-inflectional" ? "Rich Inflectional" : "Generic"}`}
              </b>
              <span>{pdfExportCapability?.supported === false
                ? pdfExportReason
                : pdfExportCapability?.supported
                  ? pdfExportCapability.pdf?.status
                  : "PDF preflight pending."}</span>
              {omniProfileResolution?.warnings.length ? (
                <details>
                  <summary>Detection and routing notes</summary>
                  <ul>{omniProfileResolution.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                </details>
              ) : null}
            </div>
          )}

          <div className="canvas-stage" onPointerDown={clearSelectionFromPaper}>
            <div className="page-stack">
              {pages.map((page, pageIndex) => (
                <div className="page-wrap" key={`page-${pageIndex + 1}`}>
                  <div className="page-label">PAGE {pageIndex + 1} / {pages.length}</div>
                  <div
                    className="paper-preview export-page"
                    style={pageStyle}
                    data-page-break-reason={page.breakReason ?? "end"}
                    data-remaining-bottom-px={page.remainingBottomPx.toFixed(2)}
                    data-pagination-key={layoutSourceKey}
                  >
                    {hasHeader(currentProjectSettings) && (
                      <div className="paper-heading">
                        <span>{formatPageText(currentProjectSettings.headerLeft, pageIndex + 1, pages.length, analysis.tokens.length)}</span>
                        <span>{formatPageText(currentProjectSettings.headerRight, pageIndex + 1, pages.length, analysis.tokens.length)}</span>
                      </div>
                    )}
                    <div className="paper-body">
                      <div
                        className={`token-lines ${omniDocument ? "omni-token-flow" : ""} ${omniVertical ? "is-vertical" : ""}`}
                        dir={omniDocument?.direction}
                        style={omniWritingStyle ?? undefined}
                      >
                        {page.tokenLines.map((line, lineIndex) => (
                          <div
                            className="token-line"
                            key={line.tokens[0]?.id || `line-${lineIndex + 1}`}
                            data-resolved-gap-px={line.resolvedGapBefore.toFixed(2)}
                            data-measured-height-px={line.measuredHeight.toFixed(2)}
                            style={line.paragraphSpacingBefore + line.resolvedGapBefore
                              ? { marginTop: `${line.paragraphSpacingBefore + line.resolvedGapBefore}px` }
                              : undefined}
                          >
                            {line.tokens.map((item) => (
                              <div className="token-slot" key={item.id}>
                                <TokenCard
                                  item={item}
                                  language={analysis.language}
                                  selected={selectedIdSet.has(item.id)}
                                  focusable={selection.focusId === item.id || (!selection.focusId && item.id === tokenIds[0])}
                                  settings={currentProjectSettings}
                                  onSelect={(event) => selectTokenFromPointer(item.id, event)}
                                  onSelectionKeyDown={(event) => selectTokenFromKeyboard(item.id, event)}
                                  onLookup={dictionaryLookupEnabled ? (event) => {
                                    event.preventDefault();
                                    setDictionaryTrigger(event.currentTarget);
                                    setDictionaryPopover({
                                      language: language as "ancient-greek" | "latin" | "classical-chinese",
                                      lemma: item.lemma,
                                      surface: item.surface,
                                      x: event.clientX,
                                      y: event.clientY,
                                      tokenId: item.id,
                                    });
                                  } : undefined}
                                  onLookupFromKeyboard={dictionaryLookupEnabled ? (event) => {
                                    const rectangle = event.currentTarget.getBoundingClientRect();
                                    setDictionaryTrigger(event.currentTarget);
                                    setDictionaryPopover({
                                      language: language as "ancient-greek" | "latin" | "classical-chinese",
                                      lemma: item.lemma,
                                      surface: item.surface,
                                      x: rectangle.left + Math.min(rectangle.width, 28),
                                      y: rectangle.top + Math.min(rectangle.height, 34),
                                      tokenId: item.id,
                                    });
                                  } : undefined}
                                />
                                <button
                                  className="insert-token-button"
                                  onClick={() => insertTokenAfter(item.id)}
                                  title={`Add a ${languageName} word after ${getTokenSourceText(item)}`}
                                  aria-label={`Add a word after ${getTokenSourceText(item)}`}
                                >＋</button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      {page.noteBlocks.map((block) => (
                        <div
                          className={`publication-notes ${block.startsAtPageTop ? "page-start" : ""}`}
                          key={`notes-${block.lineStart}`}
                          data-note-line-start={block.lineStart}
                        >
                          <span className="publication-notes-heading">
                            ANALYSIS NOTES{block.continued ? " — CONTINUED" : ""}
                          </span>
                          <div className="publication-note-lines">
                            {block.lines.map((line, lineIndex) => (
                              <div
                                className={`publication-note-line ${line.firstLine ? "is-first-line" : "is-continuation-line"}`}
                                id={line.firstLine ? analysisNoteDestination(line.noteId) : undefined}
                                key={`${line.noteId}-${block.lineStart + lineIndex}`}
                              >
                                <span className="publication-note-number">
                                  {line.firstLine
                                    ? line.tokenId
                                      ? <a href={`#${tokenNoteDestination(line.tokenId)}`} title={`Return to token for note ${line.ordinal}`}>{line.ordinal}.</a>
                                      : `${line.ordinal}.`
                                    : null}
                                </span>
                                <span className="publication-note-text">{line.text || "\u00a0"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {page.translationBlocks.map((block) => (
                        <div
                          className={`translation-block ${block.startsAtPageTop ? "page-start" : ""}`}
                          key={`${block.sectionId}-${block.continued ? "continued" : "start"}`}
                          data-translation-section={block.sectionId}
                        >
                          <span>
                            {block.sectionId === "literal" ? "LITERAL" : "IDIOMATIC"} {annotationTargetLabel.toUpperCase()} TRANSLATION
                            {block.continued ? " — CONTINUED" : ""}
                          </span>
                          <div className="translation-lines" style={{
                            fontFamily: currentProjectSettings.translationFont ?? currentProjectSettings.englishFont,
                            color: currentProjectSettings.translationColor ?? currentProjectSettings.ink,
                            fontWeight: currentProjectSettings.translationBold ? 700 : 400,
                            fontStyle: currentProjectSettings.translationItalic === false ? "normal" : "italic",
                            textDecoration: currentProjectSettings.translationUnderline ? "underline" : "none",
                          }}>
                            {block.lines.map((line, lineIndex) => (
                              <div className="translation-line" key={`${block.sectionId}-${lineIndex}`}>
                                {line || "\u00a0"}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {hasFooter(currentProjectSettings) && (
                      <div className="paper-footer">
                        <span>{formatPageText(currentProjectSettings.footerLeft, pageIndex + 1, pages.length, analysis.tokens.length)}</span>
                        <span>{formatPageText(currentProjectSettings.footerRight, pageIndex + 1, pages.length, analysis.tokens.length)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {omniDocument && analysis.notes.length > 0 && (
            <div className="analysis-footnotes">
              <span className="eyebrow">ANALYSIS NOTES</span>
              <div className="note-grid">
                {analysis.notes.map((note, index) => (
                  <article key={note.id}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    <p>{note.text}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <DictionaryPopover
        openState={dictionaryPopover}
        triggerElement={dictionaryTrigger}
        onClose={() => {
          setDictionaryPopover(null);
          setDictionaryTrigger(null);
        }}
      />

      {tokenEditorOpen && (
        <Modal
          eyebrow="TOOLBAR · MORE"
          title="Token Editor"
          subtitle={pronunciationLabel
            ? `Style fixed-face ${pronunciationLabel}, Source, Gloss, Lemma, POS, and Morphology for the complete selection`
            : "Style Source, Gloss, Lemma, POS, and Morphology independently for the complete selection"}
          wide
          styleEditor
          onClose={() => setTokenEditorOpen(false)}
        >
          <TokenEditor
            language={language}
            selectionCount={selectedTokens.length}
            selectedTokens={selectedTokens}
            selectedIds={selection.selectedIds}
            focusedToken={selectedToken}
            documentStyle={documentTokenStyle}
            fontOptions={importedFontOptions}
            pronunciationLabel={pronunciationLabel}
            onApply={applyTokenEditorDraft}
            onCancel={() => setTokenEditorOpen(false)}
          />
        </Modal>
      )}

      {compositionStyleOpen && (
        <Modal
          eyebrow="COMPOSITION · MORE"
          title="Document Default Styles"
          subtitle={pronunciationLabel
            ? `Configure fixed-face ${pronunciationLabel} plus the five interlinear Details layers, then choose whether to reuse them`
            : "Configure the five interlinear layers for this document, then explicitly choose whether to reuse them in future documents"}
          wide
          styleEditor
          onClose={() => setCompositionStyleOpen(false)}
        >
          <CompositionStyleEditor
            language={language}
            value={documentTokenStyle}
            builtInStyle={builtInTokenStyleFor(language)}
            savedDefault={getUserTokenStyleDefault(userTokenStyleDefaults, language) ?? null}
            fontOptions={importedFontOptions}
            pronunciationLabel={pronunciationLabel}
            onApply={(nextStyle) => {
              updateCompositionDocumentStyle(nextStyle);
              setCompositionStyleOpen(false);
              setToast("Document default styles applied");
            }}
            onCancel={() => setCompositionStyleOpen(false)}
            onUseAsDefault={saveCompositionStyleAsDefault}
            onClearSavedDefault={clearCompositionStyleDefault}
          />
        </Modal>
      )}

      {promptOpen && (
        <Modal eyebrow="MODEL-AGNOSTIC BRIDGE" title="Universal AI Analysis Request" subtitle="Prefer a downloadable STOA JSON file; manual copy and paste remains available" onClose={() => setPromptOpen(false)}>
          <div className="json-first-workflow" aria-label="STOA JSON-first AI workflow">
            <section className="preferred">
              <span>Preferred</span>
              <b>Ask for a valid .stoa.json file</b>
              <p>If the AI interface supports file creation, ask it to save the result for download, then use Import Analysis → Open analysis .stoa.json. File creation is not available in every model or interface.</p>
            </section>
            <section>
              <span>Fallback</span>
              <b>Copy and paste valid STOA JSON</b>
              <p>If file creation is unavailable, request valid STOA JSON, copy the response, then paste it into Import Analysis.</p>
            </section>
          </div>
          <textarea className="prompt-output" readOnly value={prompt} aria-label="Universal AI analysis prompt" />
          <div className="modal-actions">
            <button className="secondary-action" onClick={() => download(prompt, `${language}-ai-prompt.txt`, "text/plain;charset=utf-8")}>Download .txt</button>
            <button className="primary-action" onClick={copyPrompt}>Copy full prompt</button>
          </div>
        </Modal>
      )}

      {manualSessionOpen && manualSession && manualMerge && (
        <Modal
          wide
          eyebrow="LOCAL · MODEL-AGNOSTIC"
          title="Guided Chunk Analysis"
          subtitle="STOA locks the source locally; you copy prompts and paste responses into at most two work slots"
          onClose={() => setManualSessionOpen(false)}
        >
          <div className={`manual-session-source ${manualSessionMatchesSource ? "is-current" : "is-stale"}`}>
            <div>
              <span>{manualSessionMatchesSource ? "SOURCE LOCKED" : "SOURCE CHANGED"}</span>
              <b>{manualSession.sourceTokens.length} tokens · {manualSession.chunks.length} chunks · 50–80 tokens each</b>
            </div>
            <div className="manual-source-actions">
              {!manualSessionMatchesSource && (
                <button type="button" onClick={restoreManualSessionSource}>Restore saved source</button>
              )}
              <button type="button" onClick={() => openGuidedManualSession(true)}>
                {manualSessionMatchesSource ? "Restart from source" : "Start new session from current source"}
              </button>
            </div>
          </div>

          <div className="manual-session-progress">
            <div>
              <span>{manualCompletedChunks} of {manualSession.chunks.length} chunks validated</span>
              <b>{manualMerge.analysis.tokens.length - manualMerge.unresolvedTokenIds.length} / {manualSession.sourceTokens.length} tokens verified</b>
            </div>
            <progress value={manualCompletedChunks} max={Math.max(1, manualSession.chunks.length)} />
            <div className="manual-chunk-track" aria-label="Chunk validation progress">
              {manualSession.chunks.map((chunk) => (
                <span
                  key={chunk.id}
                  className={`manual-chunk-dot is-${chunk.status}`}
                  title={`Chunk ${chunk.index + 1}: ${chunk.status}`}
                >{chunk.index + 1}</span>
              ))}
            </div>
          </div>

          {manualSessionNotice && (
            <div className={`manual-session-notice is-${manualSessionNotice.tone}`} role="status">
              {manualSessionNotice.text}
            </div>
          )}
          {manualRecoveryWarning && (
            <div className="manual-session-notice is-error" role="alert">
              {manualRecoveryWarning}
            </div>
          )}

          {!manualSessionMatchesSource && (
            <div className="manual-stale-warning" role="alert">
              This saved session belongs to an older source snapshot. Copying, validation, and preview generation are disabled so old AI results cannot overwrite newer text.
            </div>
          )}

          <div className="manual-work-slots">
            {manualSession.chunks.filter((chunk) => chunk.status === "active").map((chunk) => (
              <ManualChunkCard
                key={`${chunk.id}-${chunk.attempt}`}
                chunk={chunk}
                chunkCount={manualSession.chunks.length}
                response={manualResponseDrafts[chunk.id] ?? ""}
                disabled={!manualSessionMatchesSource}
                onResponseChange={(value) => updateManualResponseDraft(chunk.id, value)}
                onCopyPrompt={() => void copyManualChunkPrompt(chunk.id)}
                onDownloadPrompt={() => downloadManualChunkPrompt(chunk.id)}
                onValidate={() => submitManualResponse(chunk.id)}
              />
            ))}
            {!manualSession.chunks.some((chunk) => chunk.status === "active") && !manualMerge.complete && (
              <div className="manual-empty-slots">
                <b>These work slots are clear.</b>
                <p>Open the next chunk only when you are ready, so a late response cannot be pasted into a newly reassigned slot by accident.</p>
              </div>
            )}
          </div>

          <div className="manual-session-footer">
            <div>
              <b>{manualMerge.complete ? "All source tokens passed validation" : `${manualMerge.unresolvedTokenIds.length} tokens remaining`}</b>
              <span>Accepted chunks stay local and the preview is changed only once, after the final integrity check.</span>
            </div>
            <div>
              {!manualMerge.complete && (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={openNextManualChunks}
                  disabled={!manualSessionMatchesSource || manualSession.chunks.filter((chunk) => chunk.status === "active").length >= 2}
                >Open next chunk</button>
              )}
              <button
                className="primary-action"
                type="button"
                onClick={buildPreviewFromManualSession}
                disabled={!manualSessionMatchesSource || !manualMerge.complete}
              >Build STOA preview</button>
            </div>
          </div>
        </Modal>
      )}

      {layoutAiOpen && (
        <Modal
          title="AI Layout Plan"
          subtitle="Send the current fonts, paper, and layout diagnostics to your own AI, then import its settings"
          onClose={() => setLayoutAiOpen(false)}
        >
          <div className="prompt-callout layout-flow">
            <span>1</span><p>Copy or download the layout prompt.</p>
            <span>2</span><p>Send it to any AI that can return JSON.</p>
            <span>3</span><p>Paste and apply the plan returned by the AI.</p>
          </div>
          <div className="layout-ai-columns">
            <section className="layout-ai-panel">
              <div className="layout-panel-heading">
                <div><b>Current layout diagnostics</b><span>Prompt · read only</span></div>
                <button type="button" onClick={copyLayoutPrompt}>Copy prompt</button>
              </div>
              <textarea
                className="prompt-output layout-prompt-output"
                readOnly
                value={layoutPrompt}
                aria-label="AI layout prompt"
              />
              <button
                className="layout-download-button"
                type="button"
                onClick={() => download(layoutPrompt, `${language}-layout-prompt.txt`, "text/plain;charset=utf-8")}
              >Download prompt .txt</button>
            </section>
            <section className="layout-ai-panel import-panel">
              <div className="layout-panel-heading">
                <div><b>Import AI plan</b><span>Validated layout JSON</span></div>
              </div>
              <textarea
                className="prompt-output import-output layout-prompt-output"
                value={layoutPlanValue}
                onChange={(event) => setLayoutPlanValue(event.target.value)}
                placeholder={'{\n  "schemaVersion": 1,\n  "reasoningSummary": "…",\n  "settings": {\n    "greekSize": 24,\n    "wordGap": 13,\n    "lineGap": 16\n  }\n}'}
                aria-label="Import AI layout plan JSON"
              />
              <button
                className="primary-action apply-layout-button"
                type="button"
                onClick={importLayoutPlan}
                disabled={!layoutPlanValue.trim()}
              >Validate and apply layout plan</button>
            </section>
          </div>
          <p className="layout-safety-note">Only layout fields are read. The AI plan cannot overwrite tokens, translations, punctuation, breaks, colors, or header and footer content. Use Undo or Command/Ctrl + Z after applying it if needed.</p>
        </Modal>
      )}

      {projectImportOpen && (
        <Modal
          title="Import STOA Project"
          subtitle="Restore a complete interlinear document transferred from another device or collaborator"
          onClose={() => setProjectImportOpen(false)}
        >
          <div className="project-transfer-summary">
            <b>Complete project transfer</b>
            <p>Includes every token, translation, font choice, type size, color, paper dimension, margin, spacing value, header, footer, break, and per-word style.</p>
          </div>
          <div className="project-file-picker">
            <label>
              <input
                type="file"
                accept=".json,.stoa.json,application/json"
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  input.value = "";
                  void loadProjectFile(file);
                }}
              />
              <span>Choose .stoa.json file</span>
            </label>
            <div>
              <b>{projectImportFilename || "No project file selected"}</b>
              <span>You may also paste a STOA project below.</span>
            </div>
          </div>
          <textarea
            className="prompt-output import-output project-import-output"
            value={projectImportValue}
            onChange={(event) => {
              setProjectImportValue(event.target.value);
              setProjectImportFilename("");
            }}
            placeholder={'{\n  "format": "stoa-project",\n  "schemaVersion": 1,\n  "document": { … }\n}'}
            aria-label="Import STOA project JSON"
            spellCheck={false}
          />
          <div className="modal-actions">
            <button
              className="secondary-action"
              onClick={() => {
                setProjectImportValue("");
                setProjectImportFilename("");
              }}
              disabled={!projectImportValue}
            >Clear</button>
            <button className="primary-action" onClick={importProject} disabled={!projectImportValue.trim()}>
              Validate and restore project
            </button>
          </div>
          <p className="project-import-safety">Importing replaces the current document and layout, but the previous state remains available through Undo or Command/Ctrl + Z. Project files are parsed as data only and never executed.</p>
        </Modal>
      )}

      {importOpen && (
        <Modal
          wide
          title="Import Analysis"
          subtitle={isOmniLanguageId(language)
            ? "Load one self-contained OMNI JSON document into the preview; partial optional fields are accepted"
            : "Load self-contained JSON in source order; append, reopen, edit, or delete retained batches without strict ID matching"}
          onClose={() => setImportOpen(false)}
        >
          <div className="json-workspace-summary">
            <div>
              <span>JSON WORKSPACE · {languageConfig.autonym}</span>
              <b>{isOmniLanguageId(language)
                ? `${analysis.tokens.length} preview tokens · imported JSON remains editable below`
                : `${jsonWorkspace?.batches.length ?? 0} retained batch${jsonWorkspace?.batches.length === 1 ? "" : "es"} · ${analysis.tokens.length} preview tokens`}</b>
            </div>
            {!isOmniLanguageId(language) && <button className="json-workspace-new" type="button" onClick={startAdditionalJsonBatch}>＋ New JSON batch</button>}
          </div>
          {!isOmniLanguageId(language) && jsonWorkspace && jsonWorkspace.batches.length > 0 && (
            <div className="json-workspace-batches" aria-label="Retained JSON imports">
              {jsonWorkspace.batches.map((batch, index) => (
                <article className={jsonWorkspace.activeBatchId === batch.id ? "active" : ""} key={batch.id}>
                  <button type="button" className="json-batch-select" onClick={() => editJsonBatch(batch.id)}>
                    <span>Batch {String(index + 1).padStart(2, "0")}</span>
                    <b>{batch.importSummary?.importedTokenCount ?? batch.analysis.tokens.length} token updates</b>
                    <small>Revision {batch.revision} · click to edit</small>
                  </button>
                  <button type="button" className="json-batch-remove" onClick={() => deleteJsonBatch(batch.id)} aria-label={`Remove JSON batch ${index + 1}`}>×</button>
                </article>
              ))}
            </div>
          )}
          {!isOmniLanguageId(language) && <div className="json-workspace-editor-heading">
            <div>
              <b>{jsonWorkspace?.activeBatchId ? "Edit retained JSON" : "Add another JSON response"}</b>
              <span>Successful imports remain visible here and can be corrected later.</span>
            </div>
            {jsonWorkspace?.activeBatchId && <button type="button" onClick={startAdditionalJsonBatch}>Switch to new batch</button>}
          </div>}
          <div className="project-file-picker analysis-json-file-picker">
            <label>
              <input
                type="file"
                accept=".stoa.json,.json,application/json"
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  input.value = "";
                  void loadAnalysisJsonFile(file);
                }}
              />
              <span>Open analysis .stoa.json</span>
            </label>
            <div>
              <b>{analysisImportFilename || "No analysis file selected"}</b>
              <span>{isOmniLanguageId(language)
                ? "The file is loaded into the editable draft. Importing replaces the current OMNI preview in one Undo step."
                : "The file is loaded into this draft only. Loading it appends or updates the selected retained batch in one Undo step."}</span>
            </div>
          </div>
          <textarea
            className="prompt-output import-output json-workspace-editor"
            value={jsonWorkspace?.draftText ?? ""}
            onChange={(event) => {
              setAnalysisImportFilename("");
              updateJsonDraft(event.target.value);
            }}
            placeholder={'Paste raw JSON, a Markdown JSON block, or a response with explanatory text and links around the JSON.\n\n{\n  "sourceText": "…",\n  "tokens": […]\n}'}
            aria-label="Editable full analysis JSON"
            spellCheck={false}
          />
          {analysisImportFeedback && (
            <section
              className={`json-import-feedback is-${analysisImportFeedback.tone}`}
              role={analysisImportFeedback.tone === "error" ? "alert" : "status"}
            >
              <b>{analysisImportFeedback.text}</b>
              {analysisImportFeedback.permissiveSummary && (
                <details>
                  <summary>Import details</summary>
                  <div className="json-import-detail-grid">
                    <div><span>Usable tokens</span><code>{analysisImportFeedback.permissiveSummary.importedTokenCount} / {analysisImportFeedback.permissiveSummary.rawTokenCount}</code></div>
                    {analysisImportFeedback.permissiveSummary.reconstructedSourceText && <div><span>Source</span><code>Reconstructed from token surfaces and punctuation</code></div>}
                    {analysisImportFeedback.permissiveSummary.ignoredDeclaredLanguage && <div><span>Language</span><code>Kept the active {languageConfig.englishLabel} workspace; ignored {analysisImportFeedback.permissiveSummary.ignoredDeclaredLanguage}</code></div>}
                    {analysisImportFeedback.permissiveSummary.generatedIdCount > 0 && <div><span>Generated safe IDs</span><code>{analysisImportFeedback.permissiveSummary.generatedIdCount}</code></div>}
                    {analysisImportFeedback.permissiveSummary.duplicateIdCount > 0 && <div><span>Duplicate IDs repaired</span><code>{analysisImportFeedback.permissiveSummary.duplicateIdCount}</code></div>}
                    {analysisImportFeedback.permissiveSummary.skippedEntryCount > 0 && <div><span>Unusable entries skipped</span><code>{analysisImportFeedback.permissiveSummary.skippedEntryCount}</code></div>}
                    {analysisImportFeedback.permissiveSummary.invalidFields.length > 0 && (
                      <div>
                        <span>Invalid optional fields ignored</span>
                        <ul>
                          {analysisImportFeedback.permissiveSummary.invalidFields.map((field, index) => (
                            <li key={`${field.tokenId}-${field.field}-${index}`}><code>{field.tokenId}.{field.field}</code> — {field.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </section>
          )}
          <div className="modal-actions json-workspace-actions">
            <button className="danger-action" type="button" onClick={deleteAllImportedJson}>Delete all JSON & start blank</button>
            <button className="secondary-action" onClick={() => {
              setAnalysisImportFilename("");
              updateJsonDraft(JSON.stringify(getLanguageSample(language), null, 2));
            }}>Load language sample</button>
            <button className="primary-action" onClick={importJson} disabled={!jsonWorkspace?.draftText.trim()}>
              Load Analysis into Preview
            </button>
          </div>
          <p className="json-workspace-safety">Manual AI JSON is parsed as untrusted data. STOA loads usable surface tokens in JSON order, safely repairs IDs, and ignores malformed optional fields independently. The previous preview remains available through Undo; Guided Chunk Analysis and Project Import keep their stricter validation.</p>
        </Modal>
      )}

      {settingsOpen && (
        <Modal
          eyebrow="STOA SETTINGS"
          title="Preferences"
          subtitle="Manage device-local interface preferences. These settings are never included in a portable STOA project."
          onClose={() => setSettingsOpen(false)}
        >
          <section className="settings-preference-card">
            <div>
              <span>EXPERIMENTAL FEATURES</span>
              <b>OMNI entry warning</b>
              <p>{omniWarningDismissed
                ? "Suppressed on this device. You can restore the warning for the next OMNI entry."
                : "Enabled. STOA will explain OMNI's experimental limitations before entry."}</p>
            </div>
            <button
              type="button"
              onClick={restoreOmniWarning}
              disabled={!omniWarningDismissed}
            >Restore OMNI warning</button>
          </section>
        </Modal>
      )}

      {desktopHelpOpen && (
        <Modal
          eyebrow="STOA DESKTOP"
          title="Document workflow"
          subtitle="Native macOS document commands operate on the currently selected STOA workspace"
          onClose={() => setDesktopHelpOpen(false)}
        >
          <div className="desktop-help-grid">
            <section><b>New and Open</b><p>Use File → New for a blank document, New from Bundled Sample for a fresh developer-defined sample, or Open/Open Recent for an existing STOA project.</p></section>
            <section><b>Save</b><p>Command/Ctrl-S updates the associated project file. Shift-Command/Ctrl-S chooses a new file. Open accepts STOA projects created by either the Web or Desktop edition.</p></section>
            <section><b>Independent workspaces</b><p>Ancient Greek, Latin, Classical Chinese, and OMNI keep separate files, dirty states, and Undo/Redo histories.</p></section>
            <section><b>Safe closing</b><p>Close or Quit checks only modified workspaces and offers Save, Don&apos;t Save, or Cancel before any work can be discarded.</p></section>
          </div>
          <div className="modal-actions">
            <button className="primary-action" type="button" onClick={() => setDesktopHelpOpen(false)}>Done</button>
          </div>
        </Modal>
      )}

      {omniWarningPending && (
        <Modal
          eyebrow="EXPERIMENTAL WORKSPACE"
          title={OMNI_EXPERIMENTAL_WARNING.title}
          subtitle="Please review these limits before entering the OMNI workspace."
          role="alertdialog"
          initialFocus="primary"
          closeLabel={OMNI_EXPERIMENTAL_WARNING.cancelLabel}
          onClose={cancelOmniTransition}
        >
          <div className="omni-warning-body">
            <div className="omni-warning-mark" aria-hidden="true">∞</div>
            <p>{OMNI_EXPERIMENTAL_WARNING.body}</p>
          </div>
          <label className="omni-warning-suppress">
            <input
              type="checkbox"
              checked={suppressOmniWarning}
              onChange={(event) => setSuppressOmniWarning(event.target.checked)}
            />
            <span>{OMNI_EXPERIMENTAL_WARNING.suppressLabel}</span>
          </label>
          <div className="modal-actions omni-warning-actions">
            <button type="button" className="secondary-action" onClick={cancelOmniTransition}>
              {OMNI_EXPERIMENTAL_WARNING.cancelLabel}
            </button>
            <button
              type="button"
              className="primary-action"
              data-modal-primary
              onClick={continueOmniTransition}
            >{OMNI_EXPERIMENTAL_WARNING.continueLabel}</button>
          </div>
        </Modal>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
      <style>{`@media print { @page { size: ${settings.paperWidthMm}mm ${settings.paperHeightMm}mm; margin: 0; } }`}</style>
    </main>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  mixed = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  mixed?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`range-control ${mixed ? "mixed-control" : ""}`}>
      <span>
        {label}
        <span className="precision-value">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={mixed ? "" : value}
            placeholder={mixed ? "Mixed" : undefined}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <code>{mixed ? `mixed · ${suffix}` : suffix}</code>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={mixed ? `Mixed values; editing sets all selected tokens to ${value} ${suffix}` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  mixed = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  mixed?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`number-control ${mixed ? "mixed-control" : ""}`}>
      <span>{label}</span>
      <span>
        <input
          type="number"
          value={mixed ? "" : value}
          placeholder={mixed ? "Mixed" : undefined}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <code>{mixed ? `mixed · ${suffix}` : suffix}</code>
      </span>
    </label>
  );
}

function TokenNotesEditor({
  tokenId,
  allNotes,
  tokenNotes,
  onAdd,
  onUpdate,
  onMove,
  onDelete,
}: {
  tokenId: string;
  allNotes: readonly AnalysisNote[];
  tokenNotes: readonly AnalysisNote[];
  onAdd: (text: string, requestedPosition: number) => void;
  onUpdate: (noteId: string, text: string) => void;
  onMove: (noteId: string, requestedPosition: number) => void;
  onDelete: (noteId: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(tokenNotes.map((note) => [note.id, note.text])));
  const [positionDrafts, setPositionDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(tokenNotes.map((note) => [
      note.id,
      String(allNotes.findIndex((candidate) => candidate.id === note.id) + 1),
    ])));
  const [newText, setNewText] = useState("");
  const [newPosition, setNewPosition] = useState(() => String(allNotes.length + 1));
  const [validationMessage, setValidationMessage] = useState("");

  const commitText = (note: AnalysisNote) => {
    const value = (drafts[note.id] ?? note.text).trim();
    if (!value) {
      setDrafts((current) => ({ ...current, [note.id]: note.text }));
      setValidationMessage("A note cannot be empty. Use Delete to remove it.");
      return;
    }
    setValidationMessage("");
    if (value !== note.text) onUpdate(note.id, value);
  };

  const commitPosition = (note: AnalysisNote) => {
    const currentPosition = allNotes.findIndex((candidate) => candidate.id === note.id) + 1;
    const requested = Number(positionDrafts[note.id]);
    if (!Number.isFinite(requested)) {
      setPositionDrafts((current) => ({ ...current, [note.id]: String(currentPosition) }));
      return;
    }
    const normalizedPosition = Math.min(allNotes.length, Math.max(1, Math.round(requested)));
    setPositionDrafts((current) => ({ ...current, [note.id]: String(normalizedPosition) }));
    if (normalizedPosition !== currentPosition) onMove(note.id, normalizedPosition);
  };

  const addNote = () => {
    const value = newText.trim();
    if (!value) {
      setValidationMessage("Write the scholarly note before adding it.");
      return;
    }
    const requested = Number(newPosition);
    onAdd(value, Number.isFinite(requested) ? requested : allNotes.length + 1);
    setNewText("");
    setNewPosition(String(allNotes.length + 2));
    setValidationMessage("");
  };

  return (
    <section className="token-notes-editor" aria-labelledby={`token-notes-${tokenId}`}>
      <div className="token-notes-heading">
        <div>
          <span id={`token-notes-${tokenId}`}>Scholarly notes</span>
          <small>Formal English notes; numbering follows document order.</small>
        </div>
        <b>{tokenNotes.length}</b>
      </div>
      {tokenNotes.length > 0 && (
        <div className="token-note-editor-list">
          {tokenNotes.map((note) => {
            const ordinal = allNotes.findIndex((candidate) => candidate.id === note.id) + 1;
            return (
              <article className="token-note-editor-row" key={note.id}>
                <label className="token-note-position">
                  <span>No.</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, allNotes.length)}
                    value={positionDrafts[note.id] ?? String(ordinal)}
                    onChange={(event) => setPositionDrafts((current) => ({ ...current, [note.id]: event.target.value }))}
                    onBlur={() => commitPosition(note)}
                    aria-label={`Publication number for note ${ordinal}`}
                  />
                </label>
                <label className="token-note-copy">
                  <span>Note text</span>
                  <textarea
                    rows={3}
                    value={drafts[note.id] ?? note.text}
                    onChange={(event) => setDrafts((current) => ({ ...current, [note.id]: event.target.value }))}
                    onBlur={() => commitText(note)}
                  />
                </label>
                <button
                  type="button"
                  className="token-note-delete"
                  onClick={() => onDelete(note.id)}
                  aria-label={`Delete scholarly note ${ordinal}`}
                >Delete</button>
              </article>
            );
          })}
        </div>
      )}
      <div className="token-note-add-row">
        <label className="token-note-position">
          <span>Insert as no.</span>
          <input
            type="number"
            min={1}
            max={allNotes.length + 1}
            value={newPosition}
            onChange={(event) => setNewPosition(event.target.value)}
          />
        </label>
        <label className="token-note-copy">
          <span>New note</span>
          <textarea
            rows={3}
            value={newText}
            placeholder="Add a concise interpretive, textual, or linguistic note in scholarly English."
            onChange={(event) => setNewText(event.target.value)}
          />
        </label>
        <button type="button" disabled={!newText.trim()} onClick={addNote}>Add note</button>
      </div>
      {validationMessage && <p className="token-note-validation" role="alert">{validationMessage}</p>}
    </section>
  );
}

function TokenCard({
  item,
  language,
  selected,
  focusable,
  settings,
  onSelect,
  onSelectionKeyDown,
  onLookup,
  onLookupFromKeyboard,
}: {
  item: GreekToken;
  language: TextLanguage;
  selected: boolean;
  focusable: boolean;
  settings: StudioSettings;
  onSelect?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelectionKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onLookup?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onLookupFromKeyboard?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  const hideDetails = hideDetailsForToken(item, settings);
  const layers = resolvedTokenLayers(item, settings, language);
  const omniDirection = settings.omni?.direction;
  const layerClassName: Record<RenderedTokenLayerName, string> = {
    pronunciation: "word-pronunciation",
    source: "greek-word",
    gloss: "word-gloss",
    lemma: "word-lemma",
    pos: "word-pos",
    morphology: "word-morph",
  };

  return (
    <button
      id={settings.omni ? undefined : tokenNoteDestination(item.id)}
      className={`token-card ${selected ? "selected" : ""}`}
      data-stoa-token-id={item.id}
      onClick={onSelect}
      onContextMenu={onLookup}
      onKeyDown={(event) => {
        onSelectionKeyDown?.(event);
        if (event.defaultPrevented) return;
        if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
          event.preventDefault();
          onLookupFromKeyboard?.(event);
        }
      }}
      aria-haspopup={onLookup ? "dialog" : undefined}
      aria-pressed={selected}
      dir="ltr"
      title={onLookup
        ? `${hideDetails ? getTokenSourceText(item) : `${item.lemma} · ${item.pos}`} · Right-click for dictionary`
        : hideDetails ? getTokenSourceText(item) : `${item.lemma} · ${item.pos}`}
      tabIndex={onSelect && focusable ? 0 : -1}
    >
      {layers.map((layer) => (
        <span
          key={layer.layer}
          className={layerClassName[layer.layer]}
          dir={layer.layer === "pronunciation"
            ? "ltr"
            : omniDirection && (layer.layer === "source" || layer.layer === "lemma")
            ? omniDirection
            : "ltr"}
          style={{
            fontFamily: layer.style.fontFamily,
            fontSize: `${layer.style.sizePt}pt`,
            color: layer.style.color,
            fontWeight: layer.style.bold ? 700 : 400,
            fontStyle: layer.style.italic ? "italic" : "normal",
            textDecoration: layer.style.underline ? "underline" : "none",
            textDecorationThickness: layer.style.underline ? "from-font" : undefined,
            textUnderlineOffset: layer.style.underline ? "0.12em" : undefined,
            lineHeight: layer.lineHeight,
            marginBottom: `${layer.gapAfterPx}px`,
            unicodeBidi: layer.layer === "pronunciation"
              ? "isolate"
              : omniDirection && (layer.layer === "source" || layer.layer === "lemma")
              ? "isolate"
              : undefined,
          }}
        >
          {layer.text}
          {layer.layer === "source" && item.noteNumbers?.length ? (
            <sup
              className="token-note-marker"
              data-note-destinations={item.noteNumbers.join(",")}
              title={`Scholarly note${item.noteNumbers.length === 1 ? "" : "s"} ${item.noteNumbers.join(", ")}`}
              aria-label={`Scholarly note${item.noteNumbers.length === 1 ? "" : "s"} ${item.noteNumbers.join(", ")}`}
            >{item.noteNumbers.join(",")}</sup>
          ) : null}
        </span>
      ))}
    </button>
  );
}

function Toggle({
  label,
  checked,
  disabled = false,
  title,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`toggle-control ${disabled ? "is-disabled" : ""}`} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          if (!disabled) onChange(event.target.checked);
        }}
      />
      <span className="toggle-track"><i /></span>
      <b>{label}</b>
    </label>
  );
}

function ManualChunkCard({
  chunk,
  chunkCount,
  response,
  disabled,
  onResponseChange,
  onCopyPrompt,
  onDownloadPrompt,
  onValidate,
}: {
  chunk: ManualAnalysisChunk;
  chunkCount: number;
  response: string;
  disabled: boolean;
  onResponseChange: (value: string) => void;
  onCopyPrompt: () => void;
  onDownloadPrompt: () => void;
  onValidate: () => void;
}) {
  const isRetry = chunk.attempt > 0 || chunk.targetTokenIds.length < chunk.tokens.length;
  const firstToken = chunk.tokens[0];
  const lastToken = chunk.tokens[chunk.tokens.length - 1];
  const sourceExcerpt = chunk.tokens
    .slice(0, 14)
    .map((token) => `${token.punctuationBefore}${token.surface}${token.punctuationAfter}`)
    .join(" ");
  const diagnostics = chunk.diagnostics;
  const warnings = [
    diagnostics.repairedJson ? "Safe JSON repair applied" : "",
    diagnostics.missingTokenIds.length ? `${diagnostics.missingTokenIds.length} missing` : "",
    diagnostics.duplicateTokenIds.length ? `${diagnostics.duplicateTokenIds.length} duplicated` : "",
    diagnostics.surfaceMismatchTokenIds.length ? `${diagnostics.surfaceMismatchTokenIds.length} source mismatch` : "",
    diagnostics.outOfOrderTokenIds.length ? "Order corrected locally" : "",
    diagnostics.unknownTokenIds.length ? `${diagnostics.unknownTokenIds.length} unrequested IDs ignored` : "",
  ].filter(Boolean);

  return (
    <section className={`manual-chunk-card ${isRetry ? "is-retry" : ""}`}>
      <div className="manual-chunk-heading">
        <div>
          <span>{isRetry ? "TARGETED RETRY" : "ACTIVE WORK SLOT"}</span>
          <h3>Chunk {String(chunk.index + 1).padStart(2, "0")} / {String(chunkCount).padStart(2, "0")}</h3>
        </div>
        <div className="manual-token-range">
          <b>{chunk.targetTokenIds.length}</b>
          <span>{isRetry ? "IDs to retry" : "tokens"}</span>
        </div>
      </div>
      <p className="manual-source-excerpt" title={`${firstToken.id} — ${lastToken.id}`}>
        {sourceExcerpt}{chunk.tokens.length > 14 ? " …" : ""}
      </p>
      <div className="manual-chunk-integrity">
        <span>{firstToken.id.slice(-5)}–{lastToken.id.slice(-5)}</span>
        <span>{chunk.sentenceAlignedEnd ? "Sentence-aligned" : "Balanced hard cut"}</span>
        {chunk.acceptedTokens.length > 0 && <span>{chunk.acceptedTokens.length} analyses retained</span>}
      </div>
      <div className="manual-prompt-actions">
        <button type="button" onClick={onCopyPrompt} disabled={disabled}>Copy {isRetry ? "retry " : ""}prompt</button>
        <button type="button" onClick={onDownloadPrompt} disabled={disabled}>Download .txt</button>
      </div>
      <label className="manual-response-field">
        <span>Paste this chunk&apos;s complete AI response</span>
        <textarea
          value={response}
          onChange={(event) => onResponseChange(event.target.value.slice(0, 2_000_000))}
          placeholder={'Paste raw JSON, a fenced JSON block, or a response with explanatory text around the JSON. STOA will extract the JSON body locally.'}
          spellCheck={false}
          readOnly={disabled}
          aria-label={`AI response for chunk ${chunk.index + 1}`}
        />
      </label>
      {chunk.lastError && (
        <div className="manual-chunk-error" role="alert">
          <b>{chunk.lastError.code === "wrong-chunk" ? "Wrong chunk response" : "Targeted retry required"}</b>
          <span>{chunk.lastError.message}</span>
          {chunk.lastError.tokenIds.length > 0 && <small>{chunk.lastError.tokenIds.length} affected token ID{chunk.lastError.tokenIds.length === 1 ? "" : "s"}</small>}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="manual-diagnostic-list">
          {warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      )}
      <button
        className="manual-validate-button"
        type="button"
        onClick={onValidate}
        disabled={disabled || !response.trim()}
      >Validate response locally</button>
    </section>
  );
}

function Modal({
  eyebrow = "STOA WORKSPACE",
  title,
  subtitle,
  wide = false,
  styleEditor = false,
  role = "dialog",
  initialFocus = "close",
  closeLabel = "Close",
  onClose,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  wide?: boolean;
  styleEditor?: boolean;
  role?: "dialog" | "alertdialog";
  initialFocus?: "close" | "primary";
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const preferred = initialFocus === "primary"
      ? cardRef.current?.querySelector<HTMLElement>("[data-modal-primary]")
      : closeButtonRef.current;
    preferred?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((item) => item.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1) as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [initialFocus]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={cardRef}
        className={`modal-card ${wide ? "modal-card-wide" : ""} ${styleEditor ? "modal-card-style-editor" : ""}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{subtitle}</p>
          </div>
          <button ref={closeButtonRef} className="close-button" onClick={onClose} aria-label={closeLabel}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
