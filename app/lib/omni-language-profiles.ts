/**
 * Deterministic language-profile policy for STOA OMNI.
 *
 * Model output is evidence, never authority: this module canonicalizes language
 * identifiers, inspects the source script locally, validates the bundled
 * profile registry and derives the effective analysis/export capabilities.
 */

export const OMNI_LANGUAGE_DETECTION_SCHEMA_VERSION = 1 as const;
export const OMNI_LANGUAGE_PROFILE_VERSION = 1 as const;
export const OMNI_RICH_CONFIDENCE_THRESHOLD = 0.85 as const;
export const STOA_GENERIC_MORPHOLOGY_STANDARD_ID = "stoa.omni.generic.v1" as const;

export type OmniAnalysisProfile = "rich-inflectional" | "generic";

export type Iso15924Script =
  | "Latn"
  | "Grek"
  | "Cyrl"
  | "Arab"
  | "Hebr"
  | "Hani"
  | "Hira"
  | "Kana"
  | "Hang"
  | "Deva"
  | "Armn"
  | "Geor"
  | "Thai"
  | "Beng"
  | "Taml"
  | "Gujr"
  | "Guru"
  | "Telu"
  | "Knda"
  | "Mlym"
  | "Sinh"
  | "Mymr"
  | "Khmr"
  | "Laoo"
  | "Ethi"
  | "Zyyy"
  | "Zinh"
  | "Zzzz";

export type OmniLanguageDetection = Readonly<{
  schemaVersion: typeof OMNI_LANGUAGE_DETECTION_SCHEMA_VERSION;
  languageId: string;
  languageName: string;
  script: Iso15924Script;
  confidence: number;
  isMixedLanguage: boolean;
}>;

export type OmniManualLanguageOverride = Readonly<{
  languageId: string;
  confirmed: boolean;
}> | null;

export const DEFAULT_OMNI_LANGUAGE_DETECTION: OmniLanguageDetection = Object.freeze({
  schemaVersion: OMNI_LANGUAGE_DETECTION_SCHEMA_VERSION,
  languageId: "und",
  languageName: "Undetermined",
  script: "Zzzz",
  confidence: 0,
  isMixedLanguage: false,
});

export const OMNI_RICH_LANGUAGE_IDS = [
  "el", "de", "is", "fo", "ru", "uk", "pl", "cs", "sk", "sl", "hr",
  "sr", "bs", "lt", "lv", "es", "pt", "it", "fr", "ro", "ca", "sq",
] as const;

export type OmniRichLanguageId = (typeof OMNI_RICH_LANGUAGE_IDS)[number];
export type OmniUdPos =
  | "ADJ" | "ADP" | "ADV" | "AUX" | "CCONJ" | "DET" | "INTJ"
  | "NOUN" | "NUM" | "PART" | "PRON" | "PROPN" | "SCONJ" | "VERB" | "X";

export type OmniMorphologyCategory = Readonly<{
  id: string;
  label: string;
  allowedValues: readonly string[];
  abbreviations: Readonly<Record<string, string>>;
}>;

export type OmniMorphologyExample = Readonly<{
  surface: string;
  pos: OmniUdPos;
  morphology: string;
  note?: string;
}>;

export type OmniInvalidMorphologyExample = OmniMorphologyExample & Readonly<{
  reason: string;
}>;

export type OmniLanguageProfile = Readonly<{
  profileVersion: typeof OMNI_LANGUAGE_PROFILE_VERSION;
  languageId: OmniRichLanguageId;
  languageName: string;
  morphologyStandard: `stoa.omni.${OmniRichLanguageId}.v1`;
  status: "validated";
  scripts: readonly Iso15924Script[];
  aliases: readonly string[];
  orthographyRules: readonly string[];
  tokenizationRules: readonly string[];
  contractionRules: readonly string[];
  cliticRules: readonly string[];
  categories: readonly OmniMorphologyCategory[];
  morphologyOrder: readonly string[];
  posShapes: Readonly<Partial<Record<OmniUdPos, readonly string[]>>>;
  ambiguityRules: readonly string[];
  indeclinablePos: readonly OmniUdPos[];
  validExamples: readonly OmniMorphologyExample[];
  invalidExamples: readonly OmniInvalidMorphologyExample[];
}>;

export type OmniProfileValidation = Readonly<{
  valid: boolean;
  errors: readonly string[];
}>;

export type OmniSourceScriptDetection = Readonly<{
  script: Iso15924Script;
  scripts: readonly Iso15924Script[];
  isMixedScript: boolean;
  confidence: number;
  counts: Readonly<Partial<Record<Iso15924Script, number>>>;
}>;

export type OmniRoutingReason =
  | "validated-profile"
  | "manual-override"
  | "low-confidence"
  | "undetermined-language"
  | "mixed-language"
  | "mixed-script"
  | "unsupported-language"
  | "script-mismatch"
  | "unknown-script"
  | "language-unverified"
  | "unvalidated-profile";

export type OmniLocalCapabilities = Readonly<{
  hideIndeclinableDetails: boolean;
  exportProject: boolean;
  exportLatex: boolean;
  exportPng: boolean;
  exportPdf: true;
}>;

export type OmniProfileResolution = Readonly<{
  detection: OmniLanguageDetection;
  sourceScript: OmniSourceScriptDetection;
  selectedLanguageId: string;
  manualOverride: OmniManualLanguageOverride;
  analysisProfile: OmniAnalysisProfile;
  morphologyStandard: string;
  profile: OmniLanguageProfile | null;
  reason: OmniRoutingReason;
  warnings: readonly string[];
  ignoredAiClaims: readonly string[];
  capabilities: OmniLocalCapabilities;
}>;

export type ResolveOmniLanguageProfileInput = Readonly<{
  sourceText: string;
  detection?: Partial<OmniLanguageDetection> | null;
  manualOverride?: OmniManualLanguageOverride;
  /** These values are recorded only as ignored/mismatched claims. */
  aiClaims?: Readonly<{
    analysisProfile?: unknown;
    morphologyStandard?: unknown;
    capabilities?: unknown;
  }>;
}>;

export type OmniIndeclinableToken = Readonly<{
  pos?: unknown;
  isIndeclinable?: unknown;
}>;

const ISO_639_ALIASES: Readonly<Record<string, OmniRichLanguageId>> = Object.freeze({
  ell: "el", gre: "el", deu: "de", ger: "de", isl: "is", ice: "is",
  fao: "fo", rus: "ru", ukr: "uk", pol: "pl", ces: "cs", cze: "cs",
  slk: "sk", slo: "sk", slv: "sl", hrv: "hr", srp: "sr", bos: "bs",
  lit: "lt", lav: "lv", spa: "es", por: "pt", ita: "it", fra: "fr",
  fre: "fr", ron: "ro", rum: "ro", cat: "ca", sqi: "sq", alb: "sq",
});

const KNOWN_SCRIPTS = new Set<Iso15924Script>([
  "Latn", "Grek", "Cyrl", "Arab", "Hebr", "Hani", "Hira", "Kana", "Hang",
  "Deva", "Armn", "Geor", "Thai", "Zyyy", "Zinh", "Zzzz",
  "Beng", "Taml", "Gujr", "Guru", "Telu", "Knda", "Mlym", "Sinh",
  "Mymr", "Khmr", "Laoo", "Ethi",
]);

