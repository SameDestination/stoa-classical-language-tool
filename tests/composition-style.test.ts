import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneCompositionStyle,
  compositionStylesEqual,
  patchCompositionStyle,
} from "../app/lib/composition-style.ts";
import { deriveDocumentTokenStyleDefaults } from "../app/lib/token-style.ts";

const builtIn = () => deriveDocumentTokenStyleDefaults({
  greekFont: "Greek Default",
  englishFont: "English Default",
  lemmaFont: "Lemma Default",
  morphFont: "Morphology Default",
  greekSize: 24,
  glossSize: 12,
  lemmaSize: 10,
  posSize: 8,
  morphSize: 9,
  ink: "#29271f",
  accent: "#9e4a32",
  background: "#eee2cc",
});

test("Composition document patches are immutable, canonical, and layer-scoped", () => {
  const original = builtIn();
  const next = patchCompositionStyle(original, {
    layers: {
      gloss: { fontFamily: "  User Font  ", sizePt: 200, color: "#ABC", underline: true },
    },
    gapAfterPx: { lemma: 9.26 },
  });

  assert.notEqual(next, original);
  assert.notEqual(next.layers.gloss, original.layers.gloss);
  assert.equal(original.layers.gloss.fontFamily, "English Default");
  assert.equal(next.layers.gloss.fontFamily, "User Font");
  assert.equal(next.layers.gloss.sizePt, 144);
  assert.equal(next.layers.gloss.color, "#aabbcc");
  assert.equal(next.layers.gloss.underline, true);
  assert.deepEqual(next.layers.source, original.layers.source);
  assert.equal(next.gapAfterPx.lemma, 9.5);
  assert.equal(original.gapAfterPx.lemma, 3);
});

test("Composition style cloning detaches every mutable nested record", () => {
  const original = builtIn();
  const clone = cloneCompositionStyle(original);

  assert.ok(compositionStylesEqual(original, clone));
  assert.notEqual(clone, original);
  assert.notEqual(clone.layers.source, original.layers.source);
  assert.notEqual(clone.gapAfterPx, original.gapAfterPx);

  clone.layers.source.bold = true;
  clone.gapAfterPx.source = 17;
  assert.equal(original.layers.source.bold, false);
  assert.equal(original.gapAfterPx.source, 5);
  assert.equal(compositionStylesEqual(original, clone), false);
});

test("Composition equality handles absent user defaults explicitly", () => {
  const value = builtIn();
  assert.equal(compositionStylesEqual(null, null), true);
  assert.equal(compositionStylesEqual(undefined, undefined), true);
  assert.equal(compositionStylesEqual(value, null), false);
  assert.equal(compositionStylesEqual(value, cloneCompositionStyle(value)), true);
});

