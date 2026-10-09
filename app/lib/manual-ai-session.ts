import {
  buildChunkPrompts,
  chunkSourceTokens,
  parseAiJsonResponse,
  tokenizeClassicalText,
  validateChunkResponse,
} from "./ai-pipeline.ts";
import { isStoaLanguageId } from "../language-config.ts";
import type { AnnotationTargetId } from "../language-config.ts";
import type {
  AiAnalysis,
  AiAnalyzedToken,
  AiChunk,
  AiPipelineIssueType,
  AiTextLanguage,
  AiTokenEnrichment,
  LocalSourceToken,
  ValidatedChunkResponse,
} from "./ai-pipeline.ts";
import {
  mergeAnalysisNotes,
  normalizeAnalysisNotes,
  type AnalysisNote,
} from "./analysis-notes.ts";

export type ManualChunkStatus = "pending" | "active" | "valid" | "needs-retry";

export type ManualSessionErrorCode =
  | "invalid-session"
  | "unknown-chunk"
  | "invalid-status"
  | "active-limit"
  | "wrong-chunk"
  | "json"
  | "schema"
  | "incomplete";

export type ManualSessionErrorDetails = {
  code: ManualSessionErrorCode;
  message: string;
  chunkId?: string;
  tokenIds: string[];
  details: string[];
};

export type ManualChunkDiagnostics = {
  repairedJson: boolean;
  missingTokenIds: string[];
  duplicateTokenIds: string[];
  unknownTokenIds: string[];
  surfaceMismatchTokenIds: string[];
  outOfOrderTokenIds: string[];
  schemaErrors: string[];
};

export type ManualAnalysisChunk = {
  id: string;
  index: number;
  status: ManualChunkStatus;
  tokens: LocalSourceToken[];
  /** IDs that the next prompt must return. */
  targetTokenIds: string[];
  acceptedTokens: AiTokenEnrichment[];
  attempt: number;
  literalTranslation: string;
  naturalTranslation: string;
  notes: AnalysisNote[];
  diagnostics: ManualChunkDiagnostics;
  diagnosticHistory: ManualChunkDiagnostics[];
  lastError: ManualSessionErrorDetails | null;
  sentenceAlignedEnd: boolean;
};

export type ManualAnalysisSession = {
  format: "stoa-manual-ai-session";
  schemaVersion: 1;
  id: string;
  language: AiTextLanguage;
  annotationTarget?: AnnotationTargetId;
  sourceText: string;
  sourceTokens: LocalSourceToken[];
  chunkMinTokens: number;
  chunkMaxTokens: number;
  chunks: ManualAnalysisChunk[];
};

export type CreateManualSessionOptions = {
  text: string;
  language: AiTextLanguage;
  annotationTarget?: AnnotationTargetId;
  chunkMinTokens?: number;
  chunkMaxTokens?: number;
  /** Defaults to two and can never exceed two. */
  initialActiveChunks?: number;
};

export type ManualChunkPrompt = {
  chunkId: string;
  chunkIndex: number;
  attempt: number;
  isRetry: boolean;
  targetTokenIds: string[];
  contextTokenIds: string[];
  systemPrompt: string;
  userPrompt: string;
  copyText: string;
};

export type ManualSubmissionResult = {
  ok: boolean;
  session: ManualAnalysisSession;
  chunk: ManualAnalysisChunk;
  diagnostics: ManualChunkDiagnostics;
  error: ManualSessionErrorDetails | null;
};

export type ManualSessionIssue = {
  type: AiPipelineIssueType;
  chunkId: string;
  tokenIds: string[];
  message: string;
};

export type ManualMergeResult = {
  analysis: AiAnalysis;
  complete: boolean;
  unresolvedTokenIds: string[];
  duplicateAcceptedTokenIds: string[];
  outOfOrderAcceptedTokenIds: string[];
  issues: ManualSessionIssue[];
};

export class ManualSessionError extends Error {
  readonly details: ManualSessionErrorDetails;

  constructor(details: ManualSessionErrorDetails) {
    super(details.message);
    this.name = "ManualSessionError";
    this.details = details;
  }
}

