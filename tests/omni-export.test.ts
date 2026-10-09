import assert from "node:assert/strict";
import test from "node:test";

import {
  OMNI_DETECTABLE_SOURCE_SCRIPTS,
  OMNI_PAGE_DEFAULT_EXPORT_COVERAGE,
  OMNI_RASTER_STATUS,
  OMNI_VECTOR_STATUS,
  OmniExportPreflightError,
  assertOmniExportSupported,
  getOmniExportCapabilities,
  getOmniExportCapability,
  inspectOmniSourceCoverage,
  preflightOmniPdf,
  type OmniExportFontUse,
  type OmniExportPreflightInput,
} from "../app/lib/omni-export.ts";

const notoFont = (renderedText: string): OmniExportFontUse => ({
  cssFamily: "'Noto Serif STOA', 'Times New Roman', Times, serif",
  source: "bundled",
  available: true,
  embeddable: true,
  coverageKnown: true,
  coverageId: "noto-serif-stoa-unicode",
  renderedText,
});

const richVectorInput = (sourceText = "Der Mann ist nicht hier. λόγος мир."): OmniExportPreflightInput => ({
  sourceText,
  renderedText: `${sourceText}\nword lemma NOUN Nom. Sg.`,
  direction: "ltr",
  writingMode: "horizontal-tb",
  analysisProfile: "rich-inflectional",
  layoutParityVerified: true,
  fontUses: [notoFont(`${sourceText}\nword lemma NOUN Nom. Sg.`)],
});

test("audited bundled European Unicode fonts pass deterministic vector preflight", () => {
  assert.deepEqual(OMNI_PAGE_DEFAULT_EXPORT_COVERAGE, [
    "noto-serif-stoa-unicode",
    "liberation-sans-stoa-unicode",
    "vusillus-greek",
  ]);
  assert.deepEqual(OMNI_DETECTABLE_SOURCE_SCRIPTS.slice(0, 3), ["latin", "greek", "cyrillic"]);

  const input = richVectorInput("Zażółć gęślą jaźń. λόγος. Київ.");
  const coverage = inspectOmniSourceCoverage(input.renderedText ?? "");
  assert.equal(coverage.supported, true);
  assert.deepEqual(coverage.scripts, ["latin", "greek", "cyrillic"]);

  const preflight = preflightOmniPdf(input);
  assert.deepEqual(preflight, {
    outputType: "vector",
    status: OMNI_VECTOR_STATUS,
    vectorSafe: true,
    reasons: [],
  });
});

test("Rich Inflectional Mode exposes project, Unicode LaTeX, PDF and PDF-derived PNG", () => {
  const capabilities = getOmniExportCapabilities(richVectorInput());
  assert.deepEqual(capabilities.project, { format: "project", supported: true });
  assert.deepEqual(capabilities.latex, { format: "latex", supported: true });
  assert.equal(capabilities.pdf.supported, true);
  assert.equal(capabilities.png.supported, true);
  if (capabilities.pdf.supported && capabilities.png.supported) {
    assert.equal(capabilities.pdf.pdf?.outputType, "vector");
    assert.equal(capabilities.png.derivedFrom, "pdf");
    assert.deepEqual(capabilities.png.pdf, capabilities.pdf.pdf);
  }
  assert.doesNotThrow(() => assertOmniExportSupported("project", richVectorInput()));
});

test("Generic Mode supports Project, PDF and PDF-derived PNG while keeping LaTeX profile-gated", () => {
  const input: OmniExportPreflightInput = {
    ...richVectorInput("plain generic text"),
    analysisProfile: "generic",
  };
  const capabilities = getOmniExportCapabilities(input);
  assert.deepEqual(capabilities.project, { format: "project", supported: true });
  assert.equal(capabilities.pdf.supported, true);
  assert.equal(capabilities.png.supported, true);
  if (capabilities.pdf.supported && capabilities.png.supported) {
    assert.equal(capabilities.png.derivedFrom, "pdf");
    assert.deepEqual(capabilities.png.pdf, capabilities.pdf.pdf);
  }
  for (const format of ["project", "pdf", "png"] as const) {
    assert.doesNotThrow(() => assertOmniExportSupported(format, input));
  }
  const latex = capabilities.latex;
  assert.equal(latex.supported, false);
  if (!latex.supported) {
    assert.equal(latex.reason.code, "generic-mode-policy");
    assert.equal(latex.reason.format, "latex");
  }
  assert.throws(
    () => assertOmniExportSupported("latex", input),
    (error) => error instanceof OmniExportPreflightError
      && error.format === "latex"
      && error.reason.code === "generic-mode-policy",
  );
});

test("RTL, vertical, complex shaping, emoji and bidi content automatically route to raster PDF", () => {
  const cases: Array<readonly [OmniExportPreflightInput, string]> = [
    [{ ...richVectorInput("שלום"), direction: "rtl" }, "rtl-or-bidi"],
    [{ ...richVectorInput("縦書き"), writingMode: "vertical-rl" }, "vertical-writing"],
    [{ ...richVectorInput("السلام"), direction: "rtl" }, "complex-shaping"],
    [richVectorInput("Text 😀"), "emoji-or-color-glyph"],
    [richVectorInput(`left\u2067שלום\u2069`), "rtl-or-bidi"],
  ];
  for (const [input, expectedReason] of cases) {
    const capability = getOmniExportCapability("pdf", input);
    assert.equal(capability.supported, true, "PDF remains one-click available");
    if (!capability.supported) continue;
    assert.equal(capability.pdf?.outputType, "raster");
    assert.equal(capability.pdf?.status, OMNI_RASTER_STATUS);
    assert.ok(capability.pdf?.reasons.some((reason) => reason.code === expectedReason));
  }
});

