import assert from "node:assert/strict";
import test from "node:test";

import {
  activateAvailableManualChunks,
  activateManualChunk,
  createManualAnalysisSession,
  getManualChunkPrompt,
  ManualSessionError,
  mergeManualAnalysisSession,
  restoreManualAnalysisSession,
  serializeManualAnalysisSession,
  submitManualChunkResponse,
} from "../app/lib/manual-ai-session.ts";

const enrich = (token, overrides = {}) => ({
  id: token.id,
  surface: token.surface,
  lemma: token.surface.toLocaleLowerCase(),
  gloss: `gloss-${token.ordinal}`,
  pos: "NOUN",
  morphology: "Nom. Sg.",
  features: { case: "Nominative", number: "Singular" },
  confidence: 0.97,
  alternatives: [],
  ...overrides,
});

const responseFor = (tokens, options = {}) => JSON.stringify({
  literalTranslation: options.literalTranslation || "literal",
  naturalTranslation: options.naturalTranslation || "natural",
  tokens: tokens.map((token) => enrich(token)),
  notes: options.notes || [],
});

const latinWords = (count) => Array.from(
  { length: count },
  (_, index) => `verbum${index + 1}${index % 12 === 11 ? "." : ""}`,
).join(" ");

test("a 500-word session creates 50–80 token chunks and only two active slots", () => {
  const session = createManualAnalysisSession({
    text: latinWords(500),
    language: "latin",
  });

  assert.equal(session.sourceTokens.length, 500);
  assert.equal(session.chunks.length, 7);
  assert.ok(session.chunks.every((chunk) => chunk.tokens.length >= 50 && chunk.tokens.length <= 80));
  assert.deepEqual(session.chunks.map((chunk) => chunk.status), [
    "active",
    "active",
    "pending",
    "pending",
    "pending",
    "pending",
    "pending",
  ]);
  assert.throws(
    () => activateManualChunk(session, session.chunks[2].id),
    (error) => error instanceof ManualSessionError && error.details.code === "active-limit",
  );
});

test("validating one slot allows the next pending chunk to activate", () => {
  let session = createManualAnalysisSession({
    text: latinWords(180),
    language: "latin",
  });
  const first = session.chunks[0];
  const submitted = submitManualChunkResponse(session, first.id, responseFor(first.tokens));
  assert.equal(submitted.ok, true);
  session = activateAvailableManualChunks(submitted.session);

  assert.equal(session.chunks[0].status, "valid");
  assert.equal(session.chunks.filter((chunk) => chunk.status === "active").length, 2);
  assert.equal(session.chunks[2].status, "active");
});

test("Classical Chinese guided manual import requires and preserves per-token Pinyin", () => {
  let session = createManualAnalysisSession({
    text: "學。",
    language: "classical-chinese",
  });
  const chunk = session.chunks[0];
  const missing = submitManualChunkResponse(session, chunk.id, responseFor(chunk.tokens));
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.chunk.targetTokenIds, chunk.tokens.map((token) => token.id));
  assert.match(missing.diagnostics.schemaErrors.join(" "), /string pinyin/u);

  session = activateManualChunk(missing.session, chunk.id);
  const accepted = submitManualChunkResponse(session, chunk.id, JSON.stringify({
    literalTranslation: "study",
    naturalTranslation: "Study.",
    tokens: chunk.tokens.map((token) => enrich(token, { pinyin: "xue\u0301" })),
    notes: [],
  }));
  assert.equal(accepted.ok, true);
  const merged = mergeManualAnalysisSession(accepted.session);
  assert.equal(merged.analysis.tokens[0].pinyin, "xué");

  const restored = restoreManualAnalysisSession(serializeManualAnalysisSession(accepted.session));
  assert.equal(restored.chunks[0].acceptedTokens[0].pinyin, "xué");
});