const SESSION_FORMAT = "stoa-manual-ai-session";
const SESSION_SCHEMA_VERSION = 1;
const MAX_ACTIVE_CHUNKS = 2;
const DEFAULT_CHUNK_MIN = 50;
const DEFAULT_CHUNK_MAX = 80;

const EMPTY_DIAGNOSTICS = (): ManualChunkDiagnostics => ({
  repairedJson: false,
  missingTokenIds: [],
  duplicateTokenIds: [],
  unknownTokenIds: [],
  surfaceMismatchTokenIds: [],
  outOfOrderTokenIds: [],
  schemaErrors: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clampInteger = (value: number | undefined, fallback: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value as number)));
};

const sessionError = (
  code: ManualSessionErrorCode,
  message: string,
  options: { chunkId?: string; tokenIds?: string[]; details?: string[] } = {},
) => new ManualSessionError({
  code,
  message,
  chunkId: options.chunkId,
  tokenIds: options.tokenIds || [],
  details: options.details || [],
});

const replaceChunk = (
  session: ManualAnalysisSession,
  nextChunk: ManualAnalysisChunk,
): ManualAnalysisSession => ({
  ...session,
  chunks: session.chunks.map((chunk) => chunk.id === nextChunk.id ? nextChunk : chunk),
});

const getChunk = (session: ManualAnalysisSession, chunkId: string) => {
  const chunk = session.chunks.find((candidate) => candidate.id === chunkId);
  if (!chunk) {
    throw sessionError("unknown-chunk", `Manual AI chunk ${chunkId} does not exist in this session.`, {
      chunkId,
    });
  }
  return chunk;
};

const activeCount = (session: ManualAnalysisSession) =>
  session.chunks.filter((chunk) => chunk.status === "active").length;

const targetTokensForChunk = (chunk: ManualAnalysisChunk) => {
  const tokensById = new Map(chunk.tokens.map((token) => [token.id, token]));
  return chunk.targetTokenIds.map((id) => {
    const token = tokensById.get(id);
    if (!token) {
      throw sessionError("invalid-session", `Chunk ${chunk.id} has an invalid target token ID: ${id}.`, {
        chunkId: chunk.id,
        tokenIds: [id],
      });
    }
    return token;
  });
};

const diagnosticsFromValidation = (
  response: ValidatedChunkResponse,
  repairedJson: boolean,
): ManualChunkDiagnostics => ({
  repairedJson,
  missingTokenIds: response.missingTokenIds,
  duplicateTokenIds: response.duplicateTokenIds,
  unknownTokenIds: response.unknownTokenIds,
  surfaceMismatchTokenIds: response.surfaceMismatchTokenIds,
  outOfOrderTokenIds: response.outOfOrderTokenIds,
  schemaErrors: response.schemaErrors,
});

const uniqueStrings = (values: string[]) => Array.from(new Set(values));

/** Creates a resumable manual analysis session and opens at most two work slots. */
export const createManualAnalysisSession = (
  options: CreateManualSessionOptions,
): ManualAnalysisSession => {
  const sourceTokens = tokenizeClassicalText(options.text, options.language);
  if (!sourceTokens.length) {
    throw sessionError("invalid-session", "No analyzable word tokens were found in the source text.");
  }
  const chunkMinTokens = clampInteger(options.chunkMinTokens, DEFAULT_CHUNK_MIN, 1, 500);
  const chunkMaxTokens = clampInteger(options.chunkMaxTokens, DEFAULT_CHUNK_MAX, chunkMinTokens, 500);
  const sourceChunks = chunkSourceTokens(sourceTokens, {
    minTokens: chunkMinTokens,
    maxTokens: chunkMaxTokens,
  });
  const initialActiveChunks = clampInteger(
    options.initialActiveChunks,
    MAX_ACTIVE_CHUNKS,
    0,
    MAX_ACTIVE_CHUNKS,
  );
  const chunks = sourceChunks.map<ManualAnalysisChunk>((chunk, index) => ({
    id: chunk.id,
    index: chunk.index,
    status: index < initialActiveChunks ? "active" : "pending",
    tokens: chunk.tokens,
    targetTokenIds: chunk.tokens.map((token) => token.id),
    acceptedTokens: [],
    attempt: 0,
    literalTranslation: "",
    naturalTranslation: "",
    notes: [],
    diagnostics: EMPTY_DIAGNOSTICS(),
    diagnosticHistory: [],
    lastError: null,
    sentenceAlignedEnd: chunk.sentenceAlignedEnd,
  }));
  return {
    format: SESSION_FORMAT,
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: `manual-${sourceTokens[0].id.slice(4, 11)}`,
    language: options.language,
    annotationTarget: options.annotationTarget,
    sourceText: options.text,
    sourceTokens,
    chunkMinTokens,
    chunkMaxTokens,
    chunks,
  };
};