const SCRIPT_NAMES: Readonly<Record<string, Iso15924Script>> = Object.freeze({
  latin: "Latn", latn: "Latn", greek: "Grek", grek: "Grek",
  cyrillic: "Cyrl", cyrl: "Cyrl", arabic: "Arab", arab: "Arab",
  hebrew: "Hebr", hebr: "Hebr", han: "Hani", hani: "Hani",
  hiragana: "Hira", hira: "Hira", katakana: "Kana", kana: "Kana",
  hangul: "Hang", hang: "Hang", devanagari: "Deva", deva: "Deva",
  armenian: "Armn", armn: "Armn", georgian: "Geor", geor: "Geor",
  thai: "Thai", common: "Zyyy", zyyy: "Zyyy", inherited: "Zinh",
  bengali: "Beng", beng: "Beng", tamil: "Taml", taml: "Taml",
  gujarati: "Gujr", gujr: "Gujr", gurmukhi: "Guru", guru: "Guru",
  telugu: "Telu", telu: "Telu", kannada: "Knda", knda: "Knda",
  malayalam: "Mlym", mlym: "Mlym", sinhala: "Sinh", sinh: "Sinh",
  myanmar: "Mymr", mymr: "Mymr", khmer: "Khmr", khmr: "Khmr",
  lao: "Laoo", laoo: "Laoo", ethiopic: "Ethi", ethi: "Ethi",
  zinh: "Zinh", unknown: "Zzzz", zzzz: "Zzzz",
});

const SCRIPT_PATTERNS: ReadonlyArray<readonly [Iso15924Script, RegExp]> = [
  ["Latn", /\p{Script_Extensions=Latin}/u],
  ["Grek", /\p{Script_Extensions=Greek}/u],
  ["Cyrl", /\p{Script_Extensions=Cyrillic}/u],
  ["Arab", /\p{Script_Extensions=Arabic}/u],
  ["Hebr", /\p{Script_Extensions=Hebrew}/u],
  ["Hani", /\p{Script_Extensions=Han}/u],
  ["Hira", /\p{Script_Extensions=Hiragana}/u],
  ["Kana", /\p{Script_Extensions=Katakana}/u],
  ["Hang", /\p{Script_Extensions=Hangul}/u],
  ["Deva", /\p{Script_Extensions=Devanagari}/u],
  ["Armn", /\p{Script_Extensions=Armenian}/u],
  ["Geor", /\p{Script_Extensions=Georgian}/u],
  ["Thai", /\p{Script_Extensions=Thai}/u],
  ["Beng", /\p{Script_Extensions=Bengali}/u],
  ["Taml", /\p{Script_Extensions=Tamil}/u],
  ["Gujr", /\p{Script_Extensions=Gujarati}/u],
  ["Guru", /\p{Script_Extensions=Gurmukhi}/u],
  ["Telu", /\p{Script_Extensions=Telugu}/u],
  ["Knda", /\p{Script_Extensions=Kannada}/u],
  ["Mlym", /\p{Script_Extensions=Malayalam}/u],
  ["Sinh", /\p{Script_Extensions=Sinhala}/u],
  ["Mymr", /\p{Script_Extensions=Myanmar}/u],
  ["Khmr", /\p{Script_Extensions=Khmer}/u],
  ["Laoo", /\p{Script_Extensions=Lao}/u],
  ["Ethi", /\p{Script_Extensions=Ethiopic}/u],
];

const richIdSet = new Set<string>(OMNI_RICH_LANGUAGE_IDS);
const udPosSet = new Set<OmniUdPos>([
  "ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN", "NUM",
  "PART", "PRON", "PROPN", "SCONJ", "VERB", "X",
]);

const stripControlCharacters = (value: string) => [...value].filter((character) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint > 0x1f && codePoint !== 0x7f;
}).join("");

const safeText = (value: unknown, fallback: string, maximum = 120) =>
  typeof value === "string" && value.trim()
    ? stripControlCharacters(value.trim()).slice(0, maximum) || fallback
    : fallback;

const clampConfidence = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;

export function normalizeIso15924Script(value: unknown): Iso15924Script {
  if (typeof value !== "string") return "Zzzz";
  const trimmed = value.trim();
  if (KNOWN_SCRIPTS.has(trimmed as Iso15924Script)) return trimmed as Iso15924Script;
  return SCRIPT_NAMES[trimmed.toLowerCase()] ?? "Zzzz";
}

export type NormalizedBcp47LanguageId = Readonly<{
  languageId: string;
  primaryLanguage: string;
  script: Iso15924Script | null;
  valid: boolean;
}>;

/** Canonicalizes safely; malformed or instruction-like input becomes `und`. */
export function normalizeBcp47LanguageId(value: unknown): NormalizedBcp47LanguageId {
  if (typeof value !== "string") {
    return { languageId: "und", primaryLanguage: "und", script: null, valid: false };
  }
  const candidate = value.trim().replace(/_/gu, "-");
  const containsForbiddenCharacter = [...candidate].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || character === "{" || character === "}" || character === "<" || character === ">";
  });
  if (!candidate || candidate.length > 80 || containsForbiddenCharacter) {
    return { languageId: "und", primaryLanguage: "und", script: null, valid: false };
  }
  if (candidate.toLowerCase() === "und") {
    return { languageId: "und", primaryLanguage: "und", script: null, valid: true };
  }
  try {
    const canonical = Intl.getCanonicalLocales(candidate)[0];
    if (!canonical) throw new RangeError("empty canonical locale");
    const locale = new Intl.Locale(canonical);
    const aliasedPrimary = ISO_639_ALIASES[locale.language.toLowerCase()] ?? locale.language.toLowerCase();
    const rest = canonical.split("-").slice(1);
    const languageId = [aliasedPrimary, ...rest].join("-");
    const script = locale.script ? normalizeIso15924Script(locale.script) : null;
    return { languageId, primaryLanguage: aliasedPrimary, script, valid: true };
  } catch {
    const primary = candidate.split("-")[0]?.toLowerCase() ?? "";
    const alias = ISO_639_ALIASES[primary];
    return alias
      ? { languageId: alias, primaryLanguage: alias, script: null, valid: true }
      : { languageId: "und", primaryLanguage: "und", script: null, valid: false };
  }
}

/** Counts strong Unicode letter scripts; punctuation/common marks never create a script. */
export function detectOmniSourceScript(sourceText: string): OmniSourceScriptDetection {
  const counts: Partial<Record<Iso15924Script, number>> = {};
  for (const character of sourceText) {
    if (!/\p{Letter}/u.test(character)) continue;
    const script = SCRIPT_PATTERNS.find(([, pattern]) => pattern.test(character))?.[0];
    if (script) counts[script] = (counts[script] ?? 0) + 1;
  }
  const entries = Object.entries(counts) as Array<[Iso15924Script, number]>;
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  return {
    script: entries[0]?.[0] ?? "Zzzz",
    scripts: entries.map(([script]) => script),
    isMixedScript: entries.length > 1,
    confidence: total ? (entries[0]?.[1] ?? 0) / total : 0,
    counts,
  };
}

const category = (id: string, label: string, abbreviations: Readonly<Record<string, string>>): OmniMorphologyCategory => ({
  id,
  label,
  allowedValues: Object.keys(abbreviations),
  abbreviations,
});

