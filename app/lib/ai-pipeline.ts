import {
  buildLanguageAnalysisPrompts,
  getLanguageConfig,
  isStoaLanguageId,
  type StoaLanguageId,
  type AnnotationTargetId,
} from "../language-config.ts";
import {
  normalizeAnalysisNotes,
  type AnalysisNote,
} from "./analysis-notes.ts";

/** Kept as the public pipeline name for backwards compatibility. */
export type AiTextLanguage = StoaLanguageId;

export type AiBreakAfter = "none" | "line" | "paragraph";

export type AiMorphFeatures = {
  case?: string;
  number?: string;
  gender?: string;
  person?: string;
  tense?: string;
  mood?: string;
  voice?: string;
  degree?: string;
  [key: string]: string | undefined;
};

/**
 * A source token created locally before any model is called.  Its identity and
 * layout fields are authoritative; a model response is never allowed to alter
 * them.
 */
export type LocalSourceToken = {
  id: string;
  ordinal: number;
  surface: string;
  punctuationBefore: string;
  punctuationAfter: string;
  breakAfter: AiBreakAfter;
  /** Exact inter-token whitespace when no explicit line/paragraph break follows. */
  separatorAfter?: string;
  blankLinesAfter?: number;
  sourceStart: number;
  sourceEnd: number;
};

export type AiAnalyzedToken = LocalSourceToken & {
  /** Present for Classical Chinese analyses; NFC Hanyu Pinyin with tone marks. */
  pinyin?: string;
  /** Reserved for permissive OMNI/manual ingestion outside the classical pipeline. */
  romanization?: string;
  lemma: string;
  gloss: string;
  pos: string;
  morphology: string;
  features: AiMorphFeatures;
  confidence: number;
  alternatives: string[];
};

export type AiAnalysis = {
  language: AiTextLanguage;
  sourceText: string;
  literalTranslation: string;
  naturalTranslation: string;
  tokens: AiAnalyzedToken[];
  notes: AnalysisNote[];
};

export type AiChunk = {
  id: string;
  index: number;
  tokens: LocalSourceToken[];
  sentenceAlignedEnd: boolean;
};

export type AiPipelineIssueType =
  | "request"
  | "json"
  | "schema"
  | "missing"
  | "duplicate"
  | "unknown"
  | "surface-mismatch"
  | "order"
  | "repaired-json"
  | "unresolved";

export type ParsedAiJson = {
  value: unknown;
  body: string;
  repaired: boolean;
};

export type AiTokenEnrichment = {
  id: string;
  surface: string;
  pinyin?: string;
  romanization?: string;
  lemma: string;
  gloss: string;
  pos: string;
  morphology: string;
  features: AiMorphFeatures;
  confidence: number;
  alternatives: string[];
};

export type ValidatedChunkResponse = {
  tokens: AiTokenEnrichment[];
  literalTranslation: string;
  naturalTranslation: string;
  notes: AnalysisNote[];
  failedTokenIds: string[];
  missingTokenIds: string[];
  duplicateTokenIds: string[];
  unknownTokenIds: string[];
  surfaceMismatchTokenIds: string[];
  outOfOrderTokenIds: string[];
  schemaErrors: string[];
};

export class AiJsonResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiJsonResponseError";
  }
}

const DEFAULT_CHUNK_MIN = 50;
const DEFAULT_CHUNK_MAX = 80;

const VALID_PARTS_OF_SPEECH = new Set([
  "ADJ",
  "ADP",
  "ADV",
  "AUX",
  "CCONJ",
  "DET",
  "INTJ",
  "NOUN",
  "NUM",
  "PART",
  "PRON",
  "PROPN",
  "SCONJ",
  "VERB",
  "X",
]);

const OPENING_PUNCTUATION = new Set(Array.from("([{<«‹“‘\u201e⟨⟪"));

// Internal apostrophes and hyphens remain in the orthographic token. A Greek
// numeral sign may occur at its end (for example, ια΄).
const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+(?:[’'ʼ᾽\-‐‑][\p{L}\p{N}\p{M}]+)*(?:[\u0374\u0384\u02b9\u2032])?/gu;
const WORD_CONTENT_PATTERN = /[\p{L}\p{N}\p{M}]/u;

const clampInteger = (value: number | undefined, fallback: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value as number)));
};

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
};

