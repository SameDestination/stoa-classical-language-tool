import {
  DEFAULT_OMNI_LANGUAGE_DETECTION,
  isStoaWorkspaceLanguageId,
  normalizeOmniLanguageDetection,
  resolveOmniLanguageProfile,
  type OmniAnalysisProfile,
  type OmniLanguageDetection,
  type StoaWorkspaceLanguageId,
} from "./omni-language.ts";
import { isStoaLanguageId } from "../language-config.ts";
import { tokenizeStoaText } from "./ai-pipeline.ts";
import {
  normalizeTokenStyleOverride,
  type TokenStyleOverride,
} from "./token-style.ts";
import {
  cloneAnalysisNotes,
  mergeAnalysisNotes,
  normalizeAnalysisNotes,
  type AnalysisNote,
} from "./analysis-notes.ts";

export type JsonWorkspaceLanguage = StoaWorkspaceLanguageId;

export type JsonWorkspaceBreakAfter = "none" | "line" | "paragraph";

export type JsonWorkspaceToken = {
  id: string;
  surface: string;
  punctuationBefore: string;
  punctuationAfter: string;
  /** Classical Chinese reading aid. */
  pinyin?: string;
  /** Pronunciation-oriented Latin romanization for non-Latin OMNI tokens. */
  romanization?: string;
  lemma: string;
  gloss: string;
  pos: string;
  morphology: string;
  features?: Record<string, string | undefined>;
  confidence: number;
  alternatives: string[];
  isIndeclinable?: boolean;
  breakAfter?: JsonWorkspaceBreakAfter;
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
  pronunciationSize?: number;
  pronunciationColor?: string;
  styleOverrides?: TokenStyleOverride;
  separatorAfter?: string;
};

export type JsonWorkspaceTokenStylePatch = Pick<
  JsonWorkspaceToken,
  | "wordFont"
  | "wordSize"
  | "wordColor"
  | "wordBold"
  | "wordItalic"
  | "wordUnderline"
  | "lemmaColor"
  | "lemmaUnderline"
  | "morphColor"
  | "morphUnderline"
  | "pronunciationSize"
  | "pronunciationColor"
  | "breakAfter"
  | "blankLinesAfter"
  | "blankLineSpacing"
  | "styleOverrides"
>;

export type JsonWorkspaceAnalysis = {
  language: JsonWorkspaceLanguage;
  sourceText: string;
  literalTranslation: string;
  naturalTranslation: string;
  tokens: JsonWorkspaceToken[];
  notes: AnalysisNote[];
  languageDetection?: OmniLanguageDetection;
  analysisProfile?: OmniAnalysisProfile;
  morphologyStandard?: string;
};

export type JsonWorkspaceRawRevision = {
  revision: number;
  rawText: string;
};

export type JsonWorkspaceBatch = {
  id: string;
  sequence: number;
  revision: number;
  rawText: string;
  rawHistory: JsonWorkspaceRawRevision[];
  analysis: JsonWorkspaceAnalysis;
  /** The IDs supplied by the pasted JSON, before STOA makes them globally unique. */
  sourceTokenIds: Array<string | null>;
  /** Overlay batches enrich an existing canonical source sequence instead of appending it again. */
  applicationMode?: "append" | "overlay";
  importSummary?: JsonWorkspaceImportSummary | PermissiveAnalysisImportSummary;
};

export type JsonWorkspace = {
  format: "stoa-json-workspace";
  schemaVersion: 1;
  language: JsonWorkspaceLanguage;
  baseAnalysis: JsonWorkspaceAnalysis;
  batches: JsonWorkspaceBatch[];
  activeBatchId: string | null;
  /** Editable textarea contents. A successful import deliberately does not clear it. */
  draftText: string;
  nextBatchSequence: number;
};

export type ApplyJsonWorkspaceBatchOptions = {
  value: unknown;
  /** Defaults to workspace.draftText. The exact model response is retained. */
  rawText?: string;
  /**
   * undefined: update the active batch, or append when no batch is active.
   * null: always append a new batch.
   * string: replace that batch in place.
   */
  batchId?: string | null;
};

export type ApplyJsonWorkspaceBatchResult = {
  workspace: JsonWorkspace;
  analysis: JsonWorkspaceAnalysis;
  batchId: string;
  mode: "append" | "replace";
  selectedTokenId: string | null;
  importSummary?: JsonWorkspaceImportSummary;
};

export type JsonWorkspaceInvalidField = {
  tokenId: string;
  field: string;
  message: string;
};

export type JsonWorkspaceImportSummary = {
  state: "success" | "partial";
  expectedTokenCount: number;
  importedTokenCount: number;
  importedFieldCount: number;
  skippedEntryCount: number;
  notReturnedTokenIds: string[];
  unchangedTokenIds: string[];
  unknownTokenIds: string[];
  surfaceMismatchTokenIds: string[];
  duplicateTokenIds: string[];
  ambiguousFallbackSurfaces: string[];
  invalidFields: JsonWorkspaceInvalidField[];
};

export type PermissiveAnalysisImportSummary = {
  state: "success" | "partial";
  rawTokenCount: number;
  importedTokenCount: number;
  skippedEntryCount: number;
  generatedIdCount: number;
  duplicateIdCount: number;
  reconstructedSourceText: boolean;
  /** A declared workspace language that did not match the active page and was ignored. */
  ignoredDeclaredLanguage: string | null;
  invalidFields: JsonWorkspaceInvalidField[];
};

export type PermissiveAnalysisImportResult = {
  analysis: JsonWorkspaceAnalysis;
  summary: PermissiveAnalysisImportSummary;
};

/** Backward-compatible names for the existing OMNI call site. */
export type PermissiveOmniImportSummary = PermissiveAnalysisImportSummary;
export type PermissiveOmniImportResult = PermissiveAnalysisImportResult;

export type ApplyPermissiveJsonWorkspaceBatchOptions = ApplyJsonWorkspaceBatchOptions;

export type ApplyPermissiveJsonWorkspaceBatchResult = Omit<
  ApplyJsonWorkspaceBatchResult,
  "importSummary"
> & {
  importSummary: PermissiveAnalysisImportSummary;
};

export type ApplyBestEffortJsonWorkspaceBatchOptions = ApplyJsonWorkspaceBatchOptions & {
  /** Canonical local source tokens. AI content may enrich but never reorder or replace them. */
  expectedAnalysis: JsonWorkspaceAnalysis;
};

export type JsonWorkspaceMutationResult = {
  workspace: JsonWorkspace;
  analysis: JsonWorkspaceAnalysis;
};

export type JsonWorkspaceErrorCode =
  | "invalid-analysis"
  | "language-mismatch"
  | "unknown-batch"
  | "empty-raw-text";

export class JsonWorkspaceError extends Error {
  readonly code: JsonWorkspaceErrorCode;

  constructor(code: JsonWorkspaceErrorCode, message: string) {
    super(message);
    this.name = "JsonWorkspaceError";
    this.code = code;
  }
}