/** Opens one pending or retry chunk, enforcing the global two-slot limit. */
export const activateManualChunk = (
  session: ManualAnalysisSession,
  chunkId: string,
): ManualAnalysisSession => {
  const chunk = getChunk(session, chunkId);
  if (chunk.status === "active") return session;
  if (chunk.status === "valid") {
    throw sessionError("invalid-status", `Chunk ${chunkId} is already valid and cannot be activated.`, {
      chunkId,
    });
  }
  if (activeCount(session) >= MAX_ACTIVE_CHUNKS) {
    throw sessionError("active-limit", "Only two manual AI chunks can be active at the same time.", {
      chunkId,
    });
  }
  return replaceChunk(session, { ...chunk, status: "active" });
};

/** Fills available slots, prioritizing targeted retries and then source order. */
export const activateAvailableManualChunks = (
  session: ManualAnalysisSession,
): ManualAnalysisSession => {
  let nextSession = session;
  const candidates = session.chunks
    .filter((chunk) => chunk.status === "needs-retry" || chunk.status === "pending")
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "needs-retry" ? -1 : 1;
      return left.index - right.index;
    });
  for (const chunk of candidates) {
    if (activeCount(nextSession) >= MAX_ACTIVE_CHUNKS) break;
    nextSession = activateManualChunk(nextSession, chunk.id);
  }
  return nextSession;
};

/** Generates the exact text the user copies to OpenAI, Anthropic, or another model UI. */
export const getManualChunkPrompt = (
  session: ManualAnalysisSession,
  chunkId: string,
): ManualChunkPrompt => {
  const chunk = getChunk(session, chunkId);
  if (chunk.status !== "active") {
    throw sessionError("invalid-status", `Chunk ${chunkId} must be active before its prompt is generated.`, {
      chunkId,
      tokenIds: chunk.targetTokenIds,
    });
  }
  const targetTokens = targetTokensForChunk(chunk);
  const prompts = buildChunkPrompts(
    session.language,
    chunk.id,
    targetTokens,
    chunk.tokens,
    session.annotationTarget,
  );
  return {
    chunkId: chunk.id,
    chunkIndex: chunk.index,
    attempt: chunk.attempt,
    isRetry: targetTokens.length !== chunk.tokens.length || chunk.attempt > 0,
    targetTokenIds: targetTokens.map((token) => token.id),
    contextTokenIds: chunk.tokens.map((token) => token.id),
    ...prompts,
    copyText: `${prompts.systemPrompt}\n\n${prompts.userPrompt}`,
  };
};

const makeJsonError = (chunk: ManualAnalysisChunk, error: unknown): ManualSessionErrorDetails => ({
  code: "json",
  message: `Chunk ${chunk.index + 1} response could not be read as JSON. Paste the complete model response and retry this chunk.`,
  chunkId: chunk.id,
  tokenIds: chunk.targetTokenIds,
  details: [error instanceof Error ? error.message : String(error)],
});

const makeValidationError = (
  chunk: ManualAnalysisChunk,
  failedTokenIds: string[],
  diagnostics: ManualChunkDiagnostics,
): ManualSessionErrorDetails => ({
  code: diagnostics.schemaErrors.length || diagnostics.duplicateTokenIds.length || diagnostics.surfaceMismatchTokenIds.length
    ? "schema"
    : "incomplete",
  message: `Chunk ${chunk.index + 1} retained its valid analyses, but ${failedTokenIds.length} token${failedTokenIds.length === 1 ? " needs" : "s need"} a targeted retry.`,
  chunkId: chunk.id,
  tokenIds: failedTokenIds,
  details: [
    ...diagnostics.schemaErrors,
    ...(diagnostics.missingTokenIds.length ? [`Missing IDs: ${diagnostics.missingTokenIds.join(", ")}`] : []),
    ...(diagnostics.duplicateTokenIds.length ? [`Duplicate IDs: ${diagnostics.duplicateTokenIds.join(", ")}`] : []),
    ...(diagnostics.surfaceMismatchTokenIds.length ? [`Changed surfaces: ${diagnostics.surfaceMismatchTokenIds.join(", ")}`] : []),
  ],
});