const splitContiguousPunctuation = (value: string) => {
  if (!value) return { afterPrevious: "", beforeNext: "" };
  let splitAt = value.length;
  while (splitAt > 0 && OPENING_PUNCTUATION.has(value[splitAt - 1])) {
    splitAt -= 1;
  }
  return {
    afterPrevious: value.slice(0, splitAt),
    beforeNext: value.slice(splitAt),
  };
};

const splitInterTokenGap = (gap: string) => {
  const firstWhitespace = gap.search(/\s/u);
  if (firstWhitespace === -1) return splitContiguousPunctuation(gap);

  let lastWhitespace = gap.length - 1;
  while (lastWhitespace >= 0 && !/\s/u.test(gap[lastWhitespace])) {
    lastWhitespace -= 1;
  }
  const left = gap.slice(0, firstWhitespace);
  const middle = gap.slice(firstWhitespace, lastWhitespace + 1);
  const right = gap.slice(lastWhitespace + 1);
  // Standalone punctuation surrounded by spaces is associated with the token
  // on its left. This keeps every source character without inventing a token.
  const middlePunctuation = middle.replace(/\s/gu, "");
  return {
    afterPrevious: `${left}${middlePunctuation}`,
    beforeNext: right,
  };
};

const lineBreakCount = (value: string) => (value.match(/\r\n|\r|\n/gu) || []).length;

type LocalWordMatch = {
  surface: string;
  sourceStart: number;
};

const intlWordMatches = (text: string, language: AiTextLanguage): LocalWordMatch[] | null => {
  const config = getLanguageConfig(language);
  if (config.tokenization.sourceUsesSpaces) return null;
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
  try {
    const segmenter = new Intl.Segmenter(config.sourceLocale, { granularity: "word" });
    return Array.from(segmenter.segment(text))
      .filter((segment) => segment.isWordLike && WORD_CONTENT_PATTERN.test(segment.segment))
      .map((segment) => ({ surface: segment.segment, sourceStart: segment.index }));
  } catch {
    return null;
  }
};

const fallbackWordMatches = (text: string, language: AiTextLanguage): LocalWordMatch[] => {
  const config = getLanguageConfig(language);
  if (!config.tokenization.sourceUsesSpaces) {
    // Intl.Segmenter is present in every supported STOA browser. This fallback
    // remains deterministic in reduced runtimes and, unlike WORD_PATTERN,
    // never collapses an entire unspaced CJK sentence into one token.
    return Array.from(text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)).flatMap((match) => {
      const run = match[0];
      const runStart = match.index ?? 0;
      let offset = 0;
      return Array.from(run).map((surface) => {
        const wordMatch = { surface, sourceStart: runStart + offset };
        offset += surface.length;
        return wordMatch;
      });
    });
  }
  return Array.from(text.matchAll(WORD_PATTERN)).map((match) => ({
    surface: match[0],
    sourceStart: match.index ?? 0,
  }));
};

const whitespaceFromGap = (gap: string) => (gap.match(/\s/gu) || []).join("");

/**
 * Deterministically creates authoritative source tokens for every STOA
 * language. Unspaced scripts can use the platform's Unicode-aware word
 * segmenter; all source offsets, punctuation, spacing and explicit breaks stay
 * local and cannot be changed by the model.
 */