const CASE_NGDA = category("case", "Case", { Nominative: "Nom.", Genitive: "Gen.", Dative: "Dat.", Accusative: "Acc." });
const CASE_NGDAV = category("case", "Case", { ...CASE_NGDA.abbreviations, Vocative: "Voc." });
const CASE_MODERN_GREEK = category("case", "Case", { Nominative: "Nom.", Genitive: "Gen.", Accusative: "Acc.", Vocative: "Voc." });
const CASE_SEVEN = category("case", "Case", { ...CASE_NGDAV.abbreviations, Instrumental: "Ins.", Locative: "Loc." });
const CASE_ALBANIAN = category("case", "Case", { ...CASE_NGDA.abbreviations, Ablative: "Abl.", Vocative: "Voc." });
const NUMBER_SP = category("number", "Number", { Singular: "Sg.", Plural: "Pl." });
const NUMBER_SPD = category("number", "Number", { Singular: "Sg.", Plural: "Pl.", Dual: "Du." });
const GENDER_3 = category("gender", "Gender", { Masculine: "m.", Feminine: "f.", Neuter: "n." });
const GENDER_2 = category("gender", "Gender", { Masculine: "m.", Feminine: "f." });
const ANIMACY = category("animacy", "Animacy", { Animate: "Anim.", Inanimate: "Inan." });
const DEFINITENESS = category("definiteness", "Definiteness", { Definite: "Def.", Indefinite: "Indef." });
const PERSON_NUMBER = category("personNumber", "Person-number", {
  FirstSingular: "1S", SecondSingular: "2S", ThirdSingular: "3S",
  FirstPlural: "1P", SecondPlural: "2P", ThirdPlural: "3P",
});
const PERSON_NUMBER_DUAL = category("personNumber", "Person-number", {
  ...PERSON_NUMBER.abbreviations, FirstDual: "1D", SecondDual: "2D", ThirdDual: "3D",
});
const DEGREE = category("degree", "Degree", { Positive: "Pos.", Comparative: "Comp.", Superlative: "Sup." });
const ASPECT = category("aspect", "Aspect", { Imperfective: "Impf.", Perfective: "Pf." });
const VOICE_AP = category("voice", "Voice", { Active: "Act.", Passive: "Pass." });
const VOICE_AM = category("voice", "Voice", { Active: "Act.", Middle: "Mid.", Passive: "Pass.", MiddlePassive: "Mid./Pass." });
const MOOD_ISC = category("mood", "Mood", { Indicative: "Ind.", Subjunctive: "Subj.", Imperative: "Imp.", Conditional: "Cond." });
const MOOD_MODERN_GREEK = category("mood", "Mood", { Indicative: "Ind.", Subjunctive: "Subj.", Imperative: "Imp." });
const VERB_FORM = category("verbForm", "Verb form", { Finite: "Fin.", Infinitive: "Inf.", Participle: "Part.", Converb: "Conv." });
const VERB_FORM_NO_INF = category("verbForm", "Verb form", { Finite: "Fin.", Participle: "Part.", Converb: "Conv." });
const ADJECTIVE_FORM = category("adjectiveForm", "Adjective form", { Long: "Long", Short: "Short" });

const TENSE_GERMANIC = category("tense", "Tense", { Present: "Pres.", Past: "Past.", Perfect: "Perf.", Pluperfect: "Plup.", Future: "Fut." });
const TENSE_SLAVIC = category("tense", "Tense", { Present: "Pres.", Past: "Past.", Future: "Fut." });
const TENSE_ROMANCE = category("tense", "Tense", { Present: "Pres.", Imperfect: "Imperf.", Preterite: "Pret.", Perfect: "Perf.", Pluperfect: "Plup.", Future: "Fut." });
const TENSE_GREEK = category("tense", "Tense", { Present: "Pres.", Imperfect: "Imperf.", Aorist: "Aor.", Perfect: "Perf.", Pluperfect: "Plup.", Future: "Fut." });

const DEFAULT_INDECLINABLE_POS = ["ADP", "ADV", "CCONJ", "SCONJ", "PART", "INTJ"] as const satisfies readonly OmniUdPos[];

type ProfileSeed = Omit<OmniLanguageProfile, "profileVersion" | "morphologyStandard" | "status">;

const buildProfile = (seed: ProfileSeed): OmniLanguageProfile => ({
  ...seed,
  profileVersion: OMNI_LANGUAGE_PROFILE_VERSION,
  morphologyStandard: `stoa.omni.${seed.languageId}.v1`,
  status: "validated",
  scripts: [...seed.scripts], aliases: [...seed.aliases],
  orthographyRules: [...seed.orthographyRules], tokenizationRules: [...seed.tokenizationRules],
  contractionRules: [...seed.contractionRules], cliticRules: [...seed.cliticRules],
  categories: seed.categories.map((item) => ({ ...item, allowedValues: [...item.allowedValues], abbreviations: { ...item.abbreviations } })),
  morphologyOrder: [...seed.morphologyOrder], posShapes: Object.fromEntries(
    Object.entries(seed.posShapes).map(([pos, shape]) => [pos, [...(shape ?? [])]]),
  ),
  ambiguityRules: [...seed.ambiguityRules], indeclinablePos: [...seed.indeclinablePos],
  validExamples: seed.validExamples.map((item) => ({ ...item })),
  invalidExamples: seed.invalidExamples.map((item) => ({ ...item })),
});

const sharedAmbiguity = [
  "Resolve syncretic forms from complete sentence syntax; retain only substantial unresolved readings in alternatives.",
  "Never list every paradigmatic possibility, and never invent an unexpressed category merely to fill a display shape.",
];

type NominalShapeOptions = Readonly<{
  dual?: boolean;
  verbalAspect?: boolean;
  definiteness?: boolean;
  animacy?: boolean;
  adjectiveForm?: boolean;
}>;

const nominalShapes = (options: NominalShapeOptions = {}): Partial<Record<OmniUdPos, readonly string[]>> => {
  const {
    dual = false,
    verbalAspect = true,
    definiteness = false,
    animacy = false,
    adjectiveForm = false,
  } = options;
  const nominalTail = [
    "case", "number", "gender",
    ...(animacy ? ["animacy"] : []),
    ...(definiteness ? ["definiteness"] : []),
  ];
  return {
    NOUN: nominalTail,
    PROPN: nominalTail,
    PRON: nominalTail,
    DET: nominalTail,
    ADJ: [...nominalTail, ...(adjectiveForm ? ["adjectiveForm"] : []), "degree"],
    VERB: ["personNumber", "tense", ...(verbalAspect ? ["aspect"] : []), "voice", "mood", "verbForm"],
    AUX: ["personNumber", "tense", "voice", "mood", "verbForm"],
    ...(dual ? { NUM: nominalTail } : {}),
  };
};

const romanceShapes = {
  NOUN: ["number", "gender"], PROPN: ["number", "gender"],
  PRON: ["personNumber", "case", "number", "gender"],
  DET: ["definiteness", "number", "gender"], ADJ: ["number", "gender", "degree"],
  VERB: ["personNumber", "tense", "mood", "voice", "verbForm"],
  AUX: ["personNumber", "tense", "mood", "voice", "verbForm"],
  ADV: ["degree"],
} satisfies Partial<Record<OmniUdPos, readonly string[]>>;

const albanianShapes = {
  NOUN: ["case", "number", "gender", "definiteness"],
  PROPN: ["case", "number", "gender", "definiteness"],
  PRON: ["case", "number", "gender"],
  DET: ["case", "number", "gender", "definiteness"],
  ADJ: ["case", "number", "gender", "definiteness", "degree"],
  VERB: ["personNumber", "tense", "mood", "voice", "verbForm"],
  AUX: ["personNumber", "tense", "mood", "voice", "verbForm"],
} satisfies Partial<Record<OmniUdPos, readonly string[]>>;

const commonOrthography = "Preserve exact Unicode spelling, capitalization, diacritics and original normalization in surface; never silently transliterate or modernize it.";
const commonTokenization = "Represent every visible orthographic span exactly once; punctuation remains outside surface and logical source order is preserved.";
const commonContractions = "Preserve a written contraction as one surface span and store component analysis structurally without duplicating the source.";
const commonClitics = "Keep separately written clitics separate and attached clitics inside their single visible host surface; describe components in structured features.";