test("pasted prose and URLs are ignored; valid tokens survive disorder, omissions, and duplicates", () => {
  const session = createManualAnalysisSession({
    text: latinWords(120),
    language: "latin",
  });
  const first = session.chunks[0];
  const missing = first.tokens[0];
  const duplicated = first.tokens[1];
  const disordered = first.tokens.slice(1).reverse().map((token) => enrich(token));
  disordered.push(enrich(duplicated));
  disordered.push({ ...enrich(first.tokens[2]), id: "not-a-source-id" });
  const raw = `A model may mention https://example.test/help?q=[json] first.\n\n\`\`\`json
  ${JSON.stringify({ tokens: disordered, notes: ["kept"] })}
  \`\`\`\nReference: https://example.test/end`;
  const submitted = submitManualChunkResponse(session, first.id, raw);

  assert.equal(submitted.ok, false);
  assert.equal(submitted.chunk.status, "needs-retry");
  assert.deepEqual(
    new Set(submitted.chunk.targetTokenIds),
    new Set([missing.id, duplicated.id]),
  );
  assert.equal(submitted.chunk.acceptedTokens.length, first.tokens.length - 2);
  assert.ok(submitted.diagnostics.outOfOrderTokenIds.length > 0);
  assert.deepEqual(submitted.diagnostics.missingTokenIds, [missing.id]);
  assert.deepEqual(submitted.diagnostics.duplicateTokenIds, [duplicated.id]);
  assert.deepEqual(submitted.diagnostics.unknownTokenIds, ["not-a-source-id"]);
  assert.equal(submitted.error.code, "schema");
});

test("targeted retry prompt asks only for failed IDs while retaining the full original chunk as context", () => {
  let session = createManualAnalysisSession({
    text: latinWords(120),
    language: "latin",
  });
  const first = session.chunks[0];
  const omitted = first.tokens[0];
  const partial = submitManualChunkResponse(
    session,
    first.id,
    responseFor(first.tokens.slice(1)),
  );
  session = activateManualChunk(partial.session, first.id);
  const prompt = getManualChunkPrompt(session, first.id);

  assert.equal(prompt.isRetry, true);
  assert.deepEqual(prompt.targetTokenIds, [omitted.id]);
  assert.equal(prompt.contextTokenIds.length, first.tokens.length);
  assert.match(prompt.userPrompt, /TARGET TOKENS/u);
  assert.match(prompt.userPrompt, /READ-ONLY ORIGINAL CHUNK CONTEXT/u);
  assert.ok(prompt.userPrompt.includes(first.tokens.at(-1).id));
});

test("targeted retry completes the session and final merge restores exact source order by stable ID", () => {
  let session = createManualAnalysisSession({
    text: latinWords(120),
    language: "latin",
  });
  const first = session.chunks[0];
  const second = session.chunks[1];
  const omitted = first.tokens[0];

  const firstPartialRaw = `Result follows. https://example.test is not data.\n\`\`\`json\n${JSON.stringify({
    literalTranslation: "literal one",
    naturalTranslation: "natural one",
    tokens: first.tokens.slice(1).reverse().map((token) => enrich(token)),
    notes: ["first note"],
  })}\n\`\`\``;
  session = submitManualChunkResponse(session, first.id, firstPartialRaw).session;
  session = submitManualChunkResponse(
    session,
    second.id,
    responseFor(second.tokens, {
      literalTranslation: "literal two",
      naturalTranslation: "natural two",
      notes: ["second note"],
    }),
  ).session;
  session = activateManualChunk(session, first.id);
  const retry = submitManualChunkResponse(
    session,
    first.id,
    responseFor([omitted], {
      literalTranslation: "literal one corrected",
      naturalTranslation: "natural one corrected",
      notes: ["first note"],
    }),
  );
  assert.equal(retry.ok, true);
  session = retry.session;

  const merged = mergeManualAnalysisSession(session);
  assert.equal(merged.complete, true);
  assert.deepEqual(merged.unresolvedTokenIds, []);
  assert.deepEqual(
    merged.analysis.tokens.map((token) => token.id),
    session.sourceTokens.map((token) => token.id),
  );
  assert.deepEqual(
    merged.analysis.tokens.map((token) => token.surface),
    session.sourceTokens.map((token) => token.surface),
  );
  assert.ok(merged.analysis.tokens.every((token) => token.gloss));
  assert.equal(merged.analysis.literalTranslation, "literal one corrected\nliteral two");
  assert.deepEqual(merged.analysis.notes, [
    { id: "note-0001", tokenId: null, text: "first note" },
    { id: "note-0001-2", tokenId: null, text: "second note" },
  ]);
  assert.ok(merged.issues.some((issue) => issue.type === "order"));
});

