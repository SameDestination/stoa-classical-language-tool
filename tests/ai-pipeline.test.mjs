import assert from "node:assert/strict";
import test from "node:test";

import {
  AiPipelineError,
  AiJsonResponseError,
  buildChunkPrompts,
  chunkSourceTokens,
  extractJsonBody,
  parseAiJsonResponse,
  runAiPipeline,
  tokenizeClassicalText,
  tokenizeStoaText,
  validateChunkResponse,
} from "../app/lib/ai-pipeline.ts";
import { STOA_LANGUAGE_IDS } from "../app/language-config.ts";

const enrich = (token, overrides = {}) => ({
  id: token.id,
  surface: token.surface,
  lemma: token.surface.toLowerCase(),
  gloss: `gloss-${token.ordinal}`,
  pos: "NOUN",
  morphology: "Nom. Sg.",
  features: { case: "Nominative", number: "Singular" },
  confidence: 0.98,
  alternatives: [],
  ...overrides,
});

test("local tokenizer preserves punctuation, explicit layout, offsets, and stable IDs", () => {
  const source = "“λόγον,” εἶπεν.\n\n(Ὀρθὸς ἢ ὀρθούμενος.)";
  const first = tokenizeClassicalText(source, "ancient-greek");
  const second = tokenizeClassicalText(source, "ancient-greek");

  assert.deepEqual(first.map((token) => token.id), second.map((token) => token.id));
  assert.deepEqual(first.map((token) => token.surface), [
    "λόγον",
    "εἶπεν",
    "Ὀρθὸς",
    "ἢ",
    "ὀρθούμενος",
  ]);
  assert.equal(first[0].punctuationBefore, "“");
  assert.equal(first[0].punctuationAfter, ",”");
  assert.equal(first[1].punctuationAfter, ".");
  assert.equal(first[1].breakAfter, "paragraph");
  assert.equal(first[1].blankLinesAfter, 1);
  assert.equal(first[2].punctuationBefore, "(");
  assert.equal(first.at(-1).punctuationAfter, ".)");
  first.forEach((token) => {
    assert.equal(source.slice(token.sourceStart, token.sourceEnd), token.surface);
  });
});

test("separatorAfter retains non-breaking and ordinary whitespace without exposing it to the model", () => {
  const source = "Gallia\u00a0est omnis divisa.";
  const tokens = tokenizeStoaText(source, "latin");
  assert.equal(tokens[0].separatorAfter, "\u00a0");
  assert.equal(tokens[1].separatorAfter, " ");
  assert.equal(source.slice(tokens[0].sourceEnd, tokens[1].sourceStart), "\u00a0");
  const prompt = buildChunkPrompts("latin", "chunk-la", tokens);
  assert.doesNotMatch(prompt.userPrompt, /separatorAfter/u);
  assert.match(prompt.systemPrompt, /scholarly Classical Latin interlinear analyst/u);
});

test("chunker balances a 500-token text into sentence-aligned 50–80 token jobs", () => {
  const tokens = tokenizeClassicalText(Array.from({ length: 500 }, () => "arma.").join(" "), "latin");
  const chunks = chunkSourceTokens(tokens);

  assert.equal(chunks.length, 7);
  assert.equal(chunks.flatMap((chunk) => chunk.tokens).length, 500);
  assert.ok(chunks.every((chunk) => chunk.tokens.length >= 50 && chunk.tokens.length <= 80));
  assert.ok(chunks.every((chunk) => chunk.sentenceAlignedEnd));
  assert.deepEqual(chunks.flatMap((chunk) => chunk.tokens.map((token) => token.id)), tokens.map((token) => token.id));
});

test("all production language IDs produce target-aware locked-token prompts", () => {
  const sourceByLanguage = {
    "ancient-greek": "λόγος.",
    latin: "verbum.",
    "classical-chinese": "學而時習之。",
  };
  for (const language of STOA_LANGUAGE_IDS) {
    const tokens = tokenizeStoaText(sourceByLanguage[language], language);
    const prompt = buildChunkPrompts(language, `chunk-${language}`, tokens);
    assert.ok(prompt.systemPrompt.length > 500);
    assert.match(prompt.systemPrompt, /use null for inapplicable keys/u);
    assert.match(prompt.systemPrompt, /Never use empty-string placeholders/u);
    assert.match(prompt.userPrompt, /TARGET TOKENS/u);
    assert.ok(prompt.userPrompt.includes(tokens[0].id));
  }
});

