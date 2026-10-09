import assert from "node:assert/strict";
import test from "node:test";

import { parseAiJsonResponse } from "../app/lib/ai-pipeline.ts";
import {
  applyBestEffortJsonWorkspaceBatch,
  createBlankJsonWorkspaceAnalysis,
  createJsonWorkspace,
  JsonWorkspaceError,
  materializeJsonWorkspace,
  removeJsonWorkspaceBatch,
  type JsonWorkspaceAnalysis,
  type JsonWorkspaceToken,
} from "../app/lib/json-workspace.ts";

const sourceToken = (
  id: string,
  surface: string,
  overrides: Partial<JsonWorkspaceToken> = {},
): JsonWorkspaceToken => ({
  id,
  surface,
  punctuationBefore: "",
  punctuationAfter: "",
  lemma: `old-${surface}`,
  gloss: `old gloss ${surface}`,
  pos: "NOUN",
  morphology: "Nom. Sg.",
  features: { case: "Nominative" },
  confidence: 0.7,
  alternatives: ["old alternative"],
  breakAfter: "none",
  ...overrides,
});

const expectedAnalysis = (
  tokens: JsonWorkspaceToken[] = [
    sourceToken("src-1", "amo"),
    sourceToken("src-2", "et"),
    sourceToken("src-3", "video", { punctuationAfter: "." }),
  ],
  sourceText = "amo et video.",
): JsonWorkspaceAnalysis => ({
  language: "latin",
  sourceText,
  literalTranslation: "old literal",
  naturalTranslation: "old natural",
  tokens,
  notes: [{ id: "note-old", tokenId: "src-1", text: "old note" }],
});

const apply = (
  expected: JsonWorkspaceAnalysis,
  value: unknown,
  workspace = createJsonWorkspace(expected),
) => applyBestEffortJsonWorkspaceBatch(workspace, {
  value,
  rawText: JSON.stringify(value),
  expectedAnalysis: expected,
});

test("one or several missing tokens remain in canonical order and do not block valid updates", () => {
  const expected = expectedAnalysis();
  const result = apply(expected, {
    language: "latin",
    sourceText: expected.sourceText,
    tokens: [
      { id: "src-1", surface: "amo", gloss: "I love" },
      { id: "src-3", surface: "video", gloss: "I see" },
    ],
  });

  assert.deepEqual(result.analysis.tokens.map((token) => token.id), ["src-1", "src-2", "src-3"]);
  assert.deepEqual(result.analysis.tokens.map((token) => token.gloss), ["I love", "old gloss et", "I see"]);
  assert.equal(result.importSummary?.state, "partial");
  assert.equal(result.importSummary?.importedTokenCount, 2);
  assert.deepEqual(result.importSummary?.notReturnedTokenIds, ["src-2"]);

  const oneOfFour = expectedAnalysis([
    sourceToken("one", "unum"),
    sourceToken("two", "duo"),
    sourceToken("three", "tria"),
    sourceToken("four", "quattuor"),
  ], "unum duo tria quattuor");
  const partial = apply(oneOfFour, {
    sourceText: oneOfFour.sourceText,
    tokens: [{ id: "two", surface: "duo", gloss: "two" }],
  });
  assert.equal(partial.analysis.tokens.length, 4);
  assert.deepEqual(partial.importSummary?.notReturnedTokenIds, ["one", "three", "four"]);
});

test("valid fields are salvaged independently while malformed, null, empty, and unknown fields do not erase data", () => {
  const expected = expectedAnalysis();
  const result = apply(expected, {
    sourceText: expected.sourceText,
    tokens: [
      {
        id: "src-1",
        surface: "amo",
        gloss: "love",
        lemma: null,
        alternatives: ["love", 42],
        unsupported: { __proto__: { polluted: true } },
      },
      {
        id: "src-2",
        surface: "et",
        lemma: "et",
        pos: "NOT_A_POS",
        morphology: "conjunction",
        features: ["malformed"],
      },
      {
        id: "src-3",
        surface: "video",
        gloss: "",
        lemma: "",
        morphology: "1S Pres. Act. Ind.",
        confidence: 4,
        alternatives: null,
      },
    ],
  });

  assert.equal(result.analysis.tokens[0].gloss, "love");
  assert.equal(result.analysis.tokens[0].lemma, "old-amo");
  assert.deepEqual(result.analysis.tokens[0].alternatives, ["old alternative"]);
  assert.equal(result.analysis.tokens[1].lemma, "et");
  assert.equal(result.analysis.tokens[1].pos, "NOUN");
  assert.equal(result.analysis.tokens[1].morphology, "conjunction");
  assert.deepEqual(result.analysis.tokens[1].features, { case: "Nominative" });
  assert.equal(result.analysis.tokens[2].gloss, "old gloss video");
  assert.equal(result.analysis.tokens[2].lemma, "old-video");
  assert.equal(result.analysis.tokens[2].morphology, "1S Pres. Act. Ind.");
  assert.equal(result.analysis.tokens[2].confidence, 1);
  assert.equal(result.importSummary?.importedTokenCount, 3);
  assert.ok(result.importSummary?.invalidFields.some((field) => field.field === "pos"));
  assert.ok(result.importSummary?.invalidFields.some((field) => field.field === "features"));
  assert.ok(result.importSummary?.invalidFields.some((field) => field.field === "alternatives"));
});

