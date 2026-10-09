import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  aggregateEffectiveTokenStyles,
  canonicalizeTokenColor,
  clampTokenFontSize,
  clampTokenLayerGap,
  clearSelectedTokenStyles,
  DEFAULT_TOKEN_GAP_AFTER_PX,
  deriveDocumentTokenStyleDefaults,
  deriveLegacyTokenLayerVisibility,
  legacyTokenStyleOverride,
  maximumAtomicRowHeight,
  measureTokenLayerStackHeight,
  mixTokenColors,
  normalizeDocumentTokenStyle,
  normalizeTokenStyleOverride,
  patchSelectedTokenStyles,
  patchTokenStyleOverride,
  resolveTokenStyle,
  resolveVisibleTokenLayers,
  TOKEN_LAYER_LINE_HEIGHT,
  tokenStyleOverrideFor,
  type LegacyTokenStyleSettings,
  type TokenStyleCarrier,
} from "../app/lib/token-style.ts";

type FixtureProject = {
  document: {
    settings: LegacyTokenStyleSettings & {
      showLemma?: boolean;
      showPos?: boolean;
    };
    analysis: { tokens: Array<TokenStyleCarrier & Record<string, unknown>> };
  };
};

const fixture = async (filename: string) => JSON.parse(await readFile(
  new URL(`./fixtures/canonical/${filename}`, import.meta.url),
  "utf8",
)) as FixtureProject;

const fixtureFiles = [
  "stoa-ancient-greek-20260819-184926.stoa.json",
  "stoa-latin-20260819-191723.stoa.json",
] as const;

test("canonical colors and numeric bounds are stable for project/PDF use", () => {
  assert.equal(canonicalizeTokenColor(" #AbC "), "#aabbcc");
  assert.equal(canonicalizeTokenColor("#A0b1C2"), "#a0b1c2");
  assert.equal(canonicalizeTokenColor("#abcd"), null);
  assert.equal(canonicalizeTokenColor("red"), null);

  assert.equal(clampTokenFontSize(3), 4);
  assert.equal(clampTokenFontSize(12.26), 12.5);
  assert.equal(clampTokenFontSize(200), 144);
  assert.equal(clampTokenLayerGap(-5), 0);
  assert.equal(clampTokenLayerGap(5.26), 5.5);
  assert.equal(clampTokenLayerGap(100), 48);
});

test("canonical Greek and Latin settings derive complete five-layer defaults", async () => {
  for (const filename of fixtureFiles) {
    const project = await fixture(filename);
    const settings = project.document.settings;
    const defaults = deriveDocumentTokenStyleDefaults(settings);

    assert.equal(defaults.layers.source.fontFamily, settings.greekFont);
    assert.equal(defaults.layers.gloss.fontFamily, settings.englishFont);
    assert.equal(defaults.layers.lemma.fontFamily, settings.lemmaFont);
    assert.equal(defaults.layers.pos.fontFamily, settings.englishFont);
    assert.equal(defaults.layers.morphology.fontFamily, settings.morphFont);
    assert.equal(defaults.layers.source.sizePt, settings.greekSize);
    assert.equal(defaults.layers.gloss.sizePt, settings.glossSize);
    assert.equal(defaults.layers.lemma.sizePt, settings.lemmaSize);
    assert.equal(defaults.layers.pos.sizePt, settings.posSize);
    assert.equal(defaults.layers.morphology.sizePt, settings.morphSize);
    assert.equal(defaults.layers.source.color, "#29271f");
    assert.equal(defaults.layers.pos.color, "#9e4a32");
    assert.equal(defaults.layers.gloss.bold, true);
    assert.equal(defaults.layers.lemma.italic, true);
    assert.equal(
      defaults.layers.lemma.color,
      mixTokenColors(settings.ink ?? "#29271f", settings.background ?? "#eee2cc", 0.66),
    );
    assert.equal(
      defaults.layers.morphology.color,
      mixTokenColors(settings.ink ?? "#29271f", settings.background ?? "#eee2cc", 0.72),
    );
    assert.deepEqual(defaults.gapAfterPx, DEFAULT_TOKEN_GAP_AFTER_PX);
  }
});