/**
 * Consumes one pasted response. Valid token objects are retained even when the
 * rest of the response needs a targeted retry.
 */
export const submitManualChunkResponse = (
  session: ManualAnalysisSession,
  chunkId: string,
  rawResponse: string,
): ManualSubmissionResult => {
  const chunk = getChunk(session, chunkId);
  if (chunk.status !== "active") {
    throw sessionError("invalid-status", `Chunk ${chunkId} is not active and cannot accept a response.`, {
      chunkId,
      tokenIds: chunk.targetTokenIds,
    });
  }
  const targetTokens = targetTokensForChunk(chunk);
  let parsed: ReturnType<typeof parseAiJsonResponse>;
  try {
    parsed = parseAiJsonResponse(rawResponse);
  } catch (error) {
    const lastError = makeJsonError(chunk, error);
    const nextChunk: ManualAnalysisChunk = {
      ...chunk,
      status: "needs-retry",
      attempt: chunk.attempt + 1,
      diagnostics: EMPTY_DIAGNOSTICS(),
      diagnosticHistory: [...chunk.diagnosticHistory, EMPTY_DIAGNOSTICS()],
      lastError,
    };
    const nextSession = replaceChunk(session, nextChunk);
    return {
      ok: false,
      session: nextSession,
      chunk: nextChunk,
      diagnostics: nextChunk.diagnostics,
      error: lastError,
    };
  }

  if (isRecord(parsed.value) && typeof parsed.value.chunkId === "string" && parsed.value.chunkId !== chunk.id) {
    const lastError: ManualSessionErrorDetails = {
      code: "wrong-chunk",
      message: `This response belongs to ${parsed.value.chunkId}, not active chunk ${chunk.id}. Paste it into the matching chunk slot.`,
      chunkId: chunk.id,
      tokenIds: chunk.targetTokenIds,
      details: [`Response chunkId: ${parsed.value.chunkId}`, `Expected chunkId: ${chunk.id}`],
    };
    const diagnostics: ManualChunkDiagnostics = {
      ...EMPTY_DIAGNOSTICS(),
      repairedJson: parsed.repaired,
      schemaErrors: [lastError.message],
    };
    const nextChunk: ManualAnalysisChunk = {
      ...chunk,
      status: "needs-retry",
      attempt: chunk.attempt + 1,
      diagnostics,
      diagnosticHistory: [...chunk.diagnosticHistory, diagnostics],
      lastError,
    };
    const nextSession = replaceChunk(session, nextChunk);
    return {
      ok: false,
      session: nextSession,
      chunk: nextChunk,
      diagnostics,
      error: lastError,
    };
  }

  const response = validateChunkResponse(
    parsed.value,
    targetTokens,
    undefined,
    chunk.tokens,
    session.language,
  );
  const diagnostics = diagnosticsFromValidation(response, parsed.repaired);
  const acceptedById = new Map(chunk.acceptedTokens.map((token) => [token.id, token]));
  response.tokens.forEach((token) => acceptedById.set(token.id, token));
  const acceptedTokens = chunk.tokens
    .map((token) => acceptedById.get(token.id))
    .filter((token): token is AiTokenEnrichment => Boolean(token));
  const unresolvedTokenIds = chunk.tokens
    .filter((token) => !acceptedById.has(token.id))
    .map((token) => token.id);
  const failedTokenIds = uniqueStrings([
    ...response.failedTokenIds,
    ...unresolvedTokenIds,
  ]).filter((id) => chunk.tokens.some((token) => token.id === id));
  const valid = failedTokenIds.length === 0;
  const lastError = valid ? null : makeValidationError(chunk, failedTokenIds, diagnostics);
  const nextChunk: ManualAnalysisChunk = {
    ...chunk,
    status: valid ? "valid" : "needs-retry",
    targetTokenIds: valid ? [] : failedTokenIds,
    acceptedTokens,
    attempt: chunk.attempt + 1,
    literalTranslation: response.literalTranslation || chunk.literalTranslation,
    naturalTranslation: response.naturalTranslation || chunk.naturalTranslation,
    notes: mergeAnalysisNotes(chunk.notes, response.notes),
    diagnostics,
    diagnosticHistory: [...chunk.diagnosticHistory, diagnostics],
    lastError,
  };
  const nextSession = replaceChunk(session, nextChunk);
  return {
    ok: valid,
    session: nextSession,
    chunk: nextChunk,
    diagnostics,
    error: lastError,
  };
};

