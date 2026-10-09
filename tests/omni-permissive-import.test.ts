import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPermissiveJsonWorkspaceBatch,
  beginNewJsonWorkspaceBatch,
  cloneJsonWorkspace,
  createBlankJsonWorkspaceAnalysis,
  createJsonWorkspace,
  JsonWorkspaceError,
  loadPermissiveAnalysis,
  loadPermissiveOmniAnalysis,
  removeJsonWorkspaceBatch,
} from "../app/lib/json-workspace.ts";

test("OMNI accepts a minimal token sequence as an authoritative document", () => {
  const result = loadPermissiveOmniAnalysis({
    sourceText: "uno dos",
    tokens: [
      { id: "remote-900", surface: "uno" },
      { id: "remote-100", surface: "dos" },
    ],
  });
  assert.equal(result.analysis.language, "omni");
  assert.equal(result.analysis.sourceText, "uno dos");
  assert.deepEqual(result.analysis.tokens.map((token) => token.surface), ["uno", "dos"]);
  assert.deepEqual(result.analysis.tokens.map((token) => token.id), ["remote-900", "remote-100"]);
  assert.deepEqual(
    result.analysis.tokens.map((token) => [token.gloss, token.lemma, token.pos, token.morphology]),
    [["", "", "X", ""], ["", "", "X", ""]],
  );
});

test("OMNI repairs missing, malformed, and duplicate IDs without rejecting usable tokens", () => {
  const result = loadPermissiveOmniAnalysis([
    { id: "same", surface: "«salve»", pos: "not-a-pos", confidence: 7 },
    { id: "same", surface: "munde!", features: ["bad"], alternatives: [1] },
    { id: "bad id with spaces", surface: "iterum" },
    { surface: "bene" },
  ]);
  assert.deepEqual(result.analysis.tokens.map((token) => token.surface), ["salve", "munde", "iterum", "bene"]);
  assert.equal(new Set(result.analysis.tokens.map((token) => token.id)).size, 4);
  assert.equal(result.analysis.tokens[0].punctuationBefore, "«");
  assert.equal(result.analysis.tokens[0].punctuationAfter, "»");
  assert.equal(result.analysis.tokens[1].punctuationAfter, "!");
  assert.equal(result.analysis.tokens[0].pos, "X");
  assert.equal(result.analysis.tokens[0].confidence, 1);
  assert.equal(result.summary.duplicateIdCount, 1);
  assert.equal(result.summary.generatedIdCount, 2);
  assert.ok(result.summary.invalidFields.some((field) => field.field === "features"));
  assert.ok(result.summary.invalidFields.some((field) => field.field === "alternatives"));
});

test("OMNI reconstructs sourceText and records a warning while preserving breaks", () => {
  const result = loadPermissiveOmniAnalysis({
    tokens: [
      { surface: "A", punctuationAfter: ".", breakAfter: "paragraph", blankLinesAfter: 2 },
      { surface: "B", punctuationAfter: "!" },
    ],
  });
  assert.equal(result.analysis.sourceText, "A.\n\n\nB!");
  assert.equal(result.summary.reconstructedSourceText, true);
  assert.equal(result.summary.state, "partial");
});

test("OMNI accepts historical nested document analysis and ignores bad optional fields independently", () => {
  const result = loadPermissiveOmniAnalysis({
    document: {
      analysis: {
        sourceText: "Hallo",
        literalTranslation: "Hello",
        naturalTranslation: "Hello!",
        tokens: [{
          surface: "Hallo",
          gloss: "hello",
          lemma: 42,
          morphology: { bad: true },
          features: { Case: "Nom" },
        }],
      },
    },
  });
  assert.equal(result.analysis.tokens.length, 1);
  assert.equal(result.analysis.tokens[0].gloss, "hello");
  assert.equal(result.analysis.tokens[0].lemma, "");
  assert.equal(result.analysis.tokens[0].morphology, "");
  assert.deepEqual(result.analysis.tokens[0].features, { Case: "Nom" });
  assert.equal(result.analysis.literalTranslation, "Hello");
  assert.equal(result.analysis.naturalTranslation, "Hello!");
});

test("OMNI permissive import preserves NFC romanization and restricted reading-row styles", () => {
  const result = loadPermissiveOmniAnalysis({
    sourceText: "Я читаю",
    tokens: [{
      id: "ru-1",
      surface: "читаю",
      romanization: "chita\u0301yu",
      pronunciationSize: 12.5,
      pronunciationColor: "#2F5F8F",
    }],
  });
  assert.equal(result.analysis.tokens[0].romanization, "chitáyu");
  assert.equal(result.analysis.tokens[0].pronunciationSize, 12.5);
  assert.equal(result.analysis.tokens[0].pronunciationColor, "#2F5F8F");
});

test("OMNI rejects only documents without a token array or without any usable surface", () => {
  assert.throws(
    () => loadPermissiveOmniAnalysis({ sourceText: "text" }),
    (error) => error instanceof JsonWorkspaceError && /No tokens array/u.test(error.message),
  );
  assert.throws(
    () => loadPermissiveOmniAnalysis({ tokens: [null, {}, { surface: "  " }] }),
    (error) => error instanceof JsonWorkspaceError && /zero usable tokens/u.test(error.message),
  );
});

