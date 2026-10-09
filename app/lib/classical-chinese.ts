/**
 * Philological prompt policy for the officially supported Classical Chinese
 * workspace.  It deliberately stays outside the Indo-European morphology
 * standards used by Ancient Greek and Latin.
 */

export const CLASSICAL_CHINESE_LANGUAGE_ID = "classical-chinese" as const;

export type ClassicalChineseAnnotationTarget = "english" | "chinese";

export const CLASSICAL_CHINESE_MODEL_RECOMMENDATION =
  "For Classical Chinese, STOA recommends trying Qwen first. You may use any compatible model; this is a recommended first choice, not a guarantee.";

const targetRule = (target: ClassicalChineseAnnotationTarget) => target === "chinese"
  ? `Write every contextual gloss, translation and token-level grammatical explanation in clear modern Chinese. Preserve the Classical Chinese source exactly; do not silently modernize it. Document-level scholarly notes remain in formal English.`
  : `Write every contextual gloss, translation and grammatical explanation in English. Document-level scholarly notes also use formal academic English.`;

export const getClassicalChinesePrompt = (
  target: ClassicalChineseAnnotationTarget,
  lockedTokens: boolean,
) => `CLASSICAL CHINESE / LITERARY CHINESE — MANDATORY
${targetRule(target)}

PHILOLOGICAL ANALYSIS
- Analyze according to Classical Chinese grammar and lexical usage, never by mechanically applying Modern Standard Chinese categories.
- Preserve traditional or simplified source characters exactly. If a form is a 通假字 or 異體字/异体字, keep the surface form and use the conventional lexical lemma only when helpful.
- Distinguish lexical category from contextual syntactic function. Resolve particles and grammatical words from their actual construction.
- Recognize topic-comment, serial-verb, pivotal, verb-object, subject-predicate and nominal-predicate constructions; recognize zero copula and omitted arguments in notes without inventing phantom tokens.
- Do not invent case, gender, number, person, tense or other inflectional categories that the form does not express.
- Use morphology as a concise grammatical/function note only when useful (for example Topic marker; Nominal predicate; Resultative complement; Modal particle). Use an empty string when no compact note is needed.
- Give contextual Classical Chinese glosses rather than modern Mandarin dictionary meanings when they differ.

TOKENIZATION
${lockedTokens
    ? "The client supplied stable study tokens. Copy every id and surface exactly once and enrich them without splitting, joining, adding or reordering tokens."
    : "Segment the source exactly once into philologically meaningful lexical or grammatical study units. A token may be one character, a lexicalized multi-character expression, or a grammatical unit. Never split every character blindly."}
- Keep punctuation outside surface, preserve all punctuation and paragraph structure, and never create tokens for omitted words.
- Treat grammatical particles as separate tokens when orthographically present, but do not split one character into multiple tokens merely because it has multiple functions.

PINYIN READING AID — REQUIRED
- Return a string field named pinyin for every token. Give contextually appropriate Modern Standard Mandarin Hanyu Pinyin; this is a present-day reading aid, never a claim about Old or Middle Chinese pronunciation.
- Use Unicode tone marks, not tone numbers, and normalize the result to NFC. Follow GB/T 16159 word spelling where a multi-character lexical token is written as a word; a single-character token normally receives one syllable.
- Preserve conventional capitalization for sentence openings and proper names. Return an empty string for tokens containing no Han character, including punctuation-only, Arabic-number, or symbol tokens.
- Resolve polyphonic characters from the complete source context. Never replace, normalize, or romanize the surface field itself.

TRANSLATION
- Produce both a close literal translation and a fluent natural translation in the selected annotation language.
- Put substantial alternative readings in alternatives or notes; prefer the reading best supported by syntax and immediate context.`;
