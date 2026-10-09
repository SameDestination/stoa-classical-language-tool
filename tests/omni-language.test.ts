import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LANGUAGE_CONFIGS,
  STOA_LANGUAGE_IDS,
  buildLanguageSystemPrompt,
  isStoaLanguageId,
} from "../app/language-config.ts";
import {
  OMNI_EXPERIMENTAL_WARNING,
  OMNI_LANGUAGE_PROFILE,
  STOA_OMNI_LANGUAGE_ID,
  STOA_OMNI_PROFILE_ID,
  STOA_WORKSPACE_LANGUAGE_IDS,
  buildOmniAnalysisPrompts,
  buildOmniSystemPrompt,
  buildOmniUserPrompt,
  createOmniDocumentConfig,
  getOmniWritingOrientation,
  getOmniWritingStyle,
  isOmniLanguageId,
  isStoaWorkspaceLanguageId,
  type OmniPromptInputOptions,
  type OmniTokenMetadata,
} from "../app/lib/omni-language.ts";

const parseRequest = (userPrompt: string): Record<string, unknown> => JSON.parse(
  userPrompt.slice(userPrompt.indexOf("\n") + 1),
) as Record<string, unknown>;

const parseResponseShape = (systemPrompt: string): Record<string, unknown> => {
  const marker = "Return exactly this top-level shape:\n";
  const source = systemPrompt.slice(systemPrompt.indexOf(marker) + marker.length);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      return JSON.parse(source.slice(0, index + 1)) as Record<string, unknown>;
    }
  }
  throw new Error("OMNI response-shape JSON was not balanced.");
};

test("OMNI is an experimental workspace profile, not a production classical language", () => {
  assert.equal(STOA_OMNI_LANGUAGE_ID, "omni");
  assert.equal(STOA_OMNI_PROFILE_ID, "omni-experimental");
  assert.equal(OMNI_LANGUAGE_PROFILE.status, "experimental");
  assert.equal(OMNI_LANGUAGE_PROFILE.annotationTarget, "english");
  assert.deepEqual(STOA_WORKSPACE_LANGUAGE_IDS, ["ancient-greek", "latin", "classical-chinese", "omni"]);
  assert.match(OMNI_EXPERIMENTAL_WARNING.body, /do not rely on OMNI for production-critical scholarly output/u);
  assert.equal(OMNI_EXPERIMENTAL_WARNING.preferenceKey, "stoa.omni.experimental-warning.dismissed");

  assert.deepEqual(STOA_LANGUAGE_IDS, ["ancient-greek", "latin", "classical-chinese"]);
  assert.equal(isStoaLanguageId("omni"), false);
  assert.equal("omni" in LANGUAGE_CONFIGS, false);
  assert.equal(isOmniLanguageId("omni"), true);
  assert.equal(isStoaWorkspaceLanguageId("omni"), true);
  assert.equal(isStoaWorkspaceLanguageId("ancient-greek"), true);
  assert.equal(isStoaWorkspaceLanguageId("latin"), true);
  assert.equal(isStoaWorkspaceLanguageId("classical-chinese"), true);
});

test("document configuration carries LTR/RTL plus horizontal and vertical browser writing metadata", () => {
  const defaults = createOmniDocumentConfig();
  assert.deepEqual(defaults, {
    profile: "omni-experimental",
    languageHint: null,
    direction: "ltr",
    writingMode: "horizontal-tb",
    tokenizationOrigin: "model",
    annotationTarget: "english",
    languageDetection: {
      schemaVersion: 1,
      languageId: "und",
      languageName: "Undetermined",
      script: "Zzzz",
      confidence: 0,
      isMixedLanguage: false,
    },
    analysisProfile: "generic",
    morphologyStandard: "stoa.omni.generic.v1",
    manualLanguageOverride: null,
  });
  assert.equal(getOmniWritingOrientation(defaults.writingMode), "horizontal");

  const rtlVertical = createOmniDocumentConfig({
    languageHint: " ar ",
    direction: "rtl",
    writingMode: "vertical-rl",
    tokenizationOrigin: "user",
  });
  assert.equal(rtlVertical.languageHint, "ar");
  assert.equal(getOmniWritingOrientation(rtlVertical.writingMode), "vertical");
  assert.deepEqual(getOmniWritingStyle(rtlVertical), {
    direction: "rtl",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    unicodeBidi: "isolate",
  });
  assert.equal(getOmniWritingOrientation("vertical-lr"), "vertical");
});

