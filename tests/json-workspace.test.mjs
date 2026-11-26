import assert from "node:assert/strict";
import test from "node:test";

import {
  applyJsonWorkspaceBatch,
  beginNewJsonWorkspaceBatch,
  cloneJsonWorkspace,
  cloneJsonWorkspaceAnalysis,
  createBlankJsonWorkspaceAnalysis,
  createJsonWorkspace,
  isBlankJsonWorkspaceAnalysis,
  JsonWorkspaceError,
  materializeJsonWorkspace,
  mergeJsonWorkspaceAnalysis,
  normalizeJsonWorkspaceAnalysis,
  removeJsonWorkspaceBatch,
  removeJsonWorkspaceTokens,
  resetJsonWorkspace,
  selectJsonWorkspaceBatch,
  updateJsonWorkspaceDraft,
  updateJsonWorkspaceTokenStyles,
} from "../app/lib/json-workspace.ts";

const token = (surface, overrides = {}) => ({
  id: surface,
  surface,
  punctuationBefore: "",
  punctuationAfter: "",
  lemma: surface.toLocaleLowerCase(),
  gloss: `gloss-${surface}`,
  pos: "NOUN",
  morphology: "Nom. Sg.",
  features: { case: "Nominative", number: "Singular" },
  confidence: 0.97,
  alternatives: [],
  breakAfter: "none",
  ...overrides,
});

const analysis = (language, sourceText, tokens, overrides = {}) => ({
  language,
  sourceText,
  literalTranslation: "",
  naturalTranslation: "",
  tokens,
  notes: [],
  ...overrides,
});

const nestedStyleOverrides = () => ({
  layers: {
    source: {
      fontFamily: "  Scholarly Source  ",
      sizePt: 18.24,
      color: "#AbC",
      bold: true,
      italic: false,
      underline: true,
      ignored: "discard",
    },
    gloss: { fontFamily: "Georgia", sizePt: 13.26, color: "#123456", italic: true },
    lemma: { color: "#654321", bold: true },
    pos: { sizePt: 3, underline: true },
    morphology: { sizePt: 200, color: "invalid", bold: false },
    ignored: { color: "#ffffff" },
  },
  gapAfterPx: { source: 5.26, gloss: -9, lemma: 49, pos: 2.24, ignored: 17 },
  ignored: "discard",
});

const normalizedNestedStyleOverrides = {
  layers: {
    source: {
      fontFamily: "Scholarly Source",
      sizePt: 18,
      color: "#aabbcc",
      bold: true,
      italic: false,
      underline: true,
    },
    gloss: { fontFamily: "Georgia", sizePt: 13.5, color: "#123456", italic: true },
    lemma: { color: "#654321", bold: true },
    pos: { sizePt: 4, underline: true },
    morphology: { sizePt: 144, bold: false },
  },
  gapAfterPx: { source: 5.5, gloss: 0, lemma: 48, pos: 2 },
};