test("serialization restores retry state and strips provider credentials or unknown fields", () => {
  let session = createManualAnalysisSession({
    text: latinWords(120),
    language: "latin",
  });
  const first = session.chunks[0];
  session = submitManualChunkResponse(
    session,
    first.id,
    responseFor(first.tokens.slice(2), {
      notes: [{ tokenId: first.tokens[2].id, text: "Anchored session note." }],
    }),
  ).session;
  // Simulate an accidental runtime-only credential field; the serializer is a
  // whitelist and must not persist it.
  session = { ...session, apiKey: "sk-should-never-be-saved" };
  const serialized = serializeManualAnalysisSession(session);
  const restored = restoreManualAnalysisSession(serialized);

  assert.equal(serialized.includes("sk-should-never-be-saved"), false);
  assert.equal(serialized.includes("apiKey"), false);
  assert.equal(restored.chunks[0].status, "needs-retry");
  assert.equal(restored.chunks[0].lastError.code, "incomplete");
  assert.deepEqual(restored.chunks[0].targetTokenIds, first.tokens.slice(0, 2).map((token) => token.id));
  assert.equal(restored.chunks[0].acceptedTokens.length, first.tokens.length - 2);
  assert.deepEqual(restored.chunks[0].notes, [{
    id: "note-0001",
    tokenId: first.tokens[2].id,
    text: "Anchored session note.",
  }]);
  assert.deepEqual(restored.sourceTokens.map((token) => token.id), session.sourceTokens.map((token) => token.id));
});

test("invalid pasted JSON returns a clear retryable error without losing chunk state", () => {
  const session = createManualAnalysisSession({
    text: "Gallia est omnis divisa.",
    language: "latin",
  });
  const chunk = session.chunks[0];
  const result = submitManualChunkResponse(session, chunk.id, "Only https://example.test, no JSON here.");

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "json");
  assert.equal(result.chunk.status, "needs-retry");
  assert.deepEqual(result.chunk.targetTokenIds, chunk.tokens.map((token) => token.id));
  assert.equal(result.chunk.acceptedTokens.length, 0);
});

test("a response carrying another chunkId is rejected without accepting any token", () => {
  const session = createManualAnalysisSession({
    text: latinWords(120),
    language: "latin",
  });
  const first = session.chunks[0];
  const second = session.chunks[1];
  const wrongResponse = JSON.stringify({
    chunkId: second.id,
    tokens: first.tokens.map((token) => enrich(token)),
  });
  const result = submitManualChunkResponse(session, first.id, wrongResponse);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "wrong-chunk");
  assert.match(result.error.message, /matching chunk slot/u);
  assert.equal(result.chunk.status, "needs-retry");
  assert.deepEqual(result.chunk.targetTokenIds, first.tokens.map((token) => token.id));
  assert.equal(result.chunk.acceptedTokens.length, 0);
  assert.deepEqual(session.chunks[0].acceptedTokens, []);
});

test("Greek and Latin create manual sessions and obsolete/unknown language IDs are rejected", () => {
  const examples = {
    "ancient-greek": "λόγος.",
    latin: "verbum.",
  };
  for (const [language, text] of Object.entries(examples)) {
    const session = createManualAnalysisSession({ text, language });
    assert.equal(session.language, language);
    assert.equal(session.sourceTokens.length, 1);
  }

  const valid = createManualAnalysisSession({ text: "verbum.", language: "latin" });
  const tampered = JSON.parse(serializeManualAnalysisSession(valid));
  tampered.language = "klingon";
  assert.throws(
    () => restoreManualAnalysisSession(JSON.stringify(tampered)),
    (error) => error instanceof ManualSessionError
      && error.details.code === "invalid-session"
      && /language or sourceText is invalid/u.test(error.message),
  );

  for (const obsolete of ["spanish", "french", "german", "japanese-to-chinese", "chinese-to-japanese", "chinese-to-english"]) {
    const obsoleteSession = JSON.parse(serializeManualAnalysisSession(valid));
    obsoleteSession.language = obsolete;
    assert.throws(() => restoreManualAnalysisSession(JSON.stringify(obsoleteSession)), ManualSessionError);
  }
});
