/**
 * Lossless codec for portable STOA project documents.
 *
 * Schema v1 is the immutable compatibility baseline used by STOA 4.x. Schema
 * v2 introduces a shared five-layer token-style model, schema v3 adds explicit
 * experimental OMNI document metadata, and schema v4 adds versioned OMNI
 * language-detection/profile metadata plus explicit indeclinability. Schema v5
 * adds token-anchored scholarly notes and their publication visibility. Schema
 * v6 adds optional Pinyin/romanization data plus restricted pronunciation
 * typography and visibility without changing the five Details layers. Every
 * supported schema keeps unrecognized JSON in a sidecar so parsing and
 * re-serializing never narrows extensions that this release does not understand.
 */

import {
  TOKEN_GAP_ANCHORS,
  TOKEN_STYLE_LAYERS,
  deriveDocumentTokenStyleDefaults,
  legacyTokenStyleOverride,
  type DocumentTokenStyle,
  type SparseTokenTextStyle,
  type TokenGapAnchor,
  type TokenStyleLayer,
  type TokenStyleOverride,
  type TokenTextStyle,
} from "./token-style";
import {
  OMNI_LANGUAGE_PROFILE,
  STOA_OMNI_PROFILE_ID,
  createOmniDocumentConfig,
  type OmniDocumentConfig,
  type OmniTextDirection,
  type OmniTokenizationOrigin,
  type OmniWritingMode,
} from "./omni-language";
import {
  DEFAULT_OMNI_LANGUAGE_DETECTION,
  OMNI_LANGUAGE_DETECTION_SCHEMA_VERSION,
  STOA_GENERIC_MORPHOLOGY_STANDARD_ID,
  type OmniAnalysisProfile,
  type OmniLanguageDetection,
  type OmniManualLanguageOverride,
} from "./omni-language-profiles";
import type { UserFontReference } from "./user-fonts";
import type { AnalysisNote } from "./analysis-notes";
import { clampPronunciationSize } from "./pronunciation";

export type StoaJsonPrimitive = string | number | boolean | null;
export type StoaJsonValue = StoaJsonPrimitive | StoaJsonObject | StoaJsonValue[];
export type StoaJsonObject = { [key: string]: StoaJsonValue };

export type StoaProjectBreakAfter = "none" | "line" | "paragraph";

export const STOA_TOKEN_STYLE_LAYERS = TOKEN_STYLE_LAYERS;
export const STOA_TOKEN_STYLE_GAPS = TOKEN_GAP_ANCHORS;

export type StoaProjectTokenStyleLayer = TokenStyleLayer;
export type StoaProjectTokenStyleGap = TokenGapAnchor;
export type StoaProjectLayerStyle = TokenTextStyle;
export type StoaProjectLayerStyleOverride = SparseTokenTextStyle;
export type StoaProjectTokenStyle = DocumentTokenStyle;
export type StoaProjectTokenStyleOverrides = TokenStyleOverride;
export type StoaProjectOmniSettings = OmniDocumentConfig & Readonly<{
  languageDetection: OmniLanguageDetection;
  analysisProfile: OmniAnalysisProfile;
  morphologyStandard: string;
  manualLanguageOverride: OmniManualLanguageOverride;
}>;

export type StoaProjectToken = {
  id: string;
  surface: string;
  punctuationBefore: string;
  punctuationAfter: string;
  lemma: string;
  gloss: string;
  pos: string;
  morphology: string;
  features: StoaJsonObject;
  confidence: number;
  alternatives: StoaJsonValue[];
  /** Schema-v4 internal behavior metadata; never an additional visible row. */
  isIndeclinable?: boolean;
  breakAfter?: StoaProjectBreakAfter;
  blankLinesAfter?: number;
  blankLineSpacing?: number;
  separatorAfter?: string;
  sourceStart?: number;
  sourceEnd?: number;

  /** Schema-v2 style data. */
  styleOverrides?: StoaProjectTokenStyleOverrides;

  /**
   * Schema-v1 style fields. Schema v2 continues to accept and preserve these
   * for compatibility, while the explicit migration moves them into the
   * sparse `styleOverrides` object.
   */
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
  /** Schema-v6 pronunciation rows, stored separately from the five Details layers. */
  pinyin?: string;
  romanization?: string;
  pronunciationSize?: number;
  pronunciationColor?: string;
};

export type StoaProjectAnalysis = {
  language: string;
  sourceText: string;
  literalTranslation: string;
  naturalTranslation: string;
  tokens: StoaProjectToken[];
  notes: AnalysisNote[];
  /** Optional schema-v4 analysis metadata. Older documents remain valid without it. */
  languageDetection?: OmniLanguageDetection;
  analysisProfile?: OmniAnalysisProfile;
  morphologyStandard?: string;
};

export type StoaProjectSettings = {
  /** Schema-v2+ document defaults. Required by `StoaProjectV2` and v3. */
  tokenStyle?: StoaProjectTokenStyle;

  /** Optional complete metadata introduced by schema v3. */
  omni?: StoaProjectOmniSettings;
  /** Schema-v3 annotation language for Classical Chinese documents. */
  annotationTarget?: "english" | "chinese";
  /** Schema-v3 device-library references; font bytes are never redistributed. */
  fontReferences?: UserFontReference[];

  /** Schema-v1/default-layout fields retained for backward compatibility. */
  greekSize?: number;
  glossSize?: number;
  lemmaSize?: number;
  posSize?: number;
  morphSize?: number;
  translationSize?: number;
  translationFont?: string;
  translationColor?: string;
  translationBold?: boolean;
  translationItalic?: boolean;
  translationUnderline?: boolean;
  wordGap?: number;
  lineGap?: number;
  greekFont?: string;
  englishFont?: string;
  lemmaFont?: string;
  morphFont?: string;
  paperPreset?: string;
  orientation?: "portrait" | "landscape";
  paperWidthMm?: number;
  paperHeightMm?: number;
  marginTopMm?: number;
  marginRightMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  headerLeft?: string;
  headerRight?: string;
  footerLeft?: string;
  footerRight?: string;
  background?: string;
  ink?: string;
  accent?: string;
  showLemma?: boolean;
  showPos?: boolean;
  hideIndeclinableDetails?: boolean;
  showTranslation?: boolean;
  showNotes?: boolean;
  showNoteMarkers?: boolean;
  showPronunciation?: boolean;
};

export type StoaProjectDocument = {
  language: string;
  sourceText: string;
  selectedTokenId: string | null;
  analysis: StoaProjectAnalysis;
  settings: StoaProjectSettings;
};

export type StoaProjectV1 = {
  format: "stoa-project";
  schemaVersion: 1;
  appVersion: string;
  exportedAt: string;
  document: StoaProjectDocument;
};

export type StoaProjectV2 = {
  format: "stoa-project";
  schemaVersion: 2;
  appVersion: string;
  exportedAt: string;
  /** The codec enforces a complete `settings.tokenStyle` at runtime. */
  document: StoaProjectDocument;
};

export type StoaProjectV3 = {
  format: "stoa-project";
  schemaVersion: 3;
  appVersion: string;
  exportedAt: string;
  /** The codec enforces tokenStyle and OMNI metadata requirements at runtime. */
  document: StoaProjectDocument;
};

export type StoaProjectV4 = {
  format: "stoa-project";
  schemaVersion: 4;
  appVersion: string;
  exportedAt: string;
  /** The codec enforces tokenStyle and complete v4 OMNI settings at runtime. */
  document: StoaProjectDocument;
};

export type StoaProjectV5 = {
  format: "stoa-project";
  schemaVersion: 5;
  appVersion: string;
  exportedAt: string;
  /** Schema v5 stores scholarly notes as stable token-anchored objects. */
  document: StoaProjectDocument;
};

export type StoaProjectV6 = {
  format: "stoa-project";
  schemaVersion: 6;
  appVersion: string;
  exportedAt: string;
  /** Schema v6 adds reading-aid data while retaining the five Details layers. */
  document: StoaProjectDocument;
};

export type StoaProject = StoaProjectV1 | StoaProjectV2 | StoaProjectV3 | StoaProjectV4 | StoaProjectV5 | StoaProjectV6;
export type StoaProjectSchemaVersion = StoaProject["schemaVersion"];

export type PreservedStoaTokenStyleFields = {
  present: boolean;
  root: StoaJsonObject;
  layers: StoaJsonObject;
  layerByName: Partial<Record<StoaProjectTokenStyleLayer, StoaJsonObject>>;
  gapAfterPx: StoaJsonObject;
  pronunciation: StoaJsonObject;
  hadLayers: boolean;
  hadGapAfterPx: boolean;
  hadPronunciation: boolean;
};

/** Unknown JSON is kept out of the public project payload until serialization. */
export type PreservedStoaProjectFields = {
  root: StoaJsonObject;
  document: StoaJsonObject;
  analysis: StoaJsonObject;
  settings: StoaJsonObject;
  tokenById: Record<string, StoaJsonObject>;
  settingsTokenStyle?: PreservedStoaTokenStyleFields;
  settingsOmni?: StoaJsonObject;
  analysisLanguageDetection?: StoaJsonObject;
  settingsOmniLanguageDetection?: StoaJsonObject;
  settingsOmniManualLanguageOverride?: StoaJsonObject;
  tokenStyleOverridesById: Record<string, PreservedStoaTokenStyleFields>;
  noteById: Record<string, StoaJsonObject>;
};

/**
 * Canonical, lossless in-memory representation of a supported project.
 * `sourceSchemaVersion` records provenance and can therefore remain 1 after an
 * explicit migration; `project.schemaVersion` is the schema that will emit.
 */
export type ParsedStoaProject = {
  sourceSchemaVersion: StoaProjectSchemaVersion;
  project: StoaProject;
  preserved: PreservedStoaProjectFields;
};

export type StoaProjectCodecErrorCode =
  | "invalid-json"
  | "invalid-project"
  | "unsupported-schema"
  | "duplicate-token-id"
  | "duplicate-note-id";

export class StoaProjectCodecError extends Error {
  readonly code: StoaProjectCodecErrorCode;
  readonly path: string;

  constructor(code: StoaProjectCodecErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "StoaProjectCodecError";
    this.code = code;
    this.path = path;
  }
}

