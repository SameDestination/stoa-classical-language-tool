import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = () => readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
const cssSource = () => readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("manual AI guidance presents file-first delivery with an honest copy-paste fallback", async () => {
  const page = await pageSource();

  assert.match(page, /JSON-first manual workflow/);
  assert.match(page, /Ask for a valid \.stoa\.json file/);
  assert.match(page, /If the AI interface supports file creation/);
  assert.match(page, /use Import Analysis → Open analysis \.stoa\.json/);
  assert.match(page, /File creation is not available in every model or interface/);
  assert.match(page, /If file creation is unavailable, request valid STOA JSON, copy the response/);
  assert.match(page, /save only the required JSON object as \$\{filename\}/);
  assert.match(page, /const importLabel = "Import Analysis"/);
  assert.match(page, /copied and pasted into \$\{importLabel\}/);
});

test("official-language Full AI requests let the model tokenize the intact source", async () => {
  const page = await pageSource();
  const promptBuilder = page.match(/const makeUserPrompt = \([\s\S]*?\n\};\n\nconst detectLanguage/u)?.[0] ?? "";

  assert.ok(promptBuilder, "Full AI prompt builder should exist");
  assert.doesNotMatch(promptBuilder, /tokenizeStoaText|mode: "locked-tokens"|chunkId: "full-analysis"/);
  assert.match(promptBuilder, /buildLanguageAnalysisPrompts\(language, text, \{\s*mode: "full-text"/);
});

test("analysis file chooser loads text into the retained draft and awaits an explicit preview load", async () => {
  const page = await pageSource();
  const loader = page.match(/const loadAnalysisJsonFile = async \(file\?: File\) => \{[\s\S]*?\n[ ]{2}\};/u)?.[0] ?? "";

  assert.ok(loader, "analysis file loader should exist");
  assert.match(loader, /await file\.text\(\)/);
  assert.match(loader, /updateJsonDraft\(rawText\)/);
  assert.doesNotMatch(loader, /applyJsonWorkspaceBatch|importJson\(/);
  assert.match(page, /accept="\.stoa\.json,\.json,application\/json"/);
  assert.match(page, /void loadAnalysisJsonFile\(file\)/);
  assert.match(page, /Loading it appends or updates the selected retained batch in one Undo step\./);
});

test("manual Full AI import uses the shared permissive loader and one document commit", async () => {
  const page = await pageSource();
  const importer = page.match(/const importJson = \(\) => \{[\s\S]*?\n[ ]{2}\};/u)?.[0] ?? "";
  const applier = page.match(/const applyImportedAnalysisBatch = \([\s\S]*?\n[ ]{2}\};/u)?.[0] ?? "";

  assert.ok(importer);
  assert.match(importer, /applyPermissiveJsonWorkspaceBatch/);
  assert.doesNotMatch(importer, /applyBestEffortJsonWorkspaceBatch|createBestEffortExpectedAnalysis/);
  assert.match(importer, /summary\.generatedIdCount/);
  assert.match(importer, /summary\.ignoredDeclaredLanguage/);
  assert.doesNotMatch(importer, /validateChunkResponse|runAiPipeline/);
  assert.ok(applier);
  assert.equal((applier.match(/commitDocument\(/gu) ?? []).length, 1);
  assert.match(page, /Import details/);
  assert.match(page, /Guided Chunk Analysis, direct API analysis, and Project Import keep their stricter validation/);
});

test("JSON-first and analysis-file controls have responsive UI styling", async () => {
  const css = await cssSource();

  assert.match(css, /\.json-first-workflow\s*\{/);
  assert.match(css, /\.json-first-workflow section\.preferred/);
  assert.match(css, /\.analysis-json-file-picker\s*\{/);
  assert.match(css, /@media[\s\S]*\.json-first-workflow\s*\{\s*grid-template-columns:\s*1fr;/);
});