test("all classical pages use the same surface-first permissive loader without changing workspace", () => {
  const cases = [
    { language: "ancient-greek" as const, surface: "λόγος", reading: { pinyin: "lógōs", romanization: "logos" } },
    { language: "latin" as const, surface: "verbum", reading: { pinyin: "wén", romanization: "verbum" } },
    { language: "classical-chinese" as const, surface: "學", reading: { pinyin: "xué", romanization: "xue" } },
  ];

  for (const item of cases) {
    const result = loadPermissiveAnalysis({
      language: "omni",
      tokens: [{
        id: "bad id with spaces",
        surface: item.surface,
        pos: "not-a-pos",
        confidence: 7,
        ...item.reading,
      }],
    }, item.language);

    assert.equal(result.analysis.language, item.language);
    assert.equal(result.analysis.tokens.length, 1);
    assert.equal(result.analysis.tokens[0].surface, item.surface);
    assert.deepEqual(
      [
        result.analysis.tokens[0].gloss,
        result.analysis.tokens[0].lemma,
        result.analysis.tokens[0].pos,
        result.analysis.tokens[0].morphology,
      ],
      ["", "", "X", ""],
    );
    assert.equal(result.summary.ignoredDeclaredLanguage, "omni");
    assert.equal(result.summary.state, "partial");
    assert.equal(result.analysis.tokens[0].romanization, undefined);
    assert.equal(
      result.analysis.tokens[0].pinyin,
      item.language === "classical-chinese" ? "xué" : undefined,
    );
  }
});

test("permissive classical loading accepts nested analysis and ignores malformed optional fields independently", () => {
  const result = loadPermissiveAnalysis({
    document: {
      analysis: {
        tokens: [
          null,
          { surface: "  " },
          {
            surface: "«amo!»",
            gloss: "I love",
            lemma: 12,
            morphology: { unsafe: true },
            features: ["bad"],
            alternatives: ["love", 7],
            wordColor: "red",
          },
        ],
      },
    },
  }, "latin");

  assert.equal(result.analysis.sourceText, "«amo!»");
  assert.equal(result.analysis.tokens[0].surface, "amo");
  assert.equal(result.analysis.tokens[0].punctuationBefore, "«");
  assert.equal(result.analysis.tokens[0].punctuationAfter, "!»");
  assert.equal(result.analysis.tokens[0].gloss, "I love");
  assert.equal(result.analysis.tokens[0].lemma, "");
  assert.equal(result.analysis.tokens[0].morphology, "");
  assert.equal(result.summary.skippedEntryCount, 2);
  assert.equal(result.summary.reconstructedSourceText, true);
  assert.deepEqual(
    new Set(result.summary.invalidFields.map((field) => field.field)),
    new Set(["lemma", "morphology", "features", "alternatives", "wordColor"]),
  );
});

test("permissive workspace batches append, replace in place, retain raw revisions, and remain removable", () => {
  const initial = createJsonWorkspace(createBlankJsonWorkspaceAnalysis("latin"));
  const firstRaw = JSON.stringify({
    tokens: [{ id: "shared", surface: "amo", gloss: "I love" }],
    naturalTranslation: "I love.",
  });
  const first = applyPermissiveJsonWorkspaceBatch(initial, {
    value: JSON.parse(firstRaw),
    rawText: firstRaw,
  });
  assert.equal(first.mode, "append");
  assert.equal(first.analysis.tokens.length, 1);
  assert.equal(first.workspace.batches[0].rawText, firstRaw);

  const secondRaw = JSON.stringify({
    tokens: [{ id: "shared", surface: "video", gloss: "I see" }],
    naturalTranslation: "I see.",
  });
  const second = applyPermissiveJsonWorkspaceBatch(
    beginNewJsonWorkspaceBatch(first.workspace),
    { value: JSON.parse(secondRaw), rawText: secondRaw },
  );
  assert.equal(second.workspace.batches.length, 2);
  assert.deepEqual(second.analysis.tokens.map((token) => token.surface), ["amo", "video"]);
  assert.equal(new Set(second.analysis.tokens.map((token) => token.id)).size, 2);
  assert.equal(second.analysis.sourceText, "amo\n\nvideo");

  const firstStableId = first.analysis.tokens[0].id;
  const replacementRaw = JSON.stringify({
    tokens: [{ id: "shared", surface: "amo", gloss: "love" }],
    naturalTranslation: "Love.",
  });
  const replaced = applyPermissiveJsonWorkspaceBatch(second.workspace, {
    batchId: first.batchId,
    value: JSON.parse(replacementRaw),
    rawText: replacementRaw,
  });
  assert.equal(replaced.mode, "replace");
  assert.equal(replaced.workspace.batches.length, 2);
  assert.equal(replaced.analysis.tokens.length, 2);
  assert.equal(replaced.analysis.tokens[0].id, firstStableId);
  assert.equal(replaced.analysis.tokens[0].gloss, "love");
  const replacedBatch = replaced.workspace.batches.find((batch) => batch.id === first.batchId);
  assert.equal(replacedBatch?.revision, 2);
  assert.deepEqual(replacedBatch?.rawHistory.map((revision) => revision.rawText), [firstRaw, replacementRaw]);

  const cloned = cloneJsonWorkspace(replaced.workspace);
  assert.notEqual(cloned.batches[0].importSummary, replaced.workspace.batches[0].importSummary);
  assert.notEqual(
    cloned.batches[0].importSummary?.invalidFields,
    replaced.workspace.batches[0].importSummary?.invalidFields,
  );
  const removed = removeJsonWorkspaceBatch(replaced.workspace, second.batchId);
  assert.deepEqual(removed.analysis.tokens.map((token) => token.surface), ["amo"]);
});