test("JSON extraction ignores surrounding prose, Markdown fences, and web links", () => {
  const response = `See https://example.test/help?q=[not-json].\n\n\`\`\`json
  {"tokens":[{"id":"tok-1"}],"notes":[]}
  \`\`\`\nMore help: https://example.test/end`;

  const body = extractJsonBody(response);
  assert.deepEqual(JSON.parse(body), { tokens: [{ id: "tok-1" }], notes: [] });
});

test("safe JSON repair is narrow and lossless", () => {
  const repaired = parseAiJsonResponse(`Preface\n{"tokens":[{"id":"tok-1","gloss":"line one
line two",}],"notes":[],}\nhttps://example.test`);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.value.tokens[0].gloss, "line one\nline two");

  assert.throws(
    () => parseAiJsonResponse("{'tokens': [{'id': 'tok-1'}] }"),
    AiJsonResponseError,
  );
  assert.throws(
    () => parseAiJsonResponse('{"tokens":[{"id":"tok-1"}]'),
    AiJsonResponseError,
  );
});

test("schema validation reports duplicates, omissions, unknown IDs, changed surfaces, and order", () => {
  const expected = tokenizeClassicalText("Gallia est omnis", "latin");
  const unknown = { ...enrich(expected[0]), id: "invented-id" };
  const payload = {
    tokens: [
      enrich(expected[1]),
      enrich(expected[0]),
      enrich(expected[0]),
      unknown,
      enrich(expected[2], { surface: "OMNIS" }),
    ],
  };
  const result = validateChunkResponse(payload, expected);

  assert.deepEqual(result.duplicateTokenIds, [expected[0].id]);
  assert.deepEqual(result.unknownTokenIds, ["invented-id"]);
  assert.deepEqual(result.surfaceMismatchTokenIds, [expected[2].id]);
  assert.ok(result.outOfOrderTokenIds.length > 0);
  assert.deepEqual(new Set(result.failedTokenIds), new Set([expected[0].id, expected[2].id]));
  assert.deepEqual(result.tokens.map((token) => token.id), [expected[1].id]);
});

test("chunk validation requires the expected chunkId and strips null or empty feature placeholders", () => {
  const expected = tokenizeClassicalText("verbum", "latin");
  const token = enrich(expected[0], {
    morphology: "Nom. Sg. n.",
    features: {
      case: "  Nominative  ",
      number: "Singular",
      gender: null,
      person: "",
      tense: "   ",
    },
  });

  for (const payload of [
    { tokens: [token] },
    { chunkId: "another-chunk", tokens: [token] },
  ]) {
    const invalid = validateChunkResponse(payload, expected, "chunk-latin");
    assert.deepEqual(invalid.tokens, []);
    assert.deepEqual(invalid.failedTokenIds, expected.map((item) => item.id));
    assert.match(invalid.schemaErrors.join(" "), /chunkId must be "chunk-latin"/u);
  }

  const valid = validateChunkResponse({ chunkId: "chunk-latin", tokens: [token] }, expected, "chunk-latin");
  assert.deepEqual(valid.failedTokenIds, []);
  assert.deepEqual(valid.schemaErrors, []);
  assert.deepEqual(valid.tokens[0].features, {
    case: "Nominative",
    number: "Singular",
  });
});

test("chunk validation keeps exact note anchors and ignores malformed or unknown note anchors without failing tokens", () => {
  const expected = tokenizeClassicalText("λόγος ἐστίν", "ancient-greek");
  const payload = {
    tokens: expected.map((token) => enrich(token)),
    notes: [
      { tokenId: expected[1].id, text: "The copula is explicit in this clause." },
      { tokenId: "invented", text: "Unknown anchor." },
      { tokenId: expected[0].id, text: "" },
    ],
  };
  const result = validateChunkResponse(payload, expected);
  assert.deepEqual(result.failedTokenIds, []);
  assert.deepEqual(result.notes, [{
    id: "note-0001",
    tokenId: expected[1].id,
    text: "The copula is explicit in this clause.",
  }]);
  assert.match(result.schemaErrors.join(" "), /tokenId must copy an exact token id/u);
  assert.match(result.schemaErrors.join(" "), /text must be a non-empty string/u);
});

