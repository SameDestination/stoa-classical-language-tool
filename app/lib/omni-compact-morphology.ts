/** Display-only prompt policy. Does not change detection, profiles or imports. */
export const OMNI_COMPACT_MODERN_MORPHOLOGY_PROMPT = `FIVE-LANGUAGE COMPACT MORPHOLOGY — CONDITIONAL AND MANDATORY
Apply this section ONLY when your analysis identifies the source as Spanish (es/spa), French (fr/fra/fre), German (de/deu/ger), Italian (it/ita), or Portuguese (pt/por), including regional varieties such as es-MX, fr-CA and pt-BR. For every other language keep the existing language-profile or Generic morphology scheme unchanged. For uncertain or mixed-language input, retain the existing Generic policy; never guess a target language just to apply these abbreviations.

For these five languages, morphology MUST be a short label, not an explanation. Follow STOA Latin's compact abbreviation style, but only describe categories genuinely expressed in the language and token. Use these spellings consistently:
- Case: Nom.; Gen.; Dat.; Acc. Use case on German inflected forms and on Romance pronouns only where genuinely distinguished. Never invent Latin Abl., Voc., Loc., deponents, gerundives or supines for these languages.
- Number: Sg.; Pl. Gender: m.; f.; n. only where applicable.
- Finite person-number: 1S; 2S; 3S; 1P; 2P; 3P. Never write "third person singular" or "3rd Sg.".
- Tense: Pres.; Past.; Imperf.; Pret.; Fut.; Perf.; Plup.; Fut. Perf. Choose the language-appropriate distinction, not all alternatives.
- Voice: Act.; Pass. Mood: Ind.; Subj.; Imp.; Cond. Non-finite form: Inf.; Part.; Ger. only where applicable. Degree: Comp.; Superl.; omit unmarked positive degree.
- When needed: Def.; Indef.; Refl.; Clit.; Adv.; Prep.; Conj.; Part. Do not repeat the separate pos field or add redundant features to every label.

Compact display order for these five languages (takes precedence over a conflicting profile display order, not over its grammatical facts):
- Nominals/adjectives: [Case] Number Gender [Degree]. Normally "Pl. f." for a Romance noun/adjective, not a prose phrase; German may require "Dat. Pl. n.". Omit inapplicable categories.
- Finite verbs: PersonNumber Tense Voice Mood, e.g. "1P Pres. Act. Ind.". Do not append explanations of conjugation classes, auxiliary constructions or syntactic functions.
- Non-finite forms: [Tense] [Voice] Inf./Part./Ger. [Number] [Gender]; only include categories expressed by that form. No invented finite person or mood.
- Indeclinables: a short applicable functional abbreviation, e.g. "Adv.", "Conj.", "Prep." or "Prep. + Dat." when case government is useful; otherwise an empty string is allowed.
- Keep each orthographic token once in periphrastic constructions. Do not attach the analysis of the entire phrase to every auxiliary and participle. Do not duplicate person/number as both "3S" and "Sg.".

Aim for 1–4 compact groups, usually under 30 characters; retain genuinely necessary distinctions rather than truncating or mislabeling them. Put extra grammatical detail (e.g. German subjunctive subtype, agreement class or clitic function) in features, and unresolved alternatives in alternatives, not in morphology. Never shorten gloss, lemma, romanization, translation or source text to meet this morphology-only rule.
Examples (unambiguous present-tense contexts): Spanish hablamos → 1P Pres. Act. Ind.; French parlons → 1P Pres. Act. Ind.; German sprechen (with wir) → 1P Pres. Act. Ind.; Italian parliamo → 1P Pres. Act. Ind.; Portuguese falamos → 1P Pres. Act. Ind. Resolve each actual token from its own context.`;