const placeholderEnrichment = (token: LocalSourceToken): AiTokenEnrichment => ({
  id: token.id,
  surface: token.surface,
  lemma: "",
  gloss: "",
  pos: "X",
  morphology: "",
  features: {},
  confidence: 0,
  alternatives: [],
});

/** Merges accepted analyses in original source order and reports all integrity issues. */
export const mergeManualAnalysisSession = (
  session: ManualAnalysisSession,
): ManualMergeResult => {
  const acceptedOccurrences = new Map<string, number>();
  const acceptedById = new Map<string, AiTokenEnrichment>();
  const acceptedOrder: string[] = [];
  session.chunks.forEach((chunk) => {
    chunk.acceptedTokens.forEach((token) => {
      acceptedOccurrences.set(token.id, (acceptedOccurrences.get(token.id) || 0) + 1);
      if (!acceptedById.has(token.id)) {
        acceptedById.set(token.id, token);
        acceptedOrder.push(token.id);
      }
    });
  });
  const sourceIds = session.sourceTokens.map((token) => token.id);
  const sourceIdSet = new Set(sourceIds);
  const duplicateAcceptedTokenIds = Array.from(acceptedOccurrences)
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  const unresolvedTokenIds = sourceIds.filter((id) => !acceptedById.has(id));
  const knownAcceptedOrder = acceptedOrder.filter((id) => sourceIdSet.has(id));
  const expectedAcceptedOrder = sourceIds.filter((id) => acceptedById.has(id));
  const outOfOrderAcceptedTokenIds = knownAcceptedOrder.every((id, index) => id === expectedAcceptedOrder[index])
    ? []
    : knownAcceptedOrder;
  const issues: ManualSessionIssue[] = [];
  if (unresolvedTokenIds.length) {
    issues.push({
      type: "missing",
      chunkId: "session",
      tokenIds: unresolvedTokenIds,
      message: `${unresolvedTokenIds.length} source token(s) have not been validated yet.`,
    });
  }
  if (duplicateAcceptedTokenIds.length) {
    issues.push({
      type: "duplicate",
      chunkId: "session",
      tokenIds: duplicateAcceptedTokenIds,
      message: "Accepted token IDs occur more than once across chunks.",
    });
  }
  if (outOfOrderAcceptedTokenIds.length) {
    issues.push({
      type: "order",
      chunkId: "session",
      tokenIds: outOfOrderAcceptedTokenIds,
      message: "Accepted token storage order differs from source order; output was corrected by stable ID.",
    });
  }
  session.chunks.forEach((chunk) => {
    const diagnosticHistory = chunk.diagnosticHistory.length
      ? chunk.diagnosticHistory
      : [chunk.diagnostics];
    const addIssue = (type: AiPipelineIssueType, ids: string[], message: string) => {
      if (ids.length) issues.push({ type, chunkId: chunk.id, tokenIds: ids, message });
    };
    diagnosticHistory.forEach((diagnostics) => {
      addIssue("unknown", diagnostics.unknownTokenIds, "The pasted response contained unrequested IDs; they were ignored.");
      addIssue("order", diagnostics.outOfOrderTokenIds, "The pasted response reordered token IDs; they were merged safely by ID.");
      addIssue("duplicate", diagnostics.duplicateTokenIds, "The pasted response duplicated token IDs.");
      addIssue("surface-mismatch", diagnostics.surfaceMismatchTokenIds, "The pasted response changed authoritative source text.");
    });
  });

  const tokens = session.sourceTokens.map<AiAnalyzedToken>((sourceToken) => {
    const enrichment = acceptedById.get(sourceToken.id) || placeholderEnrichment(sourceToken);
    return {
      ...sourceToken,
      ...(enrichment.pinyin !== undefined ? { pinyin: enrichment.pinyin } : {}),
      ...(enrichment.romanization !== undefined ? { romanization: enrichment.romanization } : {}),
      lemma: enrichment.lemma,
      gloss: enrichment.gloss,
      pos: enrichment.pos,
      morphology: enrichment.morphology,
      features: enrichment.features,
      confidence: enrichment.confidence,
      alternatives: enrichment.alternatives,
    };
  });
  const complete = unresolvedTokenIds.length === 0 && duplicateAcceptedTokenIds.length === 0;
  return {
    analysis: {
      language: session.language,
      sourceText: session.sourceText,
      literalTranslation: session.chunks.map((chunk) => chunk.literalTranslation).filter(Boolean).join("\n"),
      naturalTranslation: session.chunks.map((chunk) => chunk.naturalTranslation).filter(Boolean).join("\n"),
      tokens,
      notes: mergeAnalysisNotes(...session.chunks.map((chunk) => chunk.notes)),
    },
    complete,
    unresolvedTokenIds,
    duplicateAcceptedTokenIds,
    outOfOrderAcceptedTokenIds,
    issues,
  };
};