export const tokenizeClassicalText = (
  text: string,
  language: AiTextLanguage,
): LocalSourceToken[] => {
  if (!text.trim()) return [];
  if (!isStoaLanguageId(language)) throw new Error(`Unsupported STOA language: ${String(language)}.`);

  const matches = intlWordMatches(text, language) ?? fallbackWordMatches(text, language);
  if (!matches.length) return [];
  const documentHash = fnv1a(`${language}\u0000${text.normalize("NFC")}`);
  const tokens: LocalSourceToken[] = matches.map((match, index) => {
    const surface = match.surface;
    const sourceStart = match.sourceStart;
    return {
      id: `tok-${documentHash}-${String(index + 1).padStart(5, "0")}`,
      ordinal: index,
      surface,
      punctuationBefore: "",
      punctuationAfter: "",
      breakAfter: "none",
      sourceStart,
      sourceEnd: sourceStart + surface.length,
    };
  });

  tokens[0].punctuationBefore = text.slice(0, tokens[0].sourceStart).replace(/\s/gu, "");
  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    const gap = text.slice(previous.sourceEnd, current.sourceStart);
    const punctuation = splitInterTokenGap(gap);
    previous.punctuationAfter += punctuation.afterPrevious;
    current.punctuationBefore += punctuation.beforeNext;

    const breaks = lineBreakCount(gap);
    if (breaks === 1) {
      previous.breakAfter = "line";
    } else if (breaks >= 2) {
      previous.breakAfter = "paragraph";
      previous.blankLinesAfter = Math.min(20, breaks - 1);
    } else {
      previous.separatorAfter = whitespaceFromGap(gap);
    }
  }
  const last = tokens[tokens.length - 1];
  last.punctuationAfter += text.slice(last.sourceEnd).replace(/\s/gu, "");
  return tokens;
};

/** Preferred language-neutral name; the historical export remains supported. */
export const tokenizeStoaText = tokenizeClassicalText;

const isSentenceBoundary = (token: LocalSourceToken) =>
  token.breakAfter === "paragraph" || /[.!?;;··。！？；｡]/u.test(token.punctuationAfter);

/**
 * Creates balanced chunks of at most 80 tokens by default. Sentence endings
 * are preferred whenever they still allow the remaining chunks to stay within
 * their bounds. The 50-token minimum is enforced whenever mathematically
 * possible; short documents and an 81–99-token tail necessarily fall below it.
 */
export const chunkSourceTokens = (
  tokens: LocalSourceToken[],
  options: { minTokens?: number; maxTokens?: number } = {},
): AiChunk[] => {
  if (!tokens.length) return [];
  const minTokens = clampInteger(options.minTokens, DEFAULT_CHUNK_MIN, 1, 500);
  const maxTokens = clampInteger(options.maxTokens, DEFAULT_CHUNK_MAX, minTokens, 500);
  const chunkCount = Math.ceil(tokens.length / maxTokens);
  const canHonorMinimum = tokens.length >= chunkCount * minTokens;
  const sentenceEnds = new Set<number>();
  tokens.forEach((token, index) => {
    if (isSentenceBoundary(token)) sentenceEnds.add(index + 1);
  });
  sentenceEnds.add(tokens.length);

  const chunks: AiChunk[] = [];
  let cursor = 0;
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunksLeft = chunkCount - chunkIndex;
    const remaining = tokens.length - cursor;
    if (chunksLeft === 1) {
      const selected = tokens.slice(cursor);
      chunks.push({
        id: `chunk-${selected[0].id.slice(4, 11)}-${String(cursor + 1).padStart(5, "0")}-${String(tokens.length).padStart(5, "0")}`,
        index: chunkIndex,
        tokens: selected,
        sentenceAlignedEnd: true,
      });
      break;
    }

    let minimumSize = Math.max(1, remaining - maxTokens * (chunksLeft - 1));
    let maximumSize = Math.min(maxTokens, remaining - (chunksLeft - 1));
    if (canHonorMinimum) {
      minimumSize = Math.max(minTokens, minimumSize);
      maximumSize = Math.min(maximumSize, remaining - minTokens * (chunksLeft - 1));
    }
    const idealSize = remaining / chunksLeft;
    const candidateEnds = Array.from(sentenceEnds).filter((end) => {
      const size = end - cursor;
      return size >= minimumSize && size <= maximumSize;
    });
    candidateEnds.sort((left, right) => {
      const leftDistance = Math.abs(left - cursor - idealSize);
      const rightDistance = Math.abs(right - cursor - idealSize);
      return leftDistance - rightDistance || left - right;
    });
    const tokenCut = Math.min(maximumSize, Math.max(minimumSize, Math.round(idealSize)));
    const end = candidateEnds[0] ?? cursor + tokenCut;
    const selected = tokens.slice(cursor, end);
    chunks.push({
      id: `chunk-${selected[0].id.slice(4, 11)}-${String(cursor + 1).padStart(5, "0")}-${String(end).padStart(5, "0")}`,
      index: chunkIndex,
      tokens: selected,
      sentenceAlignedEnd: sentenceEnds.has(end),
    });
    cursor = end;
  }
  return chunks;
};

