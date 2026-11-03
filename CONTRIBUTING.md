# Contributing to STOA

Thank you for helping improve STOA. Contributions of every size are welcome,
from reporting a wrong gloss to adding a new export option.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug.** Use the *Bug report* issue form. A small `.stoa.json`
  project that reproduces the problem is the most useful thing you can
  attach.
- **Correct language data.** Wrong morphology labels, glosses, Pinyin,
  romanization or prompt rules for a language: use the *Language data* form.
- **Suggest a feature.** Use the *Feature request* form, and describe the
  problem before the solution.
- **Improve the documentation.** Fixes to the README, guides and comments are
  always welcome.
- **Write code.** See below. For anything larger than a small fix, please
  open an issue first so we can agree on the approach before you invest time.

Security vulnerabilities must be reported privately. See
[SECURITY.md](SECURITY.md).

## Contributor License Agreement

STOA is licensed under the [GNU GPL v3.0 or later](LICENSE)
(`GPL-3.0-or-later`). Before your first pull request can be merged, you must
sign the [Contributor License Agreement](CLA.md). You keep the copyright in
your work. The CLA lets the maintainer distribute STOA under the GPL and, if
needed, under other terms, such as a commercial license for the desktop app.

Signing takes one comment: when you open your first pull request, the CLA
Assistant bot explains what to post.

## Development setup

You need:

- [Node.js](https://nodejs.org/) 22.13 or newer (the repository's `.nvmrc`
  selects Node 22 for `nvm` users) and npm
- Git
- Python 3, only to run the Portable launcher
- macOS, only to build the Desktop installers

```sh
git clone https://github.com/SameDestination/stoa-classical-language-tool.git
cd stoa-classical-language-tool
npm ci
```

If you are not working on the Desktop app, you can skip the Electron download
(about 100 MB) with `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev:web` | Start the STOA editor at http://127.0.0.1:5173 with hot reload. **Start here.** |
| `npm run desktop` | Build the renderer and open it in the Electron desktop shell |
| `npm run build:web` | Production build of the editor into `build/web/` |
| `npm run build:portable` | Build the Portable edition into `outputs/STOA-Portable/` |
| `npm run build:desktop:web` | Build the desktop renderer into `desktop/dist/` |
| `npm run build:desktop:installers` | Build the macOS DMG and Windows MSI (macOS only; see [desktop/README.md](desktop/README.md#packaging)) |
| `npm run dev` / `npm run build` | Develop or build the separate marketing website (`app/page.tsx` and related pages) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run test:unit` | All tests except the website rendering tests (fast) |
| `npm test` | Every test, including a website build |
| `npm run check` | Typecheck, lint and every test. Run this before opening a pull request. |

Focused test scripts also exist, for example `npm run test:languages`,
`npm run test:projects` and `npm run test:dictionary`. To run one file:

```sh
node --import tsx --test tests/token-style.test.ts
```

Two Portable tests are skipped unless `outputs/STOA-Portable` exists. Run
`npm run build:portable` first to include them, as CI does.

## How the code is organised

See [Project structure](README.md#project-structure) in the README for the
directory map. A few rules keep the project maintainable:

- **One editor, three shells.** The editor lives in `app/stoa-studio.tsx` and
  `app/lib/`. The Web (`standalone/`), Portable and Desktop (`desktop/`)
  editions all bundle that same renderer. Never copy editor code, export
  engines, defaults or samples into `desktop/` or `standalone/`.
- **Desktop is a thin, locked-down shell.** Keep `contextIsolation`, the
  renderer sandbox and the narrow preload bridges intact, and keep file and
  key access in `desktop/main.mjs`. Read
  [desktop/README.md](desktop/README.md) before changing anything there.
- **Bundled samples and defaults have a single source:**
  [`app/developer-defaults/`](app/developer-defaults/README.md). If you replace
  a sample file, update its `sampleSha256` in `app/developer-defaults/index.ts`.
- **The project format is a public contract.** Changes to `.stoa.json`
  (`app/lib/stoa-project.ts`) must stay backward compatible: older projects
  must still open. Add a migration and a test for any schema change.
- **Third-party material needs a compatible license.** Do not add fonts,
  dictionaries or code unless their license allows redistribution and is
  compatible with the GPL-3.0. Add the license file next to the material and
  an entry to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Proprietary
  fonts such as Times New Roman are loaded from the user's device, never
  bundled.
- **Do not commit build output or secrets.** `dist/`, `build/web/`,
  `desktop/dist/`, `outputs/`, `.env*` files and API keys stay out of Git.
- Code in `app/lib/vendor/` and `public/vendor/` is third-party and is not
  linted. Keep changes there minimal and documented.

## Making a change

1. **Branch** from an up-to-date `main`, using a short descriptive name:

   ```sh
   git switch main && git pull
   git switch -c fix/latex-greek-accents     # or feat/…, docs/…, refactor/…, test/…, chore/…
   ```

   If you do not have write access, fork the repository first and branch in
   your fork.

2. **Commit** in small, logical steps. Write the subject line in the
   imperative mood, at most 72 characters, and use the body to explain why:

   ```text
   Fix LaTeX escaping of Greek combining accents

   Combining characters after a backslash command were dropped by
   XeLaTeX. Escape the command boundary explicitly and add a regression
   test with the sample Greek text.
   ```

3. **Test.** Add or update tests for what you changed, then run
   `npm run check`.

4. **Open a pull request** against `main`. Fill in the template, link the issue
   it addresses (`Fixes #123`), and include screenshots or exported PDFs for
   visual changes. Keep each pull request focused on one change.

5. **Review.** CI must pass and the CLA must be signed. The maintainer may
   ask for changes. Push them as new commits to the same branch. Pull
   requests are squash-merged, so your branch history does not need to be
   tidy.

## Versioning

STOA versions have the form `MAJOR.MINOR.PATCH`:

- **MAJOR**: older projects no longer open, or a feature is removed.
- **MINOR**: new features, such as a language profile or export option, that
  keep old projects working.
- **PATCH**: bug fixes only.

The `.stoa.json` schema has its own version number (currently 6), separate
from the application version. Releases are tagged `vMAJOR.MINOR.PATCH`. The
maintainer's release steps are in [docs/RELEASING.md](docs/RELEASING.md).

## Questions

If something here is unclear, open an issue. Improving this guide is a
contribution too.
