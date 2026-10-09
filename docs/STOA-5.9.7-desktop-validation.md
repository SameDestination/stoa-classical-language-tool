# STOA 5.9.7 desktop installer handoff

Date: 2026-09-08. Only two release artifacts are delivered in
`outputs/STOA-Desktop-5.9.7/`:

| Artifact | Architecture | Size | Signing status |
| --- | --- | ---: | --- |
| STOA-Windows-x64.msi | Windows x64 | 224,017,920 bytes (213.64 MiB) | Unsigned |
| STOA-macOS-arm64.dmg | Apple Silicon arm64 | 175,969,462 bytes (167.82 MiB) | Contained app ad-hoc signed; not notarized |

SHA-256:

```
518959ab291e029ca018983c2d1866eca033fe90b79a29fdf8c68243db4edc20  STOA-Windows-x64.msi
4ce9478111554fcfb86b120b4f62c6a84d7e5ec59ed5ab2d4776ed23a40e2555  STOA-macOS-arm64.dmg
```

## Architecture and scoped changes

- One shared `app/stoa-studio.tsx` renderer, production-bundled through the
  existing `standalone` entry and `desktop/vite.config.ts`. No forked editor,
  export engine, default settings, or sample documents.
- Desktop package metadata updated from 5.9.2 to 5.9.7.
- Desktop hides redundant Import/Export Project controls and the native Export
  Project menu. Native Open/Save/Save As use the existing project codec; Web
  keeps its exchange controls.
- The sidebar New Blank action uses the existing protected native lifecycle
  on Desktop, preserving save/discard/cancel behavior and file associations.
- Required Windows `en-US`, `en-GB`, `zh-CN`, `zh-TW`, and `ja` locale PAKs are
  included. macOS locale naming remains supported separately in the filter.
- Parent node_modules are explicitly excluded: the renderer already bundles
  its dependencies. This avoids approximately 74 MiB of redundant files.
- The build runner delivers only the two requested installers and supports
  resuming unchanged build intermediates. It rejects stale application files.

## Packaging toolchain

Electron runtime: 39.8.2. electron-builder is pinned to 26.15.3.
The original 26.0.12 MSI toolchain could not run its 32-bit WiX executable on
this Mac. The newer downloaded Wine bundle also failed runtime initialization.
For unsigned macOS cross-builds, electron-builder therefore produces the
Windows payload and native msitools 0.106/wixl authors the MSI. This changes
only installer authoring, not any STOA application files.

MSI provides per-user installation under LocalAppData/Programs/STOA, `.stoa`
file association, Desktop/Start shortcuts, uninstall, stable upgrade identity,
and a Windows 10+ x64 launch condition. The revised MSI now includes an English
Welcome / Next / installation folder / confirmation / Install / progress / Finish wizard, with Back,
Cancel confirmation, and Repair/Remove maintenance. Its installation directory
can be typed or chosen with Browse, including drive selection and new folders.
Native Windows WiX/signing
builds remain configured. Signing/notarization setup and repeatable commands
are documented in `desktop/README.md`.

## Validation performed

### Windows wizard revision (2026-09-08)

- Five packaging/wizard tests passed; targeted ESLint passed.
- Added path entry, folder browser, drive selection, parent/new-folder controls.
  All bind to APPLICATIONFOLDER, validated with SetTargetPath before Next/OK.
  Browse Cancel uses Reset; Back keeps the chosen location. The path and ARP
  installation location are forwarded as secure public MSI properties.
- This remains per-user: protected locations may be rejected. Existing installs
  must be uninstalled before moving to another folder, rather than retargeting
  already-installed MSI components during maintenance.
- Native MSI UI tables round-tripped through msibuild/msiinfo. Dialog references,
  keyboard targets, Next navigation and explicit Install/cancel events checked.
- Extracted all 24 Windows payload files: byte-identical to the previous payload.
  All 41 shared application files still match the macOS app. DMG unchanged.