const richProfiles = [
  buildProfile({
    languageId: "el", languageName: "Modern Greek", scripts: ["Grek"], aliases: ["ell", "gre"],
    orthographyRules: [commonOrthography, "Preserve monotonic or polytonic accents exactly; do not reinterpret Ancient Greek as Modern Greek."],
    tokenizationRules: [commonTokenization, "Treat Modern Greek orthographic words as the default token unit while preserving apostrophized elision."],
    contractionRules: [commonContractions, "Analyze articulated prepositions such as στον contextually without emitting duplicate source tokens."],
    cliticRules: [commonClitics, "Use context to distinguish weak object pronouns from stressed pronouns and articles."],
    categories: [CASE_MODERN_GREEK, NUMBER_SP, GENDER_3, DEFINITENESS, PERSON_NUMBER, TENSE_GREEK, ASPECT, VOICE_AM, MOOD_MODERN_GREEK, VERB_FORM_NO_INF, DEGREE],
    morphologyOrder: ["personNumber", "tense", "aspect", "voice", "mood", "verbForm", "case", "number", "gender", "definiteness", "degree"],
    posShapes: nominalShapes({ definiteness: true }), ambiguityRules: [...sharedAmbiguity, "Do not use Ancient Greek dative, dual, infinitive or optative analyses for Modern Greek."],
    indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: "ανθρώπους", pos: "NOUN", morphology: "Acc. Pl. m." }],
    invalidExamples: [{ surface: "ανθρώπους", pos: "NOUN", morphology: "Dat. Pl. m.", reason: "Modern Greek has no productive dative case." }],
  }),
  buildProfile({
    languageId: "de", languageName: "German", scripts: ["Latn"], aliases: ["deu", "ger"],
    orthographyRules: [commonOrthography, "Preserve noun capitalization and the letters ä, ö, ü and ß."],
    tokenizationRules: [commonTokenization, "Keep separable verb particles as their own tokens when written apart."],
    contractionRules: [commonContractions, "Recognize conventional preposition-article contractions such as im, am, zum and zur."],
    cliticRules: [commonClitics, "Treat unstressed pronouns and discourse particles by their contextual syntactic function."],
    categories: [CASE_NGDA, NUMBER_SP, GENDER_3, DEFINITENESS, PERSON_NUMBER, TENSE_GERMANIC, VOICE_AP, MOOD_ISC, VERB_FORM, DEGREE],
    morphologyOrder: ["personNumber", "tense", "voice", "mood", "verbForm", "case", "number", "gender", "definiteness", "degree"],
    posShapes: nominalShapes({ verbalAspect: false, definiteness: true }), ambiguityRules: [
      ...sharedAmbiguity,
      "Resolve article/adjective case and strong, weak or mixed agreement from its phrase context.",
      "For discourse particles such as doch, ja and eben, choose a short contextual English gloss (for example after all, however, shared-knowledge emphasis, or signals inevitability); never assign one fixed translation to every occurrence.",
    ],
    indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: "Häusern", pos: "NOUN", morphology: "Dat. Pl. n." }],
    invalidExamples: [{ surface: "Häusern", pos: "NOUN", morphology: "Abl. Pl. n.", reason: "German has no ablative case." }],
  }),
  ...(["is", "fo"] as const).map((languageId) => buildProfile({
    languageId,
    languageName: languageId === "is" ? "Icelandic" : "Faroese",
    scripts: ["Latn"], aliases: languageId === "is" ? ["isl", "ice"] : ["fao"],
    orthographyRules: [commonOrthography, languageId === "is" ? "Preserve þ, ð, æ and ö." : "Preserve ð, ø and all vowel accents."],
    tokenizationRules: [commonTokenization, "Keep compound orthographic words intact while analyzing their inflection contextually."],
    contractionRules: [commonContractions, "Do not split forms merely because their history contains multiple components."],
    cliticRules: [commonClitics, "Preserve reflexive and pronominal elements according to their written attachment."],
    categories: [CASE_NGDA, NUMBER_SP, GENDER_3, DEFINITENESS, PERSON_NUMBER, TENSE_GERMANIC, VOICE_AM, MOOD_ISC, VERB_FORM, DEGREE],
    morphologyOrder: ["personNumber", "tense", "voice", "mood", "verbForm", "case", "number", "gender", "definiteness", "degree"],
    posShapes: nominalShapes({ verbalAspect: false, definiteness: true }), ambiguityRules: [...sharedAmbiguity, "Resolve nominal case and strong/weak adjective agreement from syntax."],
    indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: languageId === "is" ? "hestum" : "húsinum", pos: "NOUN", morphology: languageId === "is" ? "Dat. Pl. m." : "Dat. Sg. n. Def." }],
    invalidExamples: [{ surface: "form", pos: "NOUN", morphology: "Abl. Sg.", reason: "The profile has no ablative case." }],
  })),
  ...(["ru", "uk"] as const).map((languageId) => buildProfile({
    languageId, languageName: languageId === "ru" ? "Russian" : "Ukrainian", scripts: ["Cyrl"], aliases: languageId === "ru" ? ["rus"] : ["ukr"],
    orthographyRules: [commonOrthography, languageId === "uk" ? "Preserve Ukrainian і, ї, є and ґ; never normalize them to Russian letters." : "Preserve Russian ё when present; never silently replace it with е."],
    tokenizationRules: [commonTokenization, "Keep written prepositions and particles separate from their complements."],
    contractionRules: [commonContractions, "Do not invent contractions where the orthography writes separate words."],
    cliticRules: [commonClitics, "Analyze reflexive -ся/-сь as an attached verbal component without duplicating the host token."],
    categories: [CASE_SEVEN, NUMBER_SP, GENDER_3, ANIMACY, PERSON_NUMBER, TENSE_SLAVIC, ASPECT, VOICE_AP, MOOD_ISC, VERB_FORM, DEGREE, ADJECTIVE_FORM],
    morphologyOrder: ["personNumber", "tense", "aspect", "voice", "mood", "verbForm", "case", "number", "gender", "animacy", "adjectiveForm", "degree"],
    posShapes: nominalShapes({ animacy: true, adjectiveForm: true }), ambiguityRules: [...sharedAmbiguity, "Resolve genitive/accusative and animate/inanimate syncretism from syntax."],
    indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: languageId === "ru" ? "книгами" : "книгою", pos: "NOUN", morphology: languageId === "ru" ? "Ins. Pl. f." : "Ins. Sg. f." }],
    invalidExamples: [{ surface: "форма", pos: "NOUN", morphology: "Abl. Sg. f.", reason: "The profile uses instrumental and locative, not an ablative." }],
  })),
  ...(["pl", "cs", "sk"] as const).map((languageId) => buildProfile({
    languageId, languageName: ({ pl: "Polish", cs: "Czech", sk: "Slovak" } as const)[languageId], scripts: ["Latn"],
    aliases: ({ pl: ["pol"], cs: ["ces", "cze"], sk: ["slk", "slo"] } as const)[languageId],
    orthographyRules: [commonOrthography, `Preserve all ${languageId === "pl" ? "Polish ogonek, stroke and acute" : languageId === "cs" ? "Czech caron, acute and ring" : "Slovak acute, caron, diaeresis and circumflex"} characters.`],
    tokenizationRules: [commonTokenization, "Preserve written reflexive particles as separate tokens."],
    contractionRules: [commonContractions, "Do not manufacture fused forms from separately written prepositions and pronouns."],
    cliticRules: [commonClitics, "Use clause position and syntax to identify clitic pronouns and auxiliaries."],
    categories: [CASE_SEVEN, NUMBER_SP, GENDER_3, ANIMACY, PERSON_NUMBER, TENSE_SLAVIC, ASPECT, VOICE_AP, MOOD_ISC, VERB_FORM, DEGREE],
    morphologyOrder: ["personNumber", "tense", "aspect", "voice", "mood", "verbForm", "case", "number", "gender", "animacy", "degree"],
    posShapes: nominalShapes({ animacy: true }), ambiguityRules: [...sharedAmbiguity, "Resolve case syncretism and masculine animacy/personhood from agreement and government."],
    indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: languageId === "pl" ? "kobietami" : "ženami", pos: "NOUN", morphology: "Ins. Pl. f." }],
    invalidExamples: [{ surface: "forma", pos: "NOUN", morphology: "Abl. Pl. f.", reason: "The profile has no ablative case." }],
  })),
  buildProfile({
    languageId: "sl", languageName: "Slovenian", scripts: ["Latn"], aliases: ["slv"],
    orthographyRules: [commonOrthography, "Preserve Slovenian č, š and ž."], tokenizationRules: [commonTokenization, "Preserve separately written reflexive particles."],
    contractionRules: [commonContractions, "Do not invent contractions from separate words."], cliticRules: [commonClitics, "Analyze second-position clitics in full clause context."],
    categories: [CASE_SEVEN, NUMBER_SPD, GENDER_3, ANIMACY, PERSON_NUMBER_DUAL, TENSE_SLAVIC, ASPECT, VOICE_AP, MOOD_ISC, VERB_FORM, DEGREE],
    morphologyOrder: ["personNumber", "tense", "aspect", "voice", "mood", "verbForm", "case", "number", "gender", "animacy", "degree"],
    posShapes: nominalShapes({ dual: true, animacy: true }), ambiguityRules: [...sharedAmbiguity, "Preserve and resolve dual number rather than collapsing it into plural."], indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: "ženama", pos: "NOUN", morphology: "Ins. Du. f." }],
    invalidExamples: [{ surface: "ženama", pos: "NOUN", morphology: "Ins. Pl. f.", reason: "This form is dual in the cited analysis." }],
  }),
  ...(["hr", "sr", "bs"] as const).map((languageId) => buildProfile({
    languageId, languageName: ({ hr: "Croatian", sr: "Serbian", bs: "Bosnian" } as const)[languageId], scripts: languageId === "sr" ? ["Cyrl", "Latn"] : ["Latn"],
    aliases: ({ hr: ["hrv"], sr: ["srp"], bs: ["bos"] } as const)[languageId],
    orthographyRules: [commonOrthography, languageId === "sr" ? "Preserve the supplied Serbian Cyrillic or Latin script without transliteration." : "Preserve č, ć, đ, š and ž."],
    tokenizationRules: [commonTokenization, "Preserve written reflexive particles and auxiliary words separately."], contractionRules: [commonContractions, "Do not invent contractions from separate words."],
    cliticRules: [commonClitics, "Resolve second-position clitic clusters in their full clause context."],
    categories: [CASE_SEVEN, NUMBER_SP, GENDER_3, ANIMACY, PERSON_NUMBER, TENSE_SLAVIC, ASPECT, VOICE_AP, MOOD_ISC, VERB_FORM, DEGREE],
    morphologyOrder: ["personNumber", "tense", "aspect", "voice", "mood", "verbForm", "case", "number", "gender", "animacy", "degree"],
    posShapes: nominalShapes({ animacy: true }), ambiguityRules: [...sharedAmbiguity, "Resolve genitive/accusative and dative/locative syncretism from government and agreement."], indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: languageId === "sr" ? "женама" : "ženama", pos: "NOUN", morphology: "Ins. Pl. f." }],
    invalidExamples: [{ surface: "forma", pos: "NOUN", morphology: "Abl. Pl. f.", reason: "The profile has no ablative case." }],
  })),
  ...(["lt", "lv"] as const).map((languageId) => buildProfile({
    languageId, languageName: languageId === "lt" ? "Lithuanian" : "Latvian", scripts: ["Latn"], aliases: languageId === "lt" ? ["lit"] : ["lav"],
    orthographyRules: [commonOrthography, languageId === "lt" ? "Preserve Lithuanian ogonek, dot, caron and macron characters." : "Preserve Latvian macrons, carons and cedilla/comma letters."],
    tokenizationRules: [commonTokenization, "Keep prepositions and particles separate as written."], contractionRules: [commonContractions, "Do not invent contractions not present in the orthography."],
    cliticRules: [commonClitics, "Classify short pronouns and particles from context rather than spelling alone."],
    categories: [CASE_SEVEN, NUMBER_SP, GENDER_2, DEFINITENESS, PERSON_NUMBER, TENSE_SLAVIC, VOICE_AP, MOOD_ISC, VERB_FORM, DEGREE],
    morphologyOrder: ["personNumber", "tense", "voice", "mood", "verbForm", "case", "number", "gender", "definiteness", "degree"],
    posShapes: nominalShapes({ verbalAspect: false, definiteness: true }), ambiguityRules: [...sharedAmbiguity, "Resolve case and definite adjective forms from agreement and syntactic government."], indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: languageId === "lt" ? "moterims" : "sievietēm", pos: "NOUN", morphology: "Dat. Pl. f." }],
    invalidExamples: [{ surface: "forma", pos: "NOUN", morphology: "Abl. Pl. f.", reason: "The profile has no ablative case." }],
  })),
  ...(["es", "pt", "it", "fr", "ro", "ca"] as const).map((languageId) => {
    const names = { es: "Spanish", pt: "Portuguese", it: "Italian", fr: "French", ro: "Romanian", ca: "Catalan" } as const;
    const aliases = { es: ["spa"], pt: ["por"], it: ["ita"], fr: ["fra", "fre"], ro: ["ron", "rum"], ca: ["cat"] } as const;
    const examples = { es: "hablamos", pt: "falamos", it: "parliamo", fr: "parlons", ro: "vorbim", ca: "parlem" } as const;
    const specialOrthography = {
      es: "Preserve ñ, inverted question/exclamation marks and written accents.",
      pt: "Preserve ã, õ, ç and written accents.",
      it: "Preserve written accents and apostrophized elision.",
      fr: "Preserve accents, diaeresis, cedilla, apostrophes and œ.",
      ro: "Preserve ă, â, î, ș and ț; do not replace comma-below with cedilla forms.",
      ca: "Preserve the middle dot in l·l, ç and written accents.",
    } as const;
    const specialClitic = {
      es: "Analyze enclitic pronouns on infinitives, gerunds and affirmative imperatives without duplicating the host surface.",
      pt: "Analyze proclisis, enclisis and mesoclisis without rewriting the visible orthographic host.",
      it: "Analyze combined proclitic or enclitic pronouns while preserving their written surface once.",
      fr: "Preserve apostrophized clitics and model their syntactic functions without duplicate tokens.",
      ro: "Analyze hyphenated clitic clusters and the enclitic definite article structurally without duplicating text.",
      ca: "Analyze apostrophized and hyphenated weak pronouns while preserving the visible surface once.",
    } as const;
    return buildProfile({
      languageId, languageName: names[languageId], scripts: ["Latn"], aliases: aliases[languageId],
      orthographyRules: [commonOrthography, specialOrthography[languageId]], tokenizationRules: [commonTokenization, "Preserve apostrophe/hyphen conventions and multiword verb constructions exactly as written."],
      contractionRules: [commonContractions, "Recognize language-specific article/preposition contractions only when they are visibly fused."], cliticRules: [commonClitics, specialClitic[languageId]],
      categories: [CASE_NGDA, NUMBER_SP, languageId === "ro" ? GENDER_3 : GENDER_2, DEFINITENESS, PERSON_NUMBER, TENSE_ROMANCE, VOICE_AP, MOOD_ISC, VERB_FORM, DEGREE],
      morphologyOrder: ["personNumber", "tense", "mood", "voice", "verbForm", "case", "definiteness", "number", "gender", "degree"],
      posShapes: romanceShapes, ambiguityRules: [...sharedAmbiguity, "Use case labels only where the language actually distinguishes them, principally in pronominal paradigms."], indeclinablePos: DEFAULT_INDECLINABLE_POS,
      validExamples: [{ surface: examples[languageId], pos: "VERB", morphology: "1P Pres. Ind." }],
      invalidExamples: [{ surface: examples[languageId], pos: "VERB", morphology: "1P Pres. Act. Ind.", reason: "Do not inject a voice label when this profile does not require one for the form." }],
    });
  }),
  buildProfile({
    languageId: "sq", languageName: "Albanian", scripts: ["Latn"], aliases: ["sqi", "alb"],
    orthographyRules: [commonOrthography, "Preserve Albanian ë and ç and the standard digraph spelling."], tokenizationRules: [commonTokenization, "Preserve analytic particles and auxiliaries as separate words."],
    contractionRules: [commonContractions, "Do not split fused preposition/article forms into duplicate visible tokens."], cliticRules: [commonClitics, "Resolve short object-pronoun clitics and doubled objects from full syntax."],
    categories: [CASE_ALBANIAN, NUMBER_SP, GENDER_2, DEFINITENESS, PERSON_NUMBER, TENSE_ROMANCE, VOICE_AM, MOOD_ISC, VERB_FORM, DEGREE],
    morphologyOrder: ["personNumber", "tense", "mood", "voice", "verbForm", "case", "number", "gender", "definiteness", "degree"],
    posShapes: albanianShapes, ambiguityRules: [...sharedAmbiguity, "Resolve case and postposed definiteness from the complete noun phrase."], indeclinablePos: DEFAULT_INDECLINABLE_POS,
    validExamples: [{ surface: "libër", pos: "NOUN", morphology: "Nom. Sg. m. Indef." }],
    invalidExamples: [{ surface: "libër", pos: "NOUN", morphology: "Loc. Sg. m.", reason: "Do not invent a locative analysis where the form is nominative." }],
  }),
] as const satisfies readonly OmniLanguageProfile[];

