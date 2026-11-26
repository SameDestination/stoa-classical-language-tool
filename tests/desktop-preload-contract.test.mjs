import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("desktop preload exposes only the fixed document lifecycle bridge", async () => {
  const source = await readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  const invocations = [];
  const sent = [];
  const listeners = new Map();
  const bridges = new Map();

  vm.runInNewContext(source, {
    require(moduleName) {
      assert.equal(moduleName, "electron");
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            bridges.set(name, value);
          },
        },
        ipcRenderer: {
          invoke(...arguments_) {
            invocations.push(arguments_);
            return Promise.resolve({});
          },
          on(channel, listener) {
            listeners.set(channel, listener);
          },
          removeListener(channel, listener) {
            if (listeners.get(channel) === listener) listeners.delete(channel);
          },
          send(...arguments_) {
            sent.push(arguments_);
          },
        },
      };
    },
    Object,
  });

  // STOA no longer exposes an AI provider bridge; documents are the only
  // capability the preload script hands to the renderer.
  assert.deepEqual([...bridges.keys()], ["stoaDesktopDocuments"]);
  assert.doesNotMatch(source, /stoa:ai:|stoaDesktopAI|ApiKey/u);

  const documents = bridges.get("stoaDesktopDocuments");
  assert.ok(documents);
  assert.deepEqual(
    Object.keys(documents).sort(),
    [
      "clearRecentFiles",
      "closeDocument",
      "getRecentFiles",
      "getState",
      "newDocument",
      "onCommand",
      "onSerializeRequest",
      "onStateChanged",
      "openDocument",
      "openRecent",
      "rendererReady",
      "saveDocument",
      "setActiveWorkspace",
      "updateWorkspaceState",
    ],
  );

  await documents.getState();
  await documents.rendererReady();
  await documents.setActiveWorkspace("latin");
  await documents.updateWorkspaceState({ workspace: "latin", revision: "r1", dirty: true });
  await documents.newDocument("latin", "sample");
  await documents.openDocument();
  await documents.openRecent("/tmp/sample.stoa.json");
  await documents.saveDocument("latin", true);
  await documents.closeDocument("latin");
  await documents.getRecentFiles();
  await documents.clearRecentFiles();

  assert.deepEqual(
    invocations.map(([channel]) => channel),
    [
      "stoa:documents:state:get",
      "stoa:documents:renderer-ready",
      "stoa:documents:active-workspace:set",
      "stoa:documents:workspace-state:update",
      "stoa:documents:new",
      "stoa:documents:open",
      "stoa:documents:open-recent",
      "stoa:documents:save",
      "stoa:documents:close",
      "stoa:documents:recent:get",
      "stoa:documents:recent:clear",
    ],
  );

  let changedState;
  const stopStateListener = documents.onStateChanged((state) => {
    changedState = state;
  });
  listeners.get("stoa:documents:state-changed")(null, { activeWorkspace: "omni" });
  assert.deepEqual(changedState, { activeWorkspace: "omni" });
  stopStateListener();

  const stopCommandListener = documents.onCommand(async (command) => ({
    ok: true,
    revision: command.id,
  }));
  await listeners.get("stoa:documents:command")(null, { id: "command-1", type: "undo" });
  stopCommandListener();

  const stopSerializationListener = documents.onSerializeRequest(async (request) => ({
    ok: true,
    workspace: request.workspace,
    contents: "{}",
    revision: "r2",
  }));
  await listeners.get("stoa:documents:serialize-request")(null, {
    id: "serialize-1",
    workspace: "latin",
  });
  stopSerializationListener();

  assert.deepEqual(sent, [
    ["stoa:documents:command-result", "command-1", { ok: true, revision: "command-1" }],
    ["stoa:documents:serialize-result", "serialize-1", {
      ok: true,
      workspace: "latin",
      contents: "{}",
      revision: "r2",
    }],
  ]);
});

test("desktop packaging includes the preload bridge without a duplicate root config", async () => {
  const [packageJson, desktopPackageJson, builderSource] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../desktop/package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../desktop/electron-builder.config.cjs", import.meta.url), "utf8"),
  ]);
  assert.equal(packageJson.build, undefined);
  assert.equal(desktopPackageJson.version, packageJson.version);
  assert.equal(desktopPackageJson.main, "main.mjs");
  assert.match(builderSource, /"preload\.cjs"/u);
  assert.match(builderSource, /directories:[\s\S]*app: "desktop"/u);
  assert.match(builderSource, /output: `outputs\/STOA-Desktop-\$\{stoaVersion\}`/u);
  assert.match(builderSource, /electronVersion: installedElectron\.version/u);
  assert.doesNotMatch(builderSource, /electronDist\s*:/u);
});