test("unsupported code points and unknown font provenance force raster without corrupting a vector PDF first", () => {
  const unknownFont: OmniExportFontUse = {
    cssFamily: "Mystery Font",
    source: "unknown",
    available: true,
    embeddable: "unknown",
    coverageKnown: false,
    renderedText: "తెలుగు",
  };
  const input: OmniExportPreflightInput = {
    sourceText: "తెలుగు",
    renderedText: "తెలుగు",
    direction: "ltr",
    writingMode: "horizontal-tb",
    analysisProfile: "rich-inflectional",
    fontUses: [unknownFont],
  };
  const coverage = inspectOmniSourceCoverage(input.sourceText);
  assert.equal(coverage.supported, false);
  assert.ok(coverage.unsupportedCodePoints.includes("U+0C24"));
  const pdf = getOmniExportCapability("pdf", input);
  assert.equal(pdf.supported, true);
  if (pdf.supported) {
    assert.equal(pdf.pdf?.outputType, "raster");
    assert.ok(pdf.pdf?.reasons.some((reason) => reason.code === "unsupported-code-point"));
    assert.ok(pdf.pdf?.reasons.some((reason) => reason.code === "font-substitution"));
  }
});

test("system and user fonts are conservative while a missing exact font blocks publication exports", () => {
  for (const fontUse of [
    {
      cssFamily: "Times New Roman",
      source: "system",
      available: true,
      embeddable: "unknown",
      coverageKnown: false,
      renderedText: "German text",
    },
    {
      cssFamily: "Imported Scholar",
      source: "user",
      available: true,
      embeddable: "unknown",
      coverageKnown: false,
      renderedText: "German text",
    },
  ] satisfies OmniExportFontUse[]) {
    const pdf = getOmniExportCapability("pdf", {
      ...richVectorInput("German text"),
      fontUses: [fontUse],
    });
    assert.equal(pdf.supported, true);
    if (pdf.supported) assert.equal(pdf.pdf?.outputType, "raster");
  }

  const missingFontInput: OmniExportPreflightInput = {
    ...richVectorInput("German text"),
    fontUses: [{
      cssFamily: "Missing Imported Scholar",
      source: "user",
      available: false,
      embeddable: "unknown",
      coverageKnown: false,
      renderedText: "German text",
    }],
  };
  assert.equal(getOmniExportCapability("project", missingFontInput).supported, true);
  for (const format of ["pdf", "png", "latex"] as const) {
    const capability = getOmniExportCapability(format, missingFontInput);
    assert.equal(capability.supported, false);
    if (!capability.supported) assert.equal(capability.reason.code, "font-unavailable");
  }
});

test("Serbian Latin and Cyrillic, Modern Greek combining marks, and Latin Extended remain vector-safe", () => {
  for (const sourceText of [
    "Srpski jezik i latinica.",
    "Српски језик и ћирилица.",
    "λόγος καί α̈.",
    "þðæö ąćęłńśźż ăâîșț l·l œ ë ç",
  ]) {
    assert.equal(preflightOmniPdf(richVectorInput(sourceText)).outputType, "vector", sourceText);
  }
});

test("PNG capability carries the exact final PDF route", () => {
  for (const input of [
    richVectorInput("Der Mann ist hier."),
    { ...richVectorInput("plain generic text"), analysisProfile: "generic" as const },
    { ...richVectorInput("שלום"), direction: "rtl" as const },
    richVectorInput("Text 😀"),
  ]) {
    const pdf = getOmniExportCapability("pdf", input);
    const png = getOmniExportCapability("png", input);
    assert.equal(pdf.supported, true);
    assert.equal(png.supported, true);
    if (pdf.supported && png.supported) {
      assert.equal(png.derivedFrom, "pdf");
      assert.deepEqual(png.pdf, pdf.pdf);
    }
  }
});

test("uncertain layout forces raster while complete Liberation covers Latin Extended", () => {
  const uncertainLayout = preflightOmniPdf({
    ...richVectorInput("Der Mann."),
    layoutParityVerified: false,
  });
  assert.equal(uncertainLayout.outputType, "raster");
  assert.ok(uncertainLayout.reasons.some((reason) => reason.code === "font-substitution"));

  const missingRenderedText = preflightOmniPdf({
    ...richVectorInput("Der Mann."),
    fontUses: [{ ...notoFont("Der Mann."), renderedText: undefined }],
  });
  assert.equal(missingRenderedText.outputType, "raster");

  const liberationMacronY = preflightOmniPdf({
    ...richVectorInput("ȳ"),
    renderedText: "ȳ",
    fontUses: [{
      cssFamily: "'Liberation Sans STOA', Arial, sans-serif",
      source: "bundled",
      available: true,
      embeddable: true,
      coverageKnown: true,
      coverageId: "liberation-sans-stoa-unicode",
      renderedText: "ȳ",
    }],
  });
  assert.equal(liberationMacronY.outputType, "vector", "The full Liberation font now includes macron y");
  assert.equal(liberationMacronY.reasons.length, 0);
});