const uniqueNonEmptyStrings = (values: readonly string[], path: string, errors: string[]) => {
  if (!values.length) errors.push(`${path} must not be empty.`);
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => !value)) errors.push(`${path} must contain only non-empty strings.`);
  if (new Set(normalized).size !== normalized.length) errors.push(`${path} must not contain duplicates.`);
};

/** Structural gate: a profile cannot become Rich merely because its ID is listed. */
export function validateOmniLanguageProfile(profile: OmniLanguageProfile): OmniProfileValidation {
  const errors: string[] = [];
  const normalized = normalizeBcp47LanguageId(profile.languageId);
  if (!normalized.valid || normalized.primaryLanguage !== profile.languageId || !richIdSet.has(profile.languageId)) {
    errors.push("languageId must be a canonical registered rich-language identifier.");
  }
  if (profile.profileVersion !== OMNI_LANGUAGE_PROFILE_VERSION) errors.push("profileVersion is unsupported.");
  if (profile.morphologyStandard !== `stoa.omni.${profile.languageId}.v1`) errors.push("morphologyStandard must match the versioned profile identifier.");
  if (profile.status !== "validated") errors.push("status must be validated for a Rich profile.");
  if (!profile.languageName.trim()) errors.push("languageName must not be empty.");
  uniqueNonEmptyStrings(profile.aliases, "aliases", errors);
  for (const alias of profile.aliases) {
    const normalizedAlias = normalizeBcp47LanguageId(alias);
    if (!normalizedAlias.valid || normalizedAlias.primaryLanguage !== profile.languageId) {
      errors.push(`alias ${alias} must canonicalize to ${profile.languageId}.`);
    }
  }
  uniqueNonEmptyStrings(profile.scripts, "scripts", errors);
  if (profile.scripts.some((script) => !KNOWN_SCRIPTS.has(script) || script.startsWith("Z"))) errors.push("scripts must contain concrete ISO 15924 identifiers.");
  for (const [key, values] of Object.entries({
    orthographyRules: profile.orthographyRules,
    tokenizationRules: profile.tokenizationRules,
    contractionRules: profile.contractionRules,
    cliticRules: profile.cliticRules,
    ambiguityRules: profile.ambiguityRules,
  })) uniqueNonEmptyStrings(values, key, errors);
  if (!profile.categories.length) errors.push("categories must not be empty.");
  const categoryIds = new Set<string>();
  for (const item of profile.categories) {
    if (!item.id.trim() || categoryIds.has(item.id)) errors.push(`category ${item.id || "<empty>"} must have a unique id.`);
    categoryIds.add(item.id);
    uniqueNonEmptyStrings(item.allowedValues, `category ${item.id} allowedValues`, errors);
    for (const value of item.allowedValues) {
      if (!item.abbreviations[value]?.trim()) errors.push(`category ${item.id} is missing an exact abbreviation for ${value}.`);
    }
    const extraAbbreviations = Object.keys(item.abbreviations).filter((value) => !item.allowedValues.includes(value));
    if (extraAbbreviations.length) errors.push(`category ${item.id} has abbreviations for undeclared values.`);
  }
  const categoryById = new Map(profile.categories.map((item) => [item.id, item]));
  uniqueNonEmptyStrings(profile.morphologyOrder, "morphologyOrder", errors);
  for (const id of categoryIds) if (!profile.morphologyOrder.includes(id)) errors.push(`morphologyOrder omits category ${id}.`);
  for (const id of profile.morphologyOrder) if (!categoryIds.has(id)) errors.push(`morphologyOrder references unknown category ${id}.`);
  const morphologyIndex = new Map(profile.morphologyOrder.map((id, index) => [id, index]));
  for (const [pos, shape] of Object.entries(profile.posShapes)) {
    if (!udPosSet.has(pos as OmniUdPos)) errors.push(`posShapes.${pos} is not a UD POS value.`);
    if (!shape?.length) errors.push(`posShapes.${pos} must not be empty.`);
    for (const id of shape ?? []) if (!categoryIds.has(id)) errors.push(`posShapes.${pos} references unknown category ${id}.`);
    const indices = (shape ?? []).map((id) => morphologyIndex.get(id) ?? Number.MAX_SAFE_INTEGER);
    if (indices.some((value, index) => index > 0 && value <= indices[index - 1])) {
      errors.push(`posShapes.${pos} must follow the mandatory morphologyOrder.`);
    }
  }
  if (!Object.keys(profile.posShapes).length) errors.push("posShapes must not be empty.");
  const reachableCategories = new Set(Object.values(profile.posShapes).flatMap((shape) => shape ?? []));
  for (const id of categoryIds) {
    if (!reachableCategories.has(id)) errors.push(`category ${id} is not reachable from any POS-specific shape.`);
  }
  uniqueNonEmptyStrings(profile.indeclinablePos, "indeclinablePos", errors);
  if (profile.indeclinablePos.some((pos) => !udPosSet.has(pos))) errors.push("indeclinablePos must contain only UD POS values.");
  if (!profile.validExamples.length) errors.push("validExamples must not be empty.");
  if (!profile.invalidExamples.length) errors.push("invalidExamples must not be empty.");
  for (const example of profile.validExamples) {
    if (!example.surface.trim() || !example.morphology.trim()) errors.push("Every valid example needs surface and morphology.");
    const shape = profile.posShapes[example.pos];
    if (!shape?.length) {
      errors.push(`Valid example ${example.surface} uses POS ${example.pos} without a POS-specific shape.`);
      continue;
    }
    let previousCategoryIndex = -1;
    for (const morphologyItem of example.morphology.trim().split(/\s+/u)) {
      const categoryIndex = shape.findIndex((id, index) => index > previousCategoryIndex
        && Object.values(categoryById.get(id)?.abbreviations ?? {}).includes(morphologyItem));
      if (categoryIndex < 0) {
        errors.push(`Valid example ${example.surface} has unsupported or out-of-order morphology item ${morphologyItem}.`);
        break;
      }
      previousCategoryIndex = categoryIndex;
    }
  }
  for (const example of profile.invalidExamples) {
    if (!example.surface.trim() || !example.morphology.trim() || !example.reason.trim()) errors.push("Every invalid example needs surface, morphology and reason.");
  }
  return { valid: errors.length === 0, errors };
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
};