export const STOA_PROJECT_FORMAT = "stoa-project" as const;
export const STOA_PROJECT_V1_SCHEMA = 1 as const;
export const STOA_PROJECT_V2_SCHEMA = 2 as const;
export const STOA_PROJECT_V3_SCHEMA = 3 as const;
export const STOA_PROJECT_V4_SCHEMA = 4 as const;
export const STOA_PROJECT_V5_SCHEMA = 5 as const;
export const STOA_PROJECT_V6_SCHEMA = 6 as const;
export const STOA_PROJECT_LATEST_SCHEMA = STOA_PROJECT_V6_SCHEMA;

const ROOT_KEYS = new Set(["format", "schemaVersion", "appVersion", "exportedAt", "document"]);
const DOCUMENT_KEYS = new Set(["language", "sourceText", "selectedTokenId", "analysis", "settings"]);
const ANALYSIS_V1_TO_V3_KEYS = new Set([
  "language",
  "sourceText",
  "literalTranslation",
  "naturalTranslation",
  "tokens",
  "notes",
]);
const ANALYSIS_V4_KEYS = new Set([
  ...ANALYSIS_V1_TO_V3_KEYS,
  "languageDetection",
  "analysisProfile",
  "morphologyStandard",
]);
const ANALYSIS_V5_KEYS = ANALYSIS_V4_KEYS;
const ANALYSIS_V6_KEYS = ANALYSIS_V5_KEYS;
const NOTE_KEYS = new Set(["id", "tokenId", "text"]);
const TOKEN_BASE_KEYS = [
  "id",
  "surface",
  "punctuationBefore",
  "punctuationAfter",
  "lemma",
  "gloss",
  "pos",
  "morphology",
  "features",
  "confidence",
  "alternatives",
  "breakAfter",
  "blankLinesAfter",
  "blankLineSpacing",
  "wordFont",
  "wordSize",
  "wordColor",
  "wordBold",
  "wordItalic",
  "wordUnderline",
  "lemmaColor",
  "lemmaUnderline",
  "morphColor",
  "morphUnderline",
  "separatorAfter",
  "sourceStart",
  "sourceEnd",
] as const;
const TOKEN_V1_KEYS = new Set<string>(TOKEN_BASE_KEYS);
const TOKEN_V2_KEYS = new Set<string>([...TOKEN_BASE_KEYS, "styleOverrides"]);
const TOKEN_V3_KEYS = TOKEN_V2_KEYS;
const TOKEN_V4_KEYS = new Set<string>([...TOKEN_V3_KEYS, "isIndeclinable"]);
const TOKEN_V5_KEYS = TOKEN_V4_KEYS;
const TOKEN_V6_KEYS = new Set<string>([
  ...TOKEN_V5_KEYS,
  "pinyin",
  "romanization",
  "pronunciationSize",
  "pronunciationColor",
]);
const NUMBER_SETTING_KEYS = [
  "greekSize",
  "glossSize",
  "lemmaSize",
  "posSize",
  "morphSize",
  "translationSize",
  "wordGap",
  "lineGap",
  "paperWidthMm",
  "paperHeightMm",
  "marginTopMm",
  "marginRightMm",
  "marginBottomMm",
  "marginLeftMm",
] as const;
const STRING_SETTING_KEYS = [
  "translationFont",
  "translationColor",
  "greekFont",
  "englishFont",
  "lemmaFont",
  "morphFont",
  "paperPreset",
  "headerLeft",
  "headerRight",
  "footerLeft",
  "footerRight",
  "background",
  "ink",
  "accent",
] as const;
const LEGACY_BOOLEAN_SETTING_KEYS = [
  "translationBold",
  "translationItalic",
  "translationUnderline",
  "showLemma",
  "showPos",
  "hideIndeclinableDetails",
  "showTranslation",
] as const;
const NOTE_BOOLEAN_SETTING_KEYS = [
  "showNotes",
  "showNoteMarkers",
] as const;
const PRONUNCIATION_BOOLEAN_SETTING_KEYS = ["showPronunciation"] as const;
const BOOLEAN_SETTING_KEYS = [
  ...LEGACY_BOOLEAN_SETTING_KEYS,
  ...NOTE_BOOLEAN_SETTING_KEYS,
] as const;
const V6_BOOLEAN_SETTING_KEYS = [
  ...BOOLEAN_SETTING_KEYS,
  ...PRONUNCIATION_BOOLEAN_SETTING_KEYS,
] as const;
const SETTINGS_V1_KEYS = new Set<string>([
  ...NUMBER_SETTING_KEYS,
  ...STRING_SETTING_KEYS,
  ...LEGACY_BOOLEAN_SETTING_KEYS,
  "orientation",
]);
const SETTINGS_V2_KEYS = new Set<string>([...SETTINGS_V1_KEYS, "tokenStyle"]);
const SETTINGS_V3_KEYS = new Set<string>([
  ...SETTINGS_V2_KEYS,
  "omni",
  "annotationTarget",
  "fontReferences",
]);
const SETTINGS_V4_KEYS = SETTINGS_V3_KEYS;
const SETTINGS_V5_KEYS = new Set<string>([
  ...SETTINGS_V4_KEYS,
  ...NOTE_BOOLEAN_SETTING_KEYS,
]);
const SETTINGS_V6_KEYS = new Set<string>([
  ...SETTINGS_V5_KEYS,
  ...PRONUNCIATION_BOOLEAN_SETTING_KEYS,
]);
const STYLE_ROOT_KEYS = new Set(["layers", "gapAfterPx", "pronunciation"]);
const STYLE_LAYER_KEYS = new Set<string>(STOA_TOKEN_STYLE_LAYERS);
const STYLE_GAP_KEYS = new Set<string>(STOA_TOKEN_STYLE_GAPS);
const LAYER_STYLE_KEYS = new Set(["fontFamily", "sizePt", "color", "bold", "italic", "underline"]);
const PRONUNCIATION_STYLE_KEYS = new Set(["sizePt", "color"]);
const OMNI_V3_SETTING_KEYS = new Set([
  "profile",
  "languageHint",
  "direction",
  "writingMode",
  "tokenizationOrigin",
  "annotationTarget",
]);
const OMNI_V4_SETTING_KEYS = new Set([
  ...OMNI_V3_SETTING_KEYS,
  "languageDetection",
  "analysisProfile",
  "morphologyStandard",
  "manualLanguageOverride",
]);
const LANGUAGE_DETECTION_KEYS = new Set([
  "schemaVersion",
  "languageId",
  "languageName",
  "script",
  "confidence",
  "isMixedLanguage",
]);
const MANUAL_LANGUAGE_OVERRIDE_KEYS = new Set(["languageId", "confirmed"]);
const OMNI_DIRECTIONS = new Set<string>(OMNI_LANGUAGE_PROFILE.supportedDirections);
const OMNI_WRITING_MODES = new Set<string>(OMNI_LANGUAGE_PROFILE.supportedWritingModes);
const OMNI_TOKENIZATION_ORIGINS = new Set<string>(OMNI_LANGUAGE_PROFILE.tokenizationOrigins);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cloneJsonValue = (
  value: unknown,
  path: string,
  ancestors = new WeakSet<object>(),
): StoaJsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new StoaProjectCodecError("invalid-project", path, "numbers must be finite JSON values");
  }
  if (typeof value !== "object") {
    throw new StoaProjectCodecError("invalid-project", path, "contains a non-JSON value");
  }
  if (ancestors.has(value)) {
    throw new StoaProjectCodecError("invalid-project", path, "contains a circular value");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => cloneJsonValue(item, `${path}[${index}]`, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new StoaProjectCodecError("invalid-project", path, "must be a plain JSON object");
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        cloneJsonValue(item, `${path}.${key}`, ancestors),
      ]),
    );
  } finally {
    ancestors.delete(value);
  }
};

const jsonObject = (value: unknown, path: string): StoaJsonObject => {
  if (!isRecord(value)) {
    throw new StoaProjectCodecError("invalid-project", path, "must be a JSON object");
  }
  return cloneJsonValue(value, path) as StoaJsonObject;
};

const unknownFields = (source: StoaJsonObject, known: Set<string>): StoaJsonObject =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !known.has(key)));

const requiredString = (source: StoaJsonObject, key: string, path: string) => {
  const value = source[key];
  if (typeof value !== "string") {
    throw new StoaProjectCodecError("invalid-project", `${path}.${key}`, "must be a string");
  }
  return value;
};

const requiredNumber = (source: StoaJsonObject, key: string, path: string) => {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StoaProjectCodecError("invalid-project", `${path}.${key}`, "must be a finite number");
  }
  return value;
};

const requiredBoolean = (source: StoaJsonObject, key: string, path: string) => {
  const value = source[key];
  if (typeof value !== "boolean") {
    throw new StoaProjectCodecError("invalid-project", `${path}.${key}`, "must be a boolean");
  }
  return value;
};

const optionalString = (source: StoaJsonObject, key: string, path: string) => {
  if (!Object.hasOwn(source, key)) return undefined;
  return requiredString(source, key, path);
};

const optionalNumber = (source: StoaJsonObject, key: string, path: string) => {
  if (!Object.hasOwn(source, key)) return undefined;
  return requiredNumber(source, key, path);
};

const optionalBoolean = (source: StoaJsonObject, key: string, path: string) => {
  if (!Object.hasOwn(source, key)) return undefined;
  return requiredBoolean(source, key, path);
};

const requiredTrimmedString = (source: StoaJsonObject, key: string, path: string) => {
  const value = requiredString(source, key, path);
  if (!value.trim() || value.trim() !== value) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.${key}`,
      "must be a non-empty trimmed string",
    );
  }
  return value;
};

const parseAnalysisProfile = (
  source: StoaJsonObject,
  key: string,
  path: string,
): OmniAnalysisProfile => {
  const value = requiredString(source, key, path);
  if (value !== "rich-inflectional" && value !== "generic") {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.${key}`,
      "must be rich-inflectional or generic",
    );
  }
  return value;
};

