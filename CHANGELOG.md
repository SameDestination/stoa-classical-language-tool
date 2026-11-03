# Changelog

All notable changes to STOA are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and STOA uses version numbers of the form `MAJOR.MINOR.PATCH` (see
[CONTRIBUTING.md](CONTRIBUTING.md#versioning)). The `.stoa.json` project
format has its own schema version (currently 6), independent of the
application version.

## [Unreleased]

### Added

- STOA is now licensed under the GNU General Public License v3.0 or later
  (`GPL-3.0-or-later`, [LICENSE](LICENSE)). Contributions require the
  [Contributor License Agreement](CLA.md), checked automatically on pull
  requests.
- Project documentation: a rewritten [README](README.md) with screenshots, a
  [Chinese README](README.zh-CN.md), [CONTRIBUTING.md](CONTRIBUTING.md),
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md),
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
  [CITATION.cff](CITATION.cff) and a
  [release checklist](docs/RELEASING.md).
- GitHub configuration: continuous integration (typecheck, lint, Web,
  Desktop-renderer and Portable builds, full test suite), a CLA check,
  Dependabot, and issue and pull request templates.
- `npm run typecheck` and `npm run check` (typecheck, lint and every test).

### Changed

- `npm test` now runs every test file. Previously it ran only the five
  website rendering tests. `npm run test:unit` runs everything except the
  website rendering tests, which need a website build.
- Release reports moved from `docs/` to [`docs/releases/`](docs/releases/).

### Fixed

- Builds from a fresh clone. `npm run build:web`, `build:portable` and
  `build:desktop:web` failed after a clean `npm ci` because the vendored
  MDict reader could not resolve `bl`. It also resolved `pako` 0.2.9 instead of
  the 1.0.x version `mdict-js` requires. Both are now declared at the exact
  versions `mdict-js` uses (`bl` 2.2.1, `pako` 1.0.11).
- `tsx`, used by every test script, is now a declared development dependency.
  It was previously available only as a transitive dependency.

### Removed

- Unused starter-template code: the optional Cloudflare D1 / Drizzle database
  layer (`db/`, `drizzle/`, `drizzle.config.ts`, `examples/d1/`, the
  `db:generate` script and the `drizzle-orm` and `drizzle-kit` packages), the
  unused Sign in with ChatGPT helper (`app/chatgpt-auth.ts`) and three unused
  starter icons.
- The stale root `main.mjs`, an outdated copy of `desktop/main.mjs` that no
  build used.
- The bundled Vusillus font (`public/fonts/vu3r.ttf`), whose redistribution
  terms are not documented. Ancient Greek now uses the bundled Noto Serif
  STOA by default. Projects and saved style defaults that name Vusillus open
  with Noto Serif STOA. You can still import your own licensed copy of
  Vusillus, or any other TTF/OTF font, in Typography.
- The Desktop AI provider integration: the *Desktop automation* card with
  **Add API key**, direct requests to OpenAI and Anthropic, encrypted key
  storage and the `stoaDesktopAI` bridge. Every edition now uses the same
  copy-and-paste workflow (**Full AI Prompt**, **Guided chunk analysis** and
  **Import Analysis**), and STOA makes no network requests to AI services. On
  startup, the Desktop edition deletes the encrypted key file that earlier
  versions could create (`stoa-secure-api-keys.json` in the user data folder).
- The website's Web Trial (`/trial`), which ran STOA 3.5. The website now
  links to the downloads.
- Download links to the packages for STOA 5.9.7 and earlier. They bundle the
  Vusillus font and are no longer distributed (see
  [docs/historical-releases.md](docs/historical-releases.md)).

## 5.9.7 - 2026-09-08

### Changed

- Bundled samples now start with the Translation layer visible. Imported
  projects keep their own saved visibility.
- OMNI: Spanish, French, German, Italian and Portuguese (including regional
  variants) get a compact, Latin-style morphology rule in AI prompts.
- Desktop: package metadata updated from 5.9.2 to 5.9.7. The redundant
  Import/Export Project controls are hidden in favour of native
  Open/Save/Save As.
- Windows installer: new MSI with an installation wizard (Welcome, folder
  selection with Browse, Install, progress, Finish), Repair/Remove
  maintenance, per-user installation, `.stoa` file association and shortcuts.

Packages: `STOA-5.9.7-Portable.zip`, `STOA-macOS-arm64.dmg` (Apple Silicon,
ad-hoc signed, not notarized), `STOA-Windows-x64.msi` (unsigned). Details:
[Web report](docs/releases/STOA-5.9.7-validation.md),
[Desktop report](docs/releases/STOA-5.9.7-desktop-validation.md).

## 5.9.6 - 2026-09-08

### Changed

- Replaced the four bundled sample projects (Ancient Greek, Latin, Classical
  Chinese, OMNI) with new versions.
- Moved the More · Token Editor button next to the 02 · Token Editor heading.

### Fixed

- Project import no longer changes saved values: an empty part of speech
  stayed empty instead of becoming `X`, saved token surfaces were no longer
  split by punctuation repair, and header/footer text over 500 characters was
  no longer replaced.

Details: [report](docs/releases/STOA-5.9.6-validation.md).

## 5.9.4 - 2026-09-07

### Added

- Device-local Times New Roman: load the installed font (where the browser
  supports Local Font Access) or import its TTF/OTF faces. No Microsoft font
  files are distributed.
- Translation typography settings (font, size, colour, bold, italic,
  underline), shared by Preview, vector PDF and LaTeX export and preserved in
  project files.

### Changed

- Complete Liberation Sans 2.1.5 fonts replaced incomplete subsets.

### Fixed

- New blank document and importing an empty project. Blank documents keep only
  the default Header Right text, and PDF/PNG export is disabled for empty
  documents.

Details: [report](docs/releases/STOA-5.9.4-validation.md),
[source map](docs/releases/STOA-5.9.4-code-map.md).

## Earlier versions

Versions 2 through 5.9.2 are listed in
[docs/historical-releases.md](docs/historical-releases.md). Detailed change
notes for those versions were not recorded in this repository.

[Unreleased]: https://github.com/SameDestination/stoa-classical-language-tool/commits/main
