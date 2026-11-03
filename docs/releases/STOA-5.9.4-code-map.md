# STOA 5.9.4 — Web source review map

This update changes the shared web renderer only. Following the user's explicit packaging request on 2026-09-07, the web release is available in `outputs/STOA-Portable` and `outputs/STOA-5.9.4-Portable.zip`. No desktop build or installer was generated; existing desktop outputs remain unchanged.

Run `npm run dev:web` in the repository and open the Local URL printed by Vite to review 5.9.4. `npm run build:web` validates the tool's production renderer into `build/web`; it does not touch `outputs` or create a release package. The existing `npm run dev` and `npm run build` commands belong to the separate marketing website and its older trial.

## AI prompts and JSON import: review these paths

All paths are relative to the repository root.

| Workspace / responsibility | Source path | Entry points |
| --- | --- | --- |
| Ancient Greek and Latin full prompts | `app/language-config.ts` | `buildLanguageSystemPrompt`, `buildLanguageUserPrompt`, `buildLanguageAnalysisPrompts`, `responseShape` |
| Exact Greek and Latin morphology labels | `app/lib/morphology-standards.ts` | `getStoaMorphologyPrompt`, `STOA_MORPHOLOGY_STANDARDS` |
| Classical Chinese English/Chinese prompt policy and Pinyin | `app/lib/classical-chinese.ts` | `getClassicalChinesePrompt` |
| OMNI detection, model tokenization and optional user-supplied tokens | `app/lib/omni-language.ts` | `buildOmniAnalysisPrompts` |
| All prompt dialogs and downloadable JSON instructions | `app/stoa-studio.tsx` | `makeUserPrompt` |
| All analysis-file/paste UI and preview commit | `app/stoa-studio.tsx` | `loadAnalysisJsonFile`, `importJson`, `applyImportedAnalysisBatch` |
| Greek/Latin/Classical Chinese permissive JSON parsing, retained batches and ID repair | `app/lib/json-workspace.ts` | `loadPermissiveAnalysis`, `applyPermissiveJsonWorkspaceBatch`, `mergeJsonWorkspaceAnalysis` |
| OMNI permissive JSON import | `app/lib/json-workspace.ts` | `loadPermissiveOmniAnalysis` |
| JSON extraction and safe syntactic repair, shared by import | `app/lib/ai-pipeline.ts` | `parseAiJsonResponse` |
| Full Project JSON codec and backward-compatible migration | `app/lib/stoa-project.ts` | `parseStoaProject`, `serializeStoaProject`, `migrateStoaProjectToLatest` |

The renderer-level bridge is `normalizeImportedProject` in `app/stoa-studio.tsx`. It accepts empty tokens only after full Project schema validation; ordinary AI analysis normalization still requires usable tokens. The New button uses `createDeveloperWebBlankProject` followed by the bundled-project normalization path. `npm run test:web-documents` executes these real functions and the New button callback, in addition to the codec/factory tests.

The web Full AI Prompt sends the exact source text with `mode: "full-text"`. The AI selects token boundaries, emits sequential IDs, separates punctuation and anchors notes using those IDs. Import accepts the returned token order; it does not compare against client-generated segmentation. Greek and Latin use orthographic words; Classical Chinese uses meaningful lexical/grammatical units and contextual Mandarin Pinyin.

OMNI continues to use model tokenization by default. Explicit user-provided tokens are an existing optional workflow, not automatic client segmentation. The legacy locked-token/API/chunk code remains for the existing desktop build; the web UI no longer offers Guided Chunk Analysis.

## Fonts and publication

- `public/fonts/LiberationSans-*.ttf`: complete official Liberation 2.1.5 fonts, replacing incomplete subsets. Source: https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5 . Existing OFL notice retained. `app/lib/omni-export.ts` coverage ranges are the intersection of the actual four font faces.
- `app/lib/user-fonts.ts`: device-local Times New Roman loading/import, preview FontFace registration and font references. No Microsoft font files are redistributed. Browsers supporting Local Font Access can load installed faces after the user clicks the button; other browsers use the existing TTF/OTF import. Import all four faces for regular/bold/italic/bold italic.
- `app/vector-pdf.ts`: embeds imported Times New Roman; rejects silent substitution when those bytes are unavailable. Liberation Serif is explicitly named as a separate bundled Times-compatible alternative.
- `app/lib/pronunciation.ts`: fixed Liberation Sans reading-aid style.
- `app/stoa-studio.tsx`, `app/vector-pdf.ts`, `app/lib/latex-export.ts`: one set of translation typography settings, used by both literal and idiomatic translation, in Preview, vector PDF and LaTeX. PNG continues to rasterize the final PDF.
- Translation settings: `translationFont`, `translationSize`, `translationColor`, `translationBold`, `translationItalic`, `translationUnderline`. Omitted settings preserve earlier behavior (annotation font, document ink, regular italic). `app/lib/stoa-project.ts` preserves these settings during Project Export/Import.
- `app/developer-defaults/index.ts`: `createDeveloperWebBlankProject` creates an independent blank document using packaged defaults, retaining only Header Right among the four running-text fields. The action remains undoable.
- `app/globals.css`: centered page stack and distinct LaTeX/PNG export colors.

## Future desktop instruction

The next explicitly requested desktop update must remove the desktop Import Project / Export Project controls because native Open / Save / Save As cover that document workflow. Keep Web Import Project / Export Project. Do not remove the project serialization format or compatibility codec. This is recorded for the future; no desktop bundle is changed in 5.9.4.
