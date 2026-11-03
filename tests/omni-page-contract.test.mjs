import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = () => readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
const cssSource = () => readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("OMNI is visually and semantically separate from the official classical catalogue", async () => {
  const page = await pageSource();
  assert.match(page, /LANGUAGE_GROUPS\[0\]\.languageIds\.map/);
  assert.match(page, /className="language-family omni-family"/);
  assert.match(page, />Experimental<\/span>/);
  assert.match(page, /changeLanguage\(STOA_OMNI_LANGUAGE_ID\)/);
  assert.match(page, /aria-label="Experimental language workspaces"/);
  assert.match(page, /Experimental multilingual workspace/);
});

test("explicit navigation and project transitions into OMNI are staged behind the warning", async () => {
  const page = await pageSource();
  assert.match(page, /type PendingOmniTransition =[\s\S]*kind: "language"[\s\S]*kind: "project"/);
  assert.doesNotMatch(page, /kind: "analysis"|kind: "history"/);
  assert.doesNotMatch(page, /shouldStageStoredOmni/);
  assert.match(page, /const imported = createOfficialSampleState\("ancient-greek"\)/);
  assert.match(page, /const changeLanguage =[\s\S]*setOmniWarningPending\(\{ kind: "language" \}\)/);
  assert.match(page, /const importProject =[\s\S]*setOmniWarningPending\(\{ kind: "project", imported \}\)/);
  assert.match(page, /undoWorkspaceHistory\([\s\S]*language,[\s\S]*currentSnapshot\(\)/);
  assert.match(page, /redoWorkspaceHistory\([\s\S]*language,[\s\S]*currentSnapshot\(\)/);
  assert.match(page, /role="alertdialog"/);
  assert.match(page, /data-modal-primary/);
  assert.match(page, /writeOmniPreferences\(window\.localStorage/);
  assert.match(page, /resetOmniPreferences\(window\.localStorage\)/);
  assert.match(page, /checked\+Cancel|checked and Cancel|cancelOmniTransition/);
});

test("OMNI uses one concise prompt and permissive analysis loader without guided chunk UI", async () => {
  const page = await pageSource();
  assert.match(page, /mode: "model-full"/);
  assert.match(page, /mode: "user-full"/);
  assert.match(page, /lockedTokens: tokens\.map/);
  assert.match(page, /punctuationBefore: item\.punctuationBefore/);
  assert.match(page, /breakAfter: getBreakAfter\(item\)/);
  assert.match(page, /OMNI uses one concise AI request and Import Analysis/);
  assert.doesNotMatch(page, /Direct API analysis/);
  assert.match(page, /!isOmniLanguageId\(language\) && \([\s\S]*?className="manual-workflow-launch"/);
  assert.match(page, /const importLabel = "Import Analysis"/);
  assert.match(page, /loadPermissiveOmniAnalysis\(parsed\.value\)/);
  assert.match(page, /updateJsonWorkspaceDraft\(createJsonWorkspace\(next\), workspace\.draftText\)/);
  assert.match(page, /Load Analysis into Preview/);
  assert.match(page, /previous preview remains available through Undo/i);
});

test("RTL and vertical preview preserve logical token order and use browser writing semantics", async () => {
  const [page, css] = await Promise.all([pageSource(), cssSource()]);
  assert.match(page, /page\.tokenLines\.map[\s\S]*line\.tokens\.map/);
  assert.doesNotMatch(page, /analysis\.tokens\.reverse\(|line\.tokens\.reverse\(/);
  assert.match(page, /dir=\{omniDocument\?\.direction\}/);
  assert.match(page, /style=\{omniWritingStyle \?\? undefined\}/);
  assert.match(page, /omniDocument\?\.direction === "rtl"[\s\S]*ArrowRight[\s\S]*"previous"/);
  assert.match(css, /\.omni-token-flow\[dir="rtl"\]:not\(\.is-vertical\)/);
  assert.match(css, /\.omni-token-flow\.is-vertical[\s\S]*text-orientation:\s*mixed/);
  assert.doesNotMatch(css, /\.omni-token-flow[\s\S]{0,500}transform:\s*rotate/);
  assert.match(css, /inset-inline-end:\s*-10px/);
});

test("OMNI export UI follows local Rich/Generic policy and unsafe vector layouts use direct DOM raster PDF", async () => {
  const [page, exportModule] = await Promise.all([
    pageSource(),
    readFile(new URL("../app/lib/omni-export.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /disabled=\{omniVertical\}/);
  assert.match(page, /assertCurrentExportSupported\("project"\)/);
  assert.match(page, /assertCurrentExportSupported\("pdf"\)/);
  assert.match(page, /assertCurrentExportSupported\("png"\)/);
  assert.match(page, /assertCurrentExportSupported\("latex"\)/);
  assert.match(page, /pdfExportCapability\?\.supported === false/);
  assert.match(page, /pdfRoute\.pdf\?\.outputType === "raster"/);
  assert.match(page, /document\.querySelectorAll<HTMLElement>\("\.paper-preview\.export-page"\)/);
  assert.match(page, /createRasterPdfFromPreview\(\{/);
  assert.match(page, /const finalPdf = await generateCurrentPdf\(exportLayoutKey\)/);
  assert.match(page, /const exportBusyRef = useRef\(false\)/);
  assert.match(page, /if \(!analysis\.tokens\.length \|\| exportBusyRef\.current \|\| !documentLayoutReady\)/);
  assert.match(page, /disabled=\{!analysis\.tokens\.length \|\| pdfExportCapability\?\.supported === false \|\| activeDocumentExport !== null \|\| !documentLayoutReady\}/);
  assert.match(page, /aria-busy=\{activeDocumentExport === "png"\}/);
  assert.match(page, /disabled=\{projectExportCapability\?\.supported === false\}/);
  assert.match(page, /\(!omniDocument \|\| latexExportCapability\?\.supported\)/);
  assert.match(page, /disabled=\{!analysis\.tokens\.length \|\| pngExportCapability\?\.supported === false \|\| activeDocumentExport !== null \|\| !documentLayoutReady\}/);
  assert.match(exportModule, /Generic Mode supports Project, PDF, and PDF-derived PNG export/);
  assert.match(exportModule, /format === "pdf"/);
  assert.match(exportModule, /format === "png"[\s\S]*derivedFrom: "pdf"/);
  const projectExporter = page.match(/const exportProject = \(\) => \{[\s\S]*?\n[ ]{2}\};/u)?.[0] ?? "";
  assert.ok(projectExporter);
  assert.match(projectExporter, /assertCurrentExportSupported\("project"\)/);
  assert.match(page, /schemaVersion: STOA_PROJECT_V6_SCHEMA/);
  assert.match(page, /manualLanguageOverride: event\.target\.value[\s\S]*confirmed: true/);
  assert.match(page, /Available only for validated inflectional-language profiles\./);
});