const registryEntries = richProfiles.map((profile) => {
  const validation = validateOmniLanguageProfile(profile);
  if (!validation.valid) throw new Error(`Invalid bundled OMNI profile ${profile.languageId}: ${validation.errors.join(" ")}`);
  return [profile.languageId, deepFreeze(profile)] as const;
});

export const OMNI_LANGUAGE_PROFILE_REGISTRY: Readonly<Record<OmniRichLanguageId, OmniLanguageProfile>> = Object.freeze(
  Object.fromEntries(registryEntries) as Record<OmniRichLanguageId, OmniLanguageProfile>,
);

export function getOmniLanguageProfile(languageId: unknown): OmniLanguageProfile | null {
  const normalized = normalizeBcp47LanguageId(languageId);
  return richIdSet.has(normalized.primaryLanguage)
    ? OMNI_LANGUAGE_PROFILE_REGISTRY[normalized.primaryLanguage as OmniRichLanguageId]
    : null;
}

export function normalizeOmniLanguageDetection(
  value: Partial<OmniLanguageDetection> | null | undefined,
  sourceText: string,
): { detection: OmniLanguageDetection; sourceScript: OmniSourceScriptDetection; warnings: string[] } {
  const sourceScript = detectOmniSourceScript(sourceText);
  const language = normalizeBcp47LanguageId(value?.languageId);
  const profile = getOmniLanguageProfile(language.languageId);
  const languageName = profile?.languageName
    ?? safeText(value?.languageName, language.primaryLanguage === "und" ? "Undetermined" : language.languageId);
  const reportedScript = normalizeIso15924Script(value?.script);
  const warnings: string[] = [];
  if (!language.valid) warnings.push("The reported language identifier was invalid and was normalized to und.");
  const languageTagScriptMismatch = language.script !== null
    && sourceScript.script !== "Zzzz"
    && language.script !== sourceScript.script;
  if (languageTagScriptMismatch) {
    warnings.push(`The language identifier's ${language.script} script subtag did not match the locally detected ${sourceScript.script} script and was removed.`);
  }
  if (reportedScript !== "Zzzz" && sourceScript.script !== "Zzzz" && reportedScript !== sourceScript.script) {
    warnings.push(`The reported script ${reportedScript} did not match the locally detected ${sourceScript.script} script.`);
  }
  if (sourceScript.isMixedScript) warnings.push(`Multiple source scripts were detected: ${sourceScript.scripts.join(", ")}.`);
  return {
    detection: {
      schemaVersion: OMNI_LANGUAGE_DETECTION_SCHEMA_VERSION,
      languageId: languageTagScriptMismatch ? language.primaryLanguage : language.languageId,
      languageName,
      script: sourceScript.script,
      confidence: clampConfidence(value?.confidence),
      isMixedLanguage: value?.isMixedLanguage === true,
    },
    sourceScript,
    warnings,
  };
}

