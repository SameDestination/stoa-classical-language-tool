import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");

const between = (start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing source range ${start} … ${end}`);
  return source.slice(startIndex, endIndex);
};

test("workspace navigation is responsive and never enters document history", () => {
  const switcher = between('<div className="language-catalog"', '<button\n          className="settings-button"');
  assert.doesNotMatch(switcher, /disabled=\{aiRunning\}/u);
  assert.match(source, /const activeLanguageRef = useRef<TextLanguage>\(language\)/u);
  assert.match(source, /if \(nextLanguage === activeLanguageRef\.current\) return;/u);

  const navigation = between(
    "const performLanguageChange = (nextLanguage: TextLanguage) => {",
    "const changeLanguage = (nextLanguage: TextLanguage) => {",
  );
  assert.match(navigation, /cancelAnalysisForWorkspaceChange\(\)/u);
  assert.match(navigation, /applySnapshot\([\s\S]*?, true\)/u);
  assert.doesNotMatch(navigation, /commitDocument\(/u);
});

test("workspace histories are page-local and undo never navigates", () => {
  assert.match(source, /WorkspaceHistories<TextLanguage, DocumentSnapshot>/u);
  assert.match(source, /undoWorkspaceHistory\([\s\S]*?language,[\s\S]*?currentSnapshot\(\)/u);
  assert.match(source, /redoWorkspaceHistory\([\s\S]*?language,[\s\S]*?currentSnapshot\(\)/u);
  assert.match(source, /if \(switchLanguage\) setLanguage\(snapshot\.language\)/u);
  assert.doesNotMatch(source, /kind:\s*"history"/u);
});

test("restoring a guided-session draft does not navigate behind the user", () => {
  const restoreEffect = between(
    "const stored = window.sessionStorage.getItem(MANUAL_AI_SESSION_STORAGE_KEY);",
    "const storedDrafts = window.sessionStorage.getItem(MANUAL_AI_DRAFT_STORAGE_KEY);",
  );
  assert.match(restoreEffect, /setManualSession\(restored\)/u);
  assert.doesNotMatch(restoreEffect, /setLanguage\(|setSourceText\(|setSettings\(/u);
});