test("legacy flat token styles migrate without fabricating whole-layer copies", async () => {
  const project = await fixture(fixtureFiles[0]);
  const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
  const legacy: TokenStyleCarrier = {
    id: "legacy",
    wordFont: "  Custom Greek  ",
    wordSize: 18.24,
    wordColor: "#A33",
    wordBold: true,
    wordItalic: false,
    wordUnderline: true,
    lemmaColor: "#123456",
    lemmaUnderline: true,
    morphColor: "not-a-color",
    morphUnderline: false,
  };

  assert.deepEqual(legacyTokenStyleOverride(legacy, defaults), {
    layers: {
      source: {
        fontFamily: "Custom Greek",
        sizePt: 18,
        color: "#aa3333",
        bold: true,
        underline: true,
      },
      lemma: { color: "#123456", underline: true },
    },
  });

  const withNested: TokenStyleCarrier = {
    ...legacy,
    styleOverrides: { layers: { source: { color: "#00FF00" } } },
  };
  assert.equal(tokenStyleOverrideFor(withNested, defaults)?.layers?.source?.color, "#00ff00");

  const resetByNested: TokenStyleCarrier = {
    ...legacy,
    styleOverrides: { layers: { source: { color: defaults.layers.source.color } } },
  };
  assert.equal(tokenStyleOverrideFor(resetByNested, defaults)?.layers?.source?.color, undefined);
});

test("v2 document styles canonicalize valid fields and inherit invalid/missing fields", async () => {
  const project = await fixture(fixtureFiles[1]);
  const fallback = deriveDocumentTokenStyleDefaults(project.document.settings);
  const normalized = normalizeDocumentTokenStyle({
    layers: {
      source: { fontFamily: "  User Latin  ", sizePt: 17.26, color: "#ABC", bold: true },
      gloss: { sizePt: "large", color: "red", italic: true },
      pos: null,
    },
    gapAfterPx: { source: 6.26, gloss: Number.NaN, lemma: 999 },
  }, fallback);

  assert.deepEqual(normalized.layers.source, {
    ...fallback.layers.source,
    fontFamily: "User Latin",
    sizePt: 17.5,
    color: "#aabbcc",
    bold: true,
  });
  assert.deepEqual(normalized.layers.gloss, {
    ...fallback.layers.gloss,
    italic: true,
  });
  assert.deepEqual(normalized.layers.pos, fallback.layers.pos);
  assert.equal(normalized.gapAfterPx.source, 6.5);
  assert.equal(normalized.gapAfterPx.gloss, fallback.gapAfterPx.gloss);
  assert.equal(normalized.gapAfterPx.lemma, 48);
  assert.equal(normalized.gapAfterPx.pos, fallback.gapAfterPx.pos);
});

test("normalization remains sparse and drops values identical to defaults", async () => {
  const project = await fixture(fixtureFiles[1]);
  const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
  const normalized = normalizeTokenStyleOverride({
    layers: {
      source: {
        fontFamily: defaults.layers.source.fontFamily,
        sizePt: defaults.layers.source.sizePt,
        color: "#ABC",
        italic: true,
        unexpected: "discard",
      },
      gloss: { sizePt: Number.NaN },
      unknown: { bold: true },
    },
    gapAfterPx: { source: 5, gloss: 7.26, unknown: 12 },
  }, defaults);

  assert.deepEqual(normalized, {
    layers: { source: { color: "#aabbcc", italic: true } },
    gapAfterPx: { gloss: 7.5 },
  });
  const resolved = resolveTokenStyle(defaults, normalized);
  assert.equal(resolved.layers.source.fontFamily, defaults.layers.source.fontFamily);
  assert.equal(resolved.layers.source.color, "#aabbcc");
  assert.equal(resolved.layers.source.italic, true);
  assert.equal(resolved.gapAfterPx.gloss, 7.5);
});

