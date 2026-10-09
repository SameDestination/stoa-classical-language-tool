# STOA developer defaults

This directory is the single developer-controlled source for the four bundled
STOA workspaces.

## What to edit

- `samples/stoa-ancient-greek.stoa.json`
- `samples/stoa-latin.stoa.json`
- `samples/stoa-classical-chinese.stoa.json`
- `samples/stoa-omni.stoa.json`

Each file is a normal STOA project. Edit it with STOA and export a project, or
edit the JSON carefully. Its source text, tokens, notes, translations,
typography, paper, colours, headers/footers, and layout become the packaged
sample/default document after the next build.

The 5.9.6 assets are byte-for-byte copies of the supplied 2026-09-08 files:

| Workspace | Supplied filename | Tokens |
| --- | --- | --- |
| Ancient Greek | `stoa-ancient-greek-sample.stoa.json` | 112 |
| Latin | `stoa-latin-sample.stoa.json` | 105 |
| Classical Chinese | `stoa-classical-chinese-sample1.stoa.json` | 226 |
| OMNI | `stoa-omni-sample2.stoa.json` | 35 |

The stable filenames above replace the previous canonical samples; old sample
assets are not shipped alongside them. The Latin sample references device-local
Times New Roman faces. Those references are preserved; proprietary font bytes
are not embedded in the sample or bundled by this update.

`index.ts` maps each workspace to its sample and contains the small
product-wide settings patch. For example, all new/restored samples currently
start with Translation visible as of 5.9.7. Imported projects retain their saved visibility. Prefer storing document-specific settings in
the corresponding project file instead of adding TypeScript constants.

## Updating a sample

1. Replace the corresponding `.stoa.json` file without changing its language.
2. Calculate its SHA-256 and update `sampleSha256` in `index.ts`.
3. Run `node --import tsx --test tests/developer-defaults.test.ts`.
4. Run the normal STOA typecheck, regression tests, and production builds.

The runtime parses and migrates these files through the same project pipeline
used by Project Import. `createDeveloperDefaultProject()` returns a fresh
sample/default copy on every call. `createDeveloperBlankProject()` derives an
empty untitled document from the same workspace settings. The imported JSON
object and canonical serialized text are never exposed. User edits therefore
cannot mutate or redefine packaged defaults.

Web startup and Restore Sample must call this factory. Desktop New/first-launch
documents and Restore Sample must use the same factory through the renderer;
Electron should not contain a second set of samples or defaults.
