import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("style editor accordions are accessible, controlled, and share one scroll surface", async () => {
  const [shared, sharedCss, token, composition, page] = await Promise.all([
    readFile(new URL("../app/compact-style-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/compact-style-editor.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/token-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/composition-style-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(shared, /aria-expanded=\{expanded\}/);
  assert.match(shared, /aria-controls=\{panelId\}/);
  assert.match(shared, /hidden=\{!expanded\}/);
  assert.match(shared, /role="region"/);
  assert.match(sharedCss, /\.scrollArea[\s\S]*overflow: auto/);
  assert.match(sharedCss, /\.footer[\s\S]*flex: 0 0 auto/);
  assert.doesNotMatch(token, /overflow-y:\s*auto/);
  assert.doesNotMatch(composition, /overflow-y:\s*auto/);
  assert.match(page, /styleEditor/);
});

test("both editors keep drafts local until one explicit Apply pathway", async () => {
  const [token, composition, page] = await Promise.all([
    readFile(new URL("../app/token-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/composition-style-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(token, /useState<TokenEditorToken\[\]>/);
  assert.match(token, /setDraftTokens/);
  assert.match(token, /onApply\(draftTokens\)/);
  assert.match(token, /onClick=\{onCancel\}/);
  assert.match(composition, /useState<DocumentTokenStyle>/);
  assert.match(composition, /setDraft/);
  assert.match(composition, /onApply\(cloneCompositionStyle\(draft\)\)/);
  assert.match(composition, /onClick=\{onCancel\}/);
  assert.match(page, /commitDocument\(\{ \.\.\.analysis, tokens \}\)/);
  assert.match(page, /updateCompositionDocumentStyle\(nextStyle\)/);
});

test("collapsed headers expose active summaries and only Source starts expanded", async () => {
  const [token, composition] = await Promise.all([
    readFile(new URL("../app/token-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/composition-style-editor.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [token, composition]) {
    assert.match(source, /new Set\(\["source"\]\)/);
    assert.match(source, /summary=/);
    assert.match(source, /Spacing and position/);
  }
  assert.match(token, /summarizeTokenLayer/);
  assert.match(composition, /summarizeCompositionLayer/);
  assert.match(composition, /Future document defaults/);
});