test("normalization preserves punctuation, breaks, blank-line controls, and per-word styling", () => {
  const normalized = normalizeJsonWorkspaceAnalysis({
    language: "ancient-greek",
    tokens: [{
      id: "  logos  ",
      surface: "“λόγος.”",
      gloss: "word",
      lemma: "λόγος",
      pos: "NOUN",
      morphology: "Nom. Sg. m.",
      features: { case: "Nominative", ignored: 7 },
      alternatives: ["speech", 12],
      breakAfter: "paragraph",
      blankLinesAfter: 4,
      blankLineSpacing: 36,
      wordFont: "Scholarly Serif",
      wordSize: 27,
      wordColor: "#123aBC",
      wordBold: true,
      wordItalic: true,
      wordUnderline: true,
      lemmaColor: "#2F5F8F",
      lemmaUnderline: true,
      morphColor: "#376B5C",
      morphUnderline: true,
      styleOverrides: nestedStyleOverrides(),
    }],
  }, "ancient-greek");

  assert.equal(normalized.tokens[0].id, "logos");
  assert.equal(normalized.tokens[0].surface, "λόγος");
  assert.equal(normalized.tokens[0].punctuationBefore, "“");
  assert.equal(normalized.tokens[0].punctuationAfter, ".”");
  assert.equal(normalized.tokens[0].breakAfter, "paragraph");
  assert.equal(normalized.tokens[0].blankLinesAfter, 4);
  assert.equal(normalized.tokens[0].blankLineSpacing, 36);
  assert.equal(normalized.tokens[0].wordFont, "Scholarly Serif");
  assert.equal(normalized.tokens[0].wordSize, 27);
  assert.equal(normalized.tokens[0].wordColor, "#123aBC");
  assert.equal(normalized.tokens[0].wordBold, true);
  assert.equal(normalized.tokens[0].wordItalic, true);
  assert.equal(normalized.tokens[0].wordUnderline, true);
  assert.equal(normalized.tokens[0].lemmaColor, "#2F5F8F");
  assert.equal(normalized.tokens[0].lemmaUnderline, true);
  assert.equal(normalized.tokens[0].morphColor, "#376B5C");
  assert.equal(normalized.tokens[0].morphUnderline, true);
  assert.deepEqual(normalized.tokens[0].styleOverrides, normalizedNestedStyleOverrides);
  assert.deepEqual(normalized.tokens[0].features, { case: "Nominative" });
  assert.deepEqual(normalized.tokens[0].alternatives, ["speech"]);
  assert.equal(normalized.sourceText, "“λόγος.”");
});

test("official classical IDs and the separate OMNI workspace ID are accepted", () => {
  for (const language of ["ancient-greek", "latin"]) {
    const normalized = normalizeJsonWorkspaceAnalysis({
      language,
      tokens: [{ surface: "verbum", gloss: "word" }],
    }, "latin");
    assert.equal(normalized.language, language);
  }

  const omni = normalizeJsonWorkspaceAnalysis({
    language: "omni",
    sourceText: "λόγος — but analyzed in OMNI",
    tokens: [{ surface: "λόγος", gloss: "word" }],
  }, "latin");
  assert.equal(omni.language, "omni", "an explicit OMNI root must retain workspace identity");

  const rootlessOmniGreek = normalizeJsonWorkspaceAnalysis({
    sourceText: "λόγος",
    tokens: [{ surface: "λόγος", gloss: "word" }],
  }, "omni");
  assert.equal(
    rootlessOmniGreek.language,
    "omni",
    "Greek script cannot promote an active OMNI workspace to official Ancient Greek",
  );

  const rootlessOfficialGreek = normalizeJsonWorkspaceAnalysis({
    sourceText: "λόγος",
    tokens: [{ surface: "λόγος", gloss: "word" }],
  }, "latin");
  assert.equal(rootlessOfficialGreek.language, "ancient-greek");

  for (const obsolete of ["spanish", "french", "german", "japanese-to-chinese", "chinese-to-japanese", "chinese-to-english"]) {
    const normalized = normalizeJsonWorkspaceAnalysis({
      language: obsolete,
      tokens: [{ surface: "token", gloss: "word" }],
    }, "latin");
    assert.equal(normalized.language, "latin", `${obsolete} must not survive as a first-class workspace ID`);
  }
});

test("OMNI batches and blank/reset workspaces retain their explicit root language", () => {
  const value = {
    language: "omni",
    sourceText: "λόγος",
    tokens: [{ surface: "λόγος", gloss: "word" }],
  };
  const applied = applyJsonWorkspaceBatch(
    createJsonWorkspace(createBlankJsonWorkspaceAnalysis("omni")),
    { value, rawText: JSON.stringify(value) },
  );
  assert.equal(applied.analysis.language, "omni");
  assert.equal(applied.workspace.language, "omni");
  assert.equal(materializeJsonWorkspace(applied.workspace).language, "omni");

  const reset = resetJsonWorkspace("omni");
  assert.equal(reset.analysis.language, "omni");
  assert.equal(reset.workspace.language, "omni");
});

