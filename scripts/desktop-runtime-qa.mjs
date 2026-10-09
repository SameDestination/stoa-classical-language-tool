// Run against the packaged app, never a second renderer or a mocked desktop.
// PLAYWRIGHT_MODULE points to a developer-installed Playwright; it is not shipped.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const executablePath = process.argv[2];
assert.ok(executablePath, "Pass the packaged STOA executable path");
const qa = await mkdtemp(path.join(os.tmpdir(), "stoa-desktop-qa-"));
const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${qa}/profile`], timeout: 60000 });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (error) => { errors.push(error.message); console.error("PAGE_ERROR", error.message); });
  page.on("console", (message) => { if (message.type() === "error") console.error("CONSOLE", message.text()); });
  await page.waitForFunction(() => !!window.stoaDesktopDocuments);
  await page.getByRole("button", { name: "Save As…", exact: true }).waitFor({ timeout: 60000 });
  await page.evaluate(() => {
    window.qaToasts = [];
    new MutationObserver(() => {
      const text = document.querySelector(".toast")?.textContent;
      if (text && window.qaToasts.at(-1) !== text) window.qaToasts.push(text);
    }).observe(document.body,{subtree:true,childList:true,characterData:true});
  });
  await page.waitForFunction(async () => {
    const state = await window.stoaDesktopDocuments.getState();
    return Object.values(state.workspaces).every((workspace) => workspace.revision);
  }, null, { timeout: 60000 });
  console.log("READY", await page.title(), await page.url());
  const initial = await page.evaluate(() => window.stoaDesktopDocuments.getState());
  assert.equal(Object.keys(initial.workspaces).length, 4);
  assert.ok(Object.values(initial.workspaces).every((workspace) => !workspace.dirty));
  assert.equal(await page.getByRole("button", { name: "↑ Import Project", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "↓ Export Project", exact: true }).count(), 0);
  await page.screenshot({ path: `${qa}/first-launch.png`, fullPage: false });
  const checks = { initial, errors };
  // Native dialogs are deterministic test doubles; all IPC, renderer logic,
  // serializers, filesystem writes and revision tracking are production code.
  await app.evaluate(({ dialog }, directory) => {
    globalThis.qaDialogCalls = [];
    dialog.showMessageBox = async (_window, options) => {
      globalThis.qaDialogCalls.push(options ?? _window);
      return { response: globalThis.qaMessageResponse ?? 2 };
    };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: `${directory}/saved.stoa` });
  }, qa);
  const saved = await page.evaluate(() => window.stoaDesktopDocuments.saveDocument("ancient-greek", false));
  assert.equal(saved.status, "saved");
  const savedProject = JSON.parse(await readFile(saved.filePath, "utf8"));
  assert.equal(savedProject.document.language, "ancient-greek");
  checks.saved = saved;
  checks.tokens = savedProject.document.analysis.tokens.length;
  const workspaces = [["ancient-greek", /Ancient Greek/], ["latin", /Latīna.*Latin/], ["classical-chinese", /文言文.*Classical Chinese/], ["omni", /OMNI.*Any language/]];
  checks.workspaceTests = [];
  for (const [workspace, buttonName] of workspaces) {
    await page.getByRole("button", { name: buttonName }).first().click();
    if (workspace === "omni") {
      const warning = page.locator(".omni-warning-actions button").last();
      await warning.waitFor();
      await warning.click();
    }
    await page.waitForFunction(async (language) => (await window.stoaDesktopDocuments.getState()).activeWorkspace === language, workspace);
    await page.waitForFunction((language) => document.querySelector("main.studio-shell")?.dataset.language === language, workspace);
    const token = page.locator(".token-card").first();
    await token.click();
    const surface = page.locator(".token-surface-field input");
    const original = await surface.inputValue();
    await surface.fill(`${original}QA`);
    await page.waitForFunction(async (language) => (await window.stoaDesktopDocuments.getState()).workspaces[language].dirty, workspace);
    let state = await page.evaluate(() => window.stoaDesktopDocuments.getState());
    assert.deepEqual(Object.values(state.workspaces).filter((item) => item.dirty).map((item) => item.workspace), [workspace]);
    await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
    await page.waitForFunction(async (language) => !(await window.stoaDesktopDocuments.getState()).workspaces[language].dirty, workspace);
    assert.equal(await surface.inputValue(), original);
    await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
    assert.equal(await surface.inputValue(), `${original}QA`);
    const cancelled = await page.evaluate((language) => window.stoaDesktopDocuments.newDocument(language, "blank"), workspace);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(await surface.inputValue(), `${original}QA`);
    await app.evaluate(() => { globalThis.qaMessageResponse = 1; });
    const blank = await page.evaluate((language) => window.stoaDesktopDocuments.newDocument(language, "blank"), workspace);
    assert.equal(blank.status, "created");
    await page.waitForFunction(() => document.querySelectorAll(".token-card").length === 0);
    state = await page.evaluate(() => window.stoaDesktopDocuments.getState());
    assert.equal(state.workspaces[workspace].filePath, null);
    assert.equal(state.workspaces[workspace].dirty, false);
    await page.getByRole("button", { name: "Restore sample", exact: true }).click();
    await page.locator(".token-card").first().waitFor();
    const restoredTokens = await page.locator(".token-card").count();
    assert.ok(restoredTokens > 0);
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
      globalThis.qaMessageResponse = 2;
    }, `${qa}/${workspace}.stoa`);
    const result = await page.evaluate((language) => window.stoaDesktopDocuments.saveDocument(language, true), workspace);
    assert.equal(result.status, "saved");
    await page.waitForFunction(async (language) => !(await window.stoaDesktopDocuments.getState()).workspaces[language].dirty, workspace);
    checks.workspaceTests.push({ workspace, restoredTokens, saved: result.filePath });
  }
  if (process.env.STOA_QA_EXPORTS === "1") {
    await mkdir(`${qa}/exports`);
    await page.getByRole("button", {name: "Load Times New Roman from this device", exact: true}).click();
    console.log("LOCAL_FONT_RESULT", await page.locator(".font-import-error").allTextContents());
    for (const name of ["Times New Roman.ttf", "Times New Roman Bold.ttf", "Times New Roman Italic.ttf", "Times New Roman Bold Italic.ttf"]) {
      const file = page.locator('input[type="file"][accept*=".ttf"]');
      await file.setInputFiles(`/System/Library/Fonts/Supplemental/${name}`);
      await page.waitForFunction(() => !document.querySelector('input[type="file"][accept*=".ttf"]').disabled);
    }
    await app.evaluate(({dialog,session}, directory) => {
      globalThis.qaDownloads = [];
      session.defaultSession.on("will-download", (_event,item) => {
        item.once("done", (_event,state) => globalThis.qaDownloads.push({state,path:item.getSavePath()}));
      });
      dialog.showSaveDialog = async (window, opts) => {
        const options = opts ?? window;
        const filename = options.defaultPath.split(/[\\/]/).pop();
        return {canceled:false, filePath:`${directory}/${filename}`};
      };
    }, `${qa}/exports`);
    checks.exports = [];
    for (const [workspace, buttonName] of workspaces) {
      if (process.env.STOA_QA_EXPORT_WORKSPACES && !process.env.STOA_QA_EXPORT_WORKSPACES.split(",").includes(workspace)) continue;
      const needsWarning = workspace === "omni" && await page.locator("main.studio-shell").getAttribute("data-language") !== "omni";
      await page.getByRole("button", {name:buttonName}).first().click();
      if (needsWarning) {
        const warning = page.locator(".omni-warning-actions button").last();
        await warning.waitFor();
        await warning.click();
      }
      await page.waitForFunction((language) => document.querySelector("main.studio-shell")?.dataset.language === language, workspace);
      await page.locator(".token-card").first().waitFor();
      if (workspace === "latin") {
        // This supplied sample pins fonts from another machine by hash. For QA,
        // explicitly rebind only a temporary working copy to this Mac's imported
        // original Times faces. Do not change the user's canonical sample.
        const project = JSON.parse(await readFile(`${qa}/latin.stoa`,"utf8"));
        project.document.settings.fontReferences = [];
        const filename = `${qa}/latin-local-fonts.stoa`;
        await writeFile(filename,JSON.stringify(project));
        await app.evaluate(({dialog}, file) => {
          globalThis.qaMessageResponse = 1;
          dialog.showOpenDialog = async () => ({canceled:false,filePaths:[file]});
        }, filename);
        assert.equal((await page.evaluate(() => window.stoaDesktopDocuments.openDocument())).status,"opened");
      }
      for (const [label, format] of [["Export PDF","pdf"],["Export PNG","png"], ...(workspace === "omni" ? [] : [["↓ LaTeX","tex"]])]) {
        const control = page.getByRole("button",{name:label,exact:true});
        const previous = await app.evaluate(() => globalThis.qaDownloads.length);
        await control.click({timeout:60000});
        let download;
        for (let attempt = 0; attempt < 180; attempt++) {
          download = await app.evaluate((_electron, index) => globalThis.qaDownloads[index], previous);
          if (download) break;
          await new Promise((resolve) => setTimeout(resolve,500));
        }
        assert.equal(download?.state,"completed",`${workspace} ${format} native download failed: ${JSON.stringify(await page.evaluate(()=>window.qaToasts))}`);
        const destination = download.path;
        console.log("EXPORT", workspace, format, destination);
        checks.exports.push({workspace,format,path:destination});
      }
      await page.screenshot({path:`${qa}/${workspace}-preview.png`,fullPage:false});
    }
  }
  await writeFile(`${qa}/results.json`, JSON.stringify(checks, null, 2));
  assert.deepEqual(errors, []);
  console.log("DESKTOP_QA_PASSED", qa);
} finally {
  for (const window of app.windows()) {
    console.log("TOASTS",await window.evaluate(()=>window.qaToasts).catch(()=>[]));
    console.log("FINAL_BODY", (await window.locator("body").innerText().catch(() => "")).slice(0,1000));
    await window.screenshot({path: `${qa}/final.png`}).catch(() => undefined);
  }
  // Avoid save dialogs when ending an automated test, not normal app quit.
  await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await app.close().catch(() => undefined);
}