const sourceChunkToComparable = (chunk: AiChunk) => ({
  id: chunk.id,
  tokenIds: chunk.tokens.map((token) => token.id),
});

/** Serializes only analysis state; provider credentials are neither accepted nor emitted. */
export const serializeManualAnalysisSession = (session: ManualAnalysisSession) => JSON.stringify({
  format: SESSION_FORMAT,
  schemaVersion: SESSION_SCHEMA_VERSION,
  id: session.id,
  language: session.language,
  annotationTarget: session.annotationTarget,
  sourceText: session.sourceText,
  sourceTokens: session.sourceTokens,
  chunkMinTokens: session.chunkMinTokens,
  chunkMaxTokens: session.chunkMaxTokens,
  chunks: session.chunks.map((chunk) => ({
    id: chunk.id,
    index: chunk.index,
    status: chunk.status,
    tokens: chunk.tokens,
    targetTokenIds: chunk.targetTokenIds,
    acceptedTokens: chunk.acceptedTokens,
    attempt: chunk.attempt,
    literalTranslation: chunk.literalTranslation,
    naturalTranslation: chunk.naturalTranslation,
    notes: chunk.notes,
    diagnostics: chunk.diagnostics,
    diagnosticHistory: chunk.diagnosticHistory,
    lastError: chunk.lastError,
    sentenceAlignedEnd: chunk.sentenceAlignedEnd,
  })),
}, null, 2);

const restoreDiagnostics = (value: unknown): ManualChunkDiagnostics => {
  if (!isRecord(value)) return EMPTY_DIAGNOSTICS();
  const getIds = (key: keyof ManualChunkDiagnostics) =>
    Array.isArray(value[key])
      ? (value[key] as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
  return {
    repairedJson: value.repairedJson === true,
    missingTokenIds: getIds("missingTokenIds"),
    duplicateTokenIds: getIds("duplicateTokenIds"),
    unknownTokenIds: getIds("unknownTokenIds"),
    surfaceMismatchTokenIds: getIds("surfaceMismatchTokenIds"),
    outOfOrderTokenIds: getIds("outOfOrderTokenIds"),
    schemaErrors: getIds("schemaErrors"),
  };
};

const restoreLastError = (value: unknown): ManualSessionErrorDetails | null => {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string") return null;
  const allowedCodes = new Set<ManualSessionErrorCode>([
    "invalid-session",
    "unknown-chunk",
    "invalid-status",
    "active-limit",
    "wrong-chunk",
    "json",
    "schema",
    "incomplete",
  ]);
  if (!allowedCodes.has(value.code as ManualSessionErrorCode)) return null;
  return {
    code: value.code as ManualSessionErrorCode,
    message: value.message,
    chunkId: typeof value.chunkId === "string" ? value.chunkId : undefined,
    tokenIds: Array.isArray(value.tokenIds)
      ? value.tokenIds.filter((item): item is string => typeof item === "string")
      : [],
    details: Array.isArray(value.details)
      ? value.details.filter((item): item is string => typeof item === "string")
      : [],
  };
};

const assertStringArray = (value: unknown, label: string) => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw sessionError("invalid-session", `${label} must be an array of strings.`);
  }
  return value;
};