const WORKSPACE_FORMAT = "stoa-json-workspace" as const;
const WORKSPACE_SCHEMA_VERSION = 1 as const;
const MAX_RAW_REVISIONS_PER_BATCH = 25;
const UD_POS = new Set([
  "ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN", "NUM",
  "PART", "PRON", "PROPN", "SCONJ", "VERB", "X",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const optionalString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

const normalizeSourceTokenId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = Array.from(value.trim())
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("")
    .slice(0, 240);
  return normalized || null;
};

const cleanGeneratedIdPart = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/[^\p{L}\p{N}_.:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 100) || "token";

const cloneToken = (token: JsonWorkspaceToken): JsonWorkspaceToken => ({
  ...token,
  styleOverrides: token.styleOverrides ? {
    layers: token.styleOverrides.layers
      ? Object.fromEntries(Object.entries(token.styleOverrides.layers).map(([layer, style]) => [
          layer,
          style ? { ...style } : style,
        ])) as TokenStyleOverride["layers"]
      : undefined,
    gapAfterPx: token.styleOverrides.gapAfterPx
      ? { ...token.styleOverrides.gapAfterPx }
      : undefined,
  } : undefined,
  features: token.features ? { ...token.features } : {},
  alternatives: [...token.alternatives],
});

const cloneImportSummary = (
  summary?: JsonWorkspaceImportSummary,
): JsonWorkspaceImportSummary | undefined => summary ? {
  ...summary,
  notReturnedTokenIds: [...summary.notReturnedTokenIds],
  unchangedTokenIds: [...summary.unchangedTokenIds],
  unknownTokenIds: [...summary.unknownTokenIds],
  surfaceMismatchTokenIds: [...summary.surfaceMismatchTokenIds],
  duplicateTokenIds: [...summary.duplicateTokenIds],
  ambiguousFallbackSurfaces: [...summary.ambiguousFallbackSurfaces],
  invalidFields: summary.invalidFields.map((field) => ({ ...field })),
} : undefined;

const clonePermissiveImportSummary = (
  summary?: PermissiveAnalysisImportSummary,
): PermissiveAnalysisImportSummary | undefined => summary ? {
  ...summary,
  invalidFields: summary.invalidFields.map((field) => ({ ...field })),
} : undefined;

const cloneBatchImportSummary = (
  summary?: JsonWorkspaceImportSummary | PermissiveAnalysisImportSummary,
) => !summary
  ? undefined
  : "rawTokenCount" in summary
    ? clonePermissiveImportSummary(summary)
    : cloneImportSummary(summary);

const TOKEN_STYLE_KEYS = [
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
  "pronunciationSize",
  "pronunciationColor",
  "styleOverrides",
] as const;

const inheritMissingTokenStyles = (
  token: JsonWorkspaceToken,
  previousToken?: JsonWorkspaceToken,
) => {
  if (!previousToken) return token;
  const next = { ...token };
  TOKEN_STYLE_KEYS.forEach((key) => {
    if (next[key] === undefined && previousToken[key] !== undefined) {
      (next as Record<string, unknown>)[key] = key === "styleOverrides"
        ? cloneToken(previousToken).styleOverrides
        : previousToken[key];
    }
  });
  return next;
};

export const cloneJsonWorkspaceAnalysis = (
  analysis: JsonWorkspaceAnalysis,
): JsonWorkspaceAnalysis => ({
  ...analysis,
  languageDetection: analysis.languageDetection
    ? { ...analysis.languageDetection }
    : undefined,
  tokens: analysis.tokens.map(cloneToken),
  // Runtime callers can still hold a pre-5.8 working copy whose notes are
  // strings. Normalize at this compatibility boundary before cloning so an
  // in-memory upgrade cannot silently discard those notes.
  notes: cloneAnalysisNotes(normalizeAnalysisNotes(
    analysis.notes,
    analysis.tokens.map((token) => token.id),
  )),
});

const tokenText = (token: JsonWorkspaceToken) =>
  `${token.punctuationBefore ?? ""}${token.surface}${token.punctuationAfter ?? ""}`;

const blankLinesAfter = (token: JsonWorkspaceToken) =>
  finiteNumber(token.blankLinesAfter)
    ? clamp(Math.round(token.blankLinesAfter), 1, 20)
    : 1;

export const reconstructJsonWorkspaceSourceText = (tokens: JsonWorkspaceToken[]) =>
  tokens
    .map((token) => {
      const defaultSeparator = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(token.surface)
        ? ""
        : " ";
      const separator = token.breakAfter === "paragraph"
        ? "\n".repeat(blankLinesAfter(token) + 1)
        : token.breakAfter === "line"
          ? "\n"
          : token.separatorAfter ?? defaultSeparator;
      return `${tokenText(token)}${separator}`;
    })
    .join("")
    .trim();

const separateAttachedPunctuation = (
  surface: string,
  punctuationBefore: unknown,
  punctuationAfter: unknown,
) => {
  let normalizedSurface = surface;
  let before = typeof punctuationBefore === "string" ? punctuationBefore : "";
  let after = typeof punctuationAfter === "string" ? punctuationAfter : "";
  if (typeof punctuationBefore !== "string") {
    const leading = normalizedSurface.match(/^([^\p{L}\p{N}\p{M}]+)(?=[\p{L}\p{N}\p{M}])/u);
    if (leading) {
      before = leading[1];
      normalizedSurface = normalizedSurface.slice(leading[1].length);
    }
  }
  if (typeof punctuationAfter !== "string" || punctuationAfter === "") {
    const trailing = normalizedSurface.match(/(?<=[\p{L}\p{N}\p{M}])([^\p{L}\p{N}\p{M}]+)$/u);
    if (trailing) {
      after = `${trailing[1]}${after}`;
      normalizedSurface = normalizedSurface.slice(0, -trailing[1].length);
    }
  }
  return { surface: normalizedSurface, punctuationBefore: before, punctuationAfter: after };
};

const comparableSourceText = (value: string) => value
  .normalize("NFC")
  .replace(/\r\n?|\u2028|\u2029/gu, "\n")
  .trim();

const sourceDocumentsMatch = (left: string, right: string) =>
  comparableSourceText(left) === comparableSourceText(right);

const stableSourceHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

type ImportWordMatch = { surface: string; sourceStart: number; sourceEnd: number };

const genericImportWordMatches = (sourceText: string): ImportWordMatch[] => {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    try {
      return Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(sourceText))
        .filter((segment) => segment.isWordLike && /[\p{L}\p{N}\p{M}]/u.test(segment.segment))
        .map((segment) => ({
          surface: segment.segment,
          sourceStart: segment.index,
          sourceEnd: segment.index + segment.segment.length,
        }));
    } catch {
      // Deterministic Unicode fallback below.
    }
  }
  return Array.from(sourceText.matchAll(/[\p{L}\p{N}\p{M}]+/gu)).map((match) => ({
    surface: match[0],
    sourceStart: match.index ?? 0,
    sourceEnd: (match.index ?? 0) + match[0].length,
  }));
};

const expectedTokenShell = (
  id: string,
  surface: string,
): JsonWorkspaceToken => ({
  id,
  surface,
  punctuationBefore: "",
  punctuationAfter: "",
  lemma: "",
  gloss: "",
  pos: "",
  morphology: "",
  features: {},
  confidence: 0.8,
  alternatives: [],
  breakAfter: "none",
});

const genericExpectedTokens = (
  sourceText: string,
  language: JsonWorkspaceLanguage,
): JsonWorkspaceToken[] => {
  const matches = genericImportWordMatches(sourceText);
  if (!matches.length) return [];
  const hash = stableSourceHash(`${language}\u0000${sourceText.normalize("NFC")}`);
  const tokens = matches.map((match, index) => expectedTokenShell(
    `tok-${hash}-${String(index + 1).padStart(5, "0")}`,
    match.surface,
  ));
  tokens[0].punctuationBefore = sourceText.slice(0, matches[0].sourceStart).replace(/\s/gu, "");
  for (let index = 1; index < matches.length; index += 1) {
    const previous = matches[index - 1];
    const current = matches[index];
    const gap = sourceText.slice(previous.sourceEnd, current.sourceStart);
    const firstWhitespace = gap.search(/\s/u);
    let lastWhitespace = gap.length - 1;
    while (lastWhitespace >= 0 && !/\s/u.test(gap[lastWhitespace])) lastWhitespace -= 1;
    if (firstWhitespace < 0) {
      tokens[index - 1].punctuationAfter += gap;
    } else {
      tokens[index - 1].punctuationAfter += gap.slice(0, firstWhitespace).replace(/\s/gu, "");
      tokens[index].punctuationBefore += gap.slice(lastWhitespace + 1).replace(/\s/gu, "");
      const lineBreaks = (gap.match(/\r\n|\r|\n/gu) ?? []).length;
      if (lineBreaks === 1) tokens[index - 1].breakAfter = "line";
      else if (lineBreaks >= 2) {
        tokens[index - 1].breakAfter = "paragraph";
        tokens[index - 1].blankLinesAfter = Math.min(20, lineBreaks - 1);
      } else {
        tokens[index - 1].separatorAfter = (gap.match(/\s/gu) ?? []).join("");
      }
    }
  }
  const finalMatch = matches[matches.length - 1];
  tokens[tokens.length - 1].punctuationAfter += sourceText.slice(finalMatch.sourceEnd).replace(/\s/gu, "");
  return tokens;
};

/** Creates the canonical source-token sequence used only by manual best-effort imports. */
export const createBestEffortExpectedAnalysis = (
  sourceText: string,
  language: JsonWorkspaceLanguage,
  current?: JsonWorkspaceAnalysis,
): JsonWorkspaceAnalysis => {
  if (current?.tokens.length && sourceDocumentsMatch(current.sourceText, sourceText)) {
    return { ...cloneJsonWorkspaceAnalysis(current), sourceText };
  }
  const tokens = isStoaLanguageId(language)
    ? tokenizeStoaText(sourceText, language).map((token) => ({
        ...expectedTokenShell(token.id, token.surface),
        punctuationBefore: token.punctuationBefore,
        punctuationAfter: token.punctuationAfter,
        breakAfter: token.breakAfter,
        blankLinesAfter: token.blankLinesAfter,
        separatorAfter: token.separatorAfter,
      }))
    : genericExpectedTokens(sourceText, language);
  return {
    ...createBlankJsonWorkspaceAnalysis(language),
    sourceText,
    tokens,
  };
};

const detectLanguage = (
  text: string,
  fallback: JsonWorkspaceLanguage,
): JsonWorkspaceLanguage =>
  fallback === "omni"
    ? "omni"
    : /\p{Script=Greek}/u.test(text) ? "ancient-greek" : fallback;

const PROTOTYPE_POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const safeImportedKey = (key: string) => !PROTOTYPE_POLLUTION_KEYS.has(key);

const normalizeFeatures = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      safeImportedKey(entry[0]) && typeof entry[1] === "string"),
  );
};

const analysisCandidate = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return { tokens: value };
  if (!isRecord(value)) {
    throw new JsonWorkspaceError(
      "invalid-analysis",
      "The JSON root must be an analysis object or a token array.",
    );
  }
  return value;
};

const permissiveAnalysisCandidate = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return { tokens: value };
  if (!isRecord(value)) {
    throw new JsonWorkspaceError("invalid-analysis", "The JSON root must be an analysis object or a token array.");
  }
  if (Array.isArray(value.tokens)) return value;
  if (isRecord(value.analysis) && Array.isArray(value.analysis.tokens)) return value.analysis;
  if (isRecord(value.document)) {
    if (Array.isArray(value.document.tokens)) return value.document;
    if (isRecord(value.document.analysis) && Array.isArray(value.document.analysis.tokens)) {
      return value.document.analysis;
    }
  }
  throw new JsonWorkspaceError("invalid-analysis", "No tokens array was found in this JSON document.");
};

const safePermissiveImportedId = (value: unknown): string | null => {
  const normalized = normalizeSourceTokenId(value);
  return normalized && /^[\p{L}\p{N}_.:-]+$/u.test(normalized) ? normalized : null;
};

/**
 * Manual pasted/file analysis import: the returned JSON is a self-contained
 * document, not a patch against local canonical tokens. The active page owns
 * the language; invalid optional fields are ignored independently and the
 * usable token sequence remains authoritative.
 */
