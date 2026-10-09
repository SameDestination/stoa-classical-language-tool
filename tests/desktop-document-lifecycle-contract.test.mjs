import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("native Open routes the canonical direct STOA document root", async () => {
  const [mainSource, sampleSource] = await Promise.all([
    readSource("../desktop/main.mjs"),
    readSource("../app/developer-defaults/samples/stoa-latin.stoa.json"),
  ]);
  const sample = JSON.parse(sampleSource);
  assert.equal(sample.format, "stoa-project");
  assert.equal(sample.document.language, "latin");
  assert.equal(Object.hasOwn(sample, "project"), false);
  assert.match(mainSource, /parsed\?\.document\?\.language/u);
});

test("native Open preserves trusted OMNI settings while exchange Import stays untrusted", async () => {
  const rendererSource = await readSource("../app/stoa-studio.tsx");
  assert.match(
    rendererSource,
    /command\.type === "open-project"[\s\S]*?normalizeImportedProject\(\s*JSON\.parse\(command\.contents\),\s*workspace,[\s\S]*?undefined,\s*"desktop"/u,
  );
  assert.match(
    rendererSource,
    /const importProject = \(\)[\s\S]*?normalizeImportedProject\(\s*JSON\.parse\(projectImportValue\),\s*language,\s*userTokenStyleDefaults\s*,?\s*\)/u,
  );
  assert.match(
    rendererSource,
    /serializeStoaProject\(project\)[\s\S]*?"bundled"/u,
  );
  assert.match(
    rendererSource,
    /const snapshotFromImportedState[\s\S]*?const selectedTokenId =[\s\S]*?\? imported\.selectedTokenId\s*: null/u,
  );
});

test("desktop Save and exchange Export Project remain separate pathways", async () => {
  const rendererSource = await readSource("../app/stoa-studio.tsx");
  assert.match(
    rendererSource,
    /const serializeDesktopWorkspace = async[\s\S]*?contents: stringifyStoaProject\(project\)/u,
  );
  assert.match(
    rendererSource,
    /const saveDesktopDocument = async[\s\S]*?bridge\.saveDocument\(language, saveAs\)/u,
  );
  assert.match(
    rendererSource,
    /const exportProject = \(\)[\s\S]*?download\(\s*stringifyStoaProject\(project\)/u,
  );
});

test("project exchange controls stay Web-only and Desktop New uses native protection", async () => {
  const renderer = await readSource("../app/stoa-studio.tsx");
  const main = await readSource("../desktop/main.mjs");
  assert.match(renderer, /!desktopDocumentsAvailable && <>[\s\S]*?↑ Import Project[\s\S]*?↓ Export Project<\/button><\/>/u);
  assert.doesNotMatch(main, /label: "(?:Export|Import) Project/u);
  assert.match(renderer, /className="new-blank-document" onClick=\{desktopDocumentsAvailable[\s\S]*?newDocument\(language, "blank"\)[\s\S]*?: newBlankDocument/u);
});

test("a native saved-revision update forces dirty-state reconciliation", async () => {
  const rendererSource = await readSource("../app/stoa-studio.tsx");
  assert.match(rendererSource, /savedRevisionChanged = true/u);
  assert.match(rendererSource, /setDesktopSavedRevisionGeneration/u);
  assert.match(
    rendererSource,
    /desktopSavedRevisionGeneration[\s\S]*?language[\s\S]*?projectBases[\s\S]*?settings/u,
  );
  assert.match(
    rendererSource,
    /const performLanguageChange[\s\S]*?setActiveWorkspace\(nextLanguage\)[\s\S]*?cancelAnalysisForWorkspaceChange/u,
  );
});
