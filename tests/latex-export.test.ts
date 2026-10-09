import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildStoaLatex,
  type LatexInterlinearAnalysis,
  type LatexInterlinearSettings,
  type LatexInterlinearToken,
} from "../app/lib/latex-export.ts";
import {
  deriveDocumentTokenStyleDefaults,
  type DocumentTokenStyle,
} from "../app/lib/token-style.ts";
import { CLASSICAL_CHINESE_BUILTIN_FONTS } from "../app/lib/classical-chinese-fonts.ts";
import {
  analysisNoteDestination,
  tokenNoteDestination,
} from "../app/lib/analysis-notes.ts";

type CanonicalProject = {
  document: {
    language: "ancient-greek" | "latin";
    analysis: LatexInterlinearAnalysis;
    settings: LatexInterlinearSettings;
  };
};

const fixtureFiles = [
  "stoa-ancient-greek-20260819-184926.stoa.json",
  "stoa-latin-20260819-191723.stoa.json",
] as const;

const fixture = async (filename: (typeof fixtureFiles)[number]) => JSON.parse(await readFile(
  new URL(`./fixtures/canonical/${filename}`, import.meta.url),
  "utf8",
)) as CanonicalProject;

const clone = <Value>(value: Value): Value => structuredClone(value);

const tokenBlock = (latex: string, uniqueText: string) => {
  const textIndex = latex.indexOf(uniqueText);
  assert.notEqual(textIndex, -1, `missing token text ${JSON.stringify(uniqueText)}`);
  const start = latex.lastIndexOf("\\begin{tabular}", textIndex);
  const end = latex.indexOf("\\end{tabular}", textIndex);
  assert.notEqual(start, -1, "token must start with a tabular block");
  assert.notEqual(end, -1, "token must end with a tabular block");
  return latex.slice(start, end + "\\end{tabular}".length);
};

const assertInOrder = (haystack: string, values: string[]) => {
  let previous = -1;
  for (const value of values) {
    const index = haystack.indexOf(value, previous + 1);
    assert.ok(index > previous, `${JSON.stringify(value)} must follow the previous token layer`);
    previous = index;
  }
};

const distinctCanonicalToken = (
  project: CanonicalProject,
): LatexInterlinearToken => {
  const token = project.document.analysis.tokens.find((candidate) =>
    candidate.surface !== candidate.lemma
    && candidate.gloss !== candidate.lemma
    && candidate.pos
    && candidate.morphology,
  );
  assert.ok(token, "canonical fixture must contain a token with five distinguishable layers");
  return token;
};

