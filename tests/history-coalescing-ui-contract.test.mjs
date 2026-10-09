import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");

test("shared renderer coalesces direct token, settings, and spacing edits", () => {
  assert.match(source, /resolveHistoryCoalescing\([\s\S]*?options\.historyCoalescingKey/u);
  assert.match(source, /historyCoalescingKey:\s*`setting:\$\{String\(key\)\}`/u);
  assert.match(source, /historyCoalescingKey:\s*`token:\$\{singleSelectedToken\.id\}:\$\{key\}`/u);
  assert.match(source, /historyCoalescingKey:\s*`note:\$\{noteId\}:text`/u);
  assert.match(source, /historyCoalescingKey:\s*"source:text"/u);
  assert.match(source, /historyCoalescingKey:\s*`tokens:\$\{selection\.selectedIds\.join\(","\)\}:blank-lines`/u);
  assert.match(source, /historyCoalescingKey:\s*`tokens:\$\{selection\.selectedIds\.join\(","\)\}:blank-line-spacing`/u);
  assert.match(source, /historyCoalescingKey:\s*"setting:paperWidthMm"/u);
  assert.match(source, /historyCoalescingKey:\s*"setting:paperHeightMm"/u);
});

test("raw Source edits use the document model instead of an unsaved UI-only mirror", () => {
  assert.match(
    source,
    /const updateRawSourceText[\s\S]*?commitDocument\([\s\S]*?\{ \.\.\.analysis, sourceText: value \}/u,
  );
  assert.match(source, /onChange=\{\(event\) => updateRawSourceText\(event\.target\.value\)\}/u);
  assert.doesNotMatch(
    source,
    /onChange=\{\(event\) => \{\s*contentRevision\.current \+= 1;\s*setSourceText/u,
  );
});

test("Undo, Redo, document replacement, and Save terminate an edit burst", () => {
  const resets = source.match(/historyCoalescingRef\.current\s*=\s*null/g) ?? [];
  assert.ok(resets.length >= 4, "expected explicit boundaries for apply, undo, redo, and save");
  assert.match(source, /const applySnapshot[\s\S]*?historyCoalescingRef\.current\s*=\s*null/u);
  assert.match(source, /const undo[\s\S]*?historyCoalescingRef\.current\s*=\s*null/u);
  assert.match(source, /const redo[\s\S]*?historyCoalescingRef\.current\s*=\s*null/u);
  assert.match(source, /if \(savedRevisionChanged\) \{[\s\S]*?historyCoalescingRef\.current\s*=\s*null/u);
});
