# STOA desktop platform layer

`desktop/` is a thin Electron host for the shared STOA renderer. It must not
contain a second copy of STOA's editor, samples, defaults, or export engines.
`npm run build:desktop:web` builds the existing application through
`desktop/vite.config.ts` into `desktop/dist`; Electron loads that bundled local
production build with no hosted-site dependency.

The main process serves only that packaged `desktop/dist` tree through the
privileged standard/secure `stoa://app/` protocol. Both lexical path-boundary
and resolved-path checks prevent traversal or symlink escape. This gives the
shared renderer a normal same-origin runtime for local fonts, the PDF.js worker,
and other export assets without exposing a general renderer filesystem API or
misclassifying the desktop app as a directly opened portable `file://` page.

Developer-controlled defaults and bundled samples live in
`app/developer-defaults/`. Web and desktop builds import those same factories.
Do not add desktop-only sample JSON or duplicate default settings here.

## Security boundary

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer sandbox enabled
- no renderer-selected IPC channel names
- no arbitrary filesystem API in the renderer
- project reads/writes, native dialogs, paths, recents, and dirty-close prompts
  stay in `main.mjs`
- `preload.cjs` exposes only `stoaDesktopAI` and `stoaDesktopDocuments`

API keys remain behind `stoaDesktopAI`. The document lifecycle bridge is:

```ts
window.stoaDesktopDocuments = {
  getState();
  rendererReady();
  setActiveWorkspace(workspace);
  updateWorkspaceState({ workspace, revision, dirty, displayName? });
  newDocument(workspace?, kind?: "blank" | "sample");
  openDocument();
  openRecent(filePath);
  saveDocument(workspace?, saveAs?: boolean);
  closeDocument(workspace?);
  getRecentFiles();
  clearRecentFiles();
  onStateChanged(listener);
  onCommand(handler);
  onSerializeRequest(handler);
};
```

The renderer must register `onCommand` and `onSerializeRequest` before calling
`rendererReady()`. Event subscriptions return cleanup functions.

### Main-to-renderer commands

- `startup-first-launch`
- `new-document` with `kind: "blank" | "sample"`
- `open-project` with `workspace`, `filePath`, `displayName`, and project text
- `close-document`
- `undo` / `redo`
- `show-help`

For `open-project`, the handler returns `{ ok: true, workspace, revision }`
only after the normal STOA parser/migration pipeline has applied the project.
New/close handlers likewise return the resulting stable revision.

For `onSerializeRequest`, return:

```ts
{
  ok: true,
  workspace,
  contents,       // normal stringifyStoaProject output
  revision,       // stable document revision/signature
  suggestedName,
}
```

Revisions identify document states, not UI events. Undoing back to a saved
state must report the saved revision again and `dirty: false`. Switching a
workspace, changing selection-only UI, or opening a modal must not create a new
document revision. Main compares the serialized revision with the live
revision after an atomic save so edits racing with disk I/O remain dirty.

## Packaging

Run `npm run build:desktop:installers` on macOS. `build-installers.mjs` builds
the shared production renderer once and delivers exactly two files in
`outputs/STOA-Desktop-<version>/`:

- `STOA-Windows-x64.msi` — Windows x64, assisted per-user installation.
- `STOA-macOS-arm64.dmg` — Apple Silicon, drag STOA into Applications.

No Intel Mac, EXE, ZIP, standalone APP, or update artifacts are delivered.
The intermediate `.app`, unpacked Windows tree, and builder diagnostics stay
in the printed temporary work directory, outside the release folder. The
runner refuses to overwrite an existing release. It verifies the pristine
arm64 application's signature strictly before handing off the two installers.
On macOS, install `msitools` (`brew install msitools`) before running the build.
electron-builder produces the Windows x64 payload; `build-msi-native.mjs` uses
the native `wixl` compiler to put that unchanged payload in an MSI, avoiding
32-bit WiX and incompatible Wine on modern Macs. The MSI installs per user
under LocalAppData/Programs/STOA, registers `.stoa`, creates Start/Desktop
shortcuts, supports uninstall/major upgrades, and checks Windows 10+ x64.
`msi-wizard.mjs` adds native Windows Installer dialog/control/event tables:
Welcome → Next → installation folder → confirmation → Install → progress → Finish.
Back, cancellation confirmation, Repair/Remove maintenance, and failure/cancel
exit pages are included. The installation folder can be typed or selected with
Browse (drive selection, parent folder, new folder). All path controls bind to
APPLICATIONFOLDER; SetTargetPath validates and resolves that actual directory
before advancing. Browse Cancel resets its pending changes. Shortcuts and file
associations use the selected directory. Choose a user-writable location: this
remains a per-user installer, not an all-users elevated install. Existing installs
use Repair/Remove; changing their location requires uninstalling and reinstalling.
Full UI waits for explicit installation approval;
standard administrator-requested `/qn` unattended installation remains possible.
No extra bootstrapper or duplicated application payload is bundled.
Windows installation/uninstallation still requires testing on real Windows.

To resume a failed packaging run, use
`node desktop/build-installers.mjs --resume=/absolute/path/to/printed/work-directory`.
Only use a work directory from the same, unchanged source build. Completed
installers are preserved; the final folder is created only when both validate.

Do not restore an `electronDist` path pointing at the host's unpacked
`node_modules/electron/dist`. That directory contains only the host
architecture and would make a mislabeled/broken cross-architecture artifact.
electron-builder instead resolves Electron `electronVersion` separately for
each target architecture (from its download cache or the network).

The default macOS build is ad-hoc signed for local QA; Windows is unsigned.
Neither should be represented as a signed/notarized public release.
For a commercial build, set
`STOA_DISTRIBUTION_BUILD=1` and provide electron-builder's standard Developer
ID/notarization credentials (`CSC_LINK`/`CSC_KEY_PASSWORD` plus Apple
notarization credentials, or the corresponding supported keychain setup):

```sh
STOA_DISTRIBUTION_BUILD=1 npm run build:desktop:installers
```

That mode delegates macOS Developer ID signing and notarization to
electron-builder instead of the local ad-hoc hook. Use `WIN_CSC_LINK` and
`WIN_CSC_KEY_PASSWORD` (or the installed builder's supported Windows signing
service configuration) for Windows; signed-mode Windows builds fail if no
signing identity is available. Never commit credentials. Keep `appId` and
the MSI `upgradeCode` stable between releases. Windows certificates are not
Apple certificates. For platform-specific signing on separate CI runners,
use the same config with `--win msi --x64` or `--mac dmg --arm64` and
`--publish=never`. Auto-update and licensing are future integration points,
not implemented services; the present task does not publish anything.
The unsigned native MSI fallback intentionally refuses distribution mode;
use native Windows WiX plus the configured signing credentials for release.

Signing references: https://www.electron.build/code-signing and
https://www.electron.build/code-signing-win (check against the installed
electron-builder version before changing credential options).

Normal desktop Save uses the Finder-associated `.stoa` document extension.
Native Open accepts both `.stoa` and Web `.stoa.json` projects. Desktop hides
the redundant Import/Export Project buttons and menu; Web retains them. Both
use the same versioned project codec. This avoids claiming every unrelated
JSON file on either operating system.

The desktop renderer is emitted as local files rather than an inline script.
This lets the packaged `index.html` enforce a Content Security Policy with no
inline or remote JavaScript while preserving the shared web renderer.