test("merge appends instead of replacing and adds a visual paragraph boundary", () => {
  const first = analysis("latin", "Prima.", [token("Prima", {
    id: "shared",
    punctuationAfter: ".",
    breakAfter: "line",
  })], {
    literalTranslation: "First literal.",
    naturalTranslation: "First natural.",
    notes: [{ id: "note-first", tokenId: "shared", text: "first note" }],
  });
  const second = analysis("latin", "Secunda.", [token("Secunda", {
    id: "shared",
    punctuationAfter: ".",
    breakAfter: "line",
    wordColor: "#aa0000",
  })], {
    literalTranslation: "Second literal.",
    naturalTranslation: "Second natural.",
    notes: [{ id: "note-second", tokenId: "shared", text: "second note" }],
  });
  const merged = mergeJsonWorkspaceAnalysis(first, second, "batch-two");

  assert.equal(merged.tokens.length, 2);
  assert.equal(new Set(merged.tokens.map((item) => item.id)).size, 2);
  assert.equal(merged.tokens[0].id, "shared");
  assert.equal(merged.tokens[0].breakAfter, "paragraph");
  assert.equal(merged.tokens[1].breakAfter, "line");
  assert.equal(merged.tokens[1].wordColor, "#aa0000");
  assert.equal(merged.sourceText, "Prima.\n\nSecunda.");
  assert.equal(merged.literalTranslation, "First literal.\n\nSecond literal.");
  assert.equal(merged.naturalTranslation, "First natural.\n\nSecond natural.");
  assert.deepEqual(merged.notes, [
    { id: "note-first", tokenId: merged.tokens[0].id, text: "first note" },
    { id: "note-second", tokenId: merged.tokens[1].id, text: "second note" },
  ]);
});

test("multiple successful imports remain as editable batches and keep globally unique IDs", () => {
  let workspace = createJsonWorkspace(createBlankJsonWorkspaceAnalysis("latin"));
  const rawOne = JSON.stringify({
    language: "latin",
    sourceText: "amo.",
    naturalTranslation: "I love.",
    tokens: [token("amo", { id: "word-1", punctuationAfter: "." })],
    notes: ["batch one"],
  }, null, 2);
  let applied = applyJsonWorkspaceBatch(workspace, {
    value: JSON.parse(rawOne),
    rawText: rawOne,
  });
  workspace = beginNewJsonWorkspaceBatch(applied.workspace);

  const rawTwo = JSON.stringify({
    language: "latin",
    sourceText: "video.",
    naturalTranslation: "I see.",
    tokens: [token("video", { id: "word-1", punctuationAfter: "." })],
    notes: ["batch two"],
  });
  workspace = updateJsonWorkspaceDraft(workspace, rawTwo);
  applied = applyJsonWorkspaceBatch(workspace, { value: JSON.parse(rawTwo) });
  workspace = applied.workspace;

  assert.equal(applied.mode, "append");
  assert.equal(workspace.batches.length, 2);
  assert.equal(workspace.draftText, rawTwo);
  assert.equal(workspace.batches[0].rawText, rawOne);
  assert.equal(workspace.batches[1].rawText, rawTwo);
  assert.equal(applied.analysis.tokens.length, 2);
  assert.equal(new Set(applied.analysis.tokens.map((item) => item.id)).size, 2);
  assert.equal(applied.analysis.sourceText, "amo.\n\nvideo.");
  assert.equal(applied.analysis.naturalTranslation, "I love.\n\nI see.");
  assert.deepEqual(applied.analysis.notes, [
    { id: "note-0001", tokenId: null, text: "batch one" },
    { id: "note-0001-2", tokenId: null, text: "batch two" },
  ]);
});