const scanJsonContainerAt = (value: string, start: number) => {
  if (value[start] !== "{" && value[start] !== "[") return null;
  const stack: string[] = [];
  let quote = "";
  let escaped = false;
  for (let cursor = start; cursor < value.length; cursor += 1) {
    const character = value[cursor];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack[stack.length - 1] !== expected) return null;
      stack.pop();
      if (!stack.length) return value.slice(start, cursor + 1);
    }
  }
  return null;
};

const scanJsonContainers = (value: string) => {
  const candidates: string[] = [];
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== "{" && value[start] !== "[") continue;
    const candidate = scanJsonContainerAt(value, start);
    if (!candidate) continue;
    candidates.push(candidate);
    start += candidate.length - 1;
  }
  return candidates;
};

/** Extracts the most likely JSON container and ignores prose, URLs and fences around it. */
export const extractJsonBody = (rawResponse: string) => {
  const withoutBom = rawResponse.replace(/^\uFEFF/u, "").trim();
  if (withoutBom.startsWith("{") || withoutBom.startsWith("[")) {
    // When the response itself starts with JSON, only its root is eligible.
    // Do not silently salvage a complete inner array from a truncated root.
    return scanJsonContainerAt(withoutBom, 0) || withoutBom.replace(/```[\s\S]*$/u, "").trim();
  }
  const fencedBlocks = Array.from(withoutBom.matchAll(/```(?:json|javascript|js)?\s*([\s\S]*?)```/giu))
    .flatMap((match) => {
      const block = match[1].trim();
      if (block.startsWith("{") || block.startsWith("[")) {
        return [scanJsonContainerAt(block, 0) || block];
      }
      return scanJsonContainers(block);
    });
  const candidates = [...fencedBlocks, ...scanJsonContainers(withoutBom)];
  if (!candidates.length) {
    const firstContainer = withoutBom.search(/[{[]/u);
    if (firstContainer >= 0) return withoutBom.slice(firstContainer).replace(/```[\s\S]*$/u, "").trim();
    throw new AiJsonResponseError("The model response does not contain a JSON object or array.");
  }
  candidates.sort((left, right) => {
    const score = (candidate: string) =>
      (/"tokens"\s*:/u.test(candidate) ? 1_000_000 : 0) +
      (/"id"\s*:/u.test(candidate) ? 100_000 : 0) +
      candidate.length;
    return score(right) - score(left);
  });
  return candidates[0].trim();
};

const escapeUnsafeJsonCharacters = (value: string) => {
  let output = "";
  let insideString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (insideString) {
      if (escaped) {
        output += character;
        escaped = false;
      } else if (character === "\\") {
        output += character;
        escaped = true;
      } else if (character === '"') {
        output += character;
        insideString = false;
      } else if (character.charCodeAt(0) < 0x20) {
        // Raw control characters are invalid inside JSON strings. Escaping them
        // is lossless, unlike guessing missing quotes, keys, or values.
        output += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
      } else {
        output += character;
      }
      continue;
    }

    if (character === '"') {
      insideString = true;
      output += character;
      continue;
    }
    if (character.charCodeAt(0) < 0x20 && !/[\t\n\r]/u.test(character)) continue;
    output += character;
  }
  return output;
};

const removeTrailingCommas = (value: string) => {
  let output = "";
  let insideString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (insideString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') insideString = false;
      continue;
    }
    if (character === '"') {
      insideString = true;
      output += character;
      continue;
    }
    if (character === ",") {
      let lookahead = index + 1;
      while (lookahead < value.length && /\s/u.test(value[lookahead])) lookahead += 1;
      if (value[lookahead] === "}" || value[lookahead] === "]") continue;
    }
    output += character;
  }
  return output;
};