test("model tokenization remains language-aware, generic, and English-targeted", () => {
  const prompts = buildOmniAnalysisPrompts("吾日三省吾身。", {
    document: { languageHint: "lzh", writingMode: "vertical-rl" },
  });
  const request = parseRequest(prompts.userPrompt);
  assert.equal(prompts.mode, "model-full");
  assert.equal(request.sourceText, "吾日三省吾身。");
  assert.equal(request.annotationTarget, "English");
  assert.equal(request.tokenizationOrigin, "model");
  assert.equal("targetTokens" in request, false);
  assert.match(prompts.systemPrompt, /whitespace is not always a word boundary/u);
  assert.match(prompts.systemPrompt, /Detect the primary language and script/u);
  assert.match(prompts.systemPrompt, /Keep root language as omni/u);
  assert.match(prompts.systemPrompt, /Return exactly four Details fields/u);
  assert.match(prompts.systemPrompt, /ROMANIZATION IS REQUIRED FOR THIS LOCALLY NON-LATIN SOURCE/u);
  assert.ok(prompts.systemPrompt.length < 5_000, `OMNI core prompt is unexpectedly long: ${prompts.systemPrompt.length}`);
  assert.deepEqual(Object.keys(parseResponseShape(prompts.systemPrompt)), [
    "language",
    "sourceText",
    "languageDetection",
    "analysisProfile",
    "morphologyStandard",
    "literalTranslation",
    "naturalTranslation",
    "tokens",
    "notes",
  ]);
  assert.equal(parseResponseShape(prompts.systemPrompt).language, "omni");
  assert.deepEqual(parseResponseShape(prompts.systemPrompt).notes, []);
  assert.equal(
    (parseResponseShape(prompts.systemPrompt).languageDetection as Record<string, unknown>).schemaVersion,
    1,
  );
  assert.match(prompts.systemPrompt, /ACTIVE LANGUAGE PROFILE: Generic · stoa\.omni\.generic\.v1/u);
  assert.doesNotMatch(prompts.systemPrompt, /stoa\.omni\.(?:el|de|fr|ru)\.v1/u);
  assert.doesNotMatch(prompts.systemPrompt, /ANCIENT GREEK STOA MORPHOLOGY STANDARD|LATIN STOA MORPHOLOGY STANDARD/u);
});

test("user-full mode enriches fixed tokens while retaining importable full-document structure", () => {
  const sourceText = "«שלום»\n\nעולם!";
  const lockedTokens = [
    {
      id: "full-001",
      surface: "שלום",
      punctuationBefore: "«",
      punctuationAfter: "»",
      breakAfter: "paragraph" as const,
      blankLinesAfter: 2,
    },
    {
      id: "full-002",
      surface: "עולם",
      punctuationBefore: "",
      punctuationAfter: "!",
      breakAfter: "none" as const,
      blankLinesAfter: 1,
    },
  ];
  const prompts = buildOmniAnalysisPrompts(sourceText, {
    mode: "user-full",
    document: { direction: "rtl", languageHint: "he" },
    lockedTokens,
  });
  const request = parseRequest(prompts.userPrompt);
  assert.equal(prompts.mode, "user-full");
  assert.equal(request.mode, "user-full");
  assert.equal(request.sourceText, sourceText);
  assert.equal(request.tokenizationOrigin, "user");
  assert.equal("chunkId" in request, false);
  assert.deepEqual(request.targetTokens, lockedTokens);

  const shape = parseResponseShape(prompts.systemPrompt);
  assert.deepEqual(Object.keys(shape), [
    "language",
    "sourceText",
    "languageDetection",
    "analysisProfile",
    "morphologyStandard",
    "literalTranslation",
    "naturalTranslation",
    "tokens",
    "notes",
  ]);
  assert.equal(shape.language, "omni");
  assert.equal(shape.sourceText, "copy the supplied source text exactly");
  const tokenShape = (shape.tokens as Array<Record<string, unknown>>)[0];
  assert.deepEqual(Object.keys(tokenShape), [
    "id",
    "surface",
    "punctuationBefore",
    "punctuationAfter",
    "romanization",
    "lemma",
    "gloss",
    "pos",
    "morphology",
    "features",
    "isIndeclinable",
    "confidence",
    "alternatives",
    "breakAfter",
    "blankLinesAfter",
  ]);
  assert.equal(tokenShape.breakAfter, "copy supplied none|line|paragraph value exactly");
  assert.equal(tokenShape.blankLinesAfter, "copy supplied integer value exactly");
  assert.match(
    prompts.systemPrompt,
    /Copy id, surface, punctuationBefore, punctuationAfter, breakAfter, and blankLinesAfter exactly/u,
  );
  assert.match(
    prompts.systemPrompt,
    /Enrich only lemma, gloss, pos, morphology, features, isIndeclinable, confidence, alternatives, and romanization/u,
  );
  assert.doesNotMatch(prompts.systemPrompt, /Do not return punctuation or layout fields/u);
});

