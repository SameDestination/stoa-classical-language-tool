import assert from "node:assert/strict";
import test from "node:test";

import {
  STOA_MORPHOLOGY_STANDARDS,
  getStoaMorphologyPrompt,
  getStoaMorphologyStandard,
} from "../app/lib/morphology-standards.ts";
import {
  buildLanguageSystemPrompt,
  getMorphologyPromptGuidance,
} from "../app/language-config.ts";

const forbiddenCompetingForms = [
  /Nominative Singular Masculine/u,
  /Third Person Singular Present Active Indicative/u,
  /Perfect Passive Participle Accusative Plural Feminine/u,
  /\b3SPAI\b/u,
  /\bAAPNPN\b/u,
  /\bPPPAPF\b/u,
  /\b3rd\s+(?:Sg\.?|Pl\.?)/iu,
  /\b(?:Nom|Gen|Dat|Acc|Abl|Voc)\.\s+(?:sg|pl|du)\.(?!\s)/u,
];

test("the reusable standards API is the sole guidance embedded in every classical system-prompt mode", () => {
  for (const language of ["ancient-greek", "latin"] as const) {
    const standard = getStoaMorphologyStandard(language);
    const fragment = getStoaMorphologyPrompt(language);
    assert.equal(fragment, standard.prompt);
    assert.equal(getMorphologyPromptGuidance(language), fragment);

    for (const mode of ["full-text", "locked-tokens"] as const) {
      const systemPrompt = buildLanguageSystemPrompt(language, { mode });
      assert.equal(systemPrompt.split(fragment).length - 1, 1);
      assert.match(systemPrompt, /exact STOA-standard morphology label/u);
      for (const forbidden of forbiddenCompetingForms) {
        assert.doesNotMatch(systemPrompt, forbidden);
      }
    }
  }
});

test("Ancient Greek requires compressed person-number and exact finite, participle, and infinitive ordering", () => {
  const prompt = getStoaMorphologyPrompt("ancient-greek");
  assert.match(prompt, /Finite person-number: 1S; 2S; 3S; 1P; 2P; 3P; 1D; 2D; 3D\./u);
  assert.match(prompt, /Finite verbs: PersonNumber Tense Voice Mood/u);
  assert.match(prompt, /3S Pres\. Act\. Ind\.; 2S Aor\. Act\. Subj\./u);
  assert.match(prompt, /Participles: Tense Voice Part\. Case Number Gender/u);
  assert.match(prompt, /Aor\. Act\. Part\. Acc\. Pl\. n\./u);
  assert.match(prompt, /Never assign person to a participle/u);
  assert.match(prompt, /Infinitives: Tense Voice Inf\./u);
  assert.match(prompt, /Perf\. Mid\.\/Pass\. Inf\./u);
  assert.match(prompt, /Never assign person, mood, case, number, or gender to an infinitive/u);
});

test("Ancient Greek covers duals and conservatively distinguishes middle, passive, and middle/passive", () => {
  const standard = STOA_MORPHOLOGY_STANDARDS["ancient-greek"];
  assert.match(standard.prompt, /Number: Sg\.; Pl\.; Du\./u);
  assert.match(standard.prompt, /1D; 2D; 3D/u);
  assert.match(standard.prompt, /Voice: Act\.; Mid\.; Pass\.; Mid\.\/Pass\./u);
  assert.match(standard.prompt, /2P Pres\. Mid\.\/Pass\. Imp\./u);
  assert.match(standard.prompt, /Use Mid\. when context securely identifies middle and Pass\. when it securely identifies passive/u);
  assert.match(standard.prompt, /Use Mid\.\/Pass\. only when form and context genuinely leave the distinction unresolved/u);

  const labels = new Map(standard.regressionExamples.map((example) => [example.surface, example.morphology]));
  assert.equal(labels.get("ἡνωμένοις"), "Perf. Mid./Pass. Part. Dat. Pl. n.");
});

test("Latin requires compressed person-number and exact finite, participle, and infinitive ordering", () => {
  const prompt = getStoaMorphologyPrompt("latin");
  assert.match(prompt, /Finite person-number: 1S; 2S; 3S; 1P; 2P; 3P\./u);
  assert.match(prompt, /Finite verbs: PersonNumber Tense Voice Mood/u);
  assert.match(prompt, /3S Pres\. Act\. Ind\.; 2S Imperf\. Act\. Subj\./u);
  assert.match(prompt, /Participles: Tense Voice Part\. Case Number Gender/u);
  assert.match(prompt, /Perf\. Pass\. Part\. Acc\. Pl\. f\./u);
  assert.match(prompt, /Never assign person to a participle/u);
  assert.match(prompt, /Infinitives: Tense Voice Inf\./u);
  assert.match(prompt, /Perf\. Act\. Inf\.; Perf\. Pass\. Inf\./u);
  assert.match(prompt, /Never assign finite person or mood to an infinitive/u);
});

test("Latin covers gerunds, gerundives, supines, and deponent morphology without active-voice substitution", () => {
  const standard = STOA_MORPHOLOGY_STANDARDS.latin;
  assert.match(standard.prompt, /Gerunds: Ger\. Case/u);
  assert.match(standard.prompt, /Ger\. Gen\.; Ger\. Dat\.; Ger\. Acc\.; or Ger\. Abl\./u);
  assert.match(standard.prompt, /Gerundives: Gerundive Case Number Gender/u);
  assert.match(standard.prompt, /Gerundive Nom\. Sg\. m\./u);
  assert.match(standard.prompt, /Supines: Sup\. Acc\. or Sup\. Abl\./u);
  assert.match(standard.prompt, /loquitur → 3S Pres\. Pass\. Ind\. Dep\./u);
  assert.match(standard.prompt, /English meaning does not change its morphological voice/u);

  const labels = new Map(standard.regressionExamples.map((example) => [example.surface, example.morphology]));
  assert.equal(labels.get("legendī"), "Ger. Gen.");
  assert.equal(labels.get("legendus"), "Gerundive Nom. Sg. m.");
  assert.equal(labels.get("spectātum"), "Sup. Acc.");
  assert.equal(labels.get("loquitur"), "3S Pres. Pass. Ind. Dep.");
});

test("Latin periphrastics remain separate tokens and each component receives its actual-form analysis", () => {
  const standard = STOA_MORPHOLOGY_STANDARDS.latin;
  assert.match(standard.prompt, /Every orthographic word remains a separate token in periphrastics/u);
  assert.match(
    standard.prompt,
    /amātus → Perf\. Pass\. Part\. Nom\. Sg\. m\.; est → 3S Pres\. Act\. Ind\./u,
  );
  assert.match(
    standard.prompt,
    /ventūrus → Fut\. Act\. Part\. Nom\. Sg\. m\.; est → 3S Pres\. Act\. Ind\./u,
  );

  const labels = new Map(standard.regressionExamples.map((example) => [example.surface, example.morphology]));
  assert.equal(labels.get("amātus"), "Perf. Pass. Part. Nom. Sg. m.");
  assert.equal(labels.get("est"), "3S Pres. Act. Ind.");
  assert.equal(labels.get("ventūrus"), "Fut. Act. Part. Nom. Sg. m.");
});