const genericCapabilities: OmniLocalCapabilities = Object.freeze({
  hideIndeclinableDetails: false,
  exportProject: true,
  exportLatex: false,
  exportPng: true,
  exportPdf: true,
});

const richCapabilities: OmniLocalCapabilities = Object.freeze({
  hideIndeclinableDetails: true,
  exportProject: true,
  exportLatex: true,
  exportPng: true,
  exportPdf: true,
});

const LANGUAGE_EVIDENCE_WORDS: Readonly<Record<OmniRichLanguageId, readonly string[]>> = Object.freeze({
  el: ["και", "ειναι", "το", "την", "η", "ο", "σε", "με", "που", "δεν", "για", "απο"],
  de: ["der", "die", "das", "und", "ist", "nicht", "ein", "eine", "doch", "ja", "eben", "sich", "mit", "für", "von", "zu"],
  is: ["og", "að", "er", "ekki", "sem", "með", "það", "ég", "hann", "hún", "fyrir"],
  fo: ["og", "at", "er", "ikki", "sum", "við", "tað", "eg", "hann", "hon", "fyri"],
  ru: ["и", "в", "не", "на", "что", "он", "она", "это", "как", "с", "по", "для", "но"],
  uk: ["і", "в", "не", "на", "що", "він", "вона", "це", "як", "з", "для", "але", "та"],
  pl: ["i", "w", "nie", "na", "że", "jest", "się", "z", "do", "dla", "ale", "który"],
  cs: ["a", "v", "ne", "na", "že", "je", "se", "z", "do", "pro", "ale", "který"],
  sk: ["a", "v", "nie", "na", "že", "je", "sa", "z", "do", "pre", "ale", "ktorý"],
  sl: ["in", "v", "ne", "na", "da", "je", "se", "z", "do", "za", "ampak", "ki"],
  hr: ["i", "u", "ne", "na", "da", "je", "se", "s", "do", "za", "ali", "koji"],
  sr: ["и", "у", "не", "на", "да", "је", "се", "са", "до", "за", "али", "који", "i", "u", "ne", "da", "je", "se"],
  bs: ["i", "u", "ne", "na", "da", "je", "se", "s", "do", "za", "ali", "koji"],
  lt: ["ir", "į", "ne", "kad", "yra", "su", "iš", "už", "bet", "kuris"],
  lv: ["un", "ir", "ne", "ka", "ar", "no", "par", "bet", "kas"],
  es: ["el", "la", "los", "las", "y", "de", "que", "en", "un", "una", "por", "para", "con", "no", "se", "es"],
  pt: ["o", "a", "os", "as", "e", "de", "que", "em", "um", "uma", "por", "para", "com", "não", "se"],
  it: ["il", "lo", "la", "i", "gli", "le", "e", "di", "che", "in", "un", "una", "per", "con", "non", "si"],
  fr: ["le", "la", "les", "et", "de", "que", "en", "un", "une", "pour", "avec", "ne", "pas", "se", "des"],
  ro: ["și", "în", "de", "că", "este", "un", "o", "pentru", "cu", "nu", "se", "din"],
  ca: ["el", "la", "els", "les", "i", "de", "que", "en", "un", "una", "per", "amb", "no", "es"],
  sq: ["dhe", "në", "të", "që", "është", "një", "për", "me", "nuk", "se", "nga"],
});

const LANGUAGE_DISTINCTIVE_PATTERNS: Partial<Record<OmniRichLanguageId, RegExp>> = {
  de: /ß/u,
  is: /[þæ]/iu,
  fo: /ø/iu,
  uk: /[іїєґ]/iu,
  pl: /[ąęłńśźż]/iu,
  cs: /[ěřůďťň]/iu,
  sk: /[äľĺôŕ]/iu,
  sr: /[љњђћџјђ]|đ/iu,
  lt: /[ėįųū]/iu,
  lv: /[āēģīķļņū]/iu,
  es: /ñ|[¿¡]/iu,
  pt: /[ãõ]/iu,
  fr: /œ/iu,
  ro: /[ășț]/iu,
  ca: /l[·ŀ]l/iu,
  sq: /ë/iu,
};

const evidenceText = (value: string) => value
  .toLocaleLowerCase("und")
  .normalize("NFD")
  .replace(/\p{Mark}+/gu, "")
  .normalize("NFC");

/** Independent, conservative source check used before untrusted JSON can unlock Rich mode. */
export function sourceSupportsOmniLanguageProfile(
  sourceText: string,
  profile: OmniLanguageProfile,
): boolean {
  const script = detectOmniSourceScript(sourceText);
  if (!profile.scripts.includes(script.script) || script.isMixedScript) return false;
  const letters = [...sourceText].filter((character) => /\p{Letter}/u.test(character)).length;
  if (letters < 3) return false;
  const pattern = LANGUAGE_DISTINCTIVE_PATTERNS[profile.languageId];
  if (pattern?.test(sourceText)) return true;
  const tokens = evidenceText(sourceText).match(/\p{Letter}+/gu) ?? [];
  const markerSet = new Set(LANGUAGE_EVIDENCE_WORDS[profile.languageId].map(evidenceText));
  const matches = new Set(tokens.filter((token) => markerSet.has(token)));
  return matches.size >= 2;
}

/**
 * Derives the effective profile exclusively from local state. AI-supplied mode,
 * morphology-standard and capability claims are deliberately ignored.
 */