test("hidden lemma/POS/details never accumulate invisible vertical gaps", async () => {
  const project = await fixture(fixtureFiles[0]);
  const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
  const style = {
    ...defaults,
    gapAfterPx: { source: 5, gloss: 6, lemma: 7, pos: 8 },
  };

  const withoutLemmaAndPos = resolveVisibleTokenLayers(style, {
    source: true,
    gloss: true,
    lemma: false,
    pos: false,
    morphology: true,
  });
  assert.deepEqual(
    withoutLemmaAndPos.map(({ layer, gapAfterPx }) => [layer, gapAfterPx]),
    [["source", 5], ["gloss", 6], ["morphology", 0]],
  );

  const detailsHidden = deriveLegacyTokenLayerVisibility(
    { showLemma: true, showPos: true },
    { hideDetails: true },
  );
  assert.deepEqual(detailsHidden, {
    source: true,
    gloss: true,
    lemma: false,
    pos: false,
    morphology: false,
  });
  assert.deepEqual(
    resolveVisibleTokenLayers(style, detailsHidden).map(({ layer, gapAfterPx }) => [layer, gapAfterPx]),
    [["source", 5], ["gloss", 0]],
  );
});

test("atomic row height uses the tallest complete visible token stack", async () => {
  const project = await fixture(fixtureFiles[0]);
  const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
  const text = {
    source: "λόγος",
    gloss: "reason",
    lemma: "λόγος",
    pos: "NOUN",
    morphology: "Acc. Sg. m.",
  } as const;
  const measured = (visibility: Parameters<typeof resolveVisibleTokenLayers>[1], custom = defaults) =>
    measureTokenLayerStackHeight(
      resolveVisibleTokenLayers(custom, visibility).map((layer) => ({
        ...layer,
        text: text[layer.layer],
        lineHeight: TOKEN_LAYER_LINE_HEIGHT[layer.layer],
      })),
      96 / 72,
      1,
    );
  const allVisible = { source: true, gloss: true, lemma: true, pos: true, morphology: true };
  const indeclinableHidden = deriveLegacyTokenLayerVisibility(
    { showLemma: true, showPos: true },
    { hideDetails: true },
  );
  const fullHeight = measured(allVisible);
  const hiddenHeight = measured(indeclinableHidden);
  const custom = {
    layers: {
      ...defaults.layers,
      source: {
        ...defaults.layers.source,
        fontFamily: "'Custom Metrics Test'",
        sizePt: defaults.layers.source.sizePt + 10,
      },
    },
    gapAfterPx: { ...defaults.gapAfterPx, source: 18 },
  };
  const customHeight = measured(allVisible, custom);

  assert.ok(hiddenHeight < fullHeight);
  assert.ok(customHeight > fullHeight);
  assert.equal(
    maximumAtomicRowHeight(
      [hiddenHeight, fullHeight, customHeight],
      (height) => height,
    ),
    customHeight,
  );
});

test("effective multi-token aggregation reports uniform and mixed values explicitly", async () => {
  const project = await fixture(fixtureFiles[1]);
  const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
  const tokens: TokenStyleCarrier[] = [
    { id: "a", wordSize: 20, wordColor: "#ABC" },
    {
      id: "b",
      styleOverrides: {
        layers: { source: { sizePt: 21, color: "#aabbcc" } },
        gapAfterPx: { source: 9 },
      },
    },
    { id: "c", wordSize: 99 },
  ];

  const aggregate = aggregateEffectiveTokenStyles(tokens, ["a", "b"], defaults);
  assert.deepEqual(aggregate.layers.source.sizePt, { kind: "mixed" });
  assert.deepEqual(aggregate.layers.source.color, { kind: "uniform", value: "#aabbcc" });
  assert.deepEqual(aggregate.layers.gloss.sizePt, {
    kind: "uniform",
    value: defaults.layers.gloss.sizePt,
  });
  assert.deepEqual(aggregate.gapAfterPx.source, { kind: "mixed" });

  const empty = aggregateEffectiveTokenStyles(tokens, [], defaults);
  assert.deepEqual(empty.layers.morphology.underline, { kind: "empty" });
});

test("patches touch only explicit properties and canonicalize applied values", async () => {
  const project = await fixture(fixtureFiles[0]);
  const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
  const current = {
    layers: {
      source: { sizePt: 20, italic: true },
      gloss: { underline: true },
    },
    gapAfterPx: { source: 9 },
  };
  const patched = patchTokenStyleOverride(current, {
    layers: {
      source: { color: "#F0A", bold: true, italic: null },
      lemma: { sizePt: 200 },
    },
    gapAfterPx: { source: null, lemma: 13.26 },
  }, defaults);

  assert.deepEqual(patched, {
    layers: {
      source: { sizePt: 20, color: "#ff00aa", bold: true },
      gloss: { underline: true },
      lemma: { sizePt: 144 },
    },
    gapAfterPx: { lemma: 13.5 },
  });
});