const restoreAcceptedTokens = (
  value: unknown,
  sourceTokens: LocalSourceToken[],
  chunkId: string,
  language: AiTextLanguage,
) => {
  if (!Array.isArray(value)) {
    throw sessionError("invalid-session", `Chunk ${chunkId} acceptedTokens must be an array.`, { chunkId });
  }
  if (!value.length) return [];
  const ids = value
    .map((token) => isRecord(token) && typeof token.id === "string" ? token.id : "")
    .filter(Boolean);
  const idSet = new Set(ids);
  if (ids.length !== value.length || idSet.size !== ids.length) {
    throw sessionError("invalid-session", `Chunk ${chunkId} has invalid or duplicate accepted token IDs.`, {
      chunkId,
      tokenIds: ids,
    });
  }
  const expected = sourceTokens.filter((token) => idSet.has(token.id));
  if (expected.length !== ids.length) {
    throw sessionError("invalid-session", `Chunk ${chunkId} accepted an ID outside its source tokens.`, {
      chunkId,
      tokenIds: ids.filter((id) => !sourceTokens.some((token) => token.id === id)),
    });
  }
  // Schema-v1 sessions created before STOA 5.9.1 legitimately have no Pinyin
  // field. Keep them restorable; newly pasted Classical Chinese responses are
  // still required to provide Pinyin by submitManualChunkResponse above.
  const validationLanguage = language === "classical-chinese"
    && value.every((token) => isRecord(token) && Object.hasOwn(token, "pinyin"))
    ? language
    : undefined;
  const validated = validateChunkResponse(
    { tokens: value },
    expected,
    undefined,
    expected,
    validationLanguage,
  );
  if (validated.failedTokenIds.length || validated.schemaErrors.length) {
    throw sessionError("invalid-session", `Chunk ${chunkId} contains invalid accepted token data.`, {
      chunkId,
      tokenIds: validated.failedTokenIds,
      details: validated.schemaErrors,
    });
  }
  const byId = new Map(validated.tokens.map((token) => [token.id, token]));
  return sourceTokens.map((token) => byId.get(token.id)).filter((token): token is AiTokenEnrichment => Boolean(token));
};