test("Classical Chinese validation requires and NFC-normalizes Pinyin while Latin remains unchanged", () => {
  const chinese = tokenizeClassicalText("學", "classical-chinese");
  const withoutPinyin = validateChunkResponse(
    { tokens: [enrich(chinese[0])] },
    chinese,
    undefined,
    chinese,
    "classical-chinese",
  );
  assert.deepEqual(withoutPinyin.failedTokenIds, [chinese[0].id]);
  assert.match(withoutPinyin.schemaErrors.join(" "), /string pinyin/u);

  const withPinyin = validateChunkResponse(
    { tokens: [enrich(chinese[0], { pinyin: "xue\u0301" })] },
    chinese,
    undefined,
    chinese,
    "classical-chinese",
  );
  assert.deepEqual(withPinyin.failedTokenIds, []);
  assert.equal(withPinyin.tokens[0].pinyin, "xué");

  const latin = tokenizeClassicalText("verbum", "latin");
  const unchangedLatin = validateChunkResponse(
    { tokens: [enrich(latin[0])] },
    latin,
    undefined,
    latin,
    "latin",
  );
  assert.deepEqual(unchangedLatin.failedTokenIds, []);
  assert.equal(unchangedLatin.tokens[0].pinyin, undefined);
});

test("pipeline limits concurrency to two, merges by stable ID, and retries only failed tokens", async () => {
  const text = Array.from({ length: 120 }, (_, index) => `verbum${index + 1}${index % 12 === 11 ? "." : ""}`).join(" ");
  let active = 0;
  let maximumActive = 0;
  const calls = [];

  const result = await runAiPipeline({
    text,
    language: "latin",
    concurrency: 99,
    maxRetries: 2,
    request: async (request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      calls.push({
        attempt: request.attempt,
        rootChunkId: request.rootChunkId,
        tokenIds: request.tokens.map((token) => token.id),
        contextTokenIds: request.contextTokens.map((token) => token.id),
        userPrompt: request.userPrompt,
      });
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;

      const tokens = request.attempt === 0 && request.chunkIndex === 0
        ? request.tokens.slice(1)
        : request.tokens;
      return JSON.stringify({
        chunkId: request.rootChunkId,
        literalTranslation: `literal-${request.rootChunkId}`,
        naturalTranslation: `natural-${request.rootChunkId}`,
        tokens: tokens.map((token) => enrich(token)),
        notes: [],
      });
    },
  });

  assert.equal(result.chunks.length, 2);
  assert.equal(maximumActive, 2);
  assert.equal(result.diagnostics.requestCount, 3);
  assert.equal(result.diagnostics.retryRequestCount, 1);
  assert.equal(result.diagnostics.complete, true);
  const retry = calls.find((call) => call.attempt === 1);
  assert.ok(retry);
  assert.equal(retry.tokenIds.length, 1);
  assert.equal(retry.tokenIds[0], result.sourceTokens[0].id);
  assert.ok(retry.contextTokenIds.length > retry.tokenIds.length);
  assert.match(retry.userPrompt, /READ-ONLY ORIGINAL CHUNK CONTEXT/u);
  assert.ok(retry.userPrompt.includes(retry.contextTokenIds.at(-1)));
  assert.equal(result.analysis.tokens.length, 120);
  assert.deepEqual(result.analysis.tokens.map((token) => token.id), result.sourceTokens.map((token) => token.id));
  assert.deepEqual(result.analysis.tokens.map((token) => token.surface), result.sourceTokens.map((token) => token.surface));
  assert.ok(result.analysis.tokens.every((token) => token.gloss));
});

test("an invalid whole-chunk response retries the whole chunk and then succeeds", async () => {
  const calls = [];
  const result = await runAiPipeline({
    text: "Gallia est omnis divisa.",
    language: "latin",
    maxRetries: 1,
    request: async (request) => {
      calls.push({ attempt: request.attempt, count: request.tokens.length });
      if (request.attempt === 0) return "A link only: https://example.test";
      return JSON.stringify({
        chunkId: request.rootChunkId,
        tokens: request.tokens.map((token) => enrich(token)),
      });
    },
  });

  assert.deepEqual(calls, [
    { attempt: 0, count: 4 },
    { attempt: 1, count: 4 },
  ]);
  assert.equal(result.diagnostics.complete, true);
  assert.equal(result.diagnostics.retryRequestCount, 1);
});

test("strict Guided/API analysis still rejects unresolved source tokens", async () => {
  await assert.rejects(
    runAiPipeline({
      text: "Gallia est omnis.",
      language: "latin",
      maxRetries: 0,
      strict: true,
      request: async (request) => JSON.stringify({
        chunkId: request.rootChunkId,
        tokens: request.tokens.slice(1).map((token) => enrich(token)),
      }),
    }),
    (error) => error instanceof AiPipelineError
      && error.result.diagnostics.unresolvedTokenIds.length === 1,
  );
});