test("all five layers retain independent sparse controls", async () => {
  const project = await fixture(fixtureFiles[0]);
  const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
  const patched = patchTokenStyleOverride(undefined, {
    layers: {
      source: { fontFamily: "Source Face", sizePt: 30 },
      gloss: { color: "#111", bold: false },
      lemma: { italic: false, underline: true },
      pos: { fontFamily: "POS Face", color: "#2468AC" },
      morphology: { sizePt: 10.25, bold: true, italic: true },
    },
  }, defaults);
  const resolved = resolveTokenStyle(defaults, patched);

  assert.equal(resolved.layers.source.fontFamily, "Source Face");
  assert.equal(resolved.layers.source.sizePt, 30);
  assert.equal(resolved.layers.gloss.color, "#111111");
  assert.equal(resolved.layers.gloss.bold, false);
  assert.equal(resolved.layers.lemma.italic, false);
  assert.equal(resolved.layers.lemma.underline, true);
  assert.equal(resolved.layers.pos.fontFamily, "POS Face");
  assert.equal(resolved.layers.pos.color, "#2468ac");
  assert.equal(resolved.layers.morphology.sizePt, 10.5);
  assert.equal(resolved.layers.morphology.bold, true);
  assert.equal(resolved.layers.morphology.italic, true);
});

test("bulk patch and clear preserve IDs, order, and unselected object identity", async () => {
  const project = await fixture(fixtureFiles[1]);
  const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
  const first = { ...project.document.analysis.tokens[0], wordColor: "#123456" };
  const second = project.document.analysis.tokens[1];
  const third = project.document.analysis.tokens[2];
  const input = [first, second, third];

  const patched = patchSelectedTokenStyles(input, [first.id, third.id], {
    layers: {
      gloss: { fontFamily: "Imported User Font", sizePt: 12.26, underline: true },
      source: { color: defaults.layers.source.color },
    },
  }, defaults);

  assert.deepEqual(patched.map(({ id }) => id), input.map(({ id }) => id));
  assert.notEqual(patched[0], first);
  assert.equal(patched[1], second);
  assert.notEqual(patched[2], third);
  assert.equal(patched[0].wordColor, undefined);
  assert.deepEqual(patched[0].styleOverrides, {
    layers: {
      gloss: { fontFamily: "Imported User Font", sizePt: 12.5, underline: true },
    },
  });
  assert.deepEqual(patched[2].styleOverrides, {
    layers: {
      gloss: { fontFamily: "Imported User Font", sizePt: 12.5, underline: true },
    },
  });

  const cleared = clearSelectedTokenStyles(patched, [first.id, third.id]);
  assert.deepEqual(cleared.map(({ id }) => id), input.map(({ id }) => id));
  assert.equal(cleared[1], second);
  assert.equal(cleared[0].wordColor, undefined);
  assert.equal(cleared[0].styleOverrides, undefined);
  assert.equal(cleared[2].styleOverrides, undefined);
});

test("every canonical Greek and Latin token resolves without mutation", async () => {
  for (const filename of fixtureFiles) {
    const project = await fixture(filename);
    const defaults = deriveDocumentTokenStyleDefaults(project.document.settings);
    const tokens = project.document.analysis.tokens;
    const originalIds = tokens.map(({ id }) => id);

    for (const token of tokens) {
      const resolved = resolveTokenStyle(defaults, token);
      assert.equal(resolved.layers.source.sizePt, project.document.settings.greekSize);
      assert.equal(resolved.layers.gloss.sizePt, project.document.settings.glossSize);
      assert.equal(resolved.layers.lemma.sizePt, project.document.settings.lemmaSize);
      assert.equal(resolved.layers.pos.sizePt, project.document.settings.posSize);
      assert.equal(resolved.layers.morphology.sizePt, project.document.settings.morphSize);
    }
    assert.deepEqual(tokens.map(({ id }) => id), originalIds);
    assert.ok(tokens.every((token) => token.styleOverrides === undefined));
  }
});