/** Restores and canonicalizes a saved session; unknown fields such as apiKey are discarded. */
export const restoreManualAnalysisSession = (serialized: string): ManualAnalysisSession => {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw sessionError("invalid-session", "The saved manual AI session is not valid JSON.", {
      details: [error instanceof Error ? error.message : String(error)],
    });
  }
  if (!isRecord(value) || value.format !== SESSION_FORMAT || value.schemaVersion !== SESSION_SCHEMA_VERSION) {
    throw sessionError("invalid-session", "This is not a supported STOA manual AI session file.");
  }
  if (!isStoaLanguageId(value.language) || typeof value.sourceText !== "string") {
    throw sessionError("invalid-session", "The session language or sourceText is invalid.");
  }
  const sessionLanguage = value.language;
  const annotationTarget = value.annotationTarget === "chinese" ? "chinese" : "english";
  const chunkMinTokens = clampInteger(
    typeof value.chunkMinTokens === "number" ? value.chunkMinTokens : undefined,
    DEFAULT_CHUNK_MIN,
    1,
    500,
  );
  const chunkMaxTokens = clampInteger(
    typeof value.chunkMaxTokens === "number" ? value.chunkMaxTokens : undefined,
    DEFAULT_CHUNK_MAX,
    chunkMinTokens,
    500,
  );
  const sourceTokens = tokenizeClassicalText(value.sourceText, value.language);
  if (!sourceTokens.length) {
    throw sessionError("invalid-session", "The saved session source contains no analyzable word tokens.");
  }
  const canonicalChunks = chunkSourceTokens(sourceTokens, {
    minTokens: chunkMinTokens,
    maxTokens: chunkMaxTokens,
  });
  if (!Array.isArray(value.chunks) || value.chunks.length !== canonicalChunks.length) {
    throw sessionError("invalid-session", "The saved chunk list does not match the source text.");
  }
  const savedChunks = value.chunks;
  const allowedStatuses = new Set<ManualChunkStatus>(["pending", "active", "valid", "needs-retry"]);
  const chunks = canonicalChunks.map<ManualAnalysisChunk>((canonicalChunk, index) => {
    const saved = savedChunks[index];
    if (!isRecord(saved) || saved.id !== canonicalChunk.id || saved.index !== index) {
      throw sessionError("invalid-session", `Saved chunk ${index + 1} does not match its source range.`);
    }
    const expectedComparable = sourceChunkToComparable(canonicalChunk);
    if (!Array.isArray(saved.tokens) || !saved.tokens.every(isRecord)) {
      throw sessionError("invalid-session", `Saved chunk ${index + 1} has invalid source tokens.`);
    }
    const savedComparable = {
      id: saved.id,
      tokenIds: saved.tokens.map((token) => token.id),
    };
    if (JSON.stringify(savedComparable) !== JSON.stringify(expectedComparable)) {
      throw sessionError("invalid-session", `Saved chunk ${index + 1} token IDs do not match the source text.`);
    }
    if (typeof saved.status !== "string" || !allowedStatuses.has(saved.status as ManualChunkStatus)) {
      throw sessionError("invalid-session", `Saved chunk ${index + 1} has an invalid status.`);
    }
    const targetTokenIds = assertStringArray(saved.targetTokenIds, `Chunk ${index + 1} targetTokenIds`);
    const validSourceIds = new Set(canonicalChunk.tokens.map((token) => token.id));
    if (new Set(targetTokenIds).size !== targetTokenIds.length || targetTokenIds.some((id) => !validSourceIds.has(id))) {
      throw sessionError("invalid-session", `Saved chunk ${index + 1} has invalid target token IDs.`, {
        chunkId: canonicalChunk.id,
        tokenIds: targetTokenIds,
      });
    }
    const acceptedTokens = restoreAcceptedTokens(
      saved.acceptedTokens,
      canonicalChunk.tokens,
      canonicalChunk.id,
      sessionLanguage,
    );
    if (saved.status === "valid" && acceptedTokens.length !== canonicalChunk.tokens.length) {
      throw sessionError("invalid-session", `Saved chunk ${index + 1} is marked valid but is incomplete.`);
    }
    if (saved.status !== "valid" && !targetTokenIds.length) {
      throw sessionError("invalid-session", `Saved chunk ${index + 1} has no remaining target IDs.`);
    }
    const diagnostics = restoreDiagnostics(saved.diagnostics);
    const diagnosticHistory = Array.isArray(saved.diagnosticHistory)
      ? saved.diagnosticHistory.map(restoreDiagnostics)
      : [];
    return {
      id: canonicalChunk.id,
      index,
      status: saved.status as ManualChunkStatus,
      tokens: canonicalChunk.tokens,
      targetTokenIds,
      acceptedTokens,
      attempt: clampInteger(typeof saved.attempt === "number" ? saved.attempt : undefined, 0, 0, 100),
      literalTranslation: typeof saved.literalTranslation === "string" ? saved.literalTranslation : "",
      naturalTranslation: typeof saved.naturalTranslation === "string" ? saved.naturalTranslation : "",
      notes: normalizeAnalysisNotes(saved.notes, canonicalChunk.tokens.map((token) => token.id)),
      diagnostics,
      diagnosticHistory,
      lastError: restoreLastError(saved.lastError),
      sentenceAlignedEnd: canonicalChunk.sentenceAlignedEnd,
    };
  });
  if (chunks.filter((chunk) => chunk.status === "active").length > MAX_ACTIVE_CHUNKS) {
    throw sessionError("invalid-session", "The saved session contains more than two active chunks.");
  }
  return {
    format: SESSION_FORMAT,
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: typeof value.id === "string" ? value.id : `manual-${sourceTokens[0].id.slice(4, 11)}`,
    language: sessionLanguage,
    annotationTarget,
    sourceText: value.sourceText,
    sourceTokens,
    chunkMinTokens,
    chunkMaxTokens,
    chunks,
  };
};