export function resolveOmniLanguageProfile(input: ResolveOmniLanguageProfileInput): OmniProfileResolution {
  const normalized = normalizeOmniLanguageDetection(input.detection, input.sourceText);
  const warnings = [...normalized.warnings];
  const detectedLanguage = normalizeBcp47LanguageId(normalized.detection.languageId);
  const requestedOverride = input.manualOverride ?? null;
  const normalizedOverride = requestedOverride
    ? normalizeBcp47LanguageId(requestedOverride.languageId)
    : null;
  const manualOverride = requestedOverride
    ? { languageId: normalizedOverride?.languageId ?? "und", confirmed: requestedOverride.confirmed === true }
    : null;
  const useManual = Boolean(manualOverride?.confirmed && normalizedOverride?.valid);
  if (requestedOverride && !requestedOverride.confirmed) warnings.push("The manual language override is not confirmed and was not applied.");
  if (requestedOverride?.confirmed && !normalizedOverride?.valid) warnings.push("The manual language override was invalid and could not be applied.");
  const selected = useManual ? normalizedOverride! : detectedLanguage;
  const selectedProfile = getOmniLanguageProfile(selected.languageId);
  const ignoredAiClaims = Object.entries(input.aiClaims ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (ignoredAiClaims.length) warnings.push(`Ignored AI-supplied capability claims: ${ignoredAiClaims.join(", ")}.`);

  let reason: OmniRoutingReason = useManual ? "manual-override" : "validated-profile";
  let rich = true;
  if (normalized.detection.isMixedLanguage) {
    rich = false; reason = "mixed-language";
    warnings.push("Mixed-language input uses Generic Mode.");
  } else if (normalized.sourceScript.isMixedScript) {
    rich = false; reason = "mixed-script";
    warnings.push("Mixed-script input uses Generic Mode because no validated mixed-script profile is active.");
  } else if (!useManual && normalized.detection.confidence < OMNI_RICH_CONFIDENCE_THRESHOLD) {
    rich = false; reason = detectedLanguage.primaryLanguage === "und" ? "undetermined-language" : "low-confidence";
    warnings.push(`Detection confidence is below ${OMNI_RICH_CONFIDENCE_THRESHOLD.toFixed(2)}; Generic Mode is required until a supported language is confirmed.`);
  } else if (selected.primaryLanguage === "und") {
    rich = false; reason = "undetermined-language";
  } else if (!selectedProfile) {
    rich = false; reason = "unsupported-language";
  } else {
    const validation = validateOmniLanguageProfile(selectedProfile);
    if (!validation.valid) {
      rich = false; reason = "unvalidated-profile";
      warnings.push(`The ${selectedProfile.languageName} profile is incomplete and was routed to Generic Mode.`);
    } else if (normalized.sourceScript.script === "Zzzz") {
      rich = false; reason = "unknown-script";
      warnings.push("The source script could not be established locally.");
    } else if (!selectedProfile.scripts.includes(normalized.sourceScript.script)) {
      rich = false; reason = "script-mismatch";
      warnings.push(`${selectedProfile.languageName} does not validate ${normalized.sourceScript.script} as a source script.`);
    } else if (!useManual && !sourceSupportsOmniLanguageProfile(input.sourceText, selectedProfile)) {
      rich = false; reason = "language-unverified";
      warnings.push(`The source does not provide enough independent local evidence for the ${selectedProfile.languageName} profile; Generic Mode is safer until the language is confirmed.`);
    }
  }

  const profile = rich ? selectedProfile : null;
  return {
    detection: normalized.detection,
    sourceScript: normalized.sourceScript,
    selectedLanguageId: selected.languageId,
    manualOverride,
    analysisProfile: rich ? "rich-inflectional" : "generic",
    morphologyStandard: profile?.morphologyStandard ?? STOA_GENERIC_MORPHOLOGY_STANDARD_ID,
    profile,
    reason,
    warnings,
    ignoredAiClaims,
    capabilities: rich ? richCapabilities : genericCapabilities,
  };
}

/** Explicit token metadata wins; otherwise only the validated active profile may decide. */
export function isOmniTokenIndeclinable(
  token: OmniIndeclinableToken,
  profileOrResolution: OmniLanguageProfile | OmniProfileResolution | null | undefined,
): boolean {
  if (typeof token.isIndeclinable === "boolean") return token.isIndeclinable;
  const profile = profileOrResolution && "analysisProfile" in profileOrResolution
    ? profileOrResolution.analysisProfile === "rich-inflectional" ? profileOrResolution.profile : null
    : profileOrResolution ?? null;
  if (!profile || validateOmniLanguageProfile(profile).valid === false || typeof token.pos !== "string") return false;
  return profile.indeclinablePos.includes(token.pos.trim().toUpperCase() as OmniUdPos);
}

/** Shared, profile-specific fragment for prompt composition. */
export function buildOmniMorphologyProfilePrompt(profile: OmniLanguageProfile): string {
  const validation = validateOmniLanguageProfile(profile);
  if (!validation.valid) throw new Error(`Cannot build a Rich prompt from an incomplete profile: ${validation.errors.join(" ")}`);
  const categoryLines = profile.categories.map((item) =>
    `- ${item.label}: ${item.allowedValues.map((value) => `${value}=${item.abbreviations[value]}`).join("; ")}`,
  );
  const shapeLines = Object.entries(profile.posShapes).map(([pos, shape]) => `- ${pos}: ${(shape ?? []).join(" ")}`);
  const exampleLines = profile.validExamples.map((example) => `- ${example.surface} -> ${example.morphology}`);
  return `${profile.languageName.toUpperCase()} STOA PROFILE ${profile.morphologyStandard} — MANDATORY
Preserve the visible source exactly once. Give every token a non-empty contextual English gloss, dictionary lemma, UD POS and compact morphology. For particles without a natural lexical equivalent, use a short contextual discourse/function gloss. Never add a details property or a fifth Details field; an independently requested romanization reading aid is not part of this four-field Details contract.

ORTHOGRAPHY
${profile.orthographyRules.map((rule) => `- ${rule}`).join("\n")}

TOKENIZATION, CONTRACTIONS AND CLITICS
${[...profile.tokenizationRules, ...profile.contractionRules, ...profile.cliticRules].map((rule) => `- ${rule}`).join("\n")}

EXACT CATEGORIES AND ABBREVIATIONS
${categoryLines.join("\n")}

MANDATORY CATEGORY ORDER
${profile.morphologyOrder.join(" > ")}

POS-SPECIFIC SHAPES
${shapeLines.join("\n")}

AMBIGUITY
${profile.ambiguityRules.map((rule) => `- ${rule}`).join("\n")}

VALID EXAMPLES
${exampleLines.join("\n")}`;
}

/** Compact profile fragment for the one-shot OMNI prompt. Only the active
 * language profile is included; the complete registry remains local policy. */
export function buildCompactOmniMorphologyProfilePrompt(profile: OmniLanguageProfile): string {
  const validation = validateOmniLanguageProfile(profile);
  if (!validation.valid) throw new Error(`Cannot build a Rich prompt from an incomplete profile: ${validation.errors.join(" ")}`);
  const categories = profile.categories.map((category) =>
    `${category.label}: ${category.allowedValues.map((value) => category.abbreviations[value]).join("/")}`,
  ).join("; ");
  const shapes = Object.entries(profile.posShapes)
    .map(([pos, shape]) => `${pos}=${(shape ?? []).join(" ")}`)
    .join("; ");
  const tokenization = [
    profile.tokenizationRules[0],
    profile.contractionRules[0],
    profile.cliticRules[0],
  ].filter(Boolean).join(" ");
  return `ACTIVE LANGUAGE PROFILE: ${profile.languageName} · ${profile.morphologyStandard}
Use only these exact abbreviations: ${categories}
Morphology order: ${profile.morphologyOrder.join(" > ")}
POS shapes: ${shapes}
Tokenization note: ${tokenization}`;
}
