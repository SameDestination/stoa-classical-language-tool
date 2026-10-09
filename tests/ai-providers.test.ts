import assert from "node:assert/strict";
import test from "node:test";
import {
  AiProviderRequestError,
  anthropicOutputText,
  buildProviderRequestBody,
  createProviderChunkRequest,
  openAiOutputText,
  STOA_CLASSICAL_CHINESE_CHUNK_SCHEMA,
  STOA_CHUNK_SCHEMA,
  stoaChunkSchemaForLanguage,
} from "../app/ai-providers";
import {
  runAiPipeline,
  tokenizeClassicalText,
  type AiChunkRequest,
} from "../app/lib/ai-pipeline";
import { buildLanguageSystemPrompt, STOA_LANGUAGE_IDS } from "../app/language-config";

const sourceTokens = tokenizeClassicalText("λόγος.", "ancient-greek");
const request: AiChunkRequest = {
  chunkId: "chunk-1",
  rootChunkId: "chunk-1",
  chunkIndex: 0,
  attempt: 0,
  language: "ancient-greek",
  tokens: sourceTokens,
  contextTokens: sourceTokens,
  systemPrompt: "system prompt",
  userPrompt: "user prompt",
};

test("strict schema requires every property while nullable feature keys remain semantically optional", () => {
  assert.equal(STOA_CHUNK_SCHEMA.additionalProperties, false);
  assert.deepEqual(
    new Set(STOA_CHUNK_SCHEMA.required),
    new Set(Object.keys(STOA_CHUNK_SCHEMA.properties)),
  );

  const tokenSchema = STOA_CHUNK_SCHEMA.properties.tokens.items;
  assert.equal(tokenSchema.additionalProperties, false);
  assert.deepEqual(
    new Set(tokenSchema.required),
    new Set(Object.keys(tokenSchema.properties)),
  );
  const featureSchema = tokenSchema.properties.features;
  assert.equal(featureSchema.additionalProperties, false);
  assert.deepEqual(
    new Set(featureSchema.required),
    new Set(Object.keys(featureSchema.properties)),
  );
  Object.values(featureSchema.properties).forEach((property) => {
    assert.deepEqual(property.type, ["string", "null"]);
  });
});

test("locked prompt examples match the provider response schema exactly", () => {
  for (const language of STOA_LANGUAGE_IDS) {
    const schema = stoaChunkSchemaForLanguage(language);
    const prompt = buildLanguageSystemPrompt(language, { mode: "locked-tokens" });
    const example = JSON.parse(prompt.split("Return exactly this top-level shape:\n").at(-1) ?? "");
    assert.deepEqual(
      new Set(Object.keys(example)),
      new Set(Object.keys(schema.properties)),
    );
    assert.deepEqual(
      new Set(Object.keys(example.tokens[0])),
      new Set(Object.keys(schema.properties.tokens.items.properties)),
    );
    assert.match(prompt, /use null for inapplicable keys/iu);
    assert.match(prompt, /Never use empty-string placeholders/u);
  }
});

test("Classical Chinese provider schema requires Pinyin without changing Greek or Latin", () => {
  const chineseTokenSchema = STOA_CLASSICAL_CHINESE_CHUNK_SCHEMA.properties.tokens.items;
  assert.equal(chineseTokenSchema.properties.pinyin.type, "string");
  assert.ok(chineseTokenSchema.required.includes("pinyin"));
  assert.equal("pinyin" in STOA_CHUNK_SCHEMA.properties.tokens.items.properties, false);

  const chineseRequest: AiChunkRequest = {
    ...request,
    language: "classical-chinese",
  };
  const body = buildProviderRequestBody("openai", "test-openai")(chineseRequest);
  const format = (body.text as { format: { schema: unknown } }).format;
  assert.equal(format.schema, STOA_CLASSICAL_CHINESE_CHUNK_SCHEMA);
});

