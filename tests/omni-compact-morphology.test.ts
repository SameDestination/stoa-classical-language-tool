import assert from "node:assert/strict";
import test from "node:test";
import { buildOmniAnalysisPrompts, buildOmniSystemPrompt } from "../app/lib/omni-language.ts";
import { OMNI_COMPACT_MODERN_MORPHOLOGY_PROMPT as rule } from "../app/lib/omni-compact-morphology.ts";
import { getOmniLanguageProfile, buildCompactOmniMorphologyProfilePrompt } from "../app/lib/omni-language-profiles.ts";

test("first-pass automatic detection receives the five-language conditional rule", () => {
  for (const source of ["Hablamos español.", "Nous parlons français.", "Wir sprechen Deutsch.", "Parliamo italiano.", "Falamos português."]) {
    const result = buildOmniAnalysisPrompts(source);
    assert.ok(result.systemPrompt.includes(rule));
    assert.match(result.systemPrompt, /ONLY when your analysis identifies/);
    assert.match(result.systemPrompt, /1S; 2S; 3S; 1P; 2P; 3P/);
    assert.match(result.systemPrompt, /PersonNumber Tense Voice Mood/);
    assert.match(result.systemPrompt, /not an explanation/);
    assert.match(result.systemPrompt, /in features, and unresolved alternatives in alternatives/);
    const data = JSON.parse(result.userPrompt.slice(result.userPrompt.indexOf("{")));
    assert.equal(data.sourceText, source);
    assert.equal(data.mode, "model-full");
    assert.equal(data.targetTokens, undefined);
  }
});

test("scope includes all five languages and regional variants, not the entire Romance family", () => {
  for (const name of ["Spanish (es/spa)", "French (fr/fra/fre)", "German (de/deu/ger)", "Italian (it/ita)", "Portuguese (pt/por)", "es-MX", "fr-CA", "pt-BR"]) assert.ok(rule.includes(name));
  assert.match(rule, /For every other language keep the existing language-profile or Generic morphology scheme unchanged/);
  assert.match(rule, /For uncertain or mixed-language input, retain the existing Generic policy/);
  assert.match(rule, /Never invent Latin Abl\., Voc\., Loc\./);
  assert.match(rule, /Never shorten gloss, lemma, romanization, translation or source text/);
});

test("existing non-target profiles and non-Latin reading aids remain in effect", () => {
  for (const [id, name, script, source] of [
    ["ru", "Russian", "Cyrl", "Он не здесь, но она в доме."],
    ["ro", "Romanian", "Latn", "El este aici și nu vorbește."],
    ["ca", "Catalan", "Latn", "El home és aquí i no parla."],
  ] as const) {
    const profile = getOmniLanguageProfile(id)!;
    assert.ok(profile);
    const prompt = buildOmniSystemPrompt({ sourceText: source, document: {
      languageDetection: { schemaVersion: 1, languageId: id, languageName: name, script, confidence: 0.99, isMixedLanguage: false },
    } });
    assert.ok(prompt.includes(buildCompactOmniMorphologyProfilePrompt(profile)));
    if (id === "ru") {
      assert.match(prompt, /ROMANIZATION IS REQUIRED/);
      assert.ok(!prompt.includes(rule), "non-Latin prompts are unchanged, with no added five-language rule");
    }
  }
});

test("the same bounded morphology rule works in all existing prompt modes", () => {
  for (const mode of ["model-full", "user-full", "locked-chunk"] as const) {
    const prompt = buildOmniSystemPrompt({ mode, sourceText: "Parliamo italiano." });
    assert.equal(prompt.split(rule).length, 2);
    assert.match(prompt, /Return exactly four Details fields/);
  }
});