test("user-provided tokens retain exact IDs, surfaces, punctuation, and logical RTL order", () => {
  const sourceText = "  וַיֹּאמֶר: שָׁלוֹם!\nثُمَّ قالَ.  ";
  const lockedTokens = [
    { id: "rtl-01", surface: "וַיֹּאמֶר", punctuationBefore: "", punctuationAfter: ":", breakAfter: "none" as const },
    { id: "rtl-02", surface: "שָׁלוֹם", punctuationBefore: "", punctuationAfter: "!", breakAfter: "line" as const },
    { id: "rtl-03", surface: "ثُمَّ", punctuationBefore: "", punctuationAfter: "", breakAfter: "none" as const },
    { id: "rtl-04", surface: "قالَ", punctuationBefore: "", punctuationAfter: ".", breakAfter: "none" as const },
  ];
  const prompts = buildOmniAnalysisPrompts(sourceText, {
    mode: "locked-chunk",
    document: { direction: "rtl", writingMode: "horizontal-tb", languageHint: "he-Arab" },
    chunkId: "omni-chunk-rtl",
    lockedTokens,
  });
  const request = parseRequest(prompts.userPrompt);
  assert.equal(prompts.mode, "locked-chunk");
  assert.equal(request.sourceText, sourceText);
  assert.equal(request.tokenizationOrigin, "user");
  assert.equal(request.chunkId, "omni-chunk-rtl");
  assert.deepEqual(request.targetTokens, lockedTokens);
  assert.deepEqual(
    (request.targetTokens as typeof lockedTokens).map((token) => token.id),
    ["rtl-01", "rtl-02", "rtl-03", "rtl-04"],
  );
  assert.deepEqual(request.presentation, {
    direction: "rtl",
    writingMode: "horizontal-tb",
    tokenOrder: "logical-source-order",
  });
  assert.match(prompts.systemPrompt, /Never replace or alter surface with a romanized form, and never reverse RTL token order/u);
  assert.match(prompts.systemPrompt, /Return every target token exactly once in the supplied logical order/u);
  assert.match(prompts.systemPrompt, /Do not return punctuation or layout fields because STOA preserves them locally/u);
  const lockedShape = parseResponseShape(prompts.systemPrompt);
  assert.deepEqual(Object.keys(lockedShape), [
    "chunkId",
    "literalTranslation",
    "naturalTranslation",
    "tokens",
    "notes",
  ]);
  assert.equal(lockedShape.chunkId, "copy the supplied chunkId exactly");
  assert.equal("language" in lockedShape, false);
  assert.equal("sourceText" in lockedShape, false);
  assert.equal("profile" in lockedShape, false);
});

test("a concise OMNI request includes only the active validated language profile", () => {
  const sourceText = "Doch das ist gut.";
  const document = createOmniDocumentConfig({
    manualLanguageOverride: { languageId: "de", confirmed: true },
  }, sourceText);
  const prompts = buildOmniAnalysisPrompts(sourceText, { mode: "model-full", document });
  assert.match(prompts.systemPrompt, /ACTIVE LANGUAGE PROFILE: German · stoa\.omni\.de\.v1/u);
  assert.doesNotMatch(prompts.systemPrompt, /stoa\.omni\.(?:el|fr|ru|es)\.v1/u);
  assert.ok(prompts.systemPrompt.length < 9_000, `active-profile prompt is unexpectedly long: ${prompts.systemPrompt.length}`);
  assert.doesNotMatch(prompts.systemPrompt, /ROMANIZATION IS REQUIRED/u);
  const tokenShape = (parseResponseShape(prompts.systemPrompt).tokens as Array<Record<string, unknown>>)[0];
  assert.equal("romanization" in tokenShape, false);
});

