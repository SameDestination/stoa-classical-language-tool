# STOA 5.9.7 — Web release

Date: 2026-09-08. Web-only update and Portable packaging; no desktop build or deployment.

## Scope

- `app/developer-defaults/index.ts`: bundled workspace defaults set `showTranslation: true`. First launch, first workspace visit and Restore Sample use these defaults. Users can turn Translation off. Imported projects preserve their own saved visibility; their settings are not overridden. The four 5.9.6 sample files remain byte-identical.
- `app/lib/omni-compact-morphology.ts`: a conditional morphology-only prompt rule for Spanish, French, German, Italian and Portuguese, including regional variants. Uses Latin-style compact person-number, tense, voice, mood, case, number and gender labels only when linguistically applicable. Prose explanations belong in features; unresolved alternatives belong in alternatives. Nominal and finite-verb examples are included; compactness must never erase necessary distinctions.
- `app/lib/omni-language.ts`: attaches the conditional rule to Latin-script/unknown first-pass OMNI prompts in all existing prompt modes. Non-Latin-script prompts are unchanged. Other Latin-script languages are explicitly excluded by the rule and keep their existing profiles. Detection, capability checks, the profile registry, import schema, classical-language prompts and source tokenization are unchanged.

## Validation

- 35 prompt and renderer-lifecycle tests passed: five-language rules, initial automatic analysis, non-target language profiles, non-Latin romanization, prompt modes, actual sample translation pagination, imported hidden-translation preservation, Project round-trip and blank documents.
- 183 language/sample/history/pagination/PDF tests passed.
- 90 additional project/style/pronunciation/font/LaTeX/export-resource/Portable tests passed.
- The TypeScript → ESLint → production Portable build command completed; the generated HTML identifies STOA 5.9.7.

These are automated code-path/source-contract checks, not browser click-through or Windows hardware tests. No external model was called; the prompt requirements are tested, not guaranteed compliance by a user's chosen model.

## Delivery

Local HTTP byte checks passed for the rebuilt HTML, four canonical samples, Liberation Sans, Vusillus, Source Han Serif SC and PDF worker. ZIP integrity, current HTML, Unicode README filename and executable macOS launcher were verified. The test server was stopped.

- Folder: `outputs/STOA-Portable` (approximately 85 MiB).
- ZIP: `outputs/STOA-5.9.7-Portable.zip` (86,502,314 bytes / 82.50 MiB).
- Generated: 2026-09-08 07:33:24 Asia/Shanghai.
- SHA-256: `d3a2148a690f53b563f6de91e6335afa11bceddd0b6a181e23171ce7bd658246`.
- Older ZIPs and desktop bundles are unchanged.
