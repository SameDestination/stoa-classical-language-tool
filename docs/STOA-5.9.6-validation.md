# STOA 5.9.6 — Web release

Date: 2026-09-08. Web-only update; no desktop build or deployment.

## Changes

- Replaced the four canonical files in `app/developer-defaults/samples/` with byte-identical copies of the supplied projects. Updated the integrity manifest in `app/developer-defaults/index.ts`. Startup, first workspace visit, Restore Sample, and Portable sample copies share that source. Canonical files are never given to working state by reference.
- Retained the existing developer policy: Translation starts hidden for bundled samples. Direct Project Import preserves the saved `showTranslation` value. All supplied annotations, styles, paragraph breaks, reading aids and translations remain stored.
- Moved the single More · Token Editor button from Preview's export toolbar to the left 02 · TOKEN EDITOR heading. Reuses More · Default styles button styling, existing selection/AI disabled rules, dialog state and click handler. Removed obsolete export-toolbar styling. The confidence badge remains beside the editor heading content.

## Project schema-contract audit

The exporter and parser both use `stoa-project` schema version 6. Application version 5.9.6 is not a schema version; no format bump is necessary.

The audit tests the actual renderer chain, not just the JSON codec:

`normalizeImportedProject → createProjectFile → serializeStoaProject → normalizeImportedProject → createProjectFile → serializeStoaProject`

Three real renderer-normalization mismatches were corrected:

1. A saved empty POS (present in the new OMNI sample) became `X`.
2. Project tokens passed through AI punctuation repair, which could split an intentionally saved surface even when punctuation fields were explicitly empty.
3. Header/footer strings longer than 500 characters could be exported but were silently replaced during import, despite the UI and codec accepting them.

Validated Projects now retain those values. AI analysis imports keep their independent repair/default behavior. The earlier fix allowing schema-valid empty projects remains covered.

All four raw supplied sample `document` objects match the results of actual UI-level import/export. Additional round-trip fixtures cover A3/custom landscape paper, styles, notes, punctuation, breaks, Pinyin/romanization, selected tokens, false emphasis values, font references, nested feature/alternative values and unknown extension fields. Existing OMNI exchange policy still revalidates AI language/profile claims locally; this is intentional and is not removed to force arbitrary input equality.

Review paths:

- `app/stoa-studio.tsx`: `normalizeImportedAnalysis`, `normalizeImportedProject`, `normalizeProjectSettings`, `createProjectFile`, `exportProject`, `importProject`.
- `app/lib/stoa-project.ts`: shared schema, migration, serialization and preserved extension fields.
- `tests/web-document-lifecycle.test.ts`: real renderer import/export, blank-document callback and inspector-button contracts.

## Font portability limitation

The Latin sample uses Times New Roman and carries four device-local font references. A different computer/browser needs the corresponding font files loaded/imported before matching vector export; project JSON transports references, not licensed font binaries. No font is silently changed in the supplied sample. This is a resource dependency, not a schema mismatch.

## Validation scope

Automated code-path and source-layout contract tests are used; no browser click-through/visual audit or Windows hardware test is claimed. CSS and inline worker module imports are inert only inside Node tests; the project parser, normalizer and exporter execute real source.

Completed checks:

- TypeScript `tsc --noEmit` and ESLint: passed.
- Production Portable build: passed.
- 183 language/sample/history/pagination/PDF tests: passed.
- 30 renderer lifecycle/export-import contract tests: passed, including empty and populated projects without an imported base.
- 90 additional project/style/pronunciation/font/LaTeX/export-assets/Portable tests: passed after regenerating the package.
- Local HTTP: rebuilt 5.9.6 HTML, all four supplied sample files, four Liberation Sans faces, Vusillus, Source Han Serif SC and PDF worker were byte-verified.
- ZIP: integrity, current HTML, UTF-8 names and executable macOS launcher mode verified. Test server stopped.

## Delivery

- Folder: `outputs/STOA-Portable` (85.03 MiB).
- Archive: `outputs/STOA-5.9.6-Portable.zip` (86,500,698 bytes / 82.49 MiB).
- Generated: 2026-09-08 02:40:11 Asia/Shanghai.
- SHA-256: `c30bd75ffdcd62c04a61c741ecbb10091ae8c74dadbe52086f72462966ac67e9`.

Previous canonical sample contents were replaced, not duplicated. Supplied files in Downloads, historical release ZIPs, and existing desktop bundles were not removed or modified.