- Updated package code; retained ProductCode, UpgradeCode and app version.
- Only two installers remain in the final output folder. Original MSI backup is
  in the temporary packaging work directory, not the delivery folder.
- No Windows runtime is available here: visual wizard operation, cancellation
  rollback, maintenance and actual installation still need Windows acceptance testing.
- Uses [Microsoft Windows Installer authored dialogs](https://learn.microsoft.com/en-us/windows/win32/msi/dialog-table)
  and [control events](https://learn.microsoft.com/en-us/windows/win32/msi/controlevent-table).

### Original application packaging validation (unchanged payload)

- Production desktop renderer build passed.
- 394 automated regression tests passed, zero failures/skips.
- ESLint and TypeScript checks passed.
- Packaged macOS app exercised with isolated temporary user profiles.
- All four workspaces exercised for sample startup, switching, independent
  dirty states, meaningful Undo/Redo, Cancel and Discard on New, blank
  documents, Restore Sample, native Save and Save As.
- Native Open exercised with a saved Latin project. Desktop exchange buttons
  were confirmed absent; native document controls were present.
- Greek, Latin, and Classical Chinese PDF exports each produced four pages
  with selectable text, zero raster image objects, and respectively 18, 24,
  and 14 note-link annotations. Exported text was extracted and representative
  pages, including Notes/translation pages, were visually inspected.
- Their PNG archives contained four valid PNG pages each, generated through
  the existing PDF-to-PNG pipeline. LaTeX exports succeeded, including the
  Classical Chinese open-font LaTeX ZIP.
- The Hebrew OMNI sample retained its existing appearance-preserving raster
  PDF fallback: two pages/two images. Both PDF and PDF-derived two-page PNG
  archive exported successfully. The final page was visually inspected.
- MSI was extracted with msiextract. All 24 payload files matched their
  source checksums. MSI architecture, registry, shortcuts, upgrade,
  launch-condition, and install-sequence tables were inspected.
- Both platforms contain the same 41 shared application files, byte-for-byte,
  with no redundant node_modules tree.
- DMG checksum verification passed. The DMG was mounted read-only; the
  contained app passed strict/deep signature validation, reported arm64 and
  version 5.9.7, and its application archive matched the tested app. The
  verification volume was unmounted afterward.

The older frozen PDF geometry tests were updated to select Liberation Serif
explicitly instead of assuming silent Times New Roman substitution, and to
reject a stale historical pagination capture rather than pair it with a
different current sample. No production PDF font substitution was introduced.

## Limits and release gates

- This host is macOS. Native Windows installation, launch, repair, upgrade,
  uninstall, Windows file-opening behavior, and SmartScreen were not executed
  on a real Windows machine. Payload checks are not a substitute for those.
- Open Recent and OS-driven Close/Quit/Save-on-Quit branches have source and
  contract coverage, but not an exhaustive native-dialog interaction run for
  every combination. Finder/Dock and subsequent-launch choices still merit
  hands-on release acceptance on the target systems.
- No Developer ID/Windows certificate was supplied. These installers are QA
  handoff builds, not a signed/notarized commercial release. Security warnings
  are possible. No updates, licensing service, publishing, or deployment was
  performed.
- User-imported licensed fonts remain device-local. In particular, the Latin
  sample pins specific original Times New Roman font hashes from another
  computer. Import the matching files or explicitly choose/rebind fonts before
  export. Latin export QA used a temporary working copy rebound to this Mac's
  original Times faces; the canonical supplied sample was not changed and no
  licensed font bytes were added to either installer.
- OMNI complex-script raster fallback remains intentional and its PDF text is
  not selectable. Classical-language vector export was not replaced.

Reproducible checks: `scripts/desktop-runtime-qa.mjs`,
`desktop/verify-installers.mjs`, and the desktop regression tests. QA files and
build intermediates remain outside the two-file release directory.
