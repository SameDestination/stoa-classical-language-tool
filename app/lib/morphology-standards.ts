/**
 * Authoritative STOA morphology labels for the production classical languages.
 *
 * Keep this module independent of the UI and provider layers so every AI entry
 * point can reuse the exact same standard. The prose below intentionally lists
 * only the one accepted abbreviation system; callers should not append a second
 * morphology guide.
 */

export type StoaMorphologyStandardLanguage = "ancient-greek" | "latin";

export type StoaMorphologyExample = Readonly<{
  surface: string;
  morphology: string;
  note?: string;
}>;

export type StoaMorphologyStandard = Readonly<{
  language: StoaMorphologyStandardLanguage;
  title: string;
  prompt: string;
  regressionExamples: readonly StoaMorphologyExample[];
}>;

const ancientGreekExamples = [
  { surface: "λέγῃς", morphology: "2S Pres. Act. Subj." },
  { surface: "ἡνωμένοις", morphology: "Perf. Mid./Pass. Part. Dat. Pl. n." },
  { surface: "παθόντα", morphology: "Aor. Act. Part. Nom. Pl. n." },
  { surface: "ὑπολαβεῖν", morphology: "Aor. Act. Inf." },
] as const satisfies readonly StoaMorphologyExample[];

const latinExamples = [
  { surface: "dīcit", morphology: "3S Pres. Act. Ind." },
  { surface: "amātus", morphology: "Perf. Pass. Part. Nom. Sg. m." },
  { surface: "dīxisse", morphology: "Perf. Act. Inf." },
  { surface: "legendī", morphology: "Ger. Gen." },
  { surface: "legendus", morphology: "Gerundive Nom. Sg. m." },
  { surface: "spectātum", morphology: "Sup. Acc." },
  { surface: "loquitur", morphology: "3S Pres. Pass. Ind. Dep." },
  {
    surface: "est",
    morphology: "3S Pres. Act. Ind.",
    note: "Analyze separately when it follows amātus or another periphrastic participle.",
  },
  {
    surface: "ventūrus",
    morphology: "Fut. Act. Part. Nom. Sg. m.",
    note: "Analyze separately from est in a future active periphrastic.",
  },
] as const satisfies readonly StoaMorphologyExample[];

const ANCIENT_GREEK_PROMPT = `ANCIENT GREEK STOA MORPHOLOGY STANDARD — MANDATORY
For every Ancient Greek token, morphology MUST use exactly the compact abbreviations and ordering below. Never spell the categories out, invent another abbreviation, or switch systems within an analysis.

EXACT ABBREVIATIONS
- Case: Nom.; Gen.; Dat.; Acc.; Voc.
- Number: Sg.; Pl.; Du.
- Gender: m.; f.; n.
- Finite person-number: 1S; 2S; 3S; 1P; 2P; 3P; 1D; 2D; 3D. Never use ordinal-person forms.
- Tense: Pres.; Imperf.; Fut.; Aor.; Perf.; Plup.; Fut. Perf.
- Voice: Act.; Mid.; Pass.; Mid./Pass.
- Mood or non-finite form: Ind.; Subj.; Opt.; Imp.; Inf.; Part.
- Degree: Comp.; Superl. Normally omit positive degree.

MANDATORY ORDER AND SHAPES
- Nouns, articles, determiners, pronouns: Case Number Gender, for example Nom. Sg. m. or Gen. Pl. f. Omit gender when it cannot responsibly be determined.
- Adjectives: Case Number Gender [Degree], for example Acc. Pl. n. Comp. or Gen. Sg. f. Superl.
- Finite verbs: PersonNumber Tense Voice Mood, for example 3S Pres. Act. Ind.; 2S Aor. Act. Subj.; 3P Imperf. Mid. Ind.; 2P Pres. Mid./Pass. Imp.
- Participles: Tense Voice Part. Case Number Gender, for example Pres. Act. Part. Nom. Sg. m.; Aor. Act. Part. Acc. Pl. n.; Perf. Mid./Pass. Part. Dat. Pl. m. Never assign person to a participle.
- Infinitives: Tense Voice Inf., for example Pres. Act. Inf.; Aor. Act. Inf.; Perf. Mid./Pass. Inf. Never assign person, mood, case, number, or gender to an infinitive.
- Prepositions: Prep. + Gen.; Prep. + Dat.; or Prep. + Acc., using the case actually governed in context.
- Adverbs: Adv.; Comp. Adv.; or Superl. Adv.
- Conjunctions and particles: use a concise applicable functional label such as Coord. Conj.; Subord. Conj.; Cond. Conj.; Neg. Part.; Modal Part.; Postpos. Part.; Explan. Part.; or Contrast. Part. Do not manufacture inflection for an indeclinable.
- Numerals: use ordinary nominal morphology when inflected; use Numeral or Section Numeral for notation or an indeclinable numerical expression.

RESOLUTION RULES
- Select the parse supported by full syntax. Put substantial unresolved alternatives in alternatives; do not list every paradigmatic possibility in morphology.
- Use Mid. when context securely identifies middle and Pass. when it securely identifies passive. Use Mid./Pass. only when form and context genuinely leave the distinction unresolved.
- Preserve exact polytonic spelling in surface, including contraction, elision, crasis, and irregular forms. Describe the resolved form in morphology without changing surface.

VALID STOA EXAMPLES
- ἐγώ → Nom. Sg.
- ἀνθρώπους → Acc. Pl. m.
- λέγῃς → 2S Pres. Act. Subj.
- παθόντα → Aor. Act. Part. Nom. Pl. n.
- ἡνωμένοις → Perf. Mid./Pass. Part. Dat. Pl. n.
- ὑπολαβεῖν → Aor. Act. Inf.
- ἐν → Prep. + Dat.`;

