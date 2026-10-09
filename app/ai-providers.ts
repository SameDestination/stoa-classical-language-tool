import type { AiChunkRequest } from "./lib/ai-pipeline";
import { requestAi, type AiProvider, type AiRequestResult } from "./ai-key-runtime";

const NULLABLE_STRING_SCHEMA = { type: ["string", "null"] } as const;

const TOKEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    surface: { type: "string" },
    lemma: { type: "string" },
    gloss: { type: "string" },
    pos: {
      type: "string",
      enum: [
        "ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN",
        "NUM", "PART", "PRON", "PROPN", "SCONJ", "VERB", "X",
      ],
    },
    morphology: { type: "string" },
    features: {
      type: "object",
      additionalProperties: false,
      properties: {
        case: NULLABLE_STRING_SCHEMA,
        number: NULLABLE_STRING_SCHEMA,
        gender: NULLABLE_STRING_SCHEMA,
        person: NULLABLE_STRING_SCHEMA,
        tense: NULLABLE_STRING_SCHEMA,
        mood: NULLABLE_STRING_SCHEMA,
        voice: NULLABLE_STRING_SCHEMA,
        degree: NULLABLE_STRING_SCHEMA,
        reading: NULLABLE_STRING_SCHEMA,
        transliteration: NULLABLE_STRING_SCHEMA,
        particleRole: NULLABLE_STRING_SCHEMA,
        aspect: NULLABLE_STRING_SCHEMA,
        classifier: NULLABLE_STRING_SCHEMA,
        conjugation: NULLABLE_STRING_SCHEMA,
        polarity: NULLABLE_STRING_SCHEMA,
        politeness: NULLABLE_STRING_SCHEMA,
        honorific: NULLABLE_STRING_SCHEMA,
        auxiliaryRole: NULLABLE_STRING_SCHEMA,
        syntaxRole: NULLABLE_STRING_SCHEMA,
        register: NULLABLE_STRING_SCHEMA,
      },
      required: [
        "case", "number", "gender", "person", "tense", "mood", "voice",
        "degree", "reading", "transliteration", "particleRole", "aspect",
        "classifier", "conjugation", "polarity", "politeness", "honorific",
        "auxiliaryRole", "syntaxRole", "register",
      ],
    },
    confidence: { type: "number" },
    alternatives: { type: "array", items: { type: "string" } },
  },
  required: [
    "id", "surface", "lemma", "gloss", "pos", "morphology", "features",
    "confidence", "alternatives",
  ],
} as const;

const CLASSICAL_CHINESE_TOKEN_SCHEMA = {
  ...TOKEN_SCHEMA,
  properties: {
    ...TOKEN_SCHEMA.properties,
    pinyin: { type: "string" },
  },
  required: [...TOKEN_SCHEMA.required, "pinyin"],
} as const;

const chunkSchema = <TokenSchema extends typeof TOKEN_SCHEMA | typeof CLASSICAL_CHINESE_TOKEN_SCHEMA>(
  tokenSchema: TokenSchema,
) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    chunkId: { type: "string" },
    literalTranslation: { type: "string" },
    naturalTranslation: { type: "string" },
    tokens: { type: "array", items: tokenSchema },
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tokenId: { type: "string" },
          text: { type: "string" },
        },
        required: ["tokenId", "text"],
      },
    },
  },
  required: ["chunkId", "literalTranslation", "naturalTranslation", "tokens", "notes"],
} as const);

/** Strict schema used by Ancient Greek and Latin provider requests. */
export const STOA_CHUNK_SCHEMA = chunkSchema(TOKEN_SCHEMA);

/** Classical Chinese adds a required per-token Hanyu Pinyin reading aid. */
export const STOA_CLASSICAL_CHINESE_CHUNK_SCHEMA = chunkSchema(CLASSICAL_CHINESE_TOKEN_SCHEMA);

export const stoaChunkSchemaForLanguage = (language: AiChunkRequest["language"]) =>
  language === "classical-chinese"
    ? STOA_CLASSICAL_CHINESE_CHUNK_SCHEMA
    : STOA_CHUNK_SCHEMA;

const providerErrorMessage = (provider: AiProvider, result: AiRequestResult) => {
  const data = result.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const root = data as Record<string, unknown>;
    const error = root.error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  if (result.status === 401 || result.status === 403) {
    return `${provider === "openai" ? "OpenAI" : "Anthropic"} rejected the API key.`;
  }
  if (
    result.status === 0 &&
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    const rootError = (data as Record<string, unknown>).error;
    if (
      rootError &&
      typeof rootError === "object" &&
      !Array.isArray(rootError) &&
      (rootError as Record<string, unknown>).type === "cancelled"
    ) {
      return "AI request was cancelled.";
    }
  }
  if (result.status === 429) return "The provider rate limit was reached. STOA will retry this chunk.";
  if (result.status >= 500) return "The provider is temporarily unavailable. STOA will retry this chunk.";
  return `The provider request failed${result.status ? ` (HTTP ${result.status})` : ""}.`;
};

export class AiProviderRequestError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "AiProviderRequestError";
    this.status = status;
    this.retryable = retryable;
  }
}

const isRetryableProviderFailure = (status: number) =>
  status === 0 || status === 408 || status === 409 || status === 429 || status >= 500;

const providerFailureIsRetryable = (result: AiRequestResult) => {
  if (result.status !== 0 || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return isRetryableProviderFailure(result.status);
  }
  const error = (result.data as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return true;
  return (error as Record<string, unknown>).type !== "cancelled";
};

export const openAiOutputText = (data: unknown) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const root = data as Record<string, unknown>;
  if (typeof root.output_text === "string") return root.output_text;
  if (!Array.isArray(root.output)) return "";
  return root.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const content = (item as Record<string, unknown>).content;
      return Array.isArray(content) ? content : [];
    })
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      if ((item as Record<string, unknown>).type !== "output_text") return "";
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
};

export const anthropicOutputText = (data: unknown) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const content = (data as Record<string, unknown>).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      if ((item as Record<string, unknown>).type !== "text") return "";
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
};

export const buildProviderRequestBody = (
  provider: AiProvider,
  model: string,
) => (request: AiChunkRequest): Record<string, unknown> => {
  const schema = stoaChunkSchemaForLanguage(request.language);
  return provider === "openai"
    ? {
        model,
        store: false,
        input: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "stoa_interlinear_chunk",
            strict: true,
            schema,
          },
        },
      }
    : {
        model,
        max_tokens: Math.min(16_000, Math.max(2_048, request.tokens.length * 150)),
        system: request.systemPrompt,
        messages: [{ role: "user", content: request.userPrompt }],
        output_config: {
          format: { type: "json_schema", schema },
        },
      };
};

export const createProviderChunkRequest = (
  provider: AiProvider,
  model: string,
  transport: typeof requestAi = requestAi,
) => async (request: AiChunkRequest): Promise<string> => {
  const body = buildProviderRequestBody(provider, model)(request);

  const result = await transport(provider, body, { timeoutMs: 180_000 });
  if (!result.ok) {
    throw new AiProviderRequestError(
      providerErrorMessage(provider, result),
      result.status,
      providerFailureIsRetryable(result),
    );
  }
  const text = provider === "openai"
    ? openAiOutputText(result.data)
    : anthropicOutputText(result.data);
  if (!text.trim()) throw new Error("The provider returned no structured text output.");
  return text;
};
