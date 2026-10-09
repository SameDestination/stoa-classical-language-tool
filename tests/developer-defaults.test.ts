import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  STOA_DEVELOPER_DEFAULTS,
  STOA_DEVELOPER_WORKSPACE_IDS,
  createDeveloperBlankProject,
  createDeveloperWebBlankProject,
  createDeveloperDefaultProject,
  createDeveloperDefaultSettings,
  isStoaDeveloperWorkspaceId,
} from "../app/developer-defaults/index.ts";
import {
  parseStoaProject,
  serializeStoaProject,
  STOA_PROJECT_V6_SCHEMA,
  stringifyStoaProject,
} from "../app/lib/stoa-project.ts";

test("one developer-controlled directory maps all four workspaces to verified sample assets", async () => {
  assert.deepEqual(Object.keys(STOA_DEVELOPER_DEFAULTS), [...STOA_DEVELOPER_WORKSPACE_IDS]);
  assert.equal(Object.isFrozen(STOA_DEVELOPER_DEFAULTS), true);
  for (const workspace of STOA_DEVELOPER_WORKSPACE_IDS) {
    const definition = STOA_DEVELOPER_DEFAULTS[workspace];
    assert.equal(Object.isFrozen(definition), true);
    assert.equal(Object.isFrozen(definition.settings), true);
    const bytes = await readFile(new URL(
      `../app/developer-defaults/samples/${definition.sampleFilename}`,
      import.meta.url,
    ));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), definition.sampleSha256);
    assert.equal(isStoaDeveloperWorkspaceId(workspace), true);
  }
  assert.equal(isStoaDeveloperWorkspaceId("modern-greek"), false);
});

test("startup and Restore Sample receive migrated projects with developer settings", () => {
  for (const workspace of STOA_DEVELOPER_WORKSPACE_IDS) {
    const project = createDeveloperDefaultProject(workspace);
    assert.equal(project.project.schemaVersion, STOA_PROJECT_V6_SCHEMA);
    assert.equal(project.project.document.language, workspace);
    assert.equal(project.project.document.analysis.language, workspace);
    assert.equal(project.project.document.settings.showTranslation, true);
    assert.ok(project.project.document.analysis.tokens.length > 0);

    const roundTrip = parseStoaProject(serializeStoaProject(project));
    assert.deepEqual(serializeStoaProject(roundTrip), serializeStoaProject(project));
  }
});

test("working edits never mutate a canonical bundled project", () => {
  for (const workspace of STOA_DEVELOPER_WORKSPACE_IDS) {
    const baseline = stringifyStoaProject(createDeveloperDefaultProject(workspace));
    const edited = createDeveloperDefaultProject(workspace);
    edited.project.document.sourceText = "USER EDIT";
    edited.project.document.analysis.sourceText = "USER EDIT";
    edited.project.document.analysis.tokens[0].surface = "USER EDIT";
    edited.project.document.analysis.tokens[0].features = { leaked: "no" };
    edited.project.document.settings.headerLeft = "USER EDIT";
    edited.project.document.settings.showTranslation = false;

    const restored = createDeveloperDefaultProject(workspace);
    assert.equal(stringifyStoaProject(restored), baseline);
    assert.notEqual(restored.project.document.sourceText, "USER EDIT");
    assert.notEqual(restored.project.document.analysis.tokens[0].surface, "USER EDIT");
    assert.equal(restored.project.document.analysis.tokens[0].features.leaked, undefined);
    assert.notEqual(restored.project.document.settings.headerLeft, "USER EDIT");
    assert.equal(restored.project.document.settings.showTranslation, true);
  }
});

test("New can create a blank project without duplicating workspace defaults", () => {
  for (const workspace of STOA_DEVELOPER_WORKSPACE_IDS) {
    const sample = createDeveloperDefaultProject(workspace);
    const blank = createDeveloperBlankProject(workspace);
    assert.equal(blank.project.document.language, workspace);
    assert.equal(blank.project.document.sourceText, "");
    assert.equal(blank.project.document.analysis.sourceText, "");
    assert.equal(blank.project.document.analysis.literalTranslation, "");
    assert.equal(blank.project.document.analysis.naturalTranslation, "");
    assert.deepEqual(blank.project.document.analysis.tokens, []);
    assert.deepEqual(blank.project.document.analysis.notes, []);
    assert.equal(blank.project.document.selectedTokenId, null);
    assert.deepEqual(blank.project.document.settings, sample.project.document.settings);
    assert.deepEqual(createDeveloperDefaultSettings(workspace), sample.project.document.settings);
  }
});

test("Web New clears document and running text except the packaged right header", () => {
  for (const workspace of STOA_DEVELOPER_WORKSPACE_IDS) {
    const sample = createDeveloperDefaultProject(workspace);
    const before = serializeStoaProject(sample);
    const blank = createDeveloperWebBlankProject(workspace);
    const settings = blank.project.document.settings;
    assert.equal(blank.project.document.sourceText, "");
    assert.deepEqual(blank.project.document.analysis.tokens, []);
    assert.deepEqual(blank.project.document.analysis.notes, []);
    assert.equal(settings.headerLeft, "");
    assert.equal(settings.footerLeft, "");
    assert.equal(settings.footerRight, "");
    assert.equal(settings.headerRight, sample.project.document.settings.headerRight);
    assert.deepEqual(serializeStoaProject(createDeveloperDefaultProject(workspace)), before);
  }
});

test("translation typography survives project serialization with false emphasis values", () => {
  const project = createDeveloperDefaultProject("latin");
  const styles = { translationFont: "'Liberation Sans STOA', sans-serif", translationSize: 16, translationColor: "#3366cc", translationBold: true, translationItalic: false, translationUnderline: true };
  Object.assign(project.project.document.settings, styles);
  const roundtrip = parseStoaProject(serializeStoaProject(project));
  for (const [key, value] of Object.entries(styles)) assert.equal(roundtrip.project.document.settings[key as keyof typeof styles], value);
});

test("the developer defaults location documents the supported update and rebuild workflow", async () => {
  const [documentation, languageCatalogue] = await Promise.all([
    readFile(new URL("../app/developer-defaults/README.md", import.meta.url), "utf8"),
    readFile(new URL("../app/language-config.ts", import.meta.url), "utf8"),
  ]);
  for (const workspace of STOA_DEVELOPER_WORKSPACE_IDS) {
    assert.match(documentation, new RegExp(STOA_DEVELOPER_DEFAULTS[workspace].sampleFilename, "u"));
  }
  assert.match(documentation, /createDeveloperDefaultProject\(\)/u);
  assert.match(documentation, /same project pipeline/u);
  assert.match(documentation, /never\s+exposed/u);
  assert.doesNotMatch(languageCatalogue, /const (?:greek|latin|classicalChinese)Sample/u);
  assert.doesNotMatch(languageCatalogue, /\bsample:\s*(?:greek|latin|classicalChinese)Sample/u);
});