const parseLanguageDetection = (
  value: unknown,
  path: string,
): { detection: OmniLanguageDetection; preserved: StoaJsonObject } => {
  const source = jsonObject(value, path);
  const schemaVersion = requiredNumber(source, "schemaVersion", path);
  if (schemaVersion !== OMNI_LANGUAGE_DETECTION_SCHEMA_VERSION) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.schemaVersion`,
      `must equal ${OMNI_LANGUAGE_DETECTION_SCHEMA_VERSION}`,
    );
  }
  const languageId = requiredTrimmedString(source, "languageId", path);
  const languageName = requiredTrimmedString(source, "languageName", path);
  const script = requiredTrimmedString(source, "script", path);
  if (!/^[A-Z][a-z]{3}$/u.test(script)) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.script`,
      "must be an ISO 15924-compatible four-letter script identifier",
    );
  }
  const confidence = requiredNumber(source, "confidence", path);
  if (confidence < 0 || confidence > 1) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.confidence`,
      "must be between 0 and 1",
    );
  }
  return {
    detection: {
      schemaVersion: OMNI_LANGUAGE_DETECTION_SCHEMA_VERSION,
      languageId,
      languageName,
      script: script as OmniLanguageDetection["script"],
      confidence,
      isMixedLanguage: requiredBoolean(source, "isMixedLanguage", path),
    },
    preserved: unknownFields(source, LANGUAGE_DETECTION_KEYS),
  };
};

const parseManualLanguageOverride = (
  value: unknown,
  path: string,
): {
  override: OmniManualLanguageOverride;
  preserved?: StoaJsonObject;
} => {
  if (value === null) return { override: null };
  const source = jsonObject(value, path);
  return {
    override: {
      languageId: requiredTrimmedString(source, "languageId", path),
      confirmed: requiredBoolean(source, "confirmed", path),
    },
    preserved: unknownFields(source, MANUAL_LANGUAGE_OVERRIDE_KEYS),
  };
};

const createSafeOmniProjectSettings = (
  legacy: OmniDocumentConfig = createOmniDocumentConfig(),
): StoaProjectOmniSettings => ({
  ...legacy,
  languageDetection: { ...DEFAULT_OMNI_LANGUAGE_DETECTION },
  analysisProfile: "generic",
  morphologyStandard: STOA_GENERIC_MORPHOLOGY_STANDARD_ID,
  manualLanguageOverride: null,
});

const parseOmniSettings = (
  value: unknown,
  path: string,
  schemaVersion: 3 | 4 | 5 | 6,
): {
  omni: StoaProjectOmniSettings;
  preserved: StoaJsonObject;
  preservedLanguageDetection?: StoaJsonObject;
  preservedManualLanguageOverride?: StoaJsonObject;
} => {
  const source = jsonObject(value, path);
  const profile = requiredString(source, "profile", path);
  if (profile !== STOA_OMNI_PROFILE_ID) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.profile`,
      `must equal ${JSON.stringify(STOA_OMNI_PROFILE_ID)}`,
    );
  }

  if (!Object.hasOwn(source, "languageHint")) {
    throw new StoaProjectCodecError("invalid-project", `${path}.languageHint`, "is required");
  }
  const languageHintValue = source.languageHint;
  if (languageHintValue !== null && typeof languageHintValue !== "string") {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.languageHint`,
      "must be a string or null",
    );
  }
  if (
    typeof languageHintValue === "string"
    && (!languageHintValue.trim() || languageHintValue.trim() !== languageHintValue)
  ) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.languageHint`,
      "must be null or a non-empty trimmed string",
    );
  }

  const direction = requiredString(source, "direction", path);
  if (!OMNI_DIRECTIONS.has(direction)) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.direction`,
      "must be ltr or rtl",
    );
  }
  const writingMode = requiredString(source, "writingMode", path);
  if (!OMNI_WRITING_MODES.has(writingMode)) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.writingMode`,
      "must be horizontal-tb, vertical-rl, or vertical-lr",
    );
  }
  const tokenizationOrigin = requiredString(source, "tokenizationOrigin", path);
  if (!OMNI_TOKENIZATION_ORIGINS.has(tokenizationOrigin)) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.tokenizationOrigin`,
      "must be model or user",
    );
  }
  const annotationTarget = requiredString(source, "annotationTarget", path);
  if (annotationTarget !== OMNI_LANGUAGE_PROFILE.annotationTarget) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.annotationTarget`,
      `must equal ${JSON.stringify(OMNI_LANGUAGE_PROFILE.annotationTarget)}`,
    );
  }

  const legacy = createOmniDocumentConfig({
      languageHint: languageHintValue,
      direction: direction as OmniTextDirection,
      writingMode: writingMode as OmniWritingMode,
      tokenizationOrigin: tokenizationOrigin as OmniTokenizationOrigin,
    });
  if (schemaVersion === STOA_PROJECT_V3_SCHEMA) {
    return {
      omni: createSafeOmniProjectSettings(legacy),
      preserved: unknownFields(source, OMNI_V3_SETTING_KEYS),
    };
  }

  if (!Object.hasOwn(source, "languageDetection")) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.languageDetection`,
      "is required in schema v4 OMNI settings",
    );
  }
  const languageDetection = parseLanguageDetection(
    source.languageDetection,
    `${path}.languageDetection`,
  );
  if (!Object.hasOwn(source, "manualLanguageOverride")) {
    throw new StoaProjectCodecError(
      "invalid-project",
      `${path}.manualLanguageOverride`,
      "is required in schema v4 OMNI settings",
    );
  }
  const manualLanguageOverride = parseManualLanguageOverride(
    source.manualLanguageOverride,
    `${path}.manualLanguageOverride`,
  );
  return {
    omni: {
      ...legacy,
      languageDetection: languageDetection.detection,
      analysisProfile: parseAnalysisProfile(source, "analysisProfile", path),
      morphologyStandard: requiredTrimmedString(source, "morphologyStandard", path),
      manualLanguageOverride: manualLanguageOverride.override,
    },
    preserved: unknownFields(source, OMNI_V4_SETTING_KEYS),
    preservedLanguageDetection: languageDetection.preserved,
    preservedManualLanguageOverride: manualLanguageOverride.preserved,
  };
};

const parseLayerStyle = (
  source: StoaJsonObject,
  path: string,
  complete: boolean,
): { style: StoaProjectLayerStyle | StoaProjectLayerStyleOverride; preserved: StoaJsonObject } => {
  const fontFamily = complete
    ? requiredString(source, "fontFamily", path)
    : optionalString(source, "fontFamily", path);
  const sizePt = complete
    ? requiredNumber(source, "sizePt", path)
    : optionalNumber(source, "sizePt", path);
  const color = complete
    ? requiredString(source, "color", path)
    : optionalString(source, "color", path);
  const bold = complete
    ? requiredBoolean(source, "bold", path)
    : optionalBoolean(source, "bold", path);
  const italic = complete
    ? requiredBoolean(source, "italic", path)
    : optionalBoolean(source, "italic", path);
  const underline = complete
    ? requiredBoolean(source, "underline", path)
    : optionalBoolean(source, "underline", path);

  if (sizePt !== undefined && sizePt <= 0) {
    throw new StoaProjectCodecError("invalid-project", `${path}.sizePt`, "must be greater than zero");
  }

  const style: StoaProjectLayerStyleOverride = {};
  if (fontFamily !== undefined) style.fontFamily = fontFamily;
  if (sizePt !== undefined) style.sizePt = sizePt;
  if (color !== undefined) style.color = color;
  if (bold !== undefined) style.bold = bold;
  if (italic !== undefined) style.italic = italic;
  if (underline !== undefined) style.underline = underline;
  return {
    style: style as StoaProjectLayerStyle | StoaProjectLayerStyleOverride,
    preserved: unknownFields(source, LAYER_STYLE_KEYS),
  };
};

const emptyPreservedStyle = (present = false): PreservedStoaTokenStyleFields => ({
  present,
  root: {},
  layers: {},
  layerByName: {},
  gapAfterPx: {},
  pronunciation: {},
  hadLayers: false,
  hadGapAfterPx: false,
  hadPronunciation: false,
});

const parseTokenStyle = <Complete extends boolean>(
  value: unknown,
  path: string,
  complete: Complete,
): {
  style: Complete extends true ? StoaProjectTokenStyle : StoaProjectTokenStyleOverrides;
  preserved: PreservedStoaTokenStyleFields;
} => {
  const source = jsonObject(value, path);
  const preserved = emptyPreservedStyle(true);
  preserved.root = unknownFields(source, STYLE_ROOT_KEYS);

  if (complete && !Object.hasOwn(source, "layers")) {
    throw new StoaProjectCodecError("invalid-project", `${path}.layers`, "is required");
  }
  if (complete && !Object.hasOwn(source, "gapAfterPx")) {
    throw new StoaProjectCodecError("invalid-project", `${path}.gapAfterPx`, "is required");
  }

  const layers: Partial<Record<StoaProjectTokenStyleLayer, StoaProjectLayerStyleOverride>> = {};
  if (Object.hasOwn(source, "layers")) {
    preserved.hadLayers = true;
    const layerSource = jsonObject(source.layers, `${path}.layers`);
    preserved.layers = unknownFields(layerSource, STYLE_LAYER_KEYS);
    for (const layer of STOA_TOKEN_STYLE_LAYERS) {
      if (!Object.hasOwn(layerSource, layer)) {
        if (complete) {
          throw new StoaProjectCodecError(
            "invalid-project",
            `${path}.layers.${layer}`,
            "is required",
          );
        }
        continue;
      }
      const parsedLayer = parseLayerStyle(
        jsonObject(layerSource[layer], `${path}.layers.${layer}`),
        `${path}.layers.${layer}`,
        complete,
      );
      layers[layer] = parsedLayer.style;
      preserved.layerByName[layer] = parsedLayer.preserved;
    }
  }

  const gapAfterPx: Partial<Record<StoaProjectTokenStyleGap, number>> = {};
  if (Object.hasOwn(source, "gapAfterPx")) {
    preserved.hadGapAfterPx = true;
    const gapSource = jsonObject(source.gapAfterPx, `${path}.gapAfterPx`);
    preserved.gapAfterPx = unknownFields(gapSource, STYLE_GAP_KEYS);
    for (const gap of STOA_TOKEN_STYLE_GAPS) {
      if (!Object.hasOwn(gapSource, gap)) {
        if (complete) {
          throw new StoaProjectCodecError(
            "invalid-project",
            `${path}.gapAfterPx.${gap}`,
            "is required",
          );
        }
        continue;
      }
      const valueAtGap = requiredNumber(gapSource, gap, `${path}.gapAfterPx`);
      if (valueAtGap < 0) {
        throw new StoaProjectCodecError(
          "invalid-project",
          `${path}.gapAfterPx.${gap}`,
          "must be zero or greater",
        );
      }
      gapAfterPx[gap] = valueAtGap;
    }
  }

  let pronunciation: DocumentTokenStyle["pronunciation"];
  if (Object.hasOwn(source, "pronunciation")) {
    preserved.hadPronunciation = true;
    const pronunciationSource = jsonObject(source.pronunciation, `${path}.pronunciation`);
    preserved.pronunciation = unknownFields(pronunciationSource, PRONUNCIATION_STYLE_KEYS);
    const sizePt = requiredNumber(pronunciationSource, "sizePt", `${path}.pronunciation`);
    const color = requiredString(pronunciationSource, "color", `${path}.pronunciation`);
    if (sizePt <= 0) {
      throw new StoaProjectCodecError(
        "invalid-project",
        `${path}.pronunciation.sizePt`,
        "must be greater than zero",
      );
    }
    if (!/^#[0-9a-f]{6}$/iu.test(color)) {
      throw new StoaProjectCodecError(
        "invalid-project",
        `${path}.pronunciation.color`,
        "must be a six-digit hexadecimal colour",
      );
    }
    pronunciation = { sizePt: clampPronunciationSize(sizePt), color: color.toLowerCase() };
  }

  const style: StoaProjectTokenStyleOverrides = {};
  if (complete || preserved.hadLayers) style.layers = layers;
  if (complete || preserved.hadGapAfterPx) style.gapAfterPx = gapAfterPx;
  if (complete && pronunciation) {
    (style as StoaProjectTokenStyle).pronunciation = pronunciation;
  }
  return {
    style: style as Complete extends true ? StoaProjectTokenStyle : StoaProjectTokenStyleOverrides,
    preserved,
  };
};

const parseToken = (
  source: StoaJsonObject,
  index: number,
  schemaVersion: StoaProjectSchemaVersion,
): {
  token: StoaProjectToken;
  preserved: StoaJsonObject;
  preservedStyleOverrides?: PreservedStoaTokenStyleFields;
} => {
  const path = `$.document.analysis.tokens[${index}]`;
  const features = source.features;
  if (!isRecord(features)) {
    throw new StoaProjectCodecError("invalid-project", `${path}.features`, "must be a JSON object");
  }
  const alternatives = source.alternatives;
  if (!Array.isArray(alternatives)) {
    throw new StoaProjectCodecError("invalid-project", `${path}.alternatives`, "must be an array");
  }
  let breakAfter: StoaProjectBreakAfter | undefined;
  if (Object.hasOwn(source, "breakAfter")) {
    const proposedBreak = requiredString(source, "breakAfter", path);
    if (proposedBreak !== "none" && proposedBreak !== "line" && proposedBreak !== "paragraph") {
      throw new StoaProjectCodecError(
        "invalid-project",
        `${path}.breakAfter`,
        "must be none, line, or paragraph",
      );
    }
    breakAfter = proposedBreak;
  }
  const token: StoaProjectToken = {
    id: requiredString(source, "id", path),
    surface: requiredString(source, "surface", path),
    punctuationBefore: requiredString(source, "punctuationBefore", path),
    punctuationAfter: requiredString(source, "punctuationAfter", path),
    lemma: requiredString(source, "lemma", path),
    gloss: requiredString(source, "gloss", path),
    pos: requiredString(source, "pos", path),
    morphology: requiredString(source, "morphology", path),
    features: cloneJsonValue(features, `${path}.features`) as StoaJsonObject,
    confidence: requiredNumber(source, "confidence", path),
    alternatives: cloneJsonValue(alternatives, `${path}.alternatives`) as StoaJsonValue[],
  };
  if (breakAfter) token.breakAfter = breakAfter;
  if (schemaVersion >= STOA_PROJECT_V4_SCHEMA) {
    const isIndeclinable = optionalBoolean(source, "isIndeclinable", path);
    if (isIndeclinable !== undefined) token.isIndeclinable = isIndeclinable;
  }
  if (schemaVersion >= STOA_PROJECT_V6_SCHEMA) {
    for (const key of ["pinyin", "romanization"] as const) {
      const fieldValue = optionalString(source, key, path);
      if (fieldValue !== undefined) token[key] = fieldValue.normalize("NFC");
    }
    const pronunciationSize = optionalNumber(source, "pronunciationSize", path);
    if (pronunciationSize !== undefined) {
      if (pronunciationSize <= 0) {
        throw new StoaProjectCodecError(
          "invalid-project",
          `${path}.pronunciationSize`,
          "must be greater than zero",
        );
      }
      token.pronunciationSize = clampPronunciationSize(pronunciationSize);
    }
    const pronunciationColor = optionalString(source, "pronunciationColor", path);
    if (pronunciationColor !== undefined) {
      if (!/^#[0-9a-f]{6}$/iu.test(pronunciationColor)) {
        throw new StoaProjectCodecError(
          "invalid-project",
          `${path}.pronunciationColor`,
          "must be a six-digit hexadecimal colour",
        );
      }
      token.pronunciationColor = pronunciationColor.toLowerCase();
    }
  }
  const stringFields = ["wordFont", "wordColor", "lemmaColor", "morphColor", "separatorAfter"] as const;
  for (const key of stringFields) {
    const fieldValue = optionalString(source, key, path);
    if (fieldValue !== undefined) token[key] = fieldValue;
  }
  const numberFields = ["blankLinesAfter", "blankLineSpacing", "wordSize", "sourceStart", "sourceEnd"] as const;
  for (const key of numberFields) {
    const fieldValue = optionalNumber(source, key, path);
    if (fieldValue !== undefined) token[key] = fieldValue;
  }
  const booleanFields = [
    "wordBold",
    "wordItalic",
    "wordUnderline",
    "lemmaUnderline",
    "morphUnderline",
  ] as const;
  for (const key of booleanFields) {
    const fieldValue = optionalBoolean(source, key, path);
    if (fieldValue !== undefined) token[key] = fieldValue;
  }

  let preservedStyleOverrides: PreservedStoaTokenStyleFields | undefined;
  if (schemaVersion !== STOA_PROJECT_V1_SCHEMA && Object.hasOwn(source, "styleOverrides")) {
    const parsedStyle = parseTokenStyle(
      source.styleOverrides,
      `${path}.styleOverrides`,
      false,
    );
    token.styleOverrides = parsedStyle.style;
    preservedStyleOverrides = parsedStyle.preserved;
  }

  return {
    token,
    preserved: unknownFields(
      source,
      schemaVersion === STOA_PROJECT_V1_SCHEMA
        ? TOKEN_V1_KEYS
        : schemaVersion === STOA_PROJECT_V2_SCHEMA
          ? TOKEN_V2_KEYS
          : schemaVersion === STOA_PROJECT_V3_SCHEMA
            ? TOKEN_V3_KEYS
            : schemaVersion === STOA_PROJECT_V4_SCHEMA
              ? TOKEN_V4_KEYS
              : schemaVersion === STOA_PROJECT_V5_SCHEMA
                ? TOKEN_V5_KEYS
                : TOKEN_V6_KEYS,
    ),
    preservedStyleOverrides,
  };
};

const parseFontReferences = (value: StoaJsonValue, path: string): UserFontReference[] => {
  if (!Array.isArray(value)) {
    throw new StoaProjectCodecError("invalid-project", path, "must be an array");
  }
  const ids = new Set<string>();
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      throw new StoaProjectCodecError("invalid-project", itemPath, "must be an object");
    }
    const read = (key: string) => {
      const candidate = item[key];
      if (typeof candidate !== "string" || !candidate.trim() || candidate.length > 300) {
        throw new StoaProjectCodecError("invalid-project", `${itemPath}.${key}`, "must be a non-empty string");
      }
      return candidate;
    };
    const id = read("id");
    if (ids.has(id)) {
      throw new StoaProjectCodecError("invalid-project", `${itemPath}.id`, "duplicates an imported font reference ID");
    }
    ids.add(id);
    const format = read("format");
    if (format !== "ttf" && format !== "otf") {
      throw new StoaProjectCodecError("invalid-project", `${itemPath}.format`, "must be ttf or otf");
    }
    const faceStyle = read("faceStyle");
    if (!["normal", "italic", "bold", "bolditalic"].includes(faceStyle)) {
      throw new StoaProjectCodecError("invalid-project", `${itemPath}.faceStyle`, "is invalid");
    }
    const sha256 = read("sha256");
    if (!/^[0-9a-f]{64}$/iu.test(sha256)) {
      throw new StoaProjectCodecError("invalid-project", `${itemPath}.sha256`, "must be a SHA-256 hex digest");
    }
    const byteLength = item.byteLength;
    if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength <= 0) {
      throw new StoaProjectCodecError("invalid-project", `${itemPath}.byteLength`, "must be a positive integer");
    }
    return {
      id,
      familyId: read("familyId"),
      familyName: read("familyName"),
      subfamilyName: read("subfamilyName"),
      postscriptName: read("postscriptName"),
      cssFamily: read("cssFamily"),
      filename: read("filename"),
      sha256: sha256.toLowerCase(),
      format,
      faceStyle: faceStyle as UserFontReference["faceStyle"],
      byteLength,
    };
  });
};

const parseSettings = (source: StoaJsonObject, schemaVersion: StoaProjectSchemaVersion) => {
  const path = "$.document.settings";
  const settings: StoaProjectSettings = {};
  for (const key of NUMBER_SETTING_KEYS) {
    const value = optionalNumber(source, key, path);
    if (value !== undefined) settings[key] = value;
  }
  for (const key of STRING_SETTING_KEYS) {
    const value = optionalString(source, key, path);
    if (value !== undefined) settings[key] = value;
  }
  const booleanSettingKeys = schemaVersion >= STOA_PROJECT_V6_SCHEMA
    ? V6_BOOLEAN_SETTING_KEYS
    : schemaVersion >= STOA_PROJECT_V5_SCHEMA
      ? BOOLEAN_SETTING_KEYS
      : LEGACY_BOOLEAN_SETTING_KEYS;
  for (const key of booleanSettingKeys) {
    const value = optionalBoolean(source, key, path);
    if (value !== undefined) settings[key] = value;
  }
  const orientation = optionalString(source, "orientation", path);
  if (orientation !== undefined) {
    if (orientation !== "portrait" && orientation !== "landscape") {
      throw new StoaProjectCodecError(
        "invalid-project",
        `${path}.orientation`,
        "must be portrait or landscape",
      );
    }
    settings.orientation = orientation;
  }
  if (schemaVersion >= STOA_PROJECT_V3_SCHEMA && Object.hasOwn(source, "annotationTarget")) {
    const annotationTarget = optionalString(source, "annotationTarget", path);
    if (annotationTarget !== "english" && annotationTarget !== "chinese") {
      throw new StoaProjectCodecError(
        "invalid-project",
        `${path}.annotationTarget`,
        "must be english or chinese",
      );
    }
    settings.annotationTarget = annotationTarget;
  }
  if (schemaVersion >= STOA_PROJECT_V3_SCHEMA && Object.hasOwn(source, "fontReferences")) {
    settings.fontReferences = parseFontReferences(source.fontReferences, `${path}.fontReferences`);
  }

  let settingsTokenStyle: PreservedStoaTokenStyleFields | undefined;
  let settingsOmni: StoaJsonObject | undefined;
  let settingsOmniLanguageDetection: StoaJsonObject | undefined;
  let settingsOmniManualLanguageOverride: StoaJsonObject | undefined;
  if (schemaVersion !== STOA_PROJECT_V1_SCHEMA) {
    if (!Object.hasOwn(source, "tokenStyle")) {
      throw new StoaProjectCodecError(
        "invalid-project",
        `${path}.tokenStyle`,
        "is required in schema v2 or v3",
      );
    }
    const parsedStyle = parseTokenStyle(source.tokenStyle, `${path}.tokenStyle`, true);
    settings.tokenStyle = parsedStyle.style;
    settingsTokenStyle = parsedStyle.preserved;
    if (schemaVersion >= STOA_PROJECT_V3_SCHEMA && Object.hasOwn(source, "omni")) {
      const parsedOmni = parseOmniSettings(
        source.omni,
        `${path}.omni`,
        schemaVersion === STOA_PROJECT_V3_SCHEMA
          ? STOA_PROJECT_V3_SCHEMA
          : schemaVersion === STOA_PROJECT_V4_SCHEMA
            ? STOA_PROJECT_V4_SCHEMA
            : schemaVersion === STOA_PROJECT_V5_SCHEMA
              ? STOA_PROJECT_V5_SCHEMA
              : STOA_PROJECT_V6_SCHEMA,
      );
      settings.omni = parsedOmni.omni;
      settingsOmni = parsedOmni.preserved;
      settingsOmniLanguageDetection = parsedOmni.preservedLanguageDetection;
      settingsOmniManualLanguageOverride = parsedOmni.preservedManualLanguageOverride;
    }
  }
  return {
    settings,
    preserved: unknownFields(
      source,
      schemaVersion === STOA_PROJECT_V1_SCHEMA
        ? SETTINGS_V1_KEYS
        : schemaVersion === STOA_PROJECT_V2_SCHEMA
          ? SETTINGS_V2_KEYS
          : schemaVersion === STOA_PROJECT_V3_SCHEMA
            ? SETTINGS_V3_KEYS
            : schemaVersion === STOA_PROJECT_V4_SCHEMA
              ? SETTINGS_V4_KEYS
              : schemaVersion === STOA_PROJECT_V5_SCHEMA
                ? SETTINGS_V5_KEYS
                : SETTINGS_V6_KEYS,
    ),
    settingsTokenStyle,
    settingsOmni,
    settingsOmniLanguageDetection,
    settingsOmniManualLanguageOverride,
  };
};

const parseProjectForSchema = (
  root: StoaJsonObject,
  schemaVersion: StoaProjectSchemaVersion,
): ParsedStoaProject => {
  const documentSource = jsonObject(root.document, "$.document");
  const analysisSource = jsonObject(documentSource.analysis, "$.document.analysis");
  const settingsSource = jsonObject(documentSource.settings, "$.document.settings");
  if (!Array.isArray(analysisSource.tokens)) {
    throw new StoaProjectCodecError(
      "invalid-project",
      "$.document.analysis.tokens",
      "must be an array",
    );
  }
  if (!Array.isArray(analysisSource.notes)) {
    throw new StoaProjectCodecError(
      "invalid-project",
      "$.document.analysis.notes",
      "must be an array",
    );
  }

  const tokenById: Record<string, StoaJsonObject> = Object.create(null) as Record<string, StoaJsonObject>;
  const tokenStyleOverridesById: Record<string, PreservedStoaTokenStyleFields> = Object.create(null) as Record<string, PreservedStoaTokenStyleFields>;
  const usedTokenIds = new Set<string>();
  const tokens = analysisSource.tokens.map((rawToken, index) => {
    const parsed = parseToken(
      jsonObject(rawToken, `$.document.analysis.tokens[${index}]`),
      index,
      schemaVersion,
    );
    if (usedTokenIds.has(parsed.token.id)) {
      throw new StoaProjectCodecError(
        "duplicate-token-id",
        `$.document.analysis.tokens[${index}].id`,
        `duplicates token ID ${JSON.stringify(parsed.token.id)}`,
      );
    }
    usedTokenIds.add(parsed.token.id);
    tokenById[parsed.token.id] = parsed.preserved;
    if (parsed.preservedStyleOverrides) {
      tokenStyleOverridesById[parsed.token.id] = parsed.preservedStyleOverrides;
    }
    return parsed.token;
  });
  const noteById: Record<string, StoaJsonObject> = Object.create(null) as Record<string, StoaJsonObject>;
  const usedNoteIds = new Set<string>();
  let retainedLegacyNoteCount = 0;
  const notes: AnalysisNote[] = analysisSource.notes.flatMap((rawNote, index): AnalysisNote[] => {
    const path = `$.document.analysis.notes[${index}]`;
    if (schemaVersion < STOA_PROJECT_V5_SCHEMA) {
      if (typeof rawNote !== "string") {
        throw new StoaProjectCodecError("invalid-project", path, "must be a string in schema v1-v4");
      }
      const text = rawNote.trim();
      if (!text) return [];
      retainedLegacyNoteCount += 1;
      return [{
        id: `legacy-note-${String(retainedLegacyNoteCount).padStart(4, "0")}`,
        tokenId: null,
        text,
      }];
    }
    const source = jsonObject(rawNote, path);
    const id = requiredTrimmedString(source, "id", path);
    if (usedNoteIds.has(id)) {
      throw new StoaProjectCodecError(
        "duplicate-note-id",
        `${path}.id`,
        `duplicates note ID ${JSON.stringify(id)}`,
      );
    }
    usedNoteIds.add(id);
    const tokenIdValue = source.tokenId;
    if (tokenIdValue !== null && typeof tokenIdValue !== "string") {
      throw new StoaProjectCodecError("invalid-project", `${path}.tokenId`, "must be a token ID or null");
    }
    const tokenId = typeof tokenIdValue === "string" ? tokenIdValue.trim() : null;
    if (tokenIdValue !== null && (!tokenId || !usedTokenIds.has(tokenId))) {
      throw new StoaProjectCodecError("invalid-project", `${path}.tokenId`, "must reference an existing token ID or be null");
    }
    const text = requiredString(source, "text", path);
    if (!text.trim()) {
      throw new StoaProjectCodecError(
        "invalid-project",
        `${path}.text`,
        "must be a non-empty string",
      );
    }
    noteById[id] = unknownFields(source, NOTE_KEYS);
    return [{ id, tokenId, text }];
  });
  const selectedTokenId = documentSource.selectedTokenId;
  if (selectedTokenId !== null && typeof selectedTokenId !== "string") {
    throw new StoaProjectCodecError(
      "invalid-project",
      "$.document.selectedTokenId",
      "must be a string or null",
    );
  }
  const parsedSettings = parseSettings(settingsSource, schemaVersion);
  const documentLanguage = requiredString(documentSource, "language", "$.document");
  if (
    schemaVersion >= STOA_PROJECT_V3_SCHEMA
    && documentLanguage === "omni"
    && !parsedSettings.settings.omni
  ) {
    throw new StoaProjectCodecError(
      "invalid-project",
      "$.document.settings.omni",
      "is required when document.language is omni",
    );
  }
  if (
    schemaVersion >= STOA_PROJECT_V3_SCHEMA
    && documentLanguage === "classical-chinese"
    && !parsedSettings.settings.annotationTarget
  ) {
    throw new StoaProjectCodecError(
      "invalid-project",
      "$.document.settings.annotationTarget",
      "is required when document.language is classical-chinese",
    );
  }
  let analysisLanguageDetection: StoaJsonObject | undefined;
  const analysis: StoaProjectAnalysis = {
    language: requiredString(analysisSource, "language", "$.document.analysis"),
    sourceText: requiredString(analysisSource, "sourceText", "$.document.analysis"),
    literalTranslation: requiredString(analysisSource, "literalTranslation", "$.document.analysis"),
    naturalTranslation: requiredString(analysisSource, "naturalTranslation", "$.document.analysis"),
    tokens,
    notes,
  };
  if (schemaVersion >= STOA_PROJECT_V4_SCHEMA) {
    if (Object.hasOwn(analysisSource, "languageDetection")) {
      const parsedDetection = parseLanguageDetection(
        analysisSource.languageDetection,
        "$.document.analysis.languageDetection",
      );
      analysis.languageDetection = parsedDetection.detection;
      analysisLanguageDetection = parsedDetection.preserved;
    }
    if (Object.hasOwn(analysisSource, "analysisProfile")) {
      analysis.analysisProfile = parseAnalysisProfile(
        analysisSource,
        "analysisProfile",
        "$.document.analysis",
      );
    }
    if (Object.hasOwn(analysisSource, "morphologyStandard")) {
      analysis.morphologyStandard = requiredTrimmedString(
        analysisSource,
        "morphologyStandard",
        "$.document.analysis",
      );
    }
  }
  const document: StoaProjectDocument = {
    language: documentLanguage,
    sourceText: requiredString(documentSource, "sourceText", "$.document"),
    selectedTokenId,
    analysis,
    settings: parsedSettings.settings,
  };

  const project: StoaProject = schemaVersion === STOA_PROJECT_V1_SCHEMA
    ? {
        format: STOA_PROJECT_FORMAT,
        schemaVersion: STOA_PROJECT_V1_SCHEMA,
        appVersion: requiredString(root, "appVersion", "$"),
        exportedAt: requiredString(root, "exportedAt", "$"),
        document,
      }
    : schemaVersion === STOA_PROJECT_V2_SCHEMA
      ? {
        format: STOA_PROJECT_FORMAT,
        schemaVersion: STOA_PROJECT_V2_SCHEMA,
        appVersion: requiredString(root, "appVersion", "$"),
        exportedAt: requiredString(root, "exportedAt", "$"),
        document: document as StoaProjectV2["document"],
      }
      : schemaVersion === STOA_PROJECT_V3_SCHEMA
        ? {
            format: STOA_PROJECT_FORMAT,
            schemaVersion: STOA_PROJECT_V3_SCHEMA,
            appVersion: requiredString(root, "appVersion", "$"),
            exportedAt: requiredString(root, "exportedAt", "$"),
            document: document as StoaProjectV3["document"],
          }
        : schemaVersion === STOA_PROJECT_V4_SCHEMA
          ? {
            format: STOA_PROJECT_FORMAT,
            schemaVersion: STOA_PROJECT_V4_SCHEMA,
            appVersion: requiredString(root, "appVersion", "$"),
            exportedAt: requiredString(root, "exportedAt", "$"),
            document: document as StoaProjectV4["document"],
          }
        : schemaVersion === STOA_PROJECT_V5_SCHEMA
          ? {
              format: STOA_PROJECT_FORMAT,
              schemaVersion: STOA_PROJECT_V5_SCHEMA,
              appVersion: requiredString(root, "appVersion", "$"),
              exportedAt: requiredString(root, "exportedAt", "$"),
              document: document as StoaProjectV5["document"],
            }
          : {
              format: STOA_PROJECT_FORMAT,
              schemaVersion: STOA_PROJECT_V6_SCHEMA,
              appVersion: requiredString(root, "appVersion", "$"),
              exportedAt: requiredString(root, "exportedAt", "$"),
              document: document as StoaProjectV6["document"],
            };

  return {
    sourceSchemaVersion: schemaVersion,
    project,
    preserved: {
      root: unknownFields(root, ROOT_KEYS),
      document: unknownFields(documentSource, DOCUMENT_KEYS),
      analysis: unknownFields(
        analysisSource,
        schemaVersion === STOA_PROJECT_V6_SCHEMA
          ? ANALYSIS_V6_KEYS
          : schemaVersion === STOA_PROJECT_V5_SCHEMA
            ? ANALYSIS_V5_KEYS
            : schemaVersion === STOA_PROJECT_V4_SCHEMA
              ? ANALYSIS_V4_KEYS
              : ANALYSIS_V1_TO_V3_KEYS,
      ),
      settings: parsedSettings.preserved,
      tokenById,
      settingsTokenStyle: parsedSettings.settingsTokenStyle,
      settingsOmni: parsedSettings.settingsOmni,
      analysisLanguageDetection,
      settingsOmniLanguageDetection: parsedSettings.settingsOmniLanguageDetection,
      settingsOmniManualLanguageOverride: parsedSettings.settingsOmniManualLanguageOverride,
      tokenStyleOverridesById,
      noteById,
    },
  };
};

/** Parses JSON text and validates any supported schema without narrowing it. */
export const parseStoaProjectText = (text: string): ParsedStoaProject => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new StoaProjectCodecError(
      "invalid-json",
      "$",
      error instanceof Error ? error.message : "could not parse JSON",
    );
  }
  return parseStoaProject(value);
};

/** Parses a supported project object without narrowing unrecognized fields. */
export const parseStoaProject = (value: unknown): ParsedStoaProject => {
  const root = jsonObject(value, "$");
  if (root.format !== STOA_PROJECT_FORMAT) {
    throw new StoaProjectCodecError(
      "invalid-project",
      "$.format",
      `must equal ${JSON.stringify(STOA_PROJECT_FORMAT)}`,
    );
  }
  if (
    root.schemaVersion !== STOA_PROJECT_V1_SCHEMA
    && root.schemaVersion !== STOA_PROJECT_V2_SCHEMA
    && root.schemaVersion !== STOA_PROJECT_V3_SCHEMA
    && root.schemaVersion !== STOA_PROJECT_V4_SCHEMA
    && root.schemaVersion !== STOA_PROJECT_V5_SCHEMA
    && root.schemaVersion !== STOA_PROJECT_V6_SCHEMA
  ) {
    throw new StoaProjectCodecError(
      "unsupported-schema",
      "$.schemaVersion",
      `unsupported STOA project schema ${JSON.stringify(root.schemaVersion)}`,
    );
  }
  return parseProjectForSchema(root, root.schemaVersion);
};

const assignDefined = (
  target: StoaJsonObject,
  key: string,
  value: StoaJsonValue | undefined,
) => {
  if (value !== undefined) target[key] = value;
};

const layerStyleToJson = (
  style: StoaProjectLayerStyle | StoaProjectLayerStyleOverride,
): StoaJsonObject => {
  const result: StoaJsonObject = {};
  assignDefined(result, "fontFamily", style.fontFamily);
  assignDefined(result, "sizePt", style.sizePt);
  assignDefined(result, "color", style.color);
  assignDefined(result, "bold", style.bold);
  assignDefined(result, "italic", style.italic);
  assignDefined(result, "underline", style.underline);
  return result;
};

const mergeKnown = (preserved: StoaJsonObject, known: StoaJsonObject): StoaJsonObject => ({
  ...cloneJsonValue(preserved, "preserved fields") as StoaJsonObject,
  ...known,
});

const tokenStyleToJson = (
  style: StoaProjectTokenStyle | StoaProjectTokenStyleOverrides,
  preserved: PreservedStoaTokenStyleFields = emptyPreservedStyle(),
  complete = false,
): StoaJsonObject => {
  const result: StoaJsonObject = {};
  const knownLayers: StoaJsonObject = {};
  const layers = style.layers ?? {};
  for (const layer of STOA_TOKEN_STYLE_LAYERS) {
    const layerStyle = layers[layer];
    if (!layerStyle) continue;
    knownLayers[layer] = mergeKnown(
      preserved.layerByName[layer] ?? {},
      layerStyleToJson(layerStyle),
    );
  }
  if (complete || preserved.hadLayers || Object.keys(knownLayers).length > 0 || Object.keys(preserved.layers).length > 0) {
    result.layers = mergeKnown(preserved.layers, knownLayers);
  }

  const knownGaps: StoaJsonObject = {};
  const gaps = style.gapAfterPx ?? {};
  for (const gap of STOA_TOKEN_STYLE_GAPS) {
    assignDefined(knownGaps, gap, gaps[gap]);
  }
  if (complete || preserved.hadGapAfterPx || Object.keys(knownGaps).length > 0 || Object.keys(preserved.gapAfterPx).length > 0) {
    result.gapAfterPx = mergeKnown(preserved.gapAfterPx, knownGaps);
  }
  if (
    complete
    && (style as StoaProjectTokenStyle).pronunciation
  ) {
    const pronunciation = (style as StoaProjectTokenStyle).pronunciation as NonNullable<StoaProjectTokenStyle["pronunciation"]>;
    result.pronunciation = mergeKnown(preserved.pronunciation, {
      sizePt: pronunciation.sizePt,
      color: pronunciation.color,
    });
  } else if (preserved.hadPronunciation || Object.keys(preserved.pronunciation).length > 0) {
    result.pronunciation = cloneJsonValue(preserved.pronunciation, "preserved pronunciation style") as StoaJsonObject;
  }
  return mergeKnown(preserved.root, result);
};

const languageDetectionToJson = (
  detection: OmniLanguageDetection,
  preserved: StoaJsonObject = {},
): StoaJsonObject => mergeKnown(preserved, {
  schemaVersion: detection.schemaVersion,
  languageId: detection.languageId,
  languageName: detection.languageName,
  script: detection.script,
  confidence: detection.confidence,
  isMixedLanguage: detection.isMixedLanguage,
});

const omniSettingsToJson = (
  omni: StoaProjectOmniSettings,
  schemaVersion: 3 | 4 | 5 | 6,
  preserved: StoaJsonObject = {},
  preservedLanguageDetection?: StoaJsonObject,
  preservedManualLanguageOverride?: StoaJsonObject,
): StoaJsonObject => {
  const known: StoaJsonObject = {
    profile: omni.profile,
    languageHint: omni.languageHint,
    direction: omni.direction,
    writingMode: omni.writingMode,
    tokenizationOrigin: omni.tokenizationOrigin,
    annotationTarget: omni.annotationTarget,
  };
  if (schemaVersion >= STOA_PROJECT_V4_SCHEMA) {
    known.languageDetection = languageDetectionToJson(
      omni.languageDetection,
      preservedLanguageDetection,
    );
    known.analysisProfile = omni.analysisProfile;
    known.morphologyStandard = omni.morphologyStandard;
    known.manualLanguageOverride = omni.manualLanguageOverride === null
      ? null
      : mergeKnown(preservedManualLanguageOverride ?? {}, {
          languageId: omni.manualLanguageOverride.languageId,
          confirmed: omni.manualLanguageOverride.confirmed,
        });
  }
  return mergeKnown(preserved, known);
};

const tokenToJson = (
  token: StoaProjectToken,
  schemaVersion: StoaProjectSchemaVersion,
  preservedStyle?: PreservedStoaTokenStyleFields,
): StoaJsonObject => {
  const result: StoaJsonObject = {
    id: token.id,
    surface: token.surface,
    punctuationBefore: token.punctuationBefore,
    punctuationAfter: token.punctuationAfter,
    lemma: token.lemma,
    gloss: token.gloss,
    pos: token.pos,
    morphology: token.morphology,
    features: cloneJsonValue(token.features, `token ${token.id}.features`),
    confidence: token.confidence,
    alternatives: cloneJsonValue(token.alternatives, `token ${token.id}.alternatives`),
  };
  if (schemaVersion >= STOA_PROJECT_V4_SCHEMA) {
    assignDefined(result, "isIndeclinable", token.isIndeclinable);
  }
  assignDefined(result, "breakAfter", token.breakAfter);
  assignDefined(result, "blankLinesAfter", token.blankLinesAfter);
  assignDefined(result, "blankLineSpacing", token.blankLineSpacing);
  assignDefined(result, "wordFont", token.wordFont);
  assignDefined(result, "wordSize", token.wordSize);
  assignDefined(result, "wordColor", token.wordColor);
  assignDefined(result, "wordBold", token.wordBold);
  assignDefined(result, "wordItalic", token.wordItalic);
  assignDefined(result, "wordUnderline", token.wordUnderline);
  assignDefined(result, "lemmaColor", token.lemmaColor);
  assignDefined(result, "lemmaUnderline", token.lemmaUnderline);
  assignDefined(result, "morphColor", token.morphColor);
  assignDefined(result, "morphUnderline", token.morphUnderline);
  assignDefined(result, "separatorAfter", token.separatorAfter);
  assignDefined(result, "sourceStart", token.sourceStart);
  assignDefined(result, "sourceEnd", token.sourceEnd);
  if (schemaVersion >= STOA_PROJECT_V6_SCHEMA) {
    assignDefined(result, "pinyin", token.pinyin);
    assignDefined(result, "romanization", token.romanization);
    assignDefined(result, "pronunciationSize", token.pronunciationSize);
    assignDefined(result, "pronunciationColor", token.pronunciationColor);
  }
  if (
    schemaVersion !== STOA_PROJECT_V1_SCHEMA
    && (token.styleOverrides !== undefined || preservedStyle?.present)
  ) {
    result.styleOverrides = tokenStyleToJson(token.styleOverrides ?? {}, preservedStyle, false);
  }
  return result;
};

const settingsToJson = (
  settings: StoaProjectSettings,
  schemaVersion: StoaProjectSchemaVersion,
  preservedStyle?: PreservedStoaTokenStyleFields,
  preservedOmni?: StoaJsonObject,
  preservedOmniLanguageDetection?: StoaJsonObject,
  preservedOmniManualLanguageOverride?: StoaJsonObject,
): StoaJsonObject => {
  const result: StoaJsonObject = {};
  for (const key of NUMBER_SETTING_KEYS) assignDefined(result, key, settings[key]);
  for (const key of STRING_SETTING_KEYS) assignDefined(result, key, settings[key]);
  for (const key of LEGACY_BOOLEAN_SETTING_KEYS) assignDefined(result, key, settings[key]);
  if (schemaVersion >= STOA_PROJECT_V5_SCHEMA) {
    for (const key of NOTE_BOOLEAN_SETTING_KEYS) assignDefined(result, key, settings[key]);
  }
  if (schemaVersion >= STOA_PROJECT_V6_SCHEMA) {
    for (const key of PRONUNCIATION_BOOLEAN_SETTING_KEYS) assignDefined(result, key, settings[key]);
  }
  assignDefined(result, "orientation", settings.orientation);
  if (schemaVersion >= STOA_PROJECT_V3_SCHEMA) {
    assignDefined(result, "annotationTarget", settings.annotationTarget);
    if (settings.fontReferences?.length) {
      result.fontReferences = settings.fontReferences.map((font) => ({
        id: font.id,
        familyId: font.familyId,
        familyName: font.familyName,
        subfamilyName: font.subfamilyName,
        postscriptName: font.postscriptName,
        cssFamily: font.cssFamily,
        filename: font.filename,
        sha256: font.sha256,
        format: font.format,
        faceStyle: font.faceStyle,
        byteLength: font.byteLength,
      }));
    }
  }
  if (schemaVersion !== STOA_PROJECT_V1_SCHEMA) {
    if (!settings.tokenStyle) {
      throw new StoaProjectCodecError(
        "invalid-project",
        "$.document.settings.tokenStyle",
        "is required in schema v2 or v3",
      );
    }
    result.tokenStyle = tokenStyleToJson(settings.tokenStyle, preservedStyle, true);
    if (schemaVersion >= STOA_PROJECT_V3_SCHEMA && settings.omni) {
      result.omni = omniSettingsToJson(
        settings.omni,
        schemaVersion === STOA_PROJECT_V3_SCHEMA
          ? STOA_PROJECT_V3_SCHEMA
          : schemaVersion === STOA_PROJECT_V4_SCHEMA
            ? STOA_PROJECT_V4_SCHEMA
            : schemaVersion === STOA_PROJECT_V5_SCHEMA
              ? STOA_PROJECT_V5_SCHEMA
              : STOA_PROJECT_V6_SCHEMA,
        preservedOmni,
        preservedOmniLanguageDetection,
        preservedOmniManualLanguageOverride,
      );
    }
  }
  return result;
};

const knownProjectToJson = (
  project: StoaProject,
  preserved?: PreservedStoaProjectFields,
): StoaJsonObject => {
  const schemaVersion = project.schemaVersion;
  const analysis: StoaJsonObject = {
    language: project.document.analysis.language,
    sourceText: project.document.analysis.sourceText,
    literalTranslation: project.document.analysis.literalTranslation,
    naturalTranslation: project.document.analysis.naturalTranslation,
    tokens: project.document.analysis.tokens.map((token) => tokenToJson(
      token,
      schemaVersion,
      preserved?.tokenStyleOverridesById[token.id],
    )),
    notes: schemaVersion < STOA_PROJECT_V5_SCHEMA
      ? project.document.analysis.notes.map((note) => note.text)
      : project.document.analysis.notes.map((note) => mergeKnown(
          preserved?.noteById[note.id] ?? {},
          { id: note.id, tokenId: note.tokenId, text: note.text },
        )),
  };
  if (schemaVersion >= STOA_PROJECT_V4_SCHEMA) {
    if (project.document.analysis.languageDetection) {
      analysis.languageDetection = languageDetectionToJson(
        project.document.analysis.languageDetection,
        preserved?.analysisLanguageDetection,
      );
    }
    assignDefined(analysis, "analysisProfile", project.document.analysis.analysisProfile);
    assignDefined(analysis, "morphologyStandard", project.document.analysis.morphologyStandard);
  }
  return {
    format: STOA_PROJECT_FORMAT,
    schemaVersion,
    appVersion: project.appVersion,
    exportedAt: project.exportedAt,
    document: {
      language: project.document.language,
      sourceText: project.document.sourceText,
      selectedTokenId: project.document.selectedTokenId,
      analysis,
      settings: settingsToJson(
        project.document.settings,
        schemaVersion,
        preserved?.settingsTokenStyle,
        preserved?.settingsOmni,
        preserved?.settingsOmniLanguageDetection,
        preserved?.settingsOmniManualLanguageOverride,
      ),
    },
  };
};

/**
 * Re-emits a project with all preserved fields in their original locations.
 * Application-edited canonical values win if an extension collides with a
 * field that became known to STOA.
 */
export const serializeStoaProject = (parsed: ParsedStoaProject): StoaJsonObject => {
  // Validate only known data first so application edits cannot bypass the
  // schema or introduce duplicate IDs. Then merge each lossless sidecar.
  const validated = parseStoaProject(knownProjectToJson(parsed.project)).project;
  const known = knownProjectToJson(validated, parsed.preserved);
  const knownDocument = known.document as StoaJsonObject;
  const knownAnalysis = knownDocument.analysis as StoaJsonObject;
  const knownSettings = knownDocument.settings as StoaJsonObject;
  const knownTokens = knownAnalysis.tokens as StoaJsonValue[];
  const knownNotes = knownAnalysis.notes as StoaJsonValue[];

  const tokens = validated.document.analysis.tokens.map((token, index) =>
    mergeKnown(
      parsed.preserved.tokenById[token.id] ?? {},
      knownTokens[index] as StoaJsonObject,
    ),
  );
  const analysis = mergeKnown(parsed.preserved.analysis, {
    ...knownAnalysis,
    tokens,
    notes: validated.schemaVersion < STOA_PROJECT_V5_SCHEMA
      ? knownNotes
      : validated.document.analysis.notes.map((note, index) => mergeKnown(
          parsed.preserved.noteById[note.id] ?? {},
          knownNotes[index] as StoaJsonObject,
        )),
  });
  const document = mergeKnown(parsed.preserved.document, {
    ...knownDocument,
    analysis,
    settings: mergeKnown(parsed.preserved.settings, knownSettings),
  });
  return mergeKnown(parsed.preserved.root, {
    ...known,
    document,
  });
};

export const stringifyStoaProject = (
  parsed: ParsedStoaProject,
  space: number | string = 2,
) => JSON.stringify(serializeStoaProject(parsed), null, space);

/** Creates a validated project with an empty unknown-field sidecar. */
export const createStoaProject = (project: StoaProject): ParsedStoaProject =>
  parseStoaProject(knownProjectToJson(project));

const LEGACY_STYLE_SETTING_KEYS = [
  "greekSize",
  "glossSize",
  "lemmaSize",
  "posSize",
  "morphSize",
  "greekFont",
  "englishFont",
  "lemmaFont",
  "morphFont",
] as const;
const LEGACY_TOKEN_STYLE_KEYS = [
  "wordFont",
  "wordSize",
  "wordColor",
  "wordBold",
  "wordItalic",
  "wordUnderline",
  "lemmaColor",
  "lemmaUnderline",
  "morphColor",
  "morphUnderline",
] as const;

const legacySettingsToTokenStyle = (settings: StoaProjectSettings): StoaProjectTokenStyle =>
  deriveDocumentTokenStyleDefaults(settings);

const legacyTokenToOverrides = (
  token: StoaProjectToken,
  defaults: StoaProjectTokenStyle,
): StoaProjectTokenStyleOverrides | undefined => legacyTokenStyleOverride(token, defaults);

/**
 * Schema v1 treated the future v2 style names as opaque extensions. Merge an
 * extension object into generated v2 style JSON recursively so its unknown
 * root/container/layer fields remain at the same locations. Generated known
 * v2 values win only where both sides define the same key.
 */
const mergeV1ReservedStyleExtension = (
  legacyValue: StoaJsonValue | undefined,
  generated: StoaJsonObject,
): StoaJsonObject => {
  if (legacyValue === undefined) return generated;
  if (!isRecord(legacyValue)) {
    return {
      legacyV1ExtensionValue: cloneJsonValue(
        legacyValue,
        "legacy v1 reserved style extension",
      ),
      ...generated,
    };
  }

  const legacy = cloneJsonValue(
    legacyValue,
    "legacy v1 reserved style extension",
  ) as StoaJsonObject;
  const result: StoaJsonObject = { ...legacy, ...generated };

  const mergeObjectContainer = (key: "layers" | "gapAfterPx") => {
    const legacyContainerValue = legacy[key];
    const generatedContainerValue = generated[key];
    const legacyContainer = isRecord(legacyContainerValue)
      ? cloneJsonValue(legacyContainerValue, `legacy v1 ${key}`) as StoaJsonObject
      : undefined;
    const generatedContainer = isRecord(generatedContainerValue)
      ? generatedContainerValue as StoaJsonObject
      : undefined;

    if (legacyContainer && generatedContainer) {
      result[key] = { ...legacyContainer, ...generatedContainer };
      return;
    }
    if (generatedContainer) {
      result[key] = generatedContainer;
      if (legacyContainerValue !== undefined && !legacyContainer) {
        result[`legacyV1${key === "layers" ? "Layers" : "GapAfterPx"}Value`] =
          cloneJsonValue(legacyContainerValue, `legacy v1 ${key}`);
      }
      return;
    }
    if (!legacyContainer && legacyContainerValue !== undefined) {
      // The reserved key has acquired an object shape in v2. Retain an older
      // incompatible extension value under an explicit lossless side field so
      // it cannot make the migrated v2 document invalid.
      delete result[key];
      result[`legacyV1${key === "layers" ? "Layers" : "GapAfterPx"}Value`] =
        cloneJsonValue(legacyContainerValue, `legacy v1 ${key}`);
    }
  };

  mergeObjectContainer("layers");
  mergeObjectContainer("gapAfterPx");

  const legacyLayers = isRecord(legacy.layers) ? legacy.layers as StoaJsonObject : undefined;
  const generatedLayers = isRecord(generated.layers) ? generated.layers as StoaJsonObject : undefined;
  const mergedLayers = isRecord(result.layers) ? result.layers as StoaJsonObject : undefined;
  if (legacyLayers && generatedLayers && mergedLayers) {
    for (const layer of STOA_TOKEN_STYLE_LAYERS) {
      const legacyLayer = legacyLayers[layer];
      const generatedLayer = generatedLayers[layer];
      if (isRecord(legacyLayer) && isRecord(generatedLayer)) {
        mergedLayers[layer] = {
          ...cloneJsonValue(legacyLayer, `legacy v1 layers.${layer}`) as StoaJsonObject,
          ...generatedLayer as StoaJsonObject,
        };
      }
    }
  }
  return result;
};

/**
 * Schemas v1 and v2 treated `settings.omni` as an opaque extension. A complete
 * value on an OMNI document can be promoted directly to the v3 shape. Any other
 * legacy value is retained under a collision-free side key instead of either
 * changing a Greek/Latin document's meaning, breaking migration, or being lost.
 */
const prepareLegacyOmniExtensionForMigration = (
  settings: StoaJsonObject,
  documentLanguage: string,
  sourceSchemaVersion: 1 | 2,
) => {
  if (Object.hasOwn(settings, "omni") && documentLanguage === "omni") {
    try {
      parseOmniSettings(
        settings.omni,
        "$.document.settings.omni",
        STOA_PROJECT_V3_SCHEMA,
      );
      return;
    } catch {
      // Retain the opaque value below, then install canonical v3 defaults.
    }
  }

  if (Object.hasOwn(settings, "omni")) {
    const legacyValue = settings.omni;
    delete settings.omni;
    const baseKey = `legacyV${sourceSchemaVersion}OmniExtensionValue`;
    let targetKey = baseKey;
    let suffix = 2;
    while (Object.hasOwn(settings, targetKey)) {
      targetKey = `${baseKey}${suffix}`;
      suffix += 1;
    }
    settings[targetKey] = cloneJsonValue(
      legacyValue,
      `legacy v${sourceSchemaVersion} OMNI extension`,
    );
  }

  if (documentLanguage === "omni") {
    settings.omni = omniSettingsToJson(
      createSafeOmniProjectSettings(),
      STOA_PROJECT_V3_SCHEMA,
    );
  }
};

const preserveReservedMigrationValue = (
  container: StoaJsonObject,
  key: string,
  baseKey: string,
) => {
  if (!Object.hasOwn(container, key)) return;
  const value = container[key];
  delete container[key];
  let targetKey = baseKey;
  let suffix = 2;
  while (Object.hasOwn(container, targetKey)) {
    targetKey = `${baseKey}${suffix}`;
    suffix += 1;
  }
  container[targetKey] = cloneJsonValue(value, `legacy reserved ${key}`);
};

const promoteOmniSettingsToV4 = (
  settings: StoaJsonObject,
  sourceSchemaVersion: 1 | 2 | 3,
) => {
  if (!Object.hasOwn(settings, "omni")) return;
  const source = jsonObject(settings.omni, "$.document.settings.omni");
  const legacy = parseOmniSettings(
    source,
    "$.document.settings.omni",
    STOA_PROJECT_V3_SCHEMA,
  ).omni;
  for (const key of [
    "languageDetection",
    "analysisProfile",
    "morphologyStandard",
    "manualLanguageOverride",
  ] as const) {
    preserveReservedMigrationValue(
      source,
      key,
      `legacyV${sourceSchemaVersion}Omni${key[0].toUpperCase()}${key.slice(1)}ExtensionValue`,
    );
  }
  settings.omni = mergeKnown(
    source,
    omniSettingsToJson(
      createSafeOmniProjectSettings(legacy),
      STOA_PROJECT_V4_SCHEMA,
    ),
  );
};

const prepareV4AnalysisMetadata = (
  analysis: StoaJsonObject,
  documentLanguage: string,
  sourceSchemaVersion: 1 | 2 | 3,
) => {
  for (const key of ["languageDetection", "analysisProfile", "morphologyStandard"] as const) {
    preserveReservedMigrationValue(
      analysis,
      key,
      `legacyV${sourceSchemaVersion}${key[0].toUpperCase()}${key.slice(1)}ExtensionValue`,
    );
  }
  if (documentLanguage !== "omni") return;
  const safe = createSafeOmniProjectSettings();
  analysis.languageDetection = languageDetectionToJson(safe.languageDetection);
  analysis.analysisProfile = safe.analysisProfile;
  analysis.morphologyStandard = safe.morphologyStandard;
};

const prepareV4TokenMetadata = (
  analysis: StoaJsonObject,
  sourceSchemaVersion: 1 | 2 | 3,
) => {
  const tokens = analysis.tokens as StoaJsonObject[];
  for (const token of tokens) {
    if (!Object.hasOwn(token, "isIndeclinable") || typeof token.isIndeclinable === "boolean") {
      continue;
    }
    preserveReservedMigrationValue(
      token,
      "isIndeclinable",
      `legacyV${sourceSchemaVersion}IsIndeclinableExtensionValue`,
    );
  }
};

const prepareV5NoteVisibility = (
  settings: StoaJsonObject,
  sourceSchemaVersion: 1 | 2 | 3 | 4 | 5,
) => {
  for (const key of NOTE_BOOLEAN_SETTING_KEYS) {
    preserveReservedMigrationValue(
      settings,
      key,
      `legacyV${sourceSchemaVersion}${key[0].toUpperCase()}${key.slice(1)}ExtensionValue`,
    );
    settings[key] = true;
  }
};

const prepareV6PronunciationVisibility = (
  settings: StoaJsonObject,
  sourceSchemaVersion: 1 | 2 | 3 | 4 | 5,
) => {
  for (const key of PRONUNCIATION_BOOLEAN_SETTING_KEYS) {
    preserveReservedMigrationValue(
      settings,
      key,
      `legacyV${sourceSchemaVersion}${key[0].toUpperCase()}${key.slice(1)}ExtensionValue`,
    );
    settings[key] = true;
  }
};

/**
 * Explicitly upgrades schema v1-v5 to the latest schema. Parsing alone never
 * migrates or rewrites an older project, preserving exact legacy round-tripping.
 */
export const migrateStoaProjectToLatest = (
  parsed: ParsedStoaProject,
): ParsedStoaProject => {
  if (parsed.project.schemaVersion === STOA_PROJECT_LATEST_SCHEMA) {
    const clone = parseStoaProject(serializeStoaProject(parsed));
    return { ...clone, sourceSchemaVersion: parsed.sourceSchemaVersion };
  }

  const sourceSchemaVersion = parsed.project.schemaVersion;
  const raw = serializeStoaProject(parsed);
  const document = raw.document as StoaJsonObject;
  const settings = document.settings as StoaJsonObject;
  const analysis = document.analysis as StoaJsonObject;
  if (sourceSchemaVersion === STOA_PROJECT_V1_SCHEMA || sourceSchemaVersion === STOA_PROJECT_V2_SCHEMA) {
    prepareLegacyOmniExtensionForMigration(
      settings,
      parsed.project.document.language,
      sourceSchemaVersion,
    );
  }
  if (
    sourceSchemaVersion === STOA_PROJECT_V1_SCHEMA
    || sourceSchemaVersion === STOA_PROJECT_V2_SCHEMA
    || sourceSchemaVersion === STOA_PROJECT_V3_SCHEMA
  ) {
    promoteOmniSettingsToV4(settings, sourceSchemaVersion);
    prepareV4AnalysisMetadata(
      analysis,
      parsed.project.document.language,
      sourceSchemaVersion,
    );
    prepareV4TokenMetadata(analysis, sourceSchemaVersion);
  }
  analysis.notes = parsed.project.document.analysis.notes.map((note) => ({
    id: note.id,
    tokenId: note.tokenId,
    text: note.text,
  }));
  if (sourceSchemaVersion < STOA_PROJECT_V5_SCHEMA) {
    prepareV5NoteVisibility(settings, sourceSchemaVersion);
  }
  prepareV6PronunciationVisibility(settings, sourceSchemaVersion);
  raw.schemaVersion = STOA_PROJECT_V6_SCHEMA;
  if (
    parsed.project.document.language === "classical-chinese"
    && !Object.hasOwn(settings, "annotationTarget")
  ) {
    settings.annotationTarget = "english";
  }

  if (sourceSchemaVersion === STOA_PROJECT_V1_SCHEMA) {
    const parsedLegacySettings = parsed.project.document.settings;
    const tokenStyle = legacySettingsToTokenStyle(parsedLegacySettings);
    settings.tokenStyle = mergeV1ReservedStyleExtension(
      settings.tokenStyle,
      tokenStyleToJson(tokenStyle, undefined, true),
    );
    for (const key of LEGACY_STYLE_SETTING_KEYS) delete settings[key];

    const rawTokens = analysis.tokens as StoaJsonObject[];
    parsed.project.document.analysis.tokens.forEach((token, index) => {
      const overrides = legacyTokenToOverrides(token, tokenStyle);
      if (overrides || rawTokens[index].styleOverrides !== undefined) {
        rawTokens[index].styleOverrides = mergeV1ReservedStyleExtension(
          rawTokens[index].styleOverrides,
          overrides ? tokenStyleToJson(overrides) : {},
        );
      }
      for (const key of LEGACY_TOKEN_STYLE_KEYS) delete rawTokens[index][key];
    });
  }

  const migrated = parseStoaProject(raw);
  return { ...migrated, sourceSchemaVersion: parsed.sourceSchemaVersion };
};

/** Deep clone that retains the lossless sidecar and source-schema provenance. */
export const cloneParsedStoaProject = (parsed: ParsedStoaProject): ParsedStoaProject => {
  const clone = parseStoaProject(serializeStoaProject(parsed));
  return { ...clone, sourceSchemaVersion: parsed.sourceSchemaVersion };
};