test("editing and reapplying a batch replaces it in place without duplication", () => {
  let workspace = createJsonWorkspace(createBlankJsonWorkspaceAnalysis("latin"));
  const firstRaw = JSON.stringify({
    language: "latin",
    sourceText: "amo.",
    naturalTranslation: "I love.",
    tokens: [token("amo", { id: "a", punctuationAfter: ".", gloss: "love" })],
  });
  const first = applyJsonWorkspaceBatch(workspace, {
    value: JSON.parse(firstRaw),
    rawText: firstRaw,
  });
  const firstBatchId = first.batchId;
  const firstStableId = first.analysis.tokens[0].id;

  const secondRaw = JSON.stringify({
    language: "latin",
    sourceText: "video.",
    naturalTranslation: "I see.",
    tokens: [token("video", { id: "b", punctuationAfter: "." })],
  });
  const second = applyJsonWorkspaceBatch(beginNewJsonWorkspaceBatch(first.workspace), {
    value: JSON.parse(secondRaw),
    rawText: secondRaw,
  });
  const secondStableId = second.analysis.tokens[1].id;

  workspace = selectJsonWorkspaceBatch(second.workspace, firstBatchId);
  assert.equal(workspace.draftText, firstRaw);
  const retainedBeforeDraftEdit = structuredClone(workspace.batches);
  const activeBatchBeforeDraftEdit = workspace.activeBatchId;
  const editedRaw = JSON.stringify({
    language: "latin",
    sourceText: "amo te.",
    naturalTranslation: "I love you.",
    tokens: [token("amo", {
      id: "a",
      punctuationAfter: ".",
      gloss: "love you",
      wordBold: true,
    })],
  }, null, 2);
  workspace = updateJsonWorkspaceDraft(workspace, editedRaw);
  assert.equal(workspace.activeBatchId, activeBatchBeforeDraftEdit);
  assert.deepEqual(workspace.batches, retainedBeforeDraftEdit, "draft loading cannot mutate a retained batch before validation");
  const replaced = applyJsonWorkspaceBatch(workspace, {
    value: JSON.parse(editedRaw),
  });

  assert.equal(replaced.mode, "replace");
  assert.equal(replaced.batchId, firstBatchId);
  assert.equal(replaced.analysis.tokens.length, 2);
  assert.equal(replaced.analysis.tokens[0].id, firstStableId);
  assert.equal(replaced.analysis.tokens[1].id, secondStableId);
  assert.equal(replaced.analysis.tokens[0].gloss, "love you");
  assert.equal(replaced.analysis.tokens[0].wordBold, true);
  assert.equal(replaced.analysis.sourceText, "amo te.\n\nvideo.");
  assert.equal(replaced.analysis.naturalTranslation, "I love you.\n\nI see.");
  assert.equal(replaced.workspace.batches[0].revision, 2);
  assert.deepEqual(
    replaced.workspace.batches[0].rawHistory.map((revision) => revision.rawText),
    [firstRaw, editedRaw],
  );
  assert.equal(replaced.workspace.draftText, editedRaw);
});

test("UI annotation styles survive workspace rematerialization and batch replacement", () => {
  let workspace = createJsonWorkspace(createBlankJsonWorkspaceAnalysis("latin"));
  const raw = JSON.stringify({
    language: "latin",
    tokens: [token("amo", { id: "word-1", punctuationAfter: "." })],
  });
  const applied = applyJsonWorkspaceBatch(workspace, {
    value: JSON.parse(raw),
    rawText: raw,
  });
  workspace = updateJsonWorkspaceTokenStyles(applied.workspace, applied.analysis.tokens[0].id, {
    lemmaColor: "#2f5f8f",
    lemmaUnderline: true,
    morphColor: "#376b5c",
    morphUnderline: true,
    pronunciationSize: 11.5,
    pronunciationColor: "#7b4b2a",
  });
  const materialized = materializeJsonWorkspace(workspace);
  assert.equal(materialized.tokens[0].lemmaColor, "#2f5f8f");
  assert.equal(materialized.tokens[0].lemmaUnderline, true);
  assert.equal(materialized.tokens[0].morphColor, "#376b5c");
  assert.equal(materialized.tokens[0].morphUnderline, true);
  assert.equal(materialized.tokens[0].pronunciationSize, 11.5);
  assert.equal(materialized.tokens[0].pronunciationColor, "#7b4b2a");

  const replacement = applyJsonWorkspaceBatch(workspace, {
    value: JSON.parse(raw),
    rawText: raw,
    batchId: applied.batchId,
  });
  assert.equal(replacement.analysis.tokens[0].lemmaColor, "#2f5f8f");
  assert.equal(replacement.analysis.tokens[0].lemmaUnderline, true);
  assert.equal(replacement.analysis.tokens[0].morphColor, "#376b5c");
  assert.equal(replacement.analysis.tokens[0].morphUnderline, true);
  assert.equal(replacement.analysis.tokens[0].pronunciationSize, 11.5);
  assert.equal(replacement.analysis.tokens[0].pronunciationColor, "#7b4b2a");
});