test("desktop builder targets signing-ready arm64 DMG and x64 MSI installers", async () => {
  const source = await readFile(
    new URL("../desktop/electron-builder.config.cjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /target: "msi", arch: \["x64"\]/u);
  assert.match(source, /target: "dmg", arch: \["arm64"\]/u);
  assert.doesNotMatch(source, /target: "zip"/u);
  assert.match(source, /ext: "stoa"/u);
  assert.match(source, /STOA_DISTRIBUTION_BUILD/u);
  assert.match(source, /notarize: distributionBuild/u);
});

test("desktop packaging validates exactly two installers before delivery", async () => {
  const source = await readFile(new URL("../desktop/build-installers.mjs", import.meta.url), "utf8");
  assert.match(source, /arch !== "arm64"/u);
  assert.match(source, /STOA-macOS-arm64\.dmg/u);
  assert.match(source, /STOA-Windows-x64\.msi/u);
  assert.match(source, /Missing installer/u);
  assert.match(source, /Refusing to replace existing release/u);
  assert.match(source, /codesign[\s\S]*--verify[\s\S]*--deep[\s\S]*--strict/u);
  assert.match(source, /renameSync\(staging, output\)/u);
});

test("desktop renderer is bundled locally with a no-inline-script CSP", async () => {
  const source = await readFile(new URL("../desktop/vite.config.ts", import.meta.url), "utf8");
  assert.match(source, /base: "\.\/"/u);
  assert.match(source, /script-src 'self'/u);
  assert.match(source, /object-src 'none'/u);
  assert.match(source, /Content-Security-Policy/u);
  assert.doesNotMatch(source, /viteSingleFile/u);
  assert.doesNotMatch(source, /script-src[^\n]*unsafe-inline/u);
});

test("desktop main owns a secure, atomic, per-workspace document lifecycle", async () => {
  const source = await readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8");
  assert.match(source, /registerSchemesAsPrivileged/u);
  assert.match(source, /standard: true[\s\S]*secure: true[\s\S]*supportFetchAPI: true/u);
  assert.match(source, /protocol\.handle\(APPLICATION_SCHEME/u);
  assert.match(source, /fs\.realpath\(applicationAssetsDirectory\)/u);
  assert.match(source, /candidatePath\.startsWith\(assetsPrefix\)/u);
  assert.match(source, /realPath\.startsWith\(assetsPrefix\)/u);
  assert.match(source, /net\.fetch\(pathToFileURL\(realPath\)\.href/u);
  assert.match(source, /loadURL\(applicationPageUrl\)/u);
  assert.doesNotMatch(source, /loadFile\(applicationPage/u);
  assert.match(source, /STOA_DESKTOP_SMOKE_TEST/u);
  assert.match(source, /runDesktopRuntimeSmokeTest/u);
  assert.match(source, /fetchAsset\("fonts\/NotoSerif-Regular\.ttf"\)/u);
  assert.match(source, /fetchAsset\("vendor\/pdf\.worker\.min\.mjs"\)/u);
  assert.match(source, /bypassCustomProtocolHandlers: false/u);
  assert.match(source, /contextIsolation: true[\s\S]*nodeIntegration: false[\s\S]*sandbox: true/u);
  assert.match(source, /webSecurity: true/u);
  assert.match(source, /allowRunningInsecureContent: false/u);
  assert.match(source, /webviewTag: false/u);
  assert.match(source, /setPermissionRequestHandler/u);
  assert.match(source, /setPermissionCheckHandler/u);
  assert.match(source, /clipboard-sanitized-write/u);
  assert.match(source, /STOA_WORKSPACES = Object\.freeze\(\[[\s\S]*"ancient-greek"[\s\S]*"latin"[\s\S]*"classical-chinese"[\s\S]*"omni"/u);
  assert.match(source, /await handle\.sync\(\)[\s\S]*await fs\.rename\(temporaryPath, targetPath\)/u);
  assert.match(source, /parsed\?\.document\?\.language \?\? parsed\?\.project\?\.document\?\.language/u);
  assert.match(source, /buttons: \["Save", "Don't Save", "Cancel"\]/u);
  assert.match(source, /confirmAllWorkspacesCanBeDiscarded/u);
  assert.match(source, /CmdOrCtrl\+O/u);
  assert.match(source, /CmdOrCtrl\+S/u);
  assert.match(source, /CmdOrCtrl\+Shift\+S/u);
  assert.match(source, /CmdOrCtrl\+Z/u);
  assert.match(source, /CmdOrCtrl\+Shift\+Z/u);
  assert.match(source, /app\.on\("open-file"/u);
  assert.match(source, /setDocumentEdited\(anyDirty\)/u);
  assert.match(source, /PROJECT_OPEN_FILE_FILTERS[\s\S]*extensions: \["stoa", "json"\]/u);
  assert.match(source, /PROJECT_SAVE_FILE_FILTERS[\s\S]*extensions: \["stoa"\]/u);
  assert.match(source, /ensureNativeProjectFileExtension/u);
  assert.doesNotMatch(source, /nodeIntegration: true/u);
});

test("desktop has no AI provider integration and removes the legacy key file", async () => {
  const [main, renderer, viteConfig] = await Promise.all([
    readFile(new URL("../desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../desktop/vite.config.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(main, /safeStorage/u);
  assert.doesNotMatch(main, /stoa:ai:/u);
  assert.doesNotMatch(main, /api\.openai\.com|api\.anthropic\.com|x-api-key|Authorization/u);
  assert.match(main, /LEGACY_AI_KEY_FILE_NAME = "stoa-secure-api-keys\.json"/u);
  assert.match(main, /fs\.rm\(keyFilePath, \{ force: true \}\)/u);
  assert.match(main, /void removeLegacyApiKeyFile\(\)/u);
  assert.doesNotMatch(renderer, /stoaDesktopAI|api-automation|saveApiKey|Analyze with API/u);
  assert.match(viteConfig, /"connect-src 'self'"/u);
});