const LATIN_PROMPT = `LATIN STOA MORPHOLOGY STANDARD — MANDATORY
For every Latin token, morphology MUST use exactly the compact abbreviations and ordering below. Never spell the categories out, invent another abbreviation, or switch systems within an analysis.

EXACT ABBREVIATIONS
- Case: Nom.; Gen.; Dat.; Acc.; Abl.; Voc.; Loc.
- Number: Sg.; Pl.
- Gender: m.; f.; n.
- Finite person-number: 1S; 2S; 3S; 1P; 2P; 3P. Never use ordinal-person forms.
- Tense: Pres.; Imperf.; Fut.; Perf.; Plup.; Fut. Perf.
- Voice: Act.; Pass.
- Mood or non-finite form: Ind.; Subj.; Imp.; Inf.; Part.; Ger.; Gerundive; Sup.
- Degree: Comp.; Superl. Normally omit positive degree.
- Deponent marker: Dep. may follow the complete analysis when it adds genuine value; it never replaces the form's actual morphological voice.

MANDATORY ORDER AND SHAPES
- Nouns, determiners, pronouns: Case Number Gender, for example Nom. Sg. m. or Abl. Pl. m. Omit gender when it cannot responsibly be determined.
- Adjectives: Case Number Gender [Degree], for example Acc. Pl. n. Comp. or Gen. Sg. f. Superl.
- Finite verbs: PersonNumber Tense Voice Mood, for example 3S Pres. Act. Ind.; 2S Imperf. Act. Subj.; 3P Fut. Pass. Ind.; 2P Plup. Pass. Subj.
- Participles: Tense Voice Part. Case Number Gender, for example Pres. Act. Part. Nom. Sg. m.; Perf. Pass. Part. Acc. Pl. f.; Fut. Act. Part. Nom. Pl. m. Never assign person to a participle.
- Infinitives: Tense Voice Inf., for example Pres. Act. Inf.; Pres. Pass. Inf.; Perf. Act. Inf.; Perf. Pass. Inf.; Fut. Act. Inf.; Fut. Pass. Inf. Never assign finite person or mood to an infinitive.
- Gerunds: Ger. Case, for example Ger. Gen.; Ger. Dat.; Ger. Acc.; or Ger. Abl. Resolve syncretic case from syntax when possible.
- Gerundives: Gerundive Case Number Gender, for example Gerundive Nom. Sg. m.; Gerundive Dat. Sg. m.; Gerundive Abl. Sg. m.; or Gerundive Acc. Pl. m.
- Supines: Sup. Acc. or Sup. Abl.
- Prepositions: Prep. + Acc. or Prep. + Abl., using the case actually governed in context.
- Adverbs: Adv.; Comp. Adv.; or Superl. Adv.
- Conjunctions and particles: use a concise applicable functional label such as Coord. Conj.; Subord. Conj.; Cond. Conj.; Causal Conj.; Temporal Conj.; Neg. Part.; Interrog. Part.; or Emph. Part. Do not manufacture inflection for an indeclinable.

DEPONENT AND PERIPHRASTIC RULES
- A deponent's English meaning does not change its morphological voice: loquitur → 3S Pres. Pass. Ind. Dep.; secūtus → Perf. Pass. Part. Nom. Sg. m. Dep.
- Every orthographic word remains a separate token in periphrastics. Analyze each component independently: amātus → Perf. Pass. Part. Nom. Sg. m.; est → 3S Pres. Act. Ind. Likewise ventūrus → Fut. Act. Part. Nom. Sg. m.; est → 3S Pres. Act. Ind.

RESOLUTION RULES
- Select the parse supported by full syntax. Put substantial unresolved alternatives in alternatives; do not list every paradigmatic possibility in morphology.
- Preserve exact surface spelling, capitalization, vowel-length marks, enclitics, and elision. Use the conventional Latin dictionary headword as lemma.

VALID STOA EXAMPLES
- puella → Nom. Sg. f.
- servōrum → Gen. Pl. m.
- dīcit → 3S Pres. Act. Ind.
- dīceret → 3S Imperf. Act. Subj.
- amātus → Perf. Pass. Part. Nom. Sg. m.
- dīxisse → Perf. Act. Inf.
- legendī → Ger. Gen.
- legendus → Gerundive Nom. Sg. m.
- spectātum → Sup. Acc.
- dictū → Sup. Abl.
- loquitur → 3S Pres. Pass. Ind. Dep.
- cum → Prep. + Abl.`;

export const STOA_MORPHOLOGY_STANDARDS = {
  "ancient-greek": {
    language: "ancient-greek",
    title: "Ancient Greek STOA morphology standard",
    prompt: ANCIENT_GREEK_PROMPT,
    regressionExamples: ancientGreekExamples,
  },
  latin: {
    language: "latin",
    title: "Latin STOA morphology standard",
    prompt: LATIN_PROMPT,
    regressionExamples: latinExamples,
  },
} as const satisfies Record<StoaMorphologyStandardLanguage, StoaMorphologyStandard>;

export function getStoaMorphologyStandard(
  language: StoaMorphologyStandardLanguage,
): StoaMorphologyStandard {
  return STOA_MORPHOLOGY_STANDARDS[language];
}

/** Reusable prompt fragment for full-text, chunked, retry, and future OMNI routing. */
export function getStoaMorphologyPrompt(language: StoaMorphologyStandardLanguage): string {
  return getStoaMorphologyStandard(language).prompt;
}