export const loadPermissiveAnalysis = (
  value: unknown,
  language: JsonWorkspaceLanguage,
): PermissiveAnalysisImportResult => {
  const candidate = permissiveAnalysisCandidate(value);
  const rawTokens = candidate.tokens as unknown[];
  const invalidFields: JsonWorkspaceInvalidField[] = [];
  const usedIds = new Set<string>();
  let skippedEntryCount = 0;
  let generatedIdCount = 0;
  let duplicateIdCount = 0;

  const tokens = rawTokens.flatMap((entry, index): JsonWorkspaceToken[] => {
    const fallbackId = `${language}-import-token-${String(index + 1).padStart(4, "0")}`;
    if (!isRecord(entry) || typeof entry.surface !== "string" || !entry.surface.trim()) {
      skippedEntryCount += 1;
      return [];
    }
    const punctuation = separateAttachedPunctuation(
      entry.surface,
      entry.punctuationBefore,
      entry.punctuationAfter,
    );
    if (!punctuation.surface.trim()) {
      skippedEntryCount += 1;
      return [];
    }

    const requestedId = safePermissiveImportedId(entry.id);
    if (!requestedId) generatedIdCount += 1;
    else if (usedIds.has(requestedId)) duplicateIdCount += 1;
    const id = uniqueId(requestedId ?? "", fallbackId, usedIds);
    const invalid = (field: string, message: string) => invalidFields.push({ tokenId: id, field, message });
    const textField = (field: "lemma" | "gloss" | "morphology") => {
      if (entry[field] === undefined || entry[field] === null) return "";
      if (typeof entry[field] !== "string" || entry[field].length > 10_000) {
        invalid(field, `${field} was not a usable string and was ignored.`);
        return "";
      }
      return entry[field];
    };
    const pronunciationField = (field: "pinyin" | "romanization") => {
      if (entry[field] === undefined || entry[field] === null) return undefined;
      if (typeof entry[field] !== "string" || entry[field].length > 10_000) {
        invalid(field, `${field} was not a usable string and was ignored.`);
        return undefined;
      }
      return entry[field].normalize("NFC");
    };
    const rawPos = typeof entry.pos === "string" ? entry.pos.trim().toUpperCase() : "";
    const pos = UD_POS.has(rawPos) ? rawPos : "X";
    if (entry.pos !== undefined && rawPos && pos === "X" && rawPos !== "X") {
      invalid("pos", "Unsupported POS was replaced with X.");
    }

    let features: Record<string, string> = {};
    if (entry.features !== undefined && entry.features !== null) {
      if (!isRecord(entry.features)) {
        invalid("features", "Features was not a plain string-valued object and was ignored.");
      } else {
        const entries = Object.entries(entry.features);
        if (entries.every(([key, item]) => safeImportedKey(key) && typeof item === "string" && Boolean(item.trim()))) {
          features = Object.fromEntries(entries.map(([key, item]) => [key, (item as string).trim()]));
        } else {
          invalid("features", "Malformed or unsafe feature entries were ignored as one field.");
        }
      }
    }

    let alternatives: string[] = [];
    if (entry.alternatives !== undefined && entry.alternatives !== null) {
      if (Array.isArray(entry.alternatives) && entry.alternatives.every((item) => typeof item === "string" && Boolean(item.trim()))) {
        alternatives = entry.alternatives.map((item: string) => item.trim());
      } else {
        invalid("alternatives", "Alternatives was not a string array and was ignored.");
      }
    }
    let confidence = 0.8;
    if (entry.confidence !== undefined) {
      if (finiteNumber(entry.confidence)) {
        confidence = clamp(entry.confidence, 0, 1);
        if (confidence !== entry.confidence) invalid("confidence", "Confidence was clamped to 0–1.");
      } else {
        invalid("confidence", "Confidence was not a finite number and was ignored.");
      }
    }
    const breakAfter: JsonWorkspaceBreakAfter = entry.breakAfter === "line" || entry.breakAfter === "paragraph"
      ? entry.breakAfter
      : "none";
    if (entry.breakAfter !== undefined && !["none", "line", "paragraph"].includes(String(entry.breakAfter))) {
      invalid("breakAfter", "Unsupported breakAfter was replaced with none.");
    }
    const color = (
      field: "wordColor" | "lemmaColor" | "morphColor" | "pronunciationColor",
    ) => {
      if (typeof entry[field] === "string" && /^#[0-9a-f]{6}$/iu.test(entry[field])) return entry[field];
      if (entry[field] !== undefined && entry[field] !== null && entry[field] !== "") invalid(field, "Color was not a six-digit hex value and was ignored.");
      return undefined;
    };
    const styleOverrides = normalizeTokenStyleOverride(entry.styleOverrides);
    if (entry.styleOverrides !== undefined && entry.styleOverrides !== null && !styleOverrides) {
      invalid("styleOverrides", "Unsupported style overrides were ignored.");
    }

    return [{
      id,
      surface: punctuation.surface,
      punctuationBefore: punctuation.punctuationBefore,
      punctuationAfter: punctuation.punctuationAfter,
      pinyin: language === "classical-chinese" ? pronunciationField("pinyin") : undefined,
      romanization: language === "omni" ? pronunciationField("romanization") : undefined,
      lemma: textField("lemma"),
      gloss: textField("gloss"),
      pos,
      morphology: textField("morphology"),
      features,
      confidence,
      alternatives,
      isIndeclinable: typeof entry.isIndeclinable === "boolean" ? entry.isIndeclinable : undefined,
      breakAfter,
      blankLinesAfter: finiteNumber(entry.blankLinesAfter) ? clamp(Math.round(entry.blankLinesAfter), 1, 20) : undefined,
      blankLineSpacing: finiteNumber(entry.blankLineSpacing) ? clamp(entry.blankLineSpacing, 1, 200) : undefined,
      wordFont: optionalString(entry.wordFont),
      wordSize: finiteNumber(entry.wordSize) ? clamp(entry.wordSize, 4, 144) : undefined,
      wordColor: color("wordColor"),
      wordBold: entry.wordBold === true || undefined,
      wordItalic: entry.wordItalic === true || undefined,
      wordUnderline: entry.wordUnderline === true || undefined,
      lemmaColor: color("lemmaColor"),
      lemmaUnderline: entry.lemmaUnderline === true || undefined,
      morphColor: color("morphColor"),
      morphUnderline: entry.morphUnderline === true || undefined,
      pronunciationSize: finiteNumber(entry.pronunciationSize)
        ? clamp(entry.pronunciationSize, 7, 144)
        : undefined,
      pronunciationColor: color("pronunciationColor"),
      styleOverrides,
      separatorAfter: typeof entry.separatorAfter === "string" ? entry.separatorAfter : undefined,
    }];
  });

  if (!tokens.length) {
    throw new JsonWorkspaceError("invalid-analysis", "The JSON contains zero usable tokens with a non-empty surface.");
  }
  const suppliedSource = typeof candidate.sourceText === "string" && candidate.sourceText.trim()
    ? candidate.sourceText
    : "";
  const reconstructedSourceText = !suppliedSource;
  const sourceText = suppliedSource || reconstructJsonWorkspaceSourceText(tokens);
  const resolution = language === "omni"
    ? (() => {
        const rawDetection = isRecord(candidate.languageDetection)
          ? candidate.languageDetection as Partial<OmniLanguageDetection>
          : undefined;
        const normalizedDetection = normalizeOmniLanguageDetection(rawDetection, sourceText).detection;
        return resolveOmniLanguageProfile({
          sourceText,
          detection: normalizedDetection,
          aiClaims: {
            analysisProfile: candidate.analysisProfile,
            morphologyStandard: candidate.morphologyStandard,
            capabilities: candidate.capabilities,
          },
        });
      })()
    : null;
  const notes = normalizeAnalysisNotes(candidate.notes, tokens.map((token) => token.id));
  const declaredLanguage = typeof candidate.language === "string"
    ? candidate.language.trim()
    : "";
  const ignoredDeclaredLanguage = declaredLanguage && declaredLanguage !== language
    ? declaredLanguage.slice(0, 100)
    : null;
  const summary: PermissiveAnalysisImportSummary = {
    state: skippedEntryCount || generatedIdCount || duplicateIdCount || invalidFields.length
      || reconstructedSourceText || ignoredDeclaredLanguage
      ? "partial"
      : "success",
    rawTokenCount: rawTokens.length,
    importedTokenCount: tokens.length,
    skippedEntryCount,
    generatedIdCount,
    duplicateIdCount,
    reconstructedSourceText,
    ignoredDeclaredLanguage,
    invalidFields,
  };
  return {
    analysis: {
      language,
      sourceText,
      literalTranslation: typeof candidate.literalTranslation === "string" ? candidate.literalTranslation : "",
      naturalTranslation: typeof candidate.naturalTranslation === "string" ? candidate.naturalTranslation : "",
      tokens,
      notes,
      languageDetection: resolution?.detection,
      analysisProfile: resolution?.analysisProfile,
      morphologyStandard: resolution?.morphologyStandard,
    },
    summary,
  };
};

/** Existing OMNI API retained while the UI migrates to the shared loader. */
export const loadPermissiveOmniAnalysis = (
  value: unknown,
): PermissiveOmniImportResult => loadPermissiveAnalysis(value, "omni");

const sourceTokenIdsFromValue = (value: unknown): Array<string | null> => {
  const candidate = analysisCandidate(value);
  if (!Array.isArray(candidate.tokens)) return [];
  return candidate.tokens.map((token) =>
    isRecord(token) ? normalizeSourceTokenId(token.id) : null,
  );
};

/**
 * Validates the analysis fields used by the page while preserving all current
 * punctuation, break and per-word style controls.
 */
export const normalizeJsonWorkspaceAnalysis = (
  value: unknown,
  fallbackLanguage: JsonWorkspaceLanguage,
): JsonWorkspaceAnalysis => {
  const candidate = analysisCandidate(value);
  if (!Array.isArray(candidate.tokens) || candidate.tokens.length === 0) {
    throw new JsonWorkspaceError("invalid-analysis", "No non-empty tokens array was found.");
  }
  const tokens = candidate.tokens.map<JsonWorkspaceToken>((item, index) => {
    if (!isRecord(item)) {
      throw new JsonWorkspaceError("invalid-analysis", `Token ${index + 1} must be an object.`);
    }
    if (typeof item.surface !== "string" || typeof item.gloss !== "string") {
      throw new JsonWorkspaceError(
        "invalid-analysis",
        `Token ${index + 1} is missing a string surface or gloss field.`,
      );
    }
    const punctuation = separateAttachedPunctuation(
      item.surface,
      item.punctuationBefore,
      item.punctuationAfter,
    );
    if (!punctuation.surface.trim()) {
      throw new JsonWorkspaceError(
        "invalid-analysis",
        `Token ${index + 1} has no lexical surface after punctuation was separated.`,
      );
    }
    if (!item.gloss.trim()) {
      throw new JsonWorkspaceError(
        "invalid-analysis",
        `Token ${index + 1} requires a non-empty contextual English gloss.`,
      );
    }
    const pos = typeof item.pos === "string" && item.pos.trim()
      ? item.pos.trim().toUpperCase()
      : "X";
    if (!UD_POS.has(pos)) {
      throw new JsonWorkspaceError(
        "invalid-analysis",
        `Token ${index + 1} has unsupported UD POS ${JSON.stringify(item.pos)}.`,
      );
    }
    if (item.confidence !== undefined && (!finiteNumber(item.confidence) || item.confidence < 0 || item.confidence > 1)) {
      throw new JsonWorkspaceError(
        "invalid-analysis",
        `Token ${index + 1} confidence must be a number from 0 to 1.`,
      );
    }
    const sourceId = normalizeSourceTokenId(item.id);
    const breakAfter: JsonWorkspaceBreakAfter =
      item.breakAfter === "line" || item.breakAfter === "paragraph"
        ? item.breakAfter
        : "none";
    return {
      id: sourceId ?? `imported-${index + 1}`,
      surface: punctuation.surface,
      punctuationBefore: punctuation.punctuationBefore,
      punctuationAfter: punctuation.punctuationAfter,
      pinyin: typeof item.pinyin === "string" ? item.pinyin.normalize("NFC") : undefined,
      romanization: typeof item.romanization === "string"
        ? item.romanization.normalize("NFC")
        : undefined,
      lemma: typeof item.lemma === "string" ? item.lemma : "",
      gloss: item.gloss,
      pos,
      morphology: typeof item.morphology === "string" ? item.morphology : "",
      features: normalizeFeatures(item.features),
      confidence: finiteNumber(item.confidence) ? item.confidence : 0.8,
      alternatives: Array.isArray(item.alternatives)
        ? item.alternatives.filter((entry): entry is string => typeof entry === "string")
        : [],
      isIndeclinable: typeof item.isIndeclinable === "boolean"
        ? item.isIndeclinable
        : undefined,
      breakAfter,
      blankLinesAfter: finiteNumber(item.blankLinesAfter)
        ? clamp(Math.round(item.blankLinesAfter), 1, 20)
        : undefined,
      blankLineSpacing: finiteNumber(item.blankLineSpacing)
        ? clamp(item.blankLineSpacing, 1, 200)
        : undefined,
      wordFont: optionalString(item.wordFont),
      wordSize: finiteNumber(item.wordSize) ? clamp(item.wordSize, 4, 144) : undefined,
      wordColor: typeof item.wordColor === "string" && /^#[0-9a-f]{6}$/iu.test(item.wordColor)
        ? item.wordColor
        : undefined,
      wordBold: item.wordBold === true || undefined,
      wordItalic: item.wordItalic === true || undefined,
      wordUnderline: item.wordUnderline === true || undefined,
      lemmaColor: typeof item.lemmaColor === "string" && /^#[0-9a-f]{6}$/iu.test(item.lemmaColor)
        ? item.lemmaColor
        : undefined,
      lemmaUnderline: item.lemmaUnderline === true || undefined,
      morphColor: typeof item.morphColor === "string" && /^#[0-9a-f]{6}$/iu.test(item.morphColor)
        ? item.morphColor
        : undefined,
      morphUnderline: item.morphUnderline === true || undefined,
      pronunciationSize: finiteNumber(item.pronunciationSize)
        ? clamp(item.pronunciationSize, 7, 144)
        : undefined,
      pronunciationColor: typeof item.pronunciationColor === "string"
        && /^#[0-9a-f]{6}$/iu.test(item.pronunciationColor)
        ? item.pronunciationColor.toLowerCase()
        : undefined,
      styleOverrides: normalizeTokenStyleOverride(item.styleOverrides),
      separatorAfter: typeof item.separatorAfter === "string" ? item.separatorAfter : undefined,
    };
  });

  const reconstructedSource = reconstructJsonWorkspaceSourceText(tokens);
  const suppliedSource = typeof candidate.sourceText === "string" ? candidate.sourceText : "";
  const language = fallbackLanguage === "omni"
    ? "omni"
    : isStoaWorkspaceLanguageId(candidate.language)
      ? candidate.language
      : detectLanguage(suppliedSource || reconstructedSource, fallbackLanguage);
  const sourceText = suppliedSource || reconstructedSource;
  const rawDetection = isRecord(candidate.languageDetection)
    ? candidate.languageDetection as Partial<OmniLanguageDetection>
    : undefined;
  const resolution = language === "omni"
    ? resolveOmniLanguageProfile({
        sourceText,
        detection: normalizeOmniLanguageDetection(rawDetection, sourceText).detection,
        aiClaims: {
          analysisProfile: candidate.analysisProfile,
          morphologyStandard: candidate.morphologyStandard,
          capabilities: candidate.capabilities,
        },
      })
    : null;

  if (resolution?.analysisProfile === "rich-inflectional") {
    tokens.forEach((token, index) => {
      const missing = [
        !token.gloss.trim() ? "gloss" : "",
        !token.lemma.trim() ? "lemma" : "",
        !token.pos.trim() ? "POS" : "",
        !token.morphology.trim() ? "morphology" : "",
      ].filter(Boolean);
      if (missing.length) {
        throw new JsonWorkspaceError(
          "invalid-analysis",
          `Rich Inflectional token ${index + 1} is missing ${missing.join(", ")}. Retry that token or import a complete analysis.`,
        );
      }
    });
  }

  return {
    language,
    sourceText,
    literalTranslation: typeof candidate.literalTranslation === "string"
      ? candidate.literalTranslation
      : "",
    naturalTranslation: typeof candidate.naturalTranslation === "string"
      ? candidate.naturalTranslation
      : "",
    tokens,
    notes: normalizeAnalysisNotes(candidate.notes, tokens.map((token) => token.id)),
    languageDetection: resolution?.detection,
    analysisProfile: resolution?.analysisProfile,
    morphologyStandard: resolution?.morphologyStandard,
  };
};

export const createBlankJsonWorkspaceAnalysis = (
  language: JsonWorkspaceLanguage,
): JsonWorkspaceAnalysis => ({
  language,
  sourceText: "",
  literalTranslation: "",
  naturalTranslation: "",
  tokens: [],
  notes: [],
  ...(language === "omni" ? {
    languageDetection: { ...DEFAULT_OMNI_LANGUAGE_DETECTION },
    analysisProfile: "generic" as const,
    morphologyStandard: "stoa.omni.generic.v1",
  } : {}),
});

export const isBlankJsonWorkspaceAnalysis = (analysis: JsonWorkspaceAnalysis) =>
  analysis.tokens.length === 0
  && !analysis.sourceText.trim()
  && !analysis.literalTranslation.trim()
  && !analysis.naturalTranslation.trim()
  && normalizeAnalysisNotes(analysis.notes).every((note) => !note.text.trim());

const uniqueId = (preferred: string, fallback: string, used: Set<string>) => {
  const normalizedPreferred = normalizeSourceTokenId(preferred);
  const base = normalizedPreferred ?? cleanGeneratedIdPart(fallback);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  used.add(id);
  return id;
};

const ensureUniqueAnalysisIds = (
  analysis: JsonWorkspaceAnalysis,
  namespace: string,
  initialIds: Iterable<string> = [],
) => {
  const normalizedNotes = normalizeAnalysisNotes(
    analysis.notes,
    analysis.tokens.map((token) => token.id),
  );
  const used = new Set(initialIds);
  const idMap = new Map<string, string>();
  const tokens = analysis.tokens.map((token, index) => {
    const id = uniqueId(token.id, `${namespace}-token-${index + 1}`, used);
    if (!idMap.has(token.id)) idMap.set(token.id, id);
    return { ...cloneToken(token), id };
  });
  return {
    ...cloneJsonWorkspaceAnalysis(analysis),
    tokens,
    notes: normalizeAnalysisNotes(
      normalizedNotes.map((note) => ({
        ...note,
        tokenId: note.tokenId ? idMap.get(note.tokenId) ?? note.tokenId : null,
      })),
      tokens.map((token) => token.id),
    ),
  };
};

const trimSection = (value: string) => value.trim();

const joinSections = (left: string, right: string) =>
  [trimSection(left), trimSection(right)].filter(Boolean).join("\n\n");

const mergeOmniDetection = (
  left: JsonWorkspaceAnalysis,
  right: JsonWorkspaceAnalysis,
  combinedSource: string,
) => {
  if (left.language !== "omni" || right.language !== "omni") return {};
  const leftDetection = left.languageDetection ?? DEFAULT_OMNI_LANGUAGE_DETECTION;
  const rightDetection = right.languageDetection ?? DEFAULT_OMNI_LANGUAGE_DETECTION;
  const agrees = leftDetection.languageId === rightDetection.languageId
    && leftDetection.script === rightDetection.script
    && !leftDetection.isMixedLanguage
    && !rightDetection.isMixedLanguage;
  const detection: OmniLanguageDetection = agrees
    ? {
        ...leftDetection,
        confidence: Math.min(leftDetection.confidence, rightDetection.confidence),
      }
    : {
        ...DEFAULT_OMNI_LANGUAGE_DETECTION,
        languageName: "Mixed or undetermined",
        script: leftDetection.script === rightDetection.script ? leftDetection.script : "Zzzz",
        confidence: Math.min(leftDetection.confidence, rightDetection.confidence),
        isMixedLanguage: true,
      };
  const resolution = resolveOmniLanguageProfile({ sourceText: combinedSource, detection });
  return {
    languageDetection: resolution.detection,
    analysisProfile: resolution.analysisProfile,
    morphologyStandard: resolution.morphologyStandard,
  };
};

const assertCompatibleLanguages = (
  left: JsonWorkspaceAnalysis,
  right: JsonWorkspaceAnalysis,
) => {
  if (
    !isBlankJsonWorkspaceAnalysis(left)
    && !isBlankJsonWorkspaceAnalysis(right)
    && left.language !== right.language
  ) {
    throw new JsonWorkspaceError(
      "language-mismatch",
      `Cannot append ${right.language} JSON to a ${left.language} document. Start a blank workspace first.`,
    );
  }
};

/**
 * Appends one normalized analysis. Batch boundaries are true paragraph breaks,
 * while punctuation, explicit blank-line counts and all word styles survive.
 */
export const mergeJsonWorkspaceAnalysis = (
  current: JsonWorkspaceAnalysis,
  imported: JsonWorkspaceAnalysis,
  idNamespace = "json-import",
): JsonWorkspaceAnalysis => {
  assertCompatibleLanguages(current, imported);
  if (isBlankJsonWorkspaceAnalysis(imported)) return cloneJsonWorkspaceAnalysis(current);
  if (isBlankJsonWorkspaceAnalysis(current)) {
    return ensureUniqueAnalysisIds(imported, idNamespace);
  }

  const left = ensureUniqueAnalysisIds(current, "existing");
  const right = ensureUniqueAnalysisIds(
    imported,
    idNamespace,
    left.tokens.map((token) => token.id),
  );
  const tokens = left.tokens.map(cloneToken);
  const finalLeftToken = tokens.at(-1);
  if (finalLeftToken && finalLeftToken.breakAfter !== "paragraph") {
    finalLeftToken.breakAfter = "paragraph";
  }
  tokens.push(...right.tokens.map(cloneToken));

  const sourceText = joinSections(left.sourceText, right.sourceText);

  return {
    language: left.language,
    sourceText,
    literalTranslation: joinSections(left.literalTranslation, right.literalTranslation),
    naturalTranslation: joinSections(left.naturalTranslation, right.naturalTranslation),
    tokens,
    notes: mergeAnalysisNotes(left.notes, right.notes),
    ...mergeOmniDetection(left, right, sourceText),
  };
};

const overlayJsonWorkspaceAnalysis = (
  current: JsonWorkspaceAnalysis,
  overlay: JsonWorkspaceAnalysis,
): JsonWorkspaceAnalysis => {
  assertCompatibleLanguages(current, overlay);
  const patches = new Map(overlay.tokens.map((token) => [token.id, token]));
  const tokens = current.tokens.map((token) => {
    const patch = patches.get(token.id);
    if (!patch) return cloneToken(token);
    const merged = { ...cloneToken(token), ...cloneToken(patch) };
    return {
      ...merged,
      id: token.id,
      surface: token.surface,
      punctuationBefore: token.punctuationBefore,
      punctuationAfter: token.punctuationAfter,
      breakAfter: token.breakAfter,
      blankLinesAfter: token.blankLinesAfter,
      separatorAfter: token.separatorAfter,
    };
  });
  return {
    ...cloneJsonWorkspaceAnalysis(current),
    tokens,
    sourceText: current.sourceText,
    literalTranslation: overlay.literalTranslation.trim()
      ? overlay.literalTranslation
      : current.literalTranslation,
    naturalTranslation: overlay.naturalTranslation.trim()
      ? overlay.naturalTranslation
      : current.naturalTranslation,
    notes: overlay.notes.length
      ? mergeAnalysisNotes(current.notes, overlay.notes)
      : cloneAnalysisNotes(current.notes),
  };
};

const tokenSignature = (token: JsonWorkspaceToken) =>
  `${token.punctuationBefore}\u0000${token.surface}\u0000${token.punctuationAfter}`
    .normalize("NFC")
    .toLowerCase();

const queueMap = (pairs: Array<[string, string]>) => {
  const result = new Map<string, string[]>();
  pairs.forEach(([key, id]) => {
    const queue = result.get(key) ?? [];
    queue.push(id);
    result.set(key, queue);
  });
  return result;
};

const takeAvailable = (
  queue: string[] | undefined,
  unavailable: Set<string>,
) => {
  while (queue?.length) {
    const candidate = queue.shift();
    if (candidate && !unavailable.has(candidate)) return candidate;
  }
  return null;
};

const assignStableBatchIds = (
  analysis: JsonWorkspaceAnalysis,
  sourceTokenIds: Array<string | null>,
  batchId: string,
  unavailableIds: Set<string>,
  previous?: JsonWorkspaceBatch,
): JsonWorkspaceAnalysis => {
  const used = new Set(unavailableIds);
  const previousBySourceId = queueMap(
    previous
      ? previous.sourceTokenIds.flatMap((sourceId, index): Array<[string, string]> => {
        const stableId = previous.analysis.tokens[index]?.id;
        return sourceId && stableId ? [[sourceId, stableId]] : [];
      })
      : [],
  );
  const previousBySignature = queueMap(
    previous
      ? previous.analysis.tokens.map((token) => [tokenSignature(token), token.id])
      : [],
  );
  const ordinalReuseIsSafe = Boolean(
    previous
    && previous.analysis.tokens.length === analysis.tokens.length
    && previous.sourceTokenIds.every((id) => id === null)
    && sourceTokenIds.every((id) => id === null),
  );

  const idMap = new Map<string, string>();
  const tokens = analysis.tokens.map((token, index) => {
    const sourceId = sourceTokenIds[index];
    const fromSourceId = sourceId
      ? takeAvailable(previousBySourceId.get(sourceId), used)
      : null;
    const fromSignature = fromSourceId
      ? null
      : takeAvailable(previousBySignature.get(tokenSignature(token)), used);
    const ordinalId = ordinalReuseIsSafe ? previous?.analysis.tokens[index]?.id : undefined;
    const reusableId = fromSourceId
      ?? fromSignature
      ?? (ordinalId && !used.has(ordinalId) ? ordinalId : null);
    if (reusableId) {
      used.add(reusableId);
      const previousToken = previous?.analysis.tokens.find((item) => item.id === reusableId);
      const next = {
        ...inheritMissingTokenStyles(cloneToken(token), previousToken),
        id: reusableId,
      };
      if (!idMap.has(token.id)) idMap.set(token.id, next.id);
      return next;
    }

    const preferred = sourceId && !used.has(sourceId)
      ? sourceId
      : `${batchId}-${cleanGeneratedIdPart(sourceId ?? `token-${index + 1}`)}`;
    const next = {
      ...cloneToken(token),
      id: uniqueId(preferred, `${batchId}-token-${index + 1}`, used),
    };
    if (!idMap.has(token.id)) idMap.set(token.id, next.id);
    return next;
  });
  const notes = normalizeAnalysisNotes(
    analysis.notes.map((note) => ({
      ...note,
      tokenId: note.tokenId ? idMap.get(note.tokenId) ?? note.tokenId : null,
    })),
    tokens.map((token) => token.id),
  );
  return { ...cloneJsonWorkspaceAnalysis(analysis), tokens, notes };
};

const nextBatchIdentity = (workspace: JsonWorkspace) => {
  let sequence = Math.max(1, workspace.nextBatchSequence);
  const existing = new Set(workspace.batches.map((batch) => batch.id));
  let id = `json-batch-${String(sequence).padStart(4, "0")}`;
  while (existing.has(id)) {
    sequence += 1;
    id = `json-batch-${String(sequence).padStart(4, "0")}`;
  }
  return { id, sequence, nextSequence: sequence + 1 };
};

export const createJsonWorkspace = (
  baseAnalysis: JsonWorkspaceAnalysis,
): JsonWorkspace => ({
  format: WORKSPACE_FORMAT,
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  language: baseAnalysis.language,
  baseAnalysis: ensureUniqueAnalysisIds(baseAnalysis, "base"),
  batches: [],
  activeBatchId: null,
  draftText: "",
  nextBatchSequence: 1,
});

export const cloneJsonWorkspace = (workspace: JsonWorkspace): JsonWorkspace => ({
  ...workspace,
  baseAnalysis: cloneJsonWorkspaceAnalysis(workspace.baseAnalysis),
  batches: workspace.batches.map((batch) => ({
    ...batch,
    rawHistory: batch.rawHistory.map((revision) => ({ ...revision })),
    sourceTokenIds: [...batch.sourceTokenIds],
    importSummary: cloneBatchImportSummary(batch.importSummary),
    analysis: cloneJsonWorkspaceAnalysis(batch.analysis),
  })),
});

/** Keeps UI-applied token typography in the normalized workspace data. */
export const updateJsonWorkspaceTokenStyles = (
  workspace: JsonWorkspace,
  tokenId: string,
  patch: Partial<JsonWorkspaceTokenStylePatch>,
): JsonWorkspace => {
  const apply = (analysis: JsonWorkspaceAnalysis): JsonWorkspaceAnalysis => ({
    ...analysis,
    tokens: analysis.tokens.map((token) => {
      if (token.id !== tokenId) return cloneToken(token);
      const next = { ...cloneToken(token), ...patch };
      if (Object.hasOwn(patch, "styleOverrides")) {
        next.styleOverrides = normalizeTokenStyleOverride(patch.styleOverrides);
      }
      return next;
    }),
    notes: cloneAnalysisNotes(analysis.notes),
  });
  return {
    ...workspace,
    baseAnalysis: apply(workspace.baseAnalysis),
    batches: workspace.batches.map((batch) => ({
      ...batch,
      analysis: apply(batch.analysis),
      rawHistory: batch.rawHistory.map((revision) => ({ ...revision })),
      sourceTokenIds: [...batch.sourceTokenIds],
    })),
  };
};

/** Removes normalized tokens from retained batches without rewriting the user's raw JSON history. */
export const removeJsonWorkspaceTokens = (
  workspace: JsonWorkspace,
  tokenIds: Iterable<string>,
): JsonWorkspace => {
  const removed = new Set(tokenIds);
  const removeFromAnalysis = (analysis: JsonWorkspaceAnalysis): JsonWorkspaceAnalysis => ({
    ...analysis,
    tokens: analysis.tokens.filter((token) => !removed.has(token.id)).map(cloneToken),
    notes: analysis.notes
      .filter((note) => !note.tokenId || !removed.has(note.tokenId))
      .map((note) => ({ ...note })),
  });
  return {
    ...workspace,
    baseAnalysis: removeFromAnalysis(workspace.baseAnalysis),
    batches: workspace.batches.map((batch) => {
      const retainedIndices = batch.analysis.tokens.flatMap((token, index) =>
        removed.has(token.id) ? [] : [index],
      );
      return {
        ...batch,
        analysis: removeFromAnalysis(batch.analysis),
        sourceTokenIds: retainedIndices.map((index) => batch.sourceTokenIds[index] ?? null),
        rawHistory: batch.rawHistory.map((revision) => ({ ...revision })),
      };
    }),
  };
};

export const materializeJsonWorkspace = (
  workspace: JsonWorkspace,
): JsonWorkspaceAnalysis =>
  workspace.batches.reduce(
    (document, batch) => batch.applicationMode === "overlay"
      ? overlayJsonWorkspaceAnalysis(document, batch.analysis)
      : mergeJsonWorkspaceAnalysis(document, batch.analysis, batch.id),
    cloneJsonWorkspaceAnalysis(workspace.baseAnalysis),
  );

export const updateJsonWorkspaceDraft = (
  workspace: JsonWorkspace,
  draftText: string,
): JsonWorkspace => ({ ...workspace, draftText });

/** Clears the editor for a distinct additional import without deleting history. */
export const beginNewJsonWorkspaceBatch = (
  workspace: JsonWorkspace,
  draftText = "",
): JsonWorkspace => ({
  ...workspace,
  activeBatchId: null,
  draftText,
});

/** Loads an earlier batch into the same editable JSON textarea. */
export const selectJsonWorkspaceBatch = (
  workspace: JsonWorkspace,
  batchId: string,
): JsonWorkspace => {
  const batch = workspace.batches.find((candidate) => candidate.id === batchId);
  if (!batch) {
    throw new JsonWorkspaceError("unknown-batch", `JSON batch ${batchId} does not exist.`);
  }
  return { ...workspace, activeBatchId: batch.id, draftText: batch.rawText };
};

/**
 * Appends a new parsed JSON batch or replaces an existing batch at the same
 * position. Replacement reuses stable IDs and can never duplicate the old copy.
 */
export const applyJsonWorkspaceBatch = (
  workspace: JsonWorkspace,
  options: ApplyJsonWorkspaceBatchOptions,
): ApplyJsonWorkspaceBatchResult => {
  const rawText = options.rawText ?? workspace.draftText;
  if (!rawText.trim()) {
    throw new JsonWorkspaceError("empty-raw-text", "Paste JSON before importing this batch.");
  }
  const requestedBatchId = options.batchId === undefined
    ? workspace.activeBatchId
    : options.batchId;
  const previousBatch = requestedBatchId
    ? workspace.batches.find((batch) => batch.id === requestedBatchId)
    : undefined;
  if (requestedBatchId && !previousBatch) {
    throw new JsonWorkspaceError("unknown-batch", `JSON batch ${requestedBatchId} does not exist.`);
  }

  const identity = previousBatch
    ? { id: previousBatch.id, sequence: previousBatch.sequence, nextSequence: workspace.nextBatchSequence }
    : nextBatchIdentity(workspace);
  const normalized = normalizeJsonWorkspaceAnalysis(options.value, workspace.language);
  const sourceTokenIds = sourceTokenIdsFromValue(options.value);
  const retainedBatches = previousBatch
    ? workspace.batches.filter((batch) => batch.id !== previousBatch.id)
    : workspace.batches;
  const retainedWorkspace: JsonWorkspace = { ...workspace, batches: retainedBatches };
  const retainedDocument = materializeJsonWorkspace(retainedWorkspace);
  assertCompatibleLanguages(retainedDocument, normalized);
  const unavailableIds = new Set(retainedDocument.tokens.map((token) => token.id));
  const stableAnalysis = assignStableBatchIds(
    normalized,
    sourceTokenIds,
    identity.id,
    unavailableIds,
    previousBatch,
  );
  const revision = previousBatch ? previousBatch.revision + 1 : 1;
  const rawHistory = [
    ...(previousBatch?.rawHistory ?? []),
    { revision, rawText },
  ].slice(-MAX_RAW_REVISIONS_PER_BATCH);
  const batch: JsonWorkspaceBatch = {
    id: identity.id,
    sequence: identity.sequence,
    revision,
    rawText,
    rawHistory,
    analysis: stableAnalysis,
    sourceTokenIds,
  };
  const batches = previousBatch
    ? workspace.batches.map((candidate) => candidate.id === previousBatch.id ? batch : candidate)
    : [...workspace.batches, batch];
  const pendingWorkspace: JsonWorkspace = {
    ...workspace,
    batches,
    activeBatchId: batch.id,
    draftText: rawText,
    nextBatchSequence: identity.nextSequence,
  };
  const analysis = materializeJsonWorkspace(pendingWorkspace);
  const nextWorkspace = { ...pendingWorkspace, language: analysis.language };
  return {
    workspace: nextWorkspace,
    analysis,
    batchId: batch.id,
    mode: previousBatch ? "replace" : "append",
    selectedTokenId: batch.analysis.tokens[0]?.id ?? null,
  };
};

/**
 * Loads one self-contained, permissively normalized analysis into the retained
 * JSON workspace. New imports append; editing the active batch replaces that
 * batch in place while preserving its stable runtime IDs and raw revision log.
 */
export const applyPermissiveJsonWorkspaceBatch = (
  workspace: JsonWorkspace,
  options: ApplyPermissiveJsonWorkspaceBatchOptions,
): ApplyPermissiveJsonWorkspaceBatchResult => {
  const rawText = options.rawText ?? workspace.draftText;
  if (!rawText.trim()) {
    throw new JsonWorkspaceError("empty-raw-text", "Paste JSON before importing this batch.");
  }
  const requestedBatchId = options.batchId === undefined
    ? workspace.activeBatchId
    : options.batchId;
  const previousBatch = requestedBatchId
    ? workspace.batches.find((batch) => batch.id === requestedBatchId)
    : undefined;
  if (requestedBatchId && !previousBatch) {
    throw new JsonWorkspaceError("unknown-batch", `JSON batch ${requestedBatchId} does not exist.`);
  }

  const loaded = loadPermissiveAnalysis(options.value, workspace.language);
  const identity = previousBatch
    ? { id: previousBatch.id, sequence: previousBatch.sequence, nextSequence: workspace.nextBatchSequence }
    : nextBatchIdentity(workspace);
  const retainedBatches = previousBatch
    ? workspace.batches.filter((batch) => batch.id !== previousBatch.id)
    : workspace.batches;
  const retainedWorkspace: JsonWorkspace = { ...workspace, batches: retainedBatches };
  const retainedDocument = materializeJsonWorkspace(retainedWorkspace);
  assertCompatibleLanguages(retainedDocument, loaded.analysis);
  const sourceTokenIds = loaded.analysis.tokens.map((token) => token.id);
  const stableAnalysis = assignStableBatchIds(
    loaded.analysis,
    sourceTokenIds,
    identity.id,
    new Set(retainedDocument.tokens.map((token) => token.id)),
    previousBatch,
  );
  const revision = previousBatch ? previousBatch.revision + 1 : 1;
  const rawHistory = [
    ...(previousBatch?.rawHistory ?? []),
    { revision, rawText },
  ].slice(-MAX_RAW_REVISIONS_PER_BATCH);
  const importSummary = clonePermissiveImportSummary(loaded.summary) as PermissiveAnalysisImportSummary;
  const batch: JsonWorkspaceBatch = {
    id: identity.id,
    sequence: identity.sequence,
    revision,
    rawText,
    rawHistory,
    analysis: stableAnalysis,
    sourceTokenIds,
    applicationMode: "append",
    importSummary,
  };
  const batches = previousBatch
    ? workspace.batches.map((candidate) => candidate.id === previousBatch.id ? batch : candidate)
    : [...workspace.batches, batch];
  const pendingWorkspace: JsonWorkspace = {
    ...workspace,
    batches,
    activeBatchId: batch.id,
    draftText: rawText,
    nextBatchSequence: identity.nextSequence,
  };
  const analysis = materializeJsonWorkspace(pendingWorkspace);
  return {
    workspace: { ...pendingWorkspace, language: analysis.language },
    analysis,
    batchId: batch.id,
    mode: previousBatch ? "replace" : "append",
    selectedTokenId: batch.analysis.tokens[0]?.id ?? null,
    importSummary,
  };
};

type SalvagedTokenFields = {
  token: JsonWorkspaceToken;
  importedFieldCount: number;
  invalidFields: JsonWorkspaceInvalidField[];
};

const own = (value: Record<string, unknown>, key: string) => Object.hasOwn(value, key);

const salvageTokenFields = (
  value: Record<string, unknown>,
  target: JsonWorkspaceToken,
): SalvagedTokenFields => {
  const token = cloneToken(target);
  const invalidFields: JsonWorkspaceInvalidField[] = [];
  let importedFieldCount = 0;
  const invalid = (field: string, message: string) => {
    invalidFields.push({ tokenId: target.id, field, message });
  };
  const nonEmptyString = (field: "gloss" | "lemma" | "morphology") => {
    if (!own(value, field)) return;
    const candidate = value[field];
    if (typeof candidate !== "string" || !candidate.trim() || candidate.length > 10_000) {
      invalid(field, `${field} was empty or not a usable string; the existing value was preserved.`);
      return;
    }
    token[field] = candidate;
    importedFieldCount += 1;
  };
  nonEmptyString("gloss");
  nonEmptyString("lemma");
  nonEmptyString("morphology");

  const pronunciationString = (field: "pinyin" | "romanization") => {
    if (!own(value, field)) return;
    const candidate = value[field];
    if (typeof candidate !== "string" || candidate.length > 10_000) {
      invalid(field, `${field} was not a usable string; the existing value was preserved.`);
      return;
    }
    token[field] = candidate.normalize("NFC");
    importedFieldCount += 1;
  };
  pronunciationString("pinyin");
  pronunciationString("romanization");

  if (own(value, "pos")) {
    const candidate = typeof value.pos === "string" ? value.pos.trim().toUpperCase() : "";
    if (!candidate || !UD_POS.has(candidate)) {
      invalid("pos", "POS was empty or outside the supported UD inventory; the existing value was preserved.");
    } else {
      token.pos = candidate;
      importedFieldCount += 1;
    }
  }

  if (own(value, "features")) {
    if (!isRecord(value.features)) {
      invalid("features", "Features must be a plain object containing non-empty string values.");
    } else {
      const entries = Object.entries(value.features);
      const valid = entries.length > 0 && entries.every(([key, entry]) =>
        safeImportedKey(key) && typeof entry === "string" && Boolean(entry.trim()));
      if (!valid) {
        if (entries.length) invalid("features", "Malformed or unsafe feature entries were ignored as one field.");
      } else {
        token.features = Object.fromEntries(entries.map(([key, entry]) => [key, (entry as string).trim()]));
        importedFieldCount += 1;
      }
    }
  }

  if (own(value, "confidence")) {
    if (!finiteNumber(value.confidence)) {
      invalid("confidence", "Confidence was not a finite number; the existing value was preserved.");
    } else {
      const clamped = clamp(value.confidence, 0, 1);
      token.confidence = clamped;
      importedFieldCount += 1;
      if (clamped !== value.confidence) {
        invalid("confidence", "Confidence was outside 0–1 and was safely clamped.");
      }
    }
  }

  if (own(value, "alternatives")) {
    const alternatives = value.alternatives;
    const valid = Array.isArray(alternatives)
      && alternatives.length > 0
      && alternatives.every((entry) => typeof entry === "string" && Boolean(entry.trim()));
    if (!valid) {
      if (!Array.isArray(alternatives) || alternatives.length > 0) {
        invalid("alternatives", "Alternatives must be a non-empty string array; the existing value was preserved.");
      }
    } else {
      token.alternatives = alternatives.map((entry: string) => entry.trim());
      importedFieldCount += 1;
    }
  }

  if (own(value, "isIndeclinable")) {
    if (typeof value.isIndeclinable !== "boolean") {
      invalid("isIndeclinable", "isIndeclinable must be a boolean.");
    } else {
      token.isIndeclinable = value.isIndeclinable;
      importedFieldCount += 1;
    }
  }

  const canonicalStringFields = ["punctuationBefore", "punctuationAfter", "separatorAfter"] as const;
  canonicalStringFields.forEach((field) => {
    if (!own(value, field) || value[field] === null || value[field] === "") return;
    if (typeof value[field] !== "string" || value[field] !== (target[field] ?? "")) {
      invalid(field, `${field} conflicted with the locally preserved source and was ignored.`);
    }
  });
  if (own(value, "breakAfter") && value.breakAfter !== null && value.breakAfter !== "") {
    const candidate = value.breakAfter;
    if (
      (candidate !== "none" && candidate !== "line" && candidate !== "paragraph")
      || candidate !== (target.breakAfter ?? "none")
    ) {
      invalid("breakAfter", "breakAfter conflicted with the locally preserved source and was ignored.");
    }
  }
  if (own(value, "blankLinesAfter") && value.blankLinesAfter !== null) {
    const expected = target.blankLinesAfter ?? 1;
    if (!finiteNumber(value.blankLinesAfter) || clamp(Math.round(value.blankLinesAfter), 1, 20) !== expected) {
      invalid("blankLinesAfter", "blankLinesAfter conflicted with the locally preserved paragraph structure and was ignored.");
    }
  }

  const optionalFont = (field: "wordFont") => {
    if (!own(value, field)) return;
    const candidate = optionalString(value[field]);
    if (!candidate) {
      if (value[field] !== null && value[field] !== "") invalid(field, `${field} was not a usable string.`);
      return;
    }
    token[field] = candidate;
    importedFieldCount += 1;
  };
  optionalFont("wordFont");
  if (own(value, "wordSize")) {
    if (!finiteNumber(value.wordSize)) invalid("wordSize", "wordSize was not a finite number.");
    else {
      token.wordSize = clamp(value.wordSize, 4, 144);
      importedFieldCount += 1;
    }
  }
  if (own(value, "pronunciationSize")) {
    if (!finiteNumber(value.pronunciationSize)) {
      invalid("pronunciationSize", "pronunciationSize was not a finite number.");
    } else {
      token.pronunciationSize = clamp(value.pronunciationSize, 7, 144);
      importedFieldCount += 1;
    }
  }
  (["wordColor", "lemmaColor", "morphColor", "pronunciationColor"] as const).forEach((field) => {
    if (!own(value, field)) return;
    if (typeof value[field] !== "string" || !/^#[0-9a-f]{6}$/iu.test(value[field])) {
      if (value[field] !== null && value[field] !== "") invalid(field, `${field} was not a six-digit hex color.`);
      return;
    }
    token[field] = value[field];
    importedFieldCount += 1;
  });
  (["wordBold", "wordItalic", "wordUnderline", "lemmaUnderline", "morphUnderline"] as const)
    .forEach((field) => {
      if (!own(value, field)) return;
      if (typeof value[field] !== "boolean") {
        if (value[field] !== null) invalid(field, `${field} was not a boolean.`);
        return;
      }
      token[field] = value[field] || undefined;
      importedFieldCount += 1;
    });
  if (own(value, "styleOverrides")) {
    const normalized = normalizeTokenStyleOverride(value.styleOverrides);
    if (!normalized) {
      if (value.styleOverrides !== null) invalid("styleOverrides", "styleOverrides contained no supported values.");
    } else {
      token.styleOverrides = normalized;
      importedFieldCount += 1;
    }
  }
  return { token, importedFieldCount, invalidFields };
};

const usableReturnedSurface = (value: Record<string, unknown>) => {
  if (typeof value.surface !== "string" || !value.surface.trim()) return null;
  const separated = separateAttachedPunctuation(
    value.surface,
    typeof value.punctuationBefore === "string" ? value.punctuationBefore : undefined,
    typeof value.punctuationAfter === "string" ? value.punctuationAfter : undefined,
  );
  return separated.surface.trim() ? separated.surface : null;
};

const legacySequentialTokenId = (id: string) =>
  /^(?:tok|token|word|imported)[-_:]?\d+$/iu.test(id);

const uniqueStrings = (values: Iterable<string>) => Array.from(new Set(values));

const validTopLevelString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;

/**
 * Manual pasted/file JSON only: salvage safe fields token by token while the
 * existing strict Guided Chunk Analysis validation path remains unchanged.
 */
export const applyBestEffortJsonWorkspaceBatch = (
  workspace: JsonWorkspace,
  options: ApplyBestEffortJsonWorkspaceBatchOptions,
): ApplyJsonWorkspaceBatchResult => {
  const rawText = options.rawText ?? workspace.draftText;
  if (!rawText.trim()) {
    throw new JsonWorkspaceError("empty-raw-text", "Paste JSON before importing this batch.");
  }
  const candidate = analysisCandidate(options.value);
  if (!Array.isArray(candidate.tokens) || candidate.tokens.length === 0) {
    throw new JsonWorkspaceError("invalid-analysis", "No usable tokens array was found.");
  }
  const returnedTokens = candidate.tokens;

  const requestedBatchId = options.batchId === undefined ? workspace.activeBatchId : options.batchId;
  const previousBatch = requestedBatchId
    ? workspace.batches.find((batch) => batch.id === requestedBatchId)
    : undefined;
  if (requestedBatchId && !previousBatch) {
    throw new JsonWorkspaceError("unknown-batch", `JSON batch ${requestedBatchId} does not exist.`);
  }
  const expected = previousBatch?.applicationMode !== "overlay"
    ? cloneJsonWorkspaceAnalysis(previousBatch?.analysis ?? options.expectedAnalysis)
    : cloneJsonWorkspaceAnalysis(options.expectedAnalysis);
  if (!expected.tokens.length || !expected.sourceText.trim()) {
    throw new JsonWorkspaceError("invalid-analysis", "No canonical source tokens are available for this import.");
  }
  if (expected.language !== workspace.language) {
    throw new JsonWorkspaceError("language-mismatch", "The canonical source language does not match this JSON workspace.");
  }
  if (
    typeof candidate.sourceText === "string"
    && candidate.sourceText.trim()
    && !sourceDocumentsMatch(candidate.sourceText, expected.sourceText)
  ) {
    throw new JsonWorkspaceError(
      "invalid-analysis",
      "This JSON is associated with a different source document. The current preview was not changed.",
    );
  }
  if (
    workspace.language !== "omni"
    && isStoaWorkspaceLanguageId(candidate.language)
    && candidate.language !== workspace.language
  ) {
    throw new JsonWorkspaceError(
      "language-mismatch",
      `This JSON declares ${candidate.language}, but the active source is ${workspace.language}.`,
    );
  }

  const expectedById = new Map(expected.tokens.map((token, index) => [token.id, { token, index }]));
  const knownGroups = new Map<string, number[]>();
  returnedTokens.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const id = normalizeSourceTokenId(entry.id);
    if (!id || !expectedById.has(id)) return;
    const group = knownGroups.get(id) ?? [];
    group.push(index);
    knownGroups.set(id, group);
  });

  const processed = new Set<number>();
  const imported = new Map<string, SalvagedTokenFields>();
  const matchedIdentityIds = new Set<string>();
  const unknownTokenIds = new Set<string>();
  const surfaceMismatchTokenIds = new Set<string>();
  const duplicateTokenIds = new Set<string>();
  const ambiguousFallbackSurfaces = new Set<string>();
  const invalidFields: JsonWorkspaceInvalidField[] = [];
  let skippedEntryCount = 0;
  let lastMatchedSourceIndex = -1;

  const accept = (target: JsonWorkspaceToken, targetIndex: number, entry: Record<string, unknown>) => {
    matchedIdentityIds.add(target.id);
    lastMatchedSourceIndex = Math.max(lastMatchedSourceIndex, targetIndex);
    const salvaged = salvageTokenFields(entry, target);
    invalidFields.push(...salvaged.invalidFields);
    if (!salvaged.importedFieldCount) {
      skippedEntryCount += 1;
      return;
    }
    imported.set(target.id, salvaged);
  };

  returnedTokens.forEach((entry, index) => {
    if (processed.has(index)) return;
    if (!isRecord(entry)) {
      processed.add(index);
      skippedEntryCount += 1;
      return;
    }
    const returnedId = normalizeSourceTokenId(entry.id);
    const known = returnedId ? expectedById.get(returnedId) : undefined;
    if (known && returnedId) {
      const groupIndices = knownGroups.get(returnedId) ?? [index];
      groupIndices.forEach((groupIndex) => processed.add(groupIndex));
      if (groupIndices.length > 1) duplicateTokenIds.add(returnedId);
      const candidates = groupIndices.flatMap((groupIndex) => {
        const grouped = returnedTokens[groupIndex];
        if (!isRecord(grouped)) return [];
        const surface = usableReturnedSurface(grouped);
        if (!surface || surface.normalize("NFC") !== known.token.surface.normalize("NFC")) {
          surfaceMismatchTokenIds.add(returnedId);
          return [];
        }
        matchedIdentityIds.add(returnedId);
        return [{
          grouped,
          groupIndex,
          salvaged: salvageTokenFields(grouped, known.token),
        }];
      });
      const selected = candidates.reduce<typeof candidates[number] | null>((best, item) => {
        if (!best || item.salvaged.importedFieldCount > best.salvaged.importedFieldCount) return item;
        return best;
      }, null);
      skippedEntryCount += Math.max(0, groupIndices.length - (selected?.salvaged.importedFieldCount ? 1 : 0));
      if (!selected || !selected.salvaged.importedFieldCount) {
        if (selected) invalidFields.push(...selected.salvaged.invalidFields);
        return;
      }
      lastMatchedSourceIndex = Math.max(lastMatchedSourceIndex, known.index);
      invalidFields.push(...selected.salvaged.invalidFields);
      imported.set(returnedId, selected.salvaged);
      return;
    }

    processed.add(index);
    if (returnedId && !legacySequentialTokenId(returnedId)) {
      unknownTokenIds.add(returnedId);
      skippedEntryCount += 1;
      return;
    }
    const surface = usableReturnedSurface(entry);
    if (!surface) {
      skippedEntryCount += 1;
      invalidFields.push({
        tokenId: returnedId ?? `entry-${index + 1}`,
        field: "surface",
        message: "The entry had no usable surface and could not be matched.",
      });
      return;
    }
    const matches = expected.tokens.flatMap((token, targetIndex) =>
      !matchedIdentityIds.has(token.id)
      && token.surface.normalize("NFC") === surface.normalize("NFC")
        ? [{ token, targetIndex }]
        : []);
    if (matches.length !== 1 || matches[0].targetIndex < lastMatchedSourceIndex) {
      if (matches.length > 1 || matches[0]?.targetIndex < lastMatchedSourceIndex) {
        ambiguousFallbackSurfaces.add(surface);
      } else if (returnedId) {
        unknownTokenIds.add(returnedId);
      }
      skippedEntryCount += 1;
      return;
    }
    accept(matches[0].token, matches[0].targetIndex, entry);
  });

  if (!imported.size) {
    throw new JsonWorkspaceError("invalid-analysis", "No safely importable token data was found.");
  }

  const expectedIds = expected.tokens.map((token) => token.id);
  const notReturnedTokenIds = expectedIds.filter((id) => !matchedIdentityIds.has(id));
  const unchangedTokenIds = expectedIds.filter((id) => !imported.has(id));
  const importedFieldCount = Array.from(imported.values())
    .reduce((total, item) => total + item.importedFieldCount, 0);
  const summary: JsonWorkspaceImportSummary = {
    state: skippedEntryCount || notReturnedTokenIds.length || unchangedTokenIds.length || invalidFields.length
      ? "partial"
      : "success",
    expectedTokenCount: expected.tokens.length,
    importedTokenCount: imported.size,
    importedFieldCount,
    skippedEntryCount,
    notReturnedTokenIds,
    unchangedTokenIds,
    unknownTokenIds: uniqueStrings(unknownTokenIds),
    surfaceMismatchTokenIds: uniqueStrings(surfaceMismatchTokenIds),
    duplicateTokenIds: uniqueStrings(duplicateTokenIds),
    ambiguousFallbackSurfaces: uniqueStrings(ambiguousFallbackSurfaces),
    invalidFields,
  };

  const retainedBatches = previousBatch
    ? workspace.batches.filter((batch) => batch.id !== previousBatch.id)
    : workspace.batches;
  const retainedWorkspace: JsonWorkspace = { ...workspace, batches: retainedBatches };
  const retainedDocument = materializeJsonWorkspace(retainedWorkspace);
  const applicationMode: "append" | "overlay" = previousBatch?.applicationMode
    ?? (!isBlankJsonWorkspaceAnalysis(retainedDocument)
      && sourceDocumentsMatch(retainedDocument.sourceText, expected.sourceText)
      ? "overlay"
      : "append");
  const identity = previousBatch
    ? { id: previousBatch.id, sequence: previousBatch.sequence, nextSequence: workspace.nextBatchSequence }
    : nextBatchIdentity(workspace);

  const importedTokens = new Map(Array.from(imported, ([id, item]) => [id, item.token]));
  let batchTokens: JsonWorkspaceToken[];
  if (applicationMode === "append") {
    const baseline = previousBatch?.analysis.tokens.length ? previousBatch.analysis.tokens : expected.tokens;
    batchTokens = baseline.map((token) => cloneToken(importedTokens.get(token.id) ?? token));
  } else {
    const baseline = new Map((previousBatch?.analysis.tokens ?? []).map((token) => [token.id, token]));
    importedTokens.forEach((token, id) => baseline.set(id, token));
    batchTokens = expected.tokens.flatMap((token) => {
      const patchToken = baseline.get(token.id);
      return patchToken ? [cloneToken(patchToken)] : [];
    });
  }

  const previousAnalysis = previousBatch?.analysis;
  const notes = Array.isArray(candidate.notes)
    ? normalizeAnalysisNotes(candidate.notes, batchTokens.map((token) => token.id))
    : cloneAnalysisNotes(previousAnalysis?.notes ?? (applicationMode === "append" ? expected.notes : []));
  const importedAnalysis: JsonWorkspaceAnalysis = {
    language: expected.language,
    sourceText: expected.sourceText,
    literalTranslation: validTopLevelString(
      candidate.literalTranslation,
      previousAnalysis?.literalTranslation ?? (applicationMode === "append" ? expected.literalTranslation : ""),
    ),
    naturalTranslation: validTopLevelString(
      candidate.naturalTranslation,
      previousAnalysis?.naturalTranslation ?? (applicationMode === "append" ? expected.naturalTranslation : ""),
    ),
    tokens: batchTokens,
    notes,
    languageDetection: expected.languageDetection,
    analysisProfile: expected.analysisProfile,
    morphologyStandard: expected.morphologyStandard,
  };
  if (expected.language === "omni") {
    const rawDetection = isRecord(candidate.languageDetection)
      ? candidate.languageDetection as Partial<OmniLanguageDetection>
      : expected.languageDetection;
    const resolution = resolveOmniLanguageProfile({
      sourceText: expected.sourceText,
      detection: normalizeOmniLanguageDetection(rawDetection, expected.sourceText).detection,
      aiClaims: {
        analysisProfile: candidate.analysisProfile,
        morphologyStandard: candidate.morphologyStandard,
        capabilities: candidate.capabilities,
      },
    });
    importedAnalysis.languageDetection = resolution.detection;
    importedAnalysis.analysisProfile = resolution.analysisProfile;
    importedAnalysis.morphologyStandard = resolution.morphologyStandard;
  }

  const revision = previousBatch ? previousBatch.revision + 1 : 1;
  const rawHistory = [
    ...(previousBatch?.rawHistory ?? []),
    { revision, rawText },
  ].slice(-MAX_RAW_REVISIONS_PER_BATCH);
  const batch: JsonWorkspaceBatch = {
    id: identity.id,
    sequence: identity.sequence,
    revision,
    rawText,
    rawHistory,
    analysis: importedAnalysis,
    sourceTokenIds: batchTokens.map((token) => token.id),
    applicationMode,
    importSummary: cloneImportSummary(summary),
  };
  const batches = previousBatch
    ? workspace.batches.map((item) => item.id === previousBatch.id ? batch : item)
    : [...workspace.batches, batch];
  const pendingWorkspace: JsonWorkspace = {
    ...workspace,
    batches,
    activeBatchId: batch.id,
    draftText: rawText,
    nextBatchSequence: identity.nextSequence,
  };
  const analysis = materializeJsonWorkspace(pendingWorkspace);
  return {
    workspace: { ...pendingWorkspace, language: analysis.language },
    analysis,
    batchId: batch.id,
    mode: previousBatch ? "replace" : "append",
    selectedTokenId: imported.keys().next().value ?? null,
    importSummary: cloneImportSummary(summary),
  };
};

export const removeJsonWorkspaceBatch = (
  workspace: JsonWorkspace,
  batchId: string,
): JsonWorkspaceMutationResult => {
  if (!workspace.batches.some((batch) => batch.id === batchId)) {
    throw new JsonWorkspaceError("unknown-batch", `JSON batch ${batchId} does not exist.`);
  }
  const nextWorkspace: JsonWorkspace = {
    ...workspace,
    batches: workspace.batches.filter((batch) => batch.id !== batchId),
    activeBatchId: workspace.activeBatchId === batchId ? null : workspace.activeBatchId,
    draftText: workspace.activeBatchId === batchId ? "" : workspace.draftText,
  };
  const analysis = materializeJsonWorkspace(nextWorkspace);
  return { workspace: { ...nextWorkspace, language: analysis.language }, analysis };
};

/** A true blank document: no sample tokens, translations, notes, batches or draft JSON. */
export const resetJsonWorkspace = (
  language: JsonWorkspaceLanguage,
): JsonWorkspaceMutationResult => {
  const analysis = createBlankJsonWorkspaceAnalysis(language);
  return { workspace: createJsonWorkspace(analysis), analysis };
};