test("unknown IDs and exact-ID surface mismatches skip only those entries", () => {
  const expected = expectedAnalysis();
  const result = apply(expected, {
    sourceText: expected.sourceText,
    tokens: [
      { id: "src-1", surface: "AMO", gloss: "wrong identity" },
      { id: "invented-id", surface: "et", gloss: "unknown" },
      { id: "src-3", surface: "video", lemma: "videō" },
    ],
  });

  assert.equal(result.analysis.tokens[0].gloss, "old gloss amo");
  assert.equal(result.analysis.tokens[2].lemma, "videō");
  assert.deepEqual(result.importSummary?.surfaceMismatchTokenIds, ["src-1"]);
  assert.deepEqual(result.importSummary?.unknownTokenIds, ["invented-id"]);
  assert.equal(result.importSummary?.skippedEntryCount, 2);
});

test("ID-less fallback accepts a unique ordered surface and rejects repeated ambiguous words", () => {
  const expected = expectedAnalysis([
    sourceToken("src-1", "et"),
    sourceToken("src-2", "amo"),
    sourceToken("src-3", "et"),
  ], "et amo et");
  const result = apply(expected, {
    sourceText: expected.sourceText,
    tokens: [
      { surface: "amo", gloss: "I love" },
      { surface: "et", gloss: "and" },
    ],
  });

  assert.equal(result.analysis.tokens[1].gloss, "I love");
  assert.equal(result.analysis.tokens[0].gloss, "old gloss et");
  assert.equal(result.analysis.tokens[2].gloss, "old gloss et");
  assert.deepEqual(result.importSummary?.ambiguousFallbackSurfaces, ["et"]);
  assert.equal(result.importSummary?.importedTokenCount, 1);

  const outOfOrder = apply(expectedAnalysis(), {
    tokens: [
      { surface: "video", gloss: "see" },
      { surface: "amo", gloss: "love" },
    ],
  });
  assert.equal(outOfOrder.analysis.tokens[2].gloss, "see");
  assert.equal(outOfOrder.analysis.tokens[0].gloss, "old gloss amo");
  assert.deepEqual(outOfOrder.importSummary?.ambiguousFallbackSurfaces, ["amo"]);
});

test("legacy sequential IDs may use conservative fallback but arbitrary unknown IDs may not", () => {
  const expected = expectedAnalysis();
  const result = apply(expected, {
    sourceText: expected.sourceText,
    tokens: [
      { id: "tok-0001", surface: "amo", gloss: "love" },
      { id: "external-2", surface: "et", gloss: "and" },
      { id: "src-3", surface: "video", gloss: "see" },
    ],
  });
  assert.equal(result.analysis.tokens[0].gloss, "love");
  assert.equal(result.analysis.tokens[1].gloss, "old gloss et");
  assert.equal(result.analysis.tokens[2].gloss, "see");
  assert.deepEqual(result.importSummary?.unknownTokenIds, ["external-2"]);
});

test("duplicate IDs deterministically prefer the most complete valid record and preserve the first tie", () => {
  const expected = expectedAnalysis();
  const result = apply(expected, {
    sourceText: expected.sourceText,
    tokens: [
      { id: "src-1", surface: "amo", gloss: "short" },
      { id: "src-1", surface: "amo", gloss: "complete", lemma: "amō", pos: "VERB" },
      { id: "src-2", surface: "et", gloss: "first" },
      { id: "src-2", surface: "et", gloss: "second" },
      { id: "src-3", surface: "video", gloss: "see" },
    ],
  });

  assert.equal(result.analysis.tokens[0].gloss, "complete");
  assert.equal(result.analysis.tokens[0].lemma, "amō");
  assert.equal(result.analysis.tokens[0].pos, "VERB");
  assert.equal(result.analysis.tokens[1].gloss, "first");
  assert.deepEqual(result.importSummary?.duplicateTokenIds, ["src-1", "src-2"]);
  assert.equal(result.importSummary?.skippedEntryCount, 2);
});

