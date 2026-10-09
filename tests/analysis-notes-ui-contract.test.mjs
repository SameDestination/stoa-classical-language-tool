import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("classical Preview paginates Analysis Notes before both translation blocks", () => {
  const noteRender = source.indexOf("page.noteBlocks.map");
  const translationRender = source.indexOf("page.translationBlocks.map", noteRender);
  assert.ok(noteRender >= 0 && translationRender > noteRender);
  assert.match(source, /noteSources:\s*visibleNotes\.map/u);
  assert.match(source, /sectionId === "analysis-notes"/u);
  assert.match(css, /\.publication-notes\s*\{[^}]*margin-top:\s*30px;[^}]*padding:\s*14px 22px 16px;/su);
  assert.match(css, /\.publication-note-line\s*\{[^}]*grid-template-columns:\s*22px minmax\(0, 1fr\);/su);
});

test("token markers and Notes use stable destinations while OMNI retains its legacy notes surface", () => {
  assert.match(source, /notes:\s*analysisNotesForPublication\(\s*analysis\.notes,\s*isStoaLanguageId\(analysis\.language\),?\s*\)/su);
  assert.match(source, /createVectorPdf\(\{[\s\S]*?notes:\s*publicationAnalysis\.notes,[\s\S]*?paginationPlan:\s*previewPagination\.plan,/u);
  assert.match(source, /id=\{settings\.omni \? undefined : tokenNoteDestination\(item\.id\)\}/u);
  assert.match(source, /analysisNoteDestination\(line\.noteId\)/u);
  assert.match(source, /isStoaLanguageId\(language\).*<Toggle label="Notes"/su);
  assert.match(source, /omniDocument && analysis\.notes\.length > 0/u);
  assert.match(css, /\.token-note-marker\s*\{[^}]*vertical-align:\s*baseline;/su);
});

test("single-token Notes editing supports insertion, movement, deletion and token-delete cascading", () => {
  assert.match(source, /<TokenNotesEditor/u);
  assert.match(source, /insertAnalysisNote\(analysis\.notes/u);
  assert.match(source, /moveAnalysisNote\(analysis\.notes/u);
  assert.match(source, /deleteAnalysisNote\(analysis\.notes/u);
  assert.match(source, /removedTokenIds\.has\(note\.tokenId\)/u);
  assert.match(source, /recordWorkspaceEdit\(nextLanguage, historySnapshot\)/u);
});
