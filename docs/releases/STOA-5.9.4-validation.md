# STOA 5.9.4 Web validation

Date: 2026-09-07. The initial source/development update was followed by explicitly authorized web Portable packaging. Desktop packaging remains deferred.

- TypeScript `tsc --noEmit`: passed.
- ESLint: passed.
- Production tool build `npm run build:web`: passed, using the shared renderer at `standalone/main.tsx` and `app/stoa-studio.tsx`. Build output is `build/web`, not the release folder.
- Existing marketing website production build: passed.
- Tool development entry `http://127.0.0.1:5173/`: HTTP 200. The full Liberation Sans Regular font endpoint returns HTTP 200 with 410,712 bytes.
- 211 regression tests: passed. Includes language prompts, permissive analysis imports, project/style serialization, independent history, default samples, blank documents, publication pagination, scholarly notes, Pinyin/romanization, vector PDF, PDF-derived PNG, LaTeX and imported fonts.
- Times New Roman test: loaded the four original local macOS font faces into the normal font-import/PDF pipeline; PDF contains TimesNewRomanPS font names, selectable text and no raster image. Missing Times font bytes now produce an explicit error rather than substitution.
- Pinyin regression includes `xué nǚ lǜ lǚ shuǐ hǎo ǹ ḿ ê`; romanization regression includes macrons, underdots and modifier-letter apostrophes. Text is searchable vector content. PDF-derived PNG decoding passed.
- Full Liberation Sans 2.1.5 replaces the incomplete font subsets. OMNI's coverage table was regenerated from the intersection of all four actual font faces.
- Translation style round-trip: custom font, size, color, bold, explicit non-italic and underline values survive project serialization.
- Actual XeLaTeX compilation: a long, blue, bold, underlined translation with paragraph breaks compiles successfully across four A4 pages. Two passes complete without overflow or reference warnings.
- No browser interaction/screenshot audit was performed in this task. CSS layout and controls were checked through source, compilation and existing contract tests; PDF functionality was checked using generated PDF content and rendering tests.

The current web release is `outputs/STOA-Portable`, with its ZIP at `outputs/STOA-5.9.4-Portable.zip`. `npm run build:portable` passed, as did all 11 packaging/startup/export-asset tests. A local HTTP smoke check confirmed the production HTML version and byte-identical decompression of all four Liberation Sans faces, Vusillus, Source Han Serif SC and the PDF worker. ZIP integrity validation passed. The folder is 84.75 MiB. Browser interaction and a real Windows launch were not repeated during packaging.

Existing `outputs/STOA-5.9.2-Portable.zip` and desktop DMGs are unchanged. Do not use the marketing website's old 3.5 trial page as the 5.9.4 tool preview.

Times New Roman is a device-local font. Use “Load Times New Roman from this device” where Local Font Access is supported, or import its TTF/OTF faces using Import font. No Microsoft font file is included in the repository or distribution. Liberation Serif is available as an explicitly named bundled alternative.

## 2026-09-07 blank-document hotfix

The initial factory-only tests missed a renderer integration failure: `normalizeImportedProject` passed a valid empty project into AI analysis normalization, which rejected `tokens: []`. Both New and importing saved empty projects were affected. Projects now explicitly allow empty token arrays after schema validation, while AI responses still require tokens. New uses the bundled-default path, clears old import feedback/dictionary popovers, and reports unexpected failures without a false success message.

Additional verified fixes:

- OMNI New removes the sample's language detection and manual override metadata.
- Explicit legacy `false` emphasis/underline values survive renderer normalization.
- Older projects without pronunciation styling derive its default size from the imported source style, rather than the generic startup size. Explicit user pronunciation and translation styles remain intact.
- PDF/PNG controls are disabled with an explanation for an empty token document, matching the pre-existing export handlers' empty-document guard.

Validation: 17 new renderer-path/button-handler tests pass, including all four workspace mappings, empty Project reopening, empty one-page pagination, immutable samples, running-text clearing, error handling and typography. CSS/inline dictionary-worker imports are stubbed only for the Node test environment; the project/default/parser functions and button callback are real source. This is not a browser interaction test. An additional 90 project, token-style, font, LaTeX, export-resource and Portable tests pass; the language/pagination/PDF suite contains 183 passing tests. No manual Windows or browser click-through QA is claimed.

Final delivery: TypeScript and ESLint passed after the completed patch. The production Portable build passed. All 183 language-suite tests were rerun successfully after updating the PDF/PNG empty-document UI contracts. The actual local HTTP server returned byte-identical rebuilt HTML and seven checked font/worker assets. ZIP integrity, current HTML, UTF-8 filenames and the macOS executable launcher were verified. Temporary validation servers were stopped; no website was deployed and desktop bundles remain unchanged.

- Folder: `outputs/STOA-Portable` (84.75 MiB).
- ZIP: `outputs/STOA-5.9.4-Portable.zip` (86,475,159 bytes / 82.47 MiB).
- Built: 2026-09-07 16:50:29 Asia/Shanghai.
- ZIP SHA-256: `de776591962f704f78aed2b7c8bf7045d0146f6ecf32abd9bba5b099856f0f00`.