test("canonical Greek and Latin projects export all five token layers in semantic order", async () => {
  for (const filename of fixtureFiles) {
    const project = await fixture(filename);
    const token = distinctCanonicalToken(project);
    const settings = {
      ...project.document.settings,
      showLemma: true,
      showPos: true,
      hideIndeclinableDetails: false,
    };
    const latex = buildStoaLatex({ tokens: [token] }, settings);
    const block = tokenBlock(latex, token.surface);

    assertInOrder(block, [
      token.surface,
      token.gloss,
      token.lemma,
      token.pos.toUpperCase(),
      token.morphology,
    ]);
    assert.equal((block.match(/\\\\\[/g) ?? []).length, 4);
    assert.match(latex, /^\\documentclass\[12pt\]\{article\}/);
    assert.match(latex, /\\usepackage\{fontspec\}/);
    assert.match(latex, /\\begin\{document\}[\s\S]*\\end\{document\}\s*$/);
  }
});

test("LaTeX appends literal then idiomatic translation sections with Preview typography", async () => {
  const project = await fixture(fixtureFiles[0]);
  const token = distinctCanonicalToken(project);
  const literal = "word-for-word & structurally close";
  const natural = "Clear, idiomatic English for the reader.";
  const latex = buildStoaLatex({
    tokens: [token],
    literalTranslation: literal,
    naturalTranslation: natural,
  }, {
    ...project.document.settings,
    translationSize: 13.5,
    showTranslation: true,
    englishFont: "Times New Roman",
    accent: "#a3482f",
  });

  assertInOrder(latex, [
    token.surface,
    "LITERAL ENGLISH TRANSLATION",
    "word-for-word \\& structurally close",
    "IDIOMATIC ENGLISH TRANSLATION",
    natural,
  ]);
  assert.match(latex, /\\definecolor\{Accent\}\{HTML\}\{A3482F\}/u);
  assert.match(latex, /\\newfontfamily\\NoteFont\{Times New Roman\}/u);
  assert.equal((latex.match(/\\fontsize\{13\.5\}\{20\.9\}\\selectfont\\mdseries\\itshape/g) ?? []).length, 2);
  assert.equal((latex.match(/\\fontsize\{8\}\{10\}\\selectfont\\bfseries\\addfontfeatures\{LetterSpace=15\}/g) ?? []).length, 2);
  const translationTail = latex.slice(latex.indexOf("LITERAL ENGLISH TRANSLATION"));
  assert.doesNotMatch(translationTail, /\\begin\{(?:minipage|tabular)\}/u);
});

test("LaTeX translation visibility hides both sections without affecting token layers", async () => {
  const project = await fixture(fixtureFiles[1]);
  const token = distinctCanonicalToken(project);
  const latex = buildStoaLatex({
    tokens: [token],
    literalTranslation: "HIDDEN-LITERAL",
    naturalTranslation: "HIDDEN-IDIOMATIC",
  }, {
    ...project.document.settings,
    showTranslation: false,
  });

  assert.ok(latex.includes(token.surface));
  assert.doesNotMatch(latex, /HIDDEN-(?:LITERAL|IDIOMATIC)/u);
  assert.doesNotMatch(latex, /(?:LITERAL|IDIOMATIC) ENGLISH TRANSLATION/u);
});

test("LaTeX places scholarly Analysis Notes before translations with bidirectional token links", async () => {
  const project = await fixture(fixtureFiles[0]);
  const token: LatexInterlinearToken = {
    ...distinctCanonicalToken(project),
    id: "tok-note-anchor",
  };
  const latex = buildStoaLatex({
    language: "ancient-greek",
    tokens: [token],
    notes: [{
      id: "note-a",
      tokenId: token.id,
      text: "A concise scholarly note with an ampersand & a second line.\nContinuation.",
    }],
    literalTranslation: "Literal follows notes.",
    naturalTranslation: "Idiomatic follows literal.",
  }, {
    ...project.document.settings,
    showNotes: true,
    showNoteMarkers: true,
    showTranslation: true,
  });

  assertInOrder(latex, [
    token.surface,
    "ANALYSIS NOTES",
    "A concise scholarly note with an ampersand \\& a second line.",
    "LITERAL ENGLISH TRANSLATION",
    "IDIOMATIC ENGLISH TRANSLATION",
  ]);
  const noteDestination = analysisNoteDestination("note-a");
  const tokenDestination = tokenNoteDestination(token.id);
  assert.match(latex, /\\usepackage\[hidelinks\]\{hyperref\}/u);
  assert.ok(latex.includes(`\\hypertarget{${tokenDestination}}{}`));
  assert.ok(latex.includes(`\\raisebox{0.55em}{\\hyperlink{${noteDestination}}{1}}`));
  assert.ok(latex.includes(
    `\\StoaAnchoredAnalysisNote{${noteDestination}}{${tokenDestination}}{1}`,
  ));
  assert.match(latex, /\\hyperlink\{#2\}\{\\textsuperscript\{#3\}\}/u);
  assert.match(latex, /\\hangindent=2\.15em\\hangafter=1/u);
  assert.match(latex, /\\linebreak\{\}\nContinuation\./u);
  assert.match(latex, /\\usepackage\{needspace\}/u);
  assert.match(latex, /\\Needspace\{\d+(?:\.\d+)?pt\}\\vspace\{22\.50pt\}/u);
  assert.ok(latex.indexOf("\\Needspace{") < latex.indexOf("ANALYSIS NOTES"));
  const notesTail = latex.slice(latex.indexOf("ANALYSIS NOTES"));
  assert.doesNotMatch(notesTail.slice(0, notesTail.indexOf("LITERAL ENGLISH TRANSLATION")), /\\begin\{(?:minipage|tabular)\}/u);
});

test("LaTeX Notes and note markers retain independent visibility controls", async () => {
  const project = await fixture(fixtureFiles[1]);
  const token: LatexInterlinearToken = {
    ...distinctCanonicalToken(project),
    id: "tok-independent-toggle",
  };
  const analysis: LatexInterlinearAnalysis = {
    language: "latin",
    tokens: [token],
    notes: [{ id: "note-toggle", tokenId: token.id, text: "TOGGLE-NOTE-CONTENT" }],
  };

  const markerOnly = buildStoaLatex(analysis, {
    ...project.document.settings,
    showNotes: false,
    showNoteMarkers: true,
  });
  assert.doesNotMatch(markerOnly, /TOGGLE-NOTE-CONTENT|ANALYSIS NOTES/u);
  assert.match(markerOnly, /\\raisebox\{0\.55em\}\{1\}/u);
  assert.doesNotMatch(markerOnly, new RegExp(
    `${analysisNoteDestination("note-toggle")}|\\\\usepackage\\[hidelinks\\]\\{hyperref\\}`,
    "u",
  ));

  const notesOnly = buildStoaLatex(analysis, {
    ...project.document.settings,
    showNotes: true,
    showNoteMarkers: false,
  });
  assert.match(notesOnly, /TOGGLE-NOTE-CONTENT/u);
  assert.doesNotMatch(notesOnly, new RegExp(
    `\\\\hyperlink\\{${analysisNoteDestination("note-toggle")}\\}`,
    "u",
  ));
  assert.ok(notesOnly.includes(
    `\\StoaAnchoredAnalysisNote{${analysisNoteDestination("note-toggle")}}{${tokenNoteDestination(token.id)}}{1}`,
  ));
});

test("LaTeX keeps Analysis Notes disabled for OMNI", async () => {
  const project = await fixture(fixtureFiles[1]);
  const token: LatexInterlinearToken = {
    ...distinctCanonicalToken(project),
    id: "omni-token",
  };
  const latex = buildStoaLatex({
    language: "omni",
    tokens: [token],
    notes: [{ id: "omni-note", tokenId: token.id, text: "OMNI-NOTE-MUST-STAY-HIDDEN" }],
  }, {
    ...project.document.settings,
    showNotes: true,
    showNoteMarkers: true,
  });

  assert.doesNotMatch(latex, /OMNI-NOTE-MUST-STAY-HIDDEN|ANALYSIS NOTES|stoa-analysis-note/u);
  assert.doesNotMatch(latex, /\\usepackage\[hidelinks\]\{hyperref\}/u);
});

test("LaTeX preserves explicit translation line breaks and annotation target labels", async () => {
  const project = await fixture(fixtureFiles[1]);
  const latex = buildStoaLatex({
    tokens: [],
    literalTranslation: "第一行\n\n第二行",
    naturalTranslation: "自然译文",
  }, {
    ...project.document.settings,
    annotationTarget: "chinese",
    showTranslation: true,
  });

  assertInOrder(latex, [
    "LITERAL CHINESE TRANSLATION",
    "第一行\\par\n\\mbox{}\\par\n第二行",
    "IDIOMATIC CHINESE TRANSLATION",
    "自然译文",
  ]);
  assert.match(latex, /\\usepackage\{xeCJK\}/u);
});

test("sparse per-token overrides preserve inherited values and export independent layer styling", async () => {
  const project = await fixture(fixtureFiles[1]);
  const settings = clone(project.document.settings);
  const defaults = deriveDocumentTokenStyleDefaults(settings);
  const token: LatexInterlinearToken = {
    id: "styled-token",
    surface: "SOURCE",
    punctuationBefore: "(",
    punctuationAfter: ")",
    gloss: "GLOSS",
    lemma: "LEMMA",
    pos: "noun",
    morphology: "MORPHOLOGY",
    styleOverrides: {
      layers: {
        source: { sizePt: 33.5, color: "#123456", italic: true },
        gloss: { fontFamily: "Georgia", underline: true },
        lemma: { bold: true, italic: false },
        pos: { color: "#abcdef", bold: false },
        morphology: { underline: true },
      },
      gapAfterPx: { source: 12.5, gloss: 7.5, lemma: 2, pos: 4 },
    },
  };
  const latex = buildStoaLatex({ tokens: [token] }, {
    ...settings,
    showLemma: true,
    showPos: true,
    hideIndeclinableDetails: false,
  });
  const block = tokenBlock(latex, "(SOURCE)");

  assertInOrder(block, ["(SOURCE)", "GLOSS", "LEMMA", "NOUN", "MORPHOLOGY"]);
  assert.match(block, /\\fontspec\{Times New Roman\}\\fontsize\{33\.5\}\{39\.5\}\\selectfont\\color\[HTML\]\{123456\}\\itshape\\shortstack\{\(SOURCE\)\}/);
  assert.match(block, /\\fontspec\{TeX Gyre Schola\}[^\n]*\\bfseries[^\n]*\\underline\{GLOSS\}/);
  assert.match(block, /\\fontsize\{12\}\{14\.4\}\\selectfont[^\n]*\\bfseries[^\n]*LEMMA/);
  assert.match(block, /\\color\[HTML\]\{ABCDEF\}\\shortstack\{NOUN\}/);
  assert.match(block, /\\underline\{MORPHOLOGY\}/);

  // A sparse override must not erase inherited document properties.
  assert.ok(block.includes(`\\fontsize{${defaults.layers.gloss.sizePt}}`));
  assert.ok(block.includes("\\[9.38pt]"));
  assert.ok(block.includes("\\[5.63pt]"));
  assert.ok(block.includes("\\[1.50pt]"));
  assert.ok(block.includes("\\[3.00pt]"));
});

test("hidden layers contribute neither content nor ghost vertical gaps", async () => {
  const project = await fixture(fixtureFiles[0]);
  const settings = clone(project.document.settings);
  const tokenStyle: DocumentTokenStyle = deriveDocumentTokenStyleDefaults(settings);
  tokenStyle.gapAfterPx = { source: 11, gloss: 12, lemma: 13, pos: 14 };
  const token: LatexInterlinearToken = {
    id: "visibility-token",
    surface: "SOURCE-VISIBLE",
    gloss: "GLOSS-VISIBLE",
    lemma: "LEMMA-HIDDEN",
    pos: "NOUN-HIDDEN",
    morphology: "MORPH-VISIBLE",
  };
  const latex = buildStoaLatex({ tokens: [token] }, {
    ...settings,
    tokenStyle,
    showLemma: false,
    showPos: false,
    hideIndeclinableDetails: false,
  });
  const block = tokenBlock(latex, token.surface);

  assertInOrder(block, ["SOURCE-VISIBLE", "GLOSS-VISIBLE", "MORPH-VISIBLE"]);
  assert.ok(!block.includes("LEMMA-HIDDEN"));
  assert.ok(!block.includes("NOUN-HIDDEN"));
  assert.deepEqual(block.match(/\\\\\[[^\]]+\]/g), ["\\\\[8.25pt]", "\\\\[9.00pt]"]);
  assert.ok(!block.includes("9.75pt"), "hidden lemma gap must not be emitted");
  assert.ok(!block.includes("10.50pt"), "hidden POS gap must not be emitted");

  const indeclinable = { ...token, id: "indeclinable", pos: "ADV" };
  const detailsHidden = buildStoaLatex({ tokens: [indeclinable] }, {
    ...settings,
    tokenStyle,
    showLemma: true,
    showPos: true,
    hideIndeclinableDetails: true,
  });
  const indeclinableBlock = tokenBlock(detailsHidden, token.surface);
  assert.ok(!indeclinableBlock.includes("MORPH-VISIBLE"));
  assert.deepEqual(indeclinableBlock.match(/\\\\\[[^\]]+\]/g), ["\\\\[8.25pt]"]);
});

test("legacy flat styles and equivalent nested overrides produce identical LaTeX", async () => {
  for (const filename of fixtureFiles) {
    const project = await fixture(filename);
    const base = distinctCanonicalToken(project);
    const settings = {
      ...project.document.settings,
      showLemma: true,
      showPos: true,
      hideIndeclinableDetails: false,
    };
    const legacy: LatexInterlinearToken = {
      ...base,
      id: "compatibility-token",
      wordFont: "Georgia",
      wordSize: 31.5,
      wordColor: "#123456",
      wordBold: true,
      wordItalic: true,
      wordUnderline: true,
      lemmaColor: "#654321",
      lemmaUnderline: true,
      morphColor: "#abcdef",
      morphUnderline: true,
    };
    const nested: LatexInterlinearToken = {
      ...base,
      id: "compatibility-token",
      styleOverrides: {
        layers: {
          source: {
            fontFamily: "Georgia",
            sizePt: 31.5,
            color: "#123456",
            bold: true,
            italic: true,
            underline: true,
          },
          lemma: { color: "#654321", underline: true },
          morphology: { color: "#abcdef", underline: true },
        },
      },
    };

    assert.equal(
      buildStoaLatex({ tokens: [nested] }, settings),
      buildStoaLatex({ tokens: [legacy] }, settings),
      `${filename} must preserve pre-5.1 token styling semantics`,
    );
  }
});

test("paragraph controls remain independent from token-layer gaps", async () => {
  const project = await fixture(fixtureFiles[1]);
  const token: LatexInterlinearToken = {
    ...project.document.analysis.tokens[1],
    id: "paragraph-token",
    breakAfter: "paragraph",
    blankLinesAfter: 3,
    blankLineSpacing: 20,
    styleOverrides: { gapAfterPx: { source: 16 } },
  };
  const latex = buildStoaLatex({ tokens: [token] }, {
    ...project.document.settings,
    showLemma: true,
    showPos: true,
    hideIndeclinableDetails: false,
  });
  const block = tokenBlock(latex, token.surface);

  assert.ok(block.includes("\\[12.00pt]"), "source-layer gap uses px-to-pt conversion");
  assert.ok(latex.includes("\\par\\vspace{45.00pt}\\noindent"), "paragraph blank lines use their own spacing");
});

test("empty annotation values behave as hidden layers without ghost gaps", async () => {
  const project = await fixture(fixtureFiles[1]);
  const token: LatexInterlinearToken = {
    ...project.document.analysis.tokens[1],
    id: "empty-layer-token",
    lemma: "",
    pos: "",
    styleOverrides: { gapAfterPx: { lemma: 48, pos: 48 } },
  };
  const latex = buildStoaLatex({ tokens: [token] }, {
    ...project.document.settings,
    showLemma: true,
    showPos: true,
    hideIndeclinableDetails: false,
  });
  const block = tokenBlock(latex, token.surface);
  assertInOrder(block, [token.surface, token.gloss, token.morphology]);
  assert.equal((block.match(/\\\\\[/g) ?? []).length, 2);
  assert.ok(!block.includes("36.00pt"), "empty Lemma/POS layers must not emit their 48px gaps");
});

test("LaTeX names required device-local font files without embedding licensed bytes", async () => {
  const project = await fixture(fixtureFiles[1]);
  const settings = clone(project.document.settings);
  const cssFamily = "'STOAUser-0123456789abcdef'";
  const tokenStyle = deriveDocumentTokenStyleDefaults(settings);
  tokenStyle.layers.source = {
    ...tokenStyle.layers.source,
    fontFamily: cssFamily,
    bold: false,
    italic: false,
  };
  const latex = buildStoaLatex({ tokens: [project.document.analysis.tokens[0]] }, {
    ...settings,
    tokenStyle,
    fontReferences: [{
      id: "user-font-0123456789abcdef01234567",
      familyId: "user-family-0123456789abcdef0123",
      familyName: "Scholarly Serif",
      subfamilyName: "Regular",
      postscriptName: "ScholarlySerif-Regular",
      cssFamily,
      filename: "Scholarly Serif.ttf",
      sha256: "0123456789abcdef".repeat(4),
      format: "ttf",
      faceStyle: "normal",
      byteLength: 456789,
    }],
  });
  assert.match(latex, /User fonts are not embedded for licensing reasons/u);
  assert.match(latex, /Scholarly Serif\.ttf \(Scholarly Serif Regular\)/u);
  assert.match(latex, /\\fontspec\[Path=\.\/\]\{\\detokenize\{Scholarly Serif\.ttf\}\}/u);
  assert.doesNotMatch(latex, /fontBytes|data:font/u);
});

test("all six built-in Classical Chinese families export portable XeLaTeX font paths and face semantics", async () => {
  const project = await fixture(fixtureFiles[1]);
  for (const font of CLASSICAL_CHINESE_BUILTIN_FONTS) {
    const settings = clone(project.document.settings);
    const tokenStyle = deriveDocumentTokenStyleDefaults(settings);
    for (const layer of Object.values(tokenStyle.layers)) layer.fontFamily = font.cssFamily;
    tokenStyle.layers.source.bold = true;
    tokenStyle.layers.source.italic = true;
    const latex = buildStoaLatex({
      tokens: [{
        id: font.id,
        surface: "學",
        punctuationAfter: "。",
        gloss: "study",
        lemma: "學",
        pos: "VERB",
        morphology: "謂語",
      }],
    }, {
      ...settings,
      tokenStyle,
      greekFont: font.cssFamily,
      lemmaFont: font.cssFamily,
      morphFont: font.cssFamily,
      showLemma: true,
      showPos: true,
      hideIndeclinableDetails: false,
    });
    const normalFilename = font.faces.normal.split("/").at(-1) as string;
    const emphasizedFilename = (font.faces.bold ?? font.faces.normal).split("/").at(-1) as string;
    assert.ok(latex.includes("\\setCJKmainfont[Path=./fonts/"));
    assert.ok(latex.includes(`]{${normalFilename}}`));
    assert.ok(latex.includes("\\xeCJKenablefallback"));
    assert.ok(latex.includes("\\XeTeXgenerateactualtext=1"));
    assert.ok(latex.includes(`% - ${normalFilename}`));
    assert.ok(latex.includes(`]{${emphasizedFilename}}\\CJKfontspec[`));
    assert.ok(latex.includes(`]{${emphasizedFilename}}\\fontsize`));
    assert.ok(latex.includes("FakeSlant=0.2"));
    const sourceRow = tokenBlock(latex, "學。").split("\n")[1] ?? "";
    const primaryFontOptions = sourceRow.match(/\\fontspec\[([^\]]*)\]/u)?.[1] ?? "";
    if (font.faces.bold) {
      assert.ok(latex.includes(`% - ${font.faces.bold.split("/").at(-1)}`));
      assert.equal(primaryFontOptions.includes("FakeBold=2"), false);
    } else {
      assert.equal(primaryFontOptions.includes("FakeBold=2"), true);
    }
    if (font.id !== "bundled:source-han-serif-sc") {
      assert.match(latex, /FallBack=\{ \[Path=\.\/fonts\/[^\]]*\]SourceHanSerifSC-Regular\.otf \}/u);
      assert.match(latex, /% - SourceHanSerifSC-Regular\.otf/u);
    }
    assert.doesNotMatch(latex, /\\setCJKmainfont\{Noto Sans CJK SC\}/u);
  }
});
