import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const functionSlice = (source, start, end) => source.slice(
  source.indexOf(start),
  source.indexOf(end, source.indexOf(start)),
);

test("Classical Chinese and non-Latin OMNI expose one removable pronunciation row", async () => {
  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  assert.match(page, /pronunciationLabelFor\(/u);
  assert.match(page, /label=\{pronunciationLabel\}/u);
  assert.match(page, /checked=\{settings\.showPronunciation\}/u);
  assert.match(page, /onChange=\{\(value\) => updateSetting\("showPronunciation", value\)\}/u);
  assert.match(page, /pronunciation:\s*"word-pronunciation"/u);
  assert.match(page, /pronunciationLabel === "Pinyin" \? "pinyin" : "romanization"/u);
});

test("preview measurement receives the explicit workspace language and never infers it from style data", async () => {
  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /pronunciationLanguageForToken/u);
  assert.match(page, /resolvedTokenLayers\(token, settings, analysis\.language\)/u);
  assert.match(page, /<TokenCard\s+[\s\S]*?language=\{analysis\.language\}/u);
  assert.match(page, /layoutSourceKey,\s+analysis\.language,\s+\)/u);
});

test("both More dialogs limit Pinyin and Romanization to size and five preset colors", async () => {
  const [tokenEditor, defaultEditor] = await Promise.all([
    readFile(new URL("../app/token-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/composition-style-editor.tsx", import.meta.url), "utf8"),
  ]);
  const tokenControls = functionSlice(
    tokenEditor,
    "function PronunciationControls",
    "export function TokenEditor",
  );
  const defaultControls = functionSlice(
    defaultEditor,
    "function DocumentPronunciationControls",
    "export function CompositionStyleEditor",
  );
  for (const controls of [tokenControls, defaultControls]) {
    assert.match(controls, /PRONUNCIATION_FONT_FAMILY/u);
    assert.match(controls, /PRONUNCIATION_SIZE_STEP_PT/u);
    assert.match(controls, /(?:TOKEN_EDITOR|COMPOSITION)_COLOR_PRESETS\.map/u);
    assert.doesNotMatch(controls, /fontOptions|fontFamily|type="color"|bold|italic|underline/u);
  }
  assert.match(tokenEditor, /title=\{pronunciationLabel\}/u);
  assert.match(defaultEditor, /title=\{pronunciationLabel\}/u);
  assert.match(defaultEditor, /Liberation Sans STOA · \$\{draftPronunciation\.sizePt\} pt/u);
});

test("wide-paper Notes and translation DOM use the same explicit measured line column", async () => {
  const [page, css, vector] = await Promise.all([
    readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/vector-pdf.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /--trailing-text-measure/u);
  assert.match(page, /className="translation-lines"/u);
  assert.match(page, /className="translation-line"/u);
  assert.match(css, /\.publication-note-lines\s*\{[^}]*var\(--trailing-text-measure/su);
  assert.match(css, /\.translation-lines\s*\{[^}]*var\(--trailing-text-measure/su);
  assert.match(vector, /resolveTrailingTextMeasurePx\(usableWidth \/ PX_TO_MM\)/u);
  assert.match(vector, /Preview and vector PDF use different Notes\/translation measures/u);
});