test("OpenAI request uses Responses strict JSON Schema format", () => {
  const body = buildProviderRequestBody("openai", "test-openai")(request);
  assert.equal(body.model, "test-openai");
  assert.equal(body.store, false);
  assert.deepEqual(body.input, [
    { role: "system", content: request.systemPrompt },
    { role: "user", content: request.userPrompt },
  ]);
  assert.deepEqual(body.text, {
    format: {
      type: "json_schema",
      name: "stoa_interlinear_chunk",
      strict: true,
      schema: STOA_CHUNK_SCHEMA,
    },
  });
});

test("Anthropic request uses Messages output_config.format JSON Schema", () => {
  const body = buildProviderRequestBody("anthropic", "test-claude")(request);
  assert.equal(body.model, "test-claude");
  assert.equal(body.system, request.systemPrompt);
  assert.deepEqual(body.messages, [{ role: "user", content: request.userPrompt }]);
  assert.deepEqual(body.output_config, {
    format: { type: "json_schema", schema: STOA_CHUNK_SCHEMA },
  });
  assert.equal(typeof body.max_tokens, "number");
});

test("provider response text extraction handles official and nested response shapes", () => {
  assert.equal(openAiOutputText({ output_text: "{\"ok\":1}" }), "{\"ok\":1}");
  assert.equal(
    openAiOutputText({
      output: [
        { content: [{ type: "refusal", refusal: "no" }] },
        { content: [{ type: "output_text", text: "first" }, { type: "output_text", text: "second" }] },
      ],
    }),
    "first\nsecond",
  );
  assert.equal(
    anthropicOutputText({
      content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "json" }],
    }),
    "json",
  );
});

test("401 provider errors are non-retryable and pipeline does not retry", async () => {
  let transportCalls = 0;
  const transport = async () => {
    transportCalls += 1;
    return {
      ok: false,
      status: 401,
      requestId: "request-401",
      data: { error: { message: "Incorrect API key" } },
    };
  };

  const adapter = createProviderChunkRequest("openai", "test-openai", transport);
  await assert.rejects(
    adapter(request),
    (error: unknown) =>
      error instanceof AiProviderRequestError &&
      error.status === 401 &&
      error.retryable === false,
  );

  transportCalls = 0;
  await assert.rejects(
    runAiPipeline({
      text: "λόγος.",
      language: "ancient-greek",
      request: adapter,
      maxRetries: 2,
      strict: true,
    }),
  );
  assert.equal(transportCalls, 1);
});

test("401 without a provider message still reports rejected API key", async () => {
  const transport = async () => ({
    ok: false,
    status: 401,
    requestId: "request-401",
    data: {},
  });

  await assert.rejects(
    createProviderChunkRequest("anthropic", "test-claude", transport)(request),
    (error: unknown) =>
      error instanceof AiProviderRequestError &&
      error.retryable === false &&
      /rejected the API key/u.test(error.message),
  );
});

test("429 provider errors remain retryable", async () => {
  const transport = async () => ({
    ok: false,
    status: 429,
    requestId: "request-429",
    data: { error: { message: "Rate limited" } },
  });

  await assert.rejects(
    createProviderChunkRequest("anthropic", "test-claude", transport)(request),
    (error: unknown) =>
      error instanceof AiProviderRequestError &&
      error.status === 429 &&
      error.retryable === true,
  );
});

test("missing structured text is rejected before JSON parsing", async () => {
  const transport = async () => ({
    ok: true,
    status: 200,
    requestId: "request-empty",
    data: { output: [{ content: [{ type: "refusal", refusal: "Cannot comply" }] }] },
  });

  await assert.rejects(
    createProviderChunkRequest("openai", "test-openai", transport)(request),
    /returned no structured text output/u,
  );
});

test("user cancellation is non-retryable", async () => {
  const transport = async () => ({
    ok: false,
    status: 0,
    requestId: null,
    data: { error: { type: "cancelled", message: "AI request was cancelled." } },
  });

  await assert.rejects(
    createProviderChunkRequest("openai", "test-openai", transport)(request),
    (error: unknown) =>
      error instanceof AiProviderRequestError && error.retryable === false,
  );
});