test("an append into a blank workspace keeps unreturned canonical tokens visibly incomplete", () => {
  const expected = expectedAnalysis().tokens.map((token) => ({
    ...token,
    lemma: "",
    gloss: "",
    pos: "",
    morphology: "",
    features: {},
    alternatives: [],
  }));
  const canonical = expectedAnalysis(expected);
  const blank = createJsonWorkspace(createBlankJsonWorkspaceAnalysis("latin"));
  const result = apply(canonical, {
    sourceText: canonical.sourceText,
    tokens: [{ id: "src-1", surface: "amo", gloss: "love" }],
  }, blank);

  assert.equal(result.workspace.batches[0].applicationMode, "append");
  assert.equal(result.analysis.tokens.length, 3);
  assert.equal(result.analysis.tokens[1].gloss, "");
  assert.equal(result.analysis.tokens[2].gloss, "");
});

test("overlay imports update the preview immediately and removing the batch restores previous data", () => {
  const expected = expectedAnalysis();
  const result = apply(expected, {
    sourceText: expected.sourceText,
    naturalTranslation: "I love and see.",
    tokens: [{ id: "src-1", surface: "amo", gloss: "love" }],
  });
  assert.equal(result.workspace.batches[0].applicationMode, "overlay");
  assert.equal(materializeJsonWorkspace(result.workspace).tokens[0].gloss, "love");
  assert.equal(result.analysis.naturalTranslation, "I love and see.");

  const removed = removeJsonWorkspaceBatch(result.workspace, result.batchId);
  assert.equal(removed.analysis.tokens[0].gloss, "old gloss amo");
  assert.equal(removed.analysis.naturalTranslation, "old natural");
});

test("Markdown-fenced JSON is parsed and partially imported without executing surrounding content", () => {
  const expected = expectedAnalysis();
  const parsed = parseAiJsonResponse(`Explanation and https://example.test\n\n\`\`\`json\n${JSON.stringify({
    sourceText: expected.sourceText,
    tokens: [{ id: "src-1", surface: "amo", gloss: "love" }],
  })}\n\`\`\`\nMore prose.`);
  const result = apply(expected, parsed.value);
  assert.equal(result.analysis.tokens[0].gloss, "love");
  assert.equal(result.importSummary?.state, "partial");
});

test("completely invalid text remains a fatal parse failure", () => {
  assert.throws(
    () => parseAiJsonResponse("This contains no JSON object at all."),
    /JSON/iu,
  );
});

test("AI punctuation and break metadata cannot overwrite canonical source structure", () => {
  const expected = expectedAnalysis();
  const result = apply(expected, {
    tokens: [{
      id: "src-3",
      surface: "video",
      gloss: "see",
      punctuationAfter: "!",
      breakAfter: "paragraph",
      blankLinesAfter: 8,
    }],
  });

  assert.equal(result.analysis.tokens[2].punctuationAfter, ".");
  assert.equal(result.analysis.tokens[2].breakAfter, "none");
  assert.equal(result.analysis.tokens[2].blankLinesAfter, undefined);
  assert.ok(result.importSummary?.invalidFields.some((field) => field.field === "punctuationAfter"));
  assert.ok(result.importSummary?.invalidFields.some((field) => field.field === "breakAfter"));
  assert.ok(result.importSummary?.invalidFields.some((field) => field.field === "blankLinesAfter"));
});

test("zero valid token fields and a conclusively different source remain fatal", () => {
  const expected = expectedAnalysis();
  assert.throws(
    () => apply(expected, {
      sourceText: expected.sourceText,
      tokens: [{ id: "src-1", surface: "amo", gloss: null, lemma: "", pos: "INVALID" }],
    }),
    (error) => error instanceof JsonWorkspaceError && /No safely importable/u.test(error.message),
  );
  assert.throws(
    () => apply(expected, {
      sourceText: "alia verba",
      tokens: [{ id: "src-1", surface: "amo", gloss: "love" }],
    }),
    (error) => error instanceof JsonWorkspaceError && /different source document/u.test(error.message),
  );
  assert.throws(
    () => apply(expected, { tokens: "not-an-array" }),
    (error) => error instanceof JsonWorkspaceError && /tokens array/u.test(error.message),
  );
});