test("Classical Chinese JSON keeps legacy no-Pinyin input readable and preserves NFC Pinyin", () => {
  const legacy = normalizeJsonWorkspaceAnalysis({
    language: "classical-chinese",
    tokens: [token("學")],
  }, "classical-chinese");
  assert.equal(legacy.tokens[0].pinyin, undefined);

  const normalized = normalizeJsonWorkspaceAnalysis({
    language: "classical-chinese",
    tokens: [token("學", { pinyin: "xue\u0301" })],
  }, "classical-chinese");
  assert.equal(normalized.tokens[0].pinyin, "xué");
});

test("nested five-layer overrides normalize, deep-clone, update, survive replacement, and clear", () => {
  const normalized = normalizeJsonWorkspaceAnalysis({
    language: "latin",
    tokens: [{
      ...token("amo", { id: "nested-style-token" }),
      styleOverrides: nestedStyleOverrides(),
    }],
  }, "latin");
  assert.deepEqual(normalized.tokens[0].styleOverrides, normalizedNestedStyleOverrides);

  const analysisClone = cloneJsonWorkspaceAnalysis(normalized);
  analysisClone.tokens[0].styleOverrides.layers.source.color = "#000000";
  analysisClone.tokens[0].styleOverrides.gapAfterPx.source = 31;
  assert.equal(normalized.tokens[0].styleOverrides.layers.source.color, "#aabbcc");
  assert.equal(normalized.tokens[0].styleOverrides.gapAfterPx.source, 5.5);

  const raw = JSON.stringify({
    language: "latin",
    tokens: [token("amo", { id: "nested-style-token" })],
  });
  const applied = applyJsonWorkspaceBatch(
    createJsonWorkspace(createBlankJsonWorkspaceAnalysis("latin")),
    { value: JSON.parse(raw), rawText: raw },
  );
  const stableId = applied.analysis.tokens[0].id;
  let workspace = updateJsonWorkspaceTokenStyles(applied.workspace, stableId, {
    styleOverrides: nestedStyleOverrides(),
  });
  let materialized = materializeJsonWorkspace(workspace);
  assert.deepEqual(materialized.tokens[0].styleOverrides, normalizedNestedStyleOverrides);

  const workspaceClone = cloneJsonWorkspace(workspace);
  workspaceClone.batches[0].analysis.tokens[0].styleOverrides.layers.gloss.color = "#ffffff";
  workspaceClone.batches[0].analysis.tokens[0].styleOverrides.gapAfterPx.pos = 42;
  materialized = materializeJsonWorkspace(workspace);
  assert.equal(materialized.tokens[0].styleOverrides.layers.gloss.color, "#123456");
  assert.equal(materialized.tokens[0].styleOverrides.gapAfterPx.pos, 2);

  const replaced = applyJsonWorkspaceBatch(workspace, {
    value: JSON.parse(raw),
    rawText: raw,
    batchId: applied.batchId,
  });
  assert.deepEqual(replaced.analysis.tokens[0].styleOverrides, normalizedNestedStyleOverrides);

  workspace = updateJsonWorkspaceTokenStyles(replaced.workspace, stableId, {
    styleOverrides: undefined,
  });
  materialized = materializeJsonWorkspace(workspace);
  assert.equal(materialized.tokens[0].styleOverrides, undefined);
  assert.equal(workspace.batches[0].analysis.tokens[0].styleOverrides, undefined);
});

test("replacement without model IDs reuses stable token IDs when the batch shape is unchanged", () => {
  let workspace = createJsonWorkspace(createBlankJsonWorkspaceAnalysis("ancient-greek"));
  const firstValue = {
    language: "ancient-greek",
    tokens: [
      { surface: "λόγος", gloss: "word" },
      { surface: "ἐστίν", gloss: "is" },
    ],
  };
  const first = applyJsonWorkspaceBatch(workspace, {
    value: firstValue,
    rawText: JSON.stringify(firstValue),
  });
  const stableIds = first.analysis.tokens.map((item) => item.id);
  workspace = selectJsonWorkspaceBatch(first.workspace, first.batchId);
  const editedValue = {
    language: "ancient-greek",
    tokens: [
      { surface: "λόγος", gloss: "account" },
      { surface: "ἐστίν", gloss: "exists" },
    ],
  };
  const replaced = applyJsonWorkspaceBatch(workspace, {
    value: editedValue,
    rawText: JSON.stringify(editedValue),
  });

  assert.deepEqual(replaced.analysis.tokens.map((item) => item.id), stableIds);
  assert.deepEqual(replaced.analysis.tokens.map((item) => item.gloss), ["account", "exists"]);
});