/**
 * Performs a deliberately narrow repair: invalid raw control characters are
 * escaped and trailing commas are removed. It does not guess bare keys,
 * single-quoted strings, comments, invalid literals, or missing delimiters.
 */
export const repairJsonBody = (body: string) => removeTrailingCommas(
  escapeUnsafeJsonCharacters(
    body.trim().replace(/^```(?:json|javascript|js)?/iu, "").replace(/```$/u, ""),
  ),
);

export const parseAiJsonResponse = (rawResponse: string): ParsedAiJson => {
  const body = extractJsonBody(rawResponse);
  try {
    return { value: JSON.parse(body), body, repaired: false };
  } catch (firstError) {
    const repairedBody = repairJsonBody(body);
    try {
      return { value: JSON.parse(repairedBody), body: repairedBody, repaired: true };
    } catch (secondError) {
      const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
      const secondMessage = secondError instanceof Error ? secondError.message : String(secondError);
      throw new AiJsonResponseError(`The JSON could not be parsed (${firstMessage}); safe repair also failed (${secondMessage}).`);
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string")
  ? value
  : [];

const responseNotes = (
  value: unknown,
  validTokenIds: readonly string[],
  schemaErrors: string[],
) => {
  if (!Array.isArray(value)) {
    if (value !== undefined) schemaErrors.push("notes must be an array.");
    return [];
  }
  const validIds = new Set(validTokenIds);
  const accepted: unknown[] = [];
  value.forEach((item, index) => {
    // STOA 5.7 responses remain readable as unanchored legacy notes.
    if (typeof item === "string") {
      if (item.trim()) accepted.push(item);
      return;
    }
    if (!isRecord(item)) {
      schemaErrors.push(`Note ${index + 1} must be an object with tokenId and text.`);
      return;
    }
    const tokenId = typeof item.tokenId === "string" ? item.tokenId.trim() : "";
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!tokenId || !validIds.has(tokenId)) {
      schemaErrors.push(`Note ${index + 1} tokenId must copy an exact token id from the supplied chunk.`);
      return;
    }
    if (!text) {
      schemaErrors.push(`Note ${index + 1} text must be a non-empty string.`);
      return;
    }
    accepted.push({ tokenId, text });
  });
  return normalizeAnalysisNotes(accepted, validIds);
};

const validateEnrichment = (
  value: unknown,
  tokenNumber: number,
  language?: AiTextLanguage,
) => {
  const errors: string[] = [];
  if (!isRecord(value)) return { token: null, errors: [`Response token ${tokenNumber} must be an object.`] };
  const id = typeof value.id === "string" ? value.id : "";
  if (!id) errors.push(`Response token ${tokenNumber} has no string id.`);
  const requiredStrings = ["surface", "lemma", "gloss", "pos", "morphology"] as const;
  requiredStrings.forEach((field) => {
    if (typeof value[field] !== "string") errors.push(`Token ${id || tokenNumber} has no string ${field}.`);
  });
  (["surface", "lemma", "gloss", "pos"] as const).forEach((field) => {
    if (typeof value[field] === "string" && !value[field].trim()) {
      errors.push(`Token ${id || tokenNumber} has an empty ${field}.`);
    }
  });
  if (language === "classical-chinese" && typeof value.pinyin !== "string") {
    errors.push(`Token ${id || tokenNumber} has no string pinyin.`);
  }
  for (const field of ["pinyin", "romanization"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      errors.push(`Token ${id || tokenNumber} ${field} must be a string when present.`);
    }
  }
  if (typeof value.pos === "string" && !VALID_PARTS_OF_SPEECH.has(value.pos)) {
    errors.push(`Token ${id || tokenNumber} uses unsupported pos ${value.pos}.`);
  }
  const features: AiMorphFeatures = {};
  if (value.features !== undefined && !isRecord(value.features)) {
    errors.push(`Token ${id || tokenNumber} features must be an object.`);
  } else if (isRecord(value.features)) {
    Object.entries(value.features).forEach(([key, feature]) => {
      if (feature === undefined || feature === null) return;
      if (typeof feature !== "string") {
        errors.push(`Token ${id || tokenNumber} feature ${key} must be a string.`);
      } else {
        const normalizedFeature = feature.trim();
        if (normalizedFeature) features[key] = normalizedFeature;
      }
    });
  }
  if (value.confidence !== undefined && (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
    errors.push(`Token ${id || tokenNumber} confidence must be between 0 and 1.`);
  }
  if (value.alternatives !== undefined && (!Array.isArray(value.alternatives) || !value.alternatives.every((item) => typeof item === "string"))) {
    errors.push(`Token ${id || tokenNumber} alternatives must be a string array.`);
  }
  if (errors.length) return { token: null, errors };
  const token: AiTokenEnrichment = {
    id,
    surface: value.surface as string,
    ...(typeof value.pinyin === "string" ? { pinyin: value.pinyin.normalize("NFC") } : {}),
    ...(typeof value.romanization === "string"
      ? { romanization: value.romanization.normalize("NFC") }
      : {}),
    lemma: value.lemma as string,
    gloss: value.gloss as string,
    pos: value.pos as string,
    morphology: value.morphology as string,
    features,
    confidence: typeof value.confidence === "number" ? value.confidence : 0.8,
    alternatives: stringArray(value.alternatives),
  };
  return { token, errors };
};

/** Validates a model payload against the exact IDs requested for one job. */
export const validateChunkResponse = (
  value: unknown,
  expectedTokens: LocalSourceToken[],
  expectedChunkId?: string,
  noteContextTokens: LocalSourceToken[] = expectedTokens,
  language?: AiTextLanguage,
): ValidatedChunkResponse => {
  const root = Array.isArray(value) ? { tokens: value } : value;
  const expectedById = new Map(expectedTokens.map((token) => [token.id, token]));
  const expectedIds = expectedTokens.map((token) => token.id);
  const schemaErrors: string[] = [];
  if (!isRecord(root) || !Array.isArray(root.tokens)) {
    return {
      tokens: [],
      literalTranslation: "",
      naturalTranslation: "",
      notes: [],
      failedTokenIds: expectedIds,
      missingTokenIds: expectedIds,
      duplicateTokenIds: [],
      unknownTokenIds: [],
      surfaceMismatchTokenIds: [],
      outOfOrderTokenIds: [],
      schemaErrors: ["The response root must contain a tokens array."],
    };
  }
  if (expectedChunkId !== undefined && root.chunkId !== expectedChunkId) {
    const received = typeof root.chunkId === "string"
      ? JSON.stringify(root.chunkId)
      : "no string chunkId";
    return {
      tokens: [],
      literalTranslation: "",
      naturalTranslation: "",
      notes: [],
      failedTokenIds: expectedIds,
      missingTokenIds: [],
      duplicateTokenIds: [],
      unknownTokenIds: [],
      surfaceMismatchTokenIds: [],
      outOfOrderTokenIds: [],
      schemaErrors: [`The response chunkId must be ${JSON.stringify(expectedChunkId)}; received ${received}.`],
    };
  }

  const occurrences = new Map<string, number>();
  root.tokens.forEach((item) => {
    if (isRecord(item) && typeof item.id === "string") {
      occurrences.set(item.id, (occurrences.get(item.id) || 0) + 1);
    }
  });
  const duplicateTokenIds = Array.from(occurrences)
    .filter(([id, count]) => expectedById.has(id) && count > 1)
    .map(([id]) => id);
  const duplicateSet = new Set(duplicateTokenIds);
  const unknownTokenIds = Array.from(occurrences.keys()).filter((id) => !expectedById.has(id));
  const surfaceMismatchTokenIds: string[] = [];
  const validTokens: AiTokenEnrichment[] = [];

  root.tokens.forEach((item, index) => {
    const validated = validateEnrichment(item, index + 1, language);
    schemaErrors.push(...validated.errors);
    if (!validated.token) return;
    const expected = expectedById.get(validated.token.id);
    if (!expected || duplicateSet.has(validated.token.id)) return;
    if (validated.token.surface.normalize("NFC") !== expected.surface.normalize("NFC")) {
      surfaceMismatchTokenIds.push(validated.token.id);
      return;
    }
    validTokens.push(validated.token);
  });

  const validIds = new Set(validTokens.map((token) => token.id));
  const missingTokenIds = expectedIds.filter((id) => !occurrences.has(id));
  const invalidExpectedIds = expectedIds.filter((id) => occurrences.has(id) && !validIds.has(id));
  const failedTokenIds = Array.from(new Set([
    ...missingTokenIds,
    ...duplicateTokenIds,
    ...surfaceMismatchTokenIds,
    ...invalidExpectedIds,
  ]));
  const returnedKnownIds = root.tokens
    .map((item) => isRecord(item) && typeof item.id === "string" ? item.id : null)
    .filter((id): id is string => typeof id === "string" && expectedById.has(id));
  const uniqueReturnedIds = returnedKnownIds.filter((id, index) => returnedKnownIds.indexOf(id) === index);
  const expectedReturnedOrder = expectedIds.filter((id) => uniqueReturnedIds.includes(id));
  const orderIsCorrect = uniqueReturnedIds.every((id, index) => id === expectedReturnedOrder[index]);

  return {
    tokens: validTokens,
    literalTranslation: typeof root.literalTranslation === "string" ? root.literalTranslation : "",
    naturalTranslation: typeof root.naturalTranslation === "string" ? root.naturalTranslation : "",
    notes: responseNotes(root.notes, noteContextTokens.map((token) => token.id), schemaErrors),
    failedTokenIds,
    missingTokenIds,
    duplicateTokenIds,
    unknownTokenIds,
    surfaceMismatchTokenIds,
    outOfOrderTokenIds: orderIsCorrect ? [] : uniqueReturnedIds,
    schemaErrors,
  };
};

const sourceTokenForPrompt = (token: LocalSourceToken) => ({
  id: token.id,
  surface: token.surface,
  punctuationBefore: token.punctuationBefore,
  punctuationAfter: token.punctuationAfter,
  breakAfter: token.breakAfter,
  ...(token.blankLinesAfter ? { blankLinesAfter: token.blankLinesAfter } : {}),
});

const sourceTextFromTokens = (tokens: LocalSourceToken[]) => tokens
  .map((token, index) => {
    const separator = token.breakAfter === "paragraph"
      ? "\n".repeat((token.blankLinesAfter ?? 1) + 1)
      : token.breakAfter === "line"
        ? "\n"
        : token.separatorAfter ?? (index < tokens.length - 1 ? " " : "");
    return `${token.punctuationBefore}${token.surface}${token.punctuationAfter}${separator}`;
  })
  .join("");

export const buildChunkPrompts = (
  language: AiTextLanguage,
  chunkId: string,
  tokens: LocalSourceToken[],
  contextTokens: LocalSourceToken[] = tokens,
  annotationTarget?: AnnotationTargetId,
) => {
  const isTargetedRetry = contextTokens.length !== tokens.length;
  const configured = buildLanguageAnalysisPrompts(
    language,
    sourceTextFromTokens(contextTokens),
    {
      mode: "locked-tokens",
      chunkId,
      lockedTokens: tokens.map(sourceTokenForPrompt),
      contextTokens: isTargetedRetry ? contextTokens.map(sourceTokenForPrompt) : undefined,
      annotationTarget,
    },
  );
  // The headings remain for users and tests familiar with STOA 3.x manual
  // prompts; their canonical data appears once in the request generated by
  // language-config, avoiding duplicate payloads in long-text workflows.
  const userPrompt = `${configured.userPrompt}

TARGET TOKENS — return one object for every ID in targetTokens above, and no others.

${isTargetedRetry ? "READ-ONLY ORIGINAL CHUNK CONTEXT — use readOnlyContextTokens above for disambiguation; do not return its non-target IDs." : ""}`;
  const retryTranslationRule = isTargetedRetry
    ? "\nFor a targeted retry, literalTranslation, naturalTranslation, and notes must still describe the complete original chunk shown in READ-ONLY ORIGINAL CHUNK CONTEXT, not only the target IDs."
    : "";
  return { systemPrompt: configured.systemPrompt, userPrompt: `${userPrompt}${retryTranslationRule}` };
};
