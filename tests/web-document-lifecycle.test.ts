import assert from "node:assert/strict";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {
  STOA_DEVELOPER_WORKSPACE_IDS,
  createDeveloperDefaultProject,
  createDeveloperWebBlankProject,
} from "../app/developer-defaults/index.ts";
import { serializeStoaProject, parseStoaProject, STOA_PROJECT_V6_SCHEMA } from "../app/lib/stoa-project.ts";
import { createOmniDocumentConfig } from "../app/lib/omni-language.ts";
import { academicPronunciationDefault } from "../app/lib/pronunciation.ts";
import { NOTO_SERIF_STOA_FAMILY } from "../app/lib/font-registry.ts";

// These tests run the real renderer's project normalization and button handler.
// Only Vite's non-JavaScript CSS/worker imports are inert in this Node process;
// project parsing, migrations, defaults and normalization are not mocked.
register(`data:text/javascript,${encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css') || url.includes('worker&inline')) {
      return { format: 'module', source: 'export default {}', shortCircuit: true };
    }
    return nextLoad(url, context);
  }
`)}`);
const { normalizeImportedAnalysis, normalizeImportedProject, paginatePreviewDocument, createProjectFile } = await import("../app/stoa-studio.tsx");
const renderer = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("stoa-studio.tsx", renderer, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function handler(name: string, dependencies: Record<string, unknown>) {
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(syntax) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  assert.ok(initializer, `${name} must exist in the shipped renderer`);
  const js = ts.transpileModule(`const callback = ${initializer.getText(syntax)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${js}\nreturn callback;`)(...Object.values(dependencies));
}

const exportState = (state: ReturnType<typeof normalizeImportedProject>) => serializeStoaProject(createProjectFile(
  state.language, state.analysis.sourceText, state.analysis, state.settings, state.selectedTokenId, state.projectBase,
));

test("5.9.7 samples show translations while imported hidden projects stay hidden", () => {
  for (const language of STOA_DEVELOPER_WORKSPACE_IDS) {
    const sample = createDeveloperDefaultProject(language);
    const state = normalizeImportedProject(serializeStoaProject(sample), language, undefined, "bundled");
    assert.equal(state.settings.showTranslation, true);
    const preview = paginatePreviewDocument(state.analysis.tokens, state.analysis.notes,
      state.analysis.literalTranslation, state.analysis.naturalTranslation, state.settings, false, "visible-sample", language);
    assert.ok(preview.plan.pages.some((page) => (page.translationBlocks?.length ?? 0) > 0));
    sample.project.document.settings.showTranslation = false;
    const imported = normalizeImportedProject(serializeStoaProject(sample), language);
    assert.equal(imported.settings.showTranslation, false);
    assert.equal(normalizeImportedProject(exportState(imported), language).settings.showTranslation, false);
  }
});

type ContractDocument = {
  [key: string]: unknown;
  analysis: { tokens: Array<Record<string, unknown>>; [key: string]: unknown };
  settings: Record<string, unknown>;
};

for (const language of STOA_DEVELOPER_WORKSPACE_IDS) {
  test(`${language}: a fresh document with no imported Project base exports valid schema`, () => {
    const state = normalizeImportedProject(serializeStoaProject(createDeveloperDefaultProject(language)), language);
    for (const analysis of [state.analysis, { ...state.analysis, sourceText: "", tokens: [], notes: [], literalTranslation: "", naturalTranslation: "" }]) {
      const exported = serializeStoaProject(createProjectFile(language, analysis.sourceText, analysis, state.settings, null));
      assert.equal(exported.schemaVersion, STOA_PROJECT_V6_SCHEMA);
      const reopened = normalizeImportedProject(exported, language);
      assert.deepEqual(exportState(reopened).document, exported.document);
    }
  });

  test(`${language}: supplied 5.9.6 sample survives the actual UI import/export contract`, async () => {
    const raw = JSON.parse(await readFile(new URL(`../app/developer-defaults/samples/stoa-${language}.stoa.json`, import.meta.url), "utf8"));
    const imported = normalizeImportedProject(raw, language);
    const exported = exportState(imported);
    assert.equal(exported.schemaVersion, STOA_PROJECT_V6_SCHEMA);
    assert.equal(exported.appVersion, "5.9.7");
    assert.deepEqual(exported.document, raw.document);
    assert.deepEqual(exportState(normalizeImportedProject(exported, language)).document, exported.document);
    assert.deepEqual(serializeStoaProject(parseStoaProject(exported)), exported);
  });

  test(`${language}: an edited project retains punctuation, empty POS, styles and extension data across UI export/import`, () => {
    const raw = serializeStoaProject(createDeveloperDefaultProject(language));
    const doc = raw.document as unknown as ContractDocument;
    doc.futureDocumentField = { keep: true };
    doc.analysis.futureAnalysisField = [1, "extension"];
    Object.assign(doc.analysis.tokens[0], {
      surface: "(kept.)", punctuationBefore: "", punctuationAfter: "", pos: "",
      separatorAfter: "\n\n", breakAfter: "paragraph", blankLinesAfter: 3, blankLineSpacing: 47,
      pinyin: "xué", romanization: "ḏā", pronunciationSize: 11.5, pronunciationColor: "#123456",
      futureTokenField: { keep: "by-id" },
      features: { number: "Singular", futureFeature: { rich: true } },
      alternatives: [{ gloss: "alternative", confidence: 0.5 }],
    });
    doc.selectedTokenId = doc.analysis.tokens[0].id;
    Object.assign(doc.settings, {
      headerLeft: "Saved header ".repeat(60), footerRight: "Saved footer ".repeat(60),
      showTranslation: true, translationFont: "'Liberation Sans STOA', sans-serif",
      translationSize: 36, translationColor: "#336699", translationBold: false,
      translationItalic: false, translationUnderline: true,
      paperPreset: "Custom", paperWidthMm: 420, paperHeightMm: 297,
      orientation: "landscape", wordGap: 80, lineGap: 100,
      futureSettingsField: { keep: true },
    });
    const first = exportState(normalizeImportedProject(raw, language));
    const second = exportState(normalizeImportedProject(first, language));
    assert.deepEqual(second.document, first.document);
    const after = second.document as unknown as ContractDocument;
    assert.equal(after.analysis.tokens[0].surface, "(kept.)");
    assert.equal(after.analysis.tokens[0].punctuationAfter, "");
    assert.equal(after.analysis.tokens[0].pos, "");
    assert.equal(after.settings.headerLeft, doc.settings.headerLeft);
    assert.equal(after.settings.footerRight, doc.settings.footerRight);
    assert.deepEqual(after.analysis.tokens[0].features, doc.analysis.tokens[0].features);
    assert.deepEqual(after.analysis.tokens[0].alternatives, doc.analysis.tokens[0].alternatives);
    assert.deepEqual(after.futureDocumentField, doc.futureDocumentField);
    assert.deepEqual(after.analysis.futureAnalysisField, doc.analysis.futureAnalysisField);
    assert.deepEqual(after.analysis.tokens[0].futureTokenField, doc.analysis.tokens[0].futureTokenField);
    assert.deepEqual(after.settings.futureSettingsField, doc.settings.futureSettingsField);
  });
}

test("More Token Editor is unique and belongs to the left inspector header", () => {
  const inspector = renderer.slice(renderer.indexOf('<section className="panel-section inspector-section">'), renderer.indexOf('<section className="panel-section style-section">'));
  assert.equal((renderer.match(/>More · Token Editor<\/button>/g) ?? []).length, 1);
  assert.match(inspector, /02 · TOKEN EDITOR[\s\S]*className="composition-more-button token-editor-more-button"/);
  assert.match(inspector, /disabled=\{!selectedTokens\.length\}/);
  assert.match(inspector, /aria-expanded=\{tokenEditorOpen\}/);
  assert.match(inspector, /onClick=\{\(\) => setTokenEditorOpen\(true\)\}/);
});

for (const language of STOA_DEVELOPER_WORKSPACE_IDS) {
  test(`${language}: New button commits a blank project through the actual renderer import path`, () => {
    const sample = createDeveloperDefaultProject(language);
    const canonical = serializeStoaProject(sample);
    const calls: unknown[] = [];
    const newDocument = handler("newBlankDocument", {
      language,
      createDeveloperWebBlankProject,
      importedStateFromParsedProject: (project: ReturnType<typeof createDeveloperWebBlankProject>, workspace: typeof language) =>
        normalizeImportedProject(serializeStoaProject(project), workspace, undefined, "bundled"),
      applyImportedProject: (state: ReturnType<typeof normalizeImportedProject>) => calls.push(state),
      setAnalysisImportFilename: () => {},
      setAnalysisImportFeedback: () => {},
      setDictionaryPopover: () => {},
      setDictionaryTrigger: () => {},
      setToast: (message: string) => calls.push(message),
    });
    newDocument();
    assert.equal(calls.length, 2);
    const state = calls[0] as ReturnType<typeof normalizeImportedProject>;
    assert.equal(state.language, language);
    assert.equal(state.analysis.sourceText, "");
    assert.deepEqual(state.analysis.tokens, []);
    assert.deepEqual(state.analysis.notes, []);
    assert.equal(state.analysis.literalTranslation, "");
    assert.equal(state.analysis.naturalTranslation, "");
    assert.equal(state.selectedTokenId, null);
    assert.equal(state.settings.headerLeft, "");
    assert.equal(state.settings.footerLeft, "");
    assert.equal(state.settings.footerRight, "");
    assert.equal(state.settings.headerRight, sample.project.document.settings.headerRight);
    const preview = paginatePreviewDocument([], [], "", "", state.settings, false, "blank-test", language);
    assert.equal(preview.pages.length, 1, "a blank document still displays one editable paper page");
    assert.deepEqual(preview.plan.pages[0].tokenRows, []);
    assert.deepEqual(preview.plan.pages[0].translationBlocks, []);
    assert.deepEqual(preview.plan.pages[0].noteBlocks, []);
    assert.match(calls[1] as string, /New blank document/);
    assert.deepEqual(serializeStoaProject(createDeveloperDefaultProject(language)), canonical);
  });

  test(`${language}: an exported empty project reopens without fabricating sample tokens`, () => {
    const blank = createDeveloperWebBlankProject(language);
    blank.project.document.sourceText = "Unanalysed draft text";
    blank.project.document.analysis.sourceText = "Unanalysed draft text";
    const imported = normalizeImportedProject(serializeStoaProject(blank), language);
    assert.equal(imported.analysis.sourceText, "Unanalysed draft text");
    assert.deepEqual(imported.analysis.tokens, []);
    assert.equal(imported.selectedTokenId, null);
    const reopened = normalizeImportedProject(serializeStoaProject(imported.projectBase), language);
    assert.deepEqual(reopened.analysis, imported.analysis);
  });

  test(`${language}: the real renderer preserves sample tokens, notes, translations and reading-aid defaults`, () => {
    const sample = createDeveloperDefaultProject(language);
    const imported = normalizeImportedProject(serializeStoaProject(sample), language, undefined, "bundled");
    assert.equal(imported.analysis.tokens.length, sample.project.document.analysis.tokens.length);
    assert.deepEqual(imported.analysis.tokens.map((token) => token.id), sample.project.document.analysis.tokens.map((token) => token.id));
    assert.equal(imported.analysis.sourceText, sample.project.document.sourceText);
    assert.equal(imported.analysis.literalTranslation, sample.project.document.analysis.literalTranslation);
    assert.equal(imported.analysis.naturalTranslation, sample.project.document.analysis.naturalTranslation);
    assert.deepEqual(imported.analysis.notes, sample.project.document.analysis.notes);
    const expectedPronunciation = sample.project.document.settings.tokenStyle?.pronunciation
      ?? (language === "classical-chinese" || language === "omni"
        ? academicPronunciationDefault(imported.settings.tokenStyle!.layers.source)
        : undefined);
    assert.deepEqual(imported.settings.tokenStyle?.pronunciation, expectedPronunciation);
  });
}

test("older projects that name the retired Vusillus font open, export and reopen with Noto Serif STOA", async () => {
  const raw = JSON.parse(await readFile(
    new URL("./fixtures/canonical/stoa-ancient-greek-20260819-184926.stoa.json", import.meta.url),
    "utf8",
  ));
  assert.match(JSON.stringify(raw), /Vusillus/u, "the fixture must still exercise the migration");
  const imported = normalizeImportedProject(raw, "ancient-greek");
  assert.equal(imported.settings.greekFont, NOTO_SERIF_STOA_FAMILY);
  assert.equal(imported.settings.lemmaFont, NOTO_SERIF_STOA_FAMILY);
  assert.ok(imported.analysis.tokens.length > 0);
  const exported = exportState(imported);
  assert.doesNotMatch(JSON.stringify(exported), /Vusillus/iu);
  const reopened = normalizeImportedProject(exported, "ancient-greek");
  assert.deepEqual(reopened.analysis, imported.analysis);
  assert.equal(reopened.settings.greekFont, NOTO_SERIF_STOA_FAMILY);
});

test("OMNI blank resets detection and sample overrides instead of inheriting the Hebrew sample", () => {
  const imported = normalizeImportedProject(serializeStoaProject(createDeveloperWebBlankProject("omni")), "omni", undefined, "bundled");
  const empty = createOmniDocumentConfig(undefined, "");
  assert.deepEqual(imported.settings.omni, empty);
  assert.deepEqual(imported.analysis.languageDetection, empty.languageDetection);
  assert.equal(imported.analysis.analysisProfile, empty.analysisProfile);
});

test("AI analysis still rejects missing or empty token payloads; project schema is not bypassed", () => {
  assert.throws(() => normalizeImportedAnalysis({ tokens: [] }, "latin"), /No tokens/);
  assert.throws(() => normalizeImportedAnalysis({}, "latin"), /No tokens/);
  const invalid = serializeStoaProject(createDeveloperWebBlankProject("latin"));
  (invalid.document as Record<string, unknown>).analysis = { tokens: null };
  assert.throws(() => normalizeImportedProject(invalid, "latin"));
});

test("the renderer import path retains explicit translation and pronunciation styling", () => {
  for (const language of STOA_DEVELOPER_WORKSPACE_IDS) {
    const project = createDeveloperDefaultProject(language);
    const styles = {
      translationFont: "'Liberation Sans STOA', sans-serif", translationSize: 19,
      translationColor: "#3366cc", translationBold: true,
      translationItalic: false, translationUnderline: true,
    };
    Object.assign(project.project.document.settings, styles);
    if (project.project.document.settings.tokenStyle) {
      project.project.document.settings.tokenStyle.pronunciation = { sizePt: 17, color: "#ff0000" };
    }
    const imported = normalizeImportedProject(serializeStoaProject(project), language);
    for (const [key, value] of Object.entries(styles)) {
      assert.equal(imported.settings[key as keyof typeof styles], value);
    }
    assert.deepEqual(imported.settings.tokenStyle?.pronunciation, { sizePt: 17, color: "#ff0000" });
  }
});

test("legacy token false emphasis remains an explicit override during normalization", () => {
  const token = {
    id: "one", surface: "λόγος", gloss: "word",
    wordBold: false, wordItalic: false, wordUnderline: false,
    lemmaUnderline: false, morphUnderline: false,
  };
  const imported = normalizeImportedAnalysis({ tokens: [token] }, "ancient-greek").tokens[0];
  for (const key of ["wordBold", "wordItalic", "wordUnderline", "lemmaUnderline", "morphUnderline"] as const) {
    assert.equal(imported[key], false, key);
  }
});

test("New reports a recoverable error without claiming success or replacing the current document", () => {
  let applied = false;
  let message = "";
  const action = handler("newBlankDocument", {
    language: "latin",
    createDeveloperWebBlankProject: () => { throw new Error("test failure"); },
    applyImportedProject: () => { applied = true; },
    setToast: (value: string) => { message = value; },
  });
  action();
  assert.equal(applied, false);
  assert.match(message, /Unable to create blank document: test failure/);
});