test("a batch can be removed and reset creates a completely blank workspace", () => {
  const value = {
    language: "latin",
    sourceText: "sum.",
    tokens: [token("sum", { punctuationAfter: "." })],
  };
  const applied = applyJsonWorkspaceBatch(
    createJsonWorkspace(createBlankJsonWorkspaceAnalysis("latin")),
    { value, rawText: JSON.stringify(value) },
  );
  const removed = removeJsonWorkspaceBatch(applied.workspace, applied.batchId);

  assert.equal(removed.workspace.batches.length, 0);
  assert.equal(removed.workspace.activeBatchId, null);
  assert.equal(removed.workspace.draftText, "");
  assert.equal(isBlankJsonWorkspaceAnalysis(removed.analysis), true);

  const reset = resetJsonWorkspace("ancient-greek");
  assert.deepEqual(reset.analysis, {
    language: "ancient-greek",
    sourceText: "",
    literalTranslation: "",
    naturalTranslation: "",
    tokens: [],
    notes: [],
  });
  assert.equal(reset.workspace.batches.length, 0);
  assert.equal(reset.workspace.activeBatchId, null);
  assert.equal(reset.workspace.draftText, "");
  assert.equal(materializeJsonWorkspace(reset.workspace).tokens.length, 0);
});

test("non-blank Greek and Latin analyses cannot be mixed accidentally", () => {
  const greek = analysis("ancient-greek", "λόγος", [token("λόγος")]);
  const latin = analysis("latin", "verbum", [token("verbum")]);

  assert.throws(
    () => mergeJsonWorkspaceAnalysis(greek, latin),
    (error) => error instanceof JsonWorkspaceError && error.code === "language-mismatch",
  );
  assert.throws(
    () => mergeJsonWorkspaceAnalysis(analysis("omni", "λόγος", [token("λόγος")]), greek),
    (error) => error instanceof JsonWorkspaceError && error.code === "language-mismatch",
  );
});

test("bulk editor breaks and removals stay synchronized with retained normalized JSON", () => {
  const value = {
    language: "latin",
    tokens: [token("mīror"), token("te"), token("valēre")],
    notes: [
      { id: "note-first", tokenId: "mīror", text: "Removed with the first token." },
      { id: "note-second", tokenId: "te", text: "Retained with the second token." },
    ],
  };
  const applied = applyJsonWorkspaceBatch(
    createJsonWorkspace(createBlankJsonWorkspaceAnalysis("latin")),
    { value, rawText: JSON.stringify(value) },
  );
  const [firstId, secondId, thirdId] = applied.analysis.tokens.map((item) => item.id);
  let workspace = updateJsonWorkspaceTokenStyles(applied.workspace, firstId, {
    breakAfter: "paragraph",
    blankLinesAfter: 3,
    blankLineSpacing: 42,
  });
  workspace = updateJsonWorkspaceTokenStyles(workspace, secondId, {
    breakAfter: "paragraph",
    blankLinesAfter: 3,
    blankLineSpacing: 42,
  });
  let materialized = materializeJsonWorkspace(workspace);
  assert.deepEqual(
    materialized.tokens.slice(0, 2).map((item) => [item.breakAfter, item.blankLinesAfter, item.blankLineSpacing]),
    [["paragraph", 3, 42], ["paragraph", 3, 42]],
  );

  workspace = removeJsonWorkspaceTokens(workspace, [firstId, thirdId]);
  materialized = materializeJsonWorkspace(workspace);
  assert.deepEqual(materialized.tokens.map((item) => item.id), [secondId]);
  assert.deepEqual(materialized.notes, [{
    id: "note-second",
    tokenId: secondId,
    text: "Retained with the second token.",
  }]);
  assert.deepEqual(workspace.batches[0].sourceTokenIds.length, 1);
});