test("generic token metadata accepts language-specific features without a classical fixed inventory", () => {
  const token: OmniTokenMetadata = {
    id: "omni-0001",
    surface: "行った",
    romanization: "itta",
    lemma: "行く",
    gloss: "went",
    pos: "VERB",
    morphology: "Past",
    features: {
      conjugationForm: "連用形 + た",
      politeness: "Plain",
      polarity: "Positive",
      languageSpecificAnalysis: "Godan verb",
    },
    confidence: 0.97,
    alternatives: [],
  };
  assert.equal(token.features.conjugationForm, "連用形 + た");
  assert.equal(token.romanization, "itta");
  assert.equal("case" in token.features, false);
});

test("locked-token validation rejects missing token data and duplicate stable IDs", () => {
  assert.throws(
    () => buildOmniUserPrompt("text", { document: { tokenizationOrigin: "user" } }),
    /requires a non-empty chunkId/u,
  );
  assert.throws(
    () => buildOmniUserPrompt("text", {
      chunkId: "   ",
      lockedTokens: [{ id: "one", surface: "text", punctuationBefore: "", punctuationAfter: "" }],
    }),
    /requires a non-empty chunkId/u,
  );
  assert.throws(
    () => buildOmniUserPrompt("text", { chunkId: "chunk-empty-tokens", document: { tokenizationOrigin: "user" } }),
    /requires lockedTokens/u,
  );
  assert.throws(
    () => buildOmniUserPrompt("text", { chunkId: "chunk-empty", lockedTokens: [] }),
    /requires at least one locked token/u,
  );
  assert.throws(
    () => buildOmniUserPrompt("aa", {
      chunkId: "chunk-duplicate",
      lockedTokens: [
        { id: "same", surface: "a", punctuationBefore: "", punctuationAfter: "" },
        { id: "same", surface: "a", punctuationBefore: "", punctuationAfter: "" },
      ],
    }),
    /Duplicate locked OMNI token id/u,
  );
  assert.throws(() => buildOmniSystemPrompt({ lockedTokens: false }) && buildOmniUserPrompt("  \n "), /must not be empty/u);

  const incompleteUserFull = {
    mode: "user-full",
    lockedTokens: [{
      id: "full-invalid",
      surface: "text",
      punctuationBefore: "",
      punctuationAfter: "",
    }],
  } as unknown as OmniPromptInputOptions;
  assert.throws(
    () => buildOmniUserPrompt("text", incompleteUserFull),
    /requires breakAfter/u,
  );
  const invalidBlankLines = {
    mode: "user-full",
    lockedTokens: [{
      id: "full-invalid-lines",
      surface: "text",
      punctuationBefore: "",
      punctuationAfter: "",
      breakAfter: "paragraph",
      blankLinesAfter: 1.5,
    }],
  } as unknown as OmniPromptInputOptions;
  assert.throws(() => buildOmniUserPrompt("text", invalidBlankLines), /integer blankLinesAfter value from 1 to 20/u);
  assert.throws(
    () => buildOmniUserPrompt("text", {
      chunkId: "whitespace-token",
      lockedTokens: [{ id: "   ", surface: "text", punctuationBefore: "", punctuationAfter: "" }],
    }),
    /non-empty id and surface/u,
  );
});

test("production Ancient Greek and Latin prompt contracts remain isolated from OMNI", () => {
  const greek = buildLanguageSystemPrompt("ancient-greek");
  const latin = buildLanguageSystemPrompt("latin");
  for (const prompt of [greek, latin]) {
    assert.doesNotMatch(prompt, /experimental OMNI|omni-experimental/u);
    assert.match(prompt, /exact STOA-standard morphology label/u);
  }
  assert.match(greek, /ANCIENT GREEK STOA MORPHOLOGY STANDARD — MANDATORY/u);
  assert.match(latin, /LATIN STOA MORPHOLOGY STANDARD — MANDATORY/u);
});

test("both token-style editors expose an OMNI-safe language prop and sample preview", async () => {
  const sources = await Promise.all([
    readFile(new URL("../app/token-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/composition-style-editor.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.match(source, /language: StoaWorkspaceLanguageId/u);
    assert.match(source, /omni:\s*\{[\s\S]*?source: "語"[\s\S]*?morphology: "language-specific form"/u);
    assert.match(source, /omni: "OMNI · Experimental"/u);
    assert.match(source, /language === "omni"/u);
  }
});
