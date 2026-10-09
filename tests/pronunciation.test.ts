import assert from "node:assert/strict";
import test from "node:test";

import {
  PRONUNCIATION_FONT_FAMILY,
  academicPronunciationDefault,
  clampPronunciationSize,
  containsNonLatinScriptLetters,
  pronunciationLabelFor,
  pronunciationTextFor,
  resolvePronunciationStyle,
} from "../app/lib/pronunciation.ts";
import type { TokenTextStyle } from "../app/lib/token-style.ts";

const sourceStyle: TokenTextStyle = {
  fontFamily: "Source Han Serif SC STOA",
  sizePt: 26,
  color: "#29271f",
  bold: true,
  italic: false,
  underline: false,
};

test("local script detection exposes Pinyin for Classical Chinese and Romanization only for non-Latin OMNI", () => {
  assert.equal(containsNonLatinScriptLetters("salve monde"), false);
  assert.equal(containsNonLatinScriptLetters("日本語"), true);
  assert.equal(containsNonLatinScriptLetters("עברית 123"), true);
  assert.equal(pronunciationLabelFor("classical-chinese", "民為貴"), "Pinyin");
  assert.equal(pronunciationLabelFor("omni", "日本語"), "Romanization");
  assert.equal(pronunciationLabelFor("omni", "Deutsch français"), null);
  assert.equal(pronunciationLabelFor("ancient-greek", "λόγος"), null);
  assert.equal(pronunciationLabelFor("latin", "verbum"), null);
});

test("reading-aid text is language-gated and normalized without changing token surfaces", () => {
  const token = {
    surface: "學",
    pinyin: "xue\u0301",
    romanization: "gaku",
  };
  assert.equal(pronunciationTextFor(token, "classical-chinese"), "xué");
  assert.equal(pronunciationTextFor(token, "omni"), "gaku");
  assert.equal(pronunciationTextFor({ ...token, surface: "gaku" }, "omni"), "");
  assert.equal(pronunciationTextFor(token, "latin"), "");
  assert.equal(token.surface, "學");
});

test("Pinyin and Romanization keep the fixed academic face while allowing only size and color overrides", () => {
  assert.deepEqual(academicPronunciationDefault(sourceStyle), {
    sizePt: 13,
    color: "#29271f",
  });
  const resolved = resolvePronunciationStyle({
    pronunciationSize: 15.2,
    pronunciationColor: "#3366CC",
  }, sourceStyle, { sizePt: 12, color: "#111111" });
  assert.equal(resolved.fontFamily, PRONUNCIATION_FONT_FAMILY);
  assert.equal(resolved.sizePt, 15);
  assert.equal(resolved.color, "#3366cc");
  assert.equal(resolved.bold, false);
  assert.equal(resolved.italic, false);
  assert.equal(resolved.underline, false);
  assert.equal(clampPronunciationSize(2), 7);
  assert.equal(clampPronunciationSize(12.24), 12);
  assert.equal(clampPronunciationSize(500), 144);
});
