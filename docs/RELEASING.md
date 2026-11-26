# Releasing STOA

This checklist turns `main` into a published GitHub Release whose files
are verifiably built from one tagged commit. The rule behind every step: **a
version tag points at the exact commit the release files were built from.**
Never tag a commit you did not build from, and never attach files built from
another commit.

## 1. Decide the version

STOA uses `MAJOR.MINOR.PATCH` (see [CONTRIBUTING.md](../CONTRIBUTING.md#versioning)):

| Change since the last release | Bump | Example |
| --- | --- | --- |
| Older projects no longer open, or a feature is removed | MAJOR | 5.9.7 → 6.0.0 |
| New language profile, export option or other feature; old projects still open | MINOR | 5.9.7 → 5.10.0 |
| Bug fixes only | PATCH | 5.9.7 → 5.9.8 |

Use a pre-release suffix for test builds, for example `5.10.0-beta.1`, and
mark the GitHub Release as a pre-release.

## 2. Prepare a release pull request

```sh
git switch main && git pull
git switch -c release/5.10.0
npm version 5.10.0 --no-git-tag-version   # updates package.json and package-lock.json
```

The version also appears in these files. Update each one by hand:

- `desktop/package.json`, then run `npm install --package-lock-only` inside
  `desktop/`
- `app/stoa-studio.tsx` (`STOA_VERSION`)
- `standalone/index.html` (`<title>`)
- `standalone/portable/README-使用说明.txt` (first line and release notes)
- `tests/desktop-packaging.test.mjs` and `tests/web-document-lifecycle.test.ts`
  (they assert the version)
- `CITATION.cff` (`version` and `date-released`)

`git grep -n "5.9.7"` (with the old version) finds anything left over.

Then, in `CHANGELOG.md`, rename `## [Unreleased]` to
`## [5.10.0] - YYYY-MM-DD`, add a new empty `## [Unreleased]` above it, and
update the comparison links at the bottom.

```sh
npm run check
git commit -am "Release 5.10.0"
git push -u origin release/5.10.0
```

Open a pull request, wait for CI to pass, and squash-merge it.

## 3. Tag the merged commit

```sh
git switch main && git pull
git tag -a v5.10.0 -m "STOA 5.10.0"
git push origin v5.10.0
```

## 4. Build from the tag

Build on a clean checkout of the tag, not on a working tree that has local
changes:

```sh
git switch --detach v5.10.0
git status --short            # must print nothing
rm -rf node_modules outputs
npm ci
npm run check
```

**Portable** (any OS):

```sh
npm run build:portable        # creates outputs/STOA-Portable
```

Create the ZIP in a way that keeps the macOS launcher executable and the
Unicode README filename. On macOS:

```sh
ditto -c -k --keepParent outputs/STOA-Portable outputs/STOA-5.10.0-Portable.zip
```

**Desktop installers** (macOS, with `brew install msitools`). See
[desktop/README.md](../desktop/README.md#packaging) for signing:

```sh
npm run build:desktop:installers   # creates outputs/STOA-Desktop-5.10.0/
```

The installer builder names its files `STOA-macOS-arm64.dmg` and
`STOA-Windows-x64.msi`. Copy them into `outputs/` with the version in the
name, so downloads from different releases can be told apart:

```sh
cp outputs/STOA-Desktop-5.10.0/STOA-macOS-arm64.dmg outputs/STOA-5.10.0-macOS-arm64.dmg
cp outputs/STOA-Desktop-5.10.0/STOA-Windows-x64.msi outputs/STOA-5.10.0-Windows-x64.msi
```

## 5. Checksums

```sh
cd outputs
shasum -a 256 STOA-5.10.0-* > SHA256SUMS.txt
cat SHA256SUMS.txt
```

## 6. Publish the GitHub Release

With the GitHub CLI:

```sh
gh release create v5.10.0 \
  outputs/STOA-5.10.0-Portable.zip \
  outputs/STOA-5.10.0-macOS-arm64.dmg \
  outputs/STOA-5.10.0-Windows-x64.msi \
  outputs/SHA256SUMS.txt \
  --title "STOA 5.10.0" \
  --notes-file release-notes.md
```

Or use **Releases → Draft a new release** on GitHub: choose the existing tag
`v5.10.0`, upload the same files, and publish.

Release notes should include:

- the changelog section for this version
- which file to download for each platform
- signing status (for example "macOS: ad-hoc signed, not notarized;
  Windows: unsigned") and how to open unsigned builds (see the README)
- the SHA-256 checksums

## 7. After the release

- Check that the release is marked **Latest** and that every download link
  works.
- Close the version's milestone and move any open issues to the next one.
- Never replace a published file. If a release is broken, publish a new
  patch version instead.

## Historical packages

Versions 2 through 5.9.7 were published before this process existed. They
are no longer distributed because they bundle the Vusillus font; see
[historical-releases.md](historical-releases.md). Their original source
revisions are not in this repository's history, so they have no version tags.
