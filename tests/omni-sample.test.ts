import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createOmniSampleProject,
  OMNI_SAMPLE_MANIFEST,
} from "../app/lib/omni-sample.ts";
import {
  parseStoaProject,
  serializeStoaProject,
  STOA_PROJECT_V6_SCHEMA,
} from "../app/lib/stoa-project.ts";

test("the supplied OMNI project is bundled through the normal project pipeline", async () => {
  const bytes = await readFile(new URL(`../app/developer-defaults/samples/${OMNI_SAMPLE_MANIFEST.filename}`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), OMNI_SAMPLE_MANIFEST.sha256);
  const project = createOmniSampleProject();
  assert.equal(project.project.schemaVersion, STOA_PROJECT_V6_SCHEMA);
  assert.equal(project.project.document.language, "omni");
  assert.equal(project.project.document.analysis.language, "omni");
  assert.equal(project.project.document.analysis.tokens.length, 35);
  assert.equal(project.project.document.settings.omni?.direction, "rtl");
  assert.equal(project.project.document.analysis.languageDetection?.languageId, "hbo");
  assert.equal(project.project.document.settings.showPronunciation, true);
  assert.deepEqual(
    serializeStoaProject(parseStoaProject(serializeStoaProject(project))),
    serializeStoaProject(project),
  );
});

test("OMNI sample calls return independent working copies", () => {
  const edited = createOmniSampleProject();
  edited.project.document.analysis.tokens[0].surface = "mutated";
  edited.project.document.analysis.tokens[0].romanization = "mutated-reading";
  edited.project.document.analysis.tokens[0].pronunciationSize = 22;
  edited.project.document.settings.showPronunciation = false;
  edited.project.document.settings.headerRight = "mutated";
  const restored = createOmniSampleProject();
  assert.notEqual(restored.project.document.analysis.tokens[0].surface, "mutated");
  assert.notEqual(restored.project.document.analysis.tokens[0].romanization, "mutated-reading");
  assert.notEqual(restored.project.document.analysis.tokens[0].pronunciationSize, 22);
  assert.equal(restored.project.document.settings.showPronunciation, true);
  assert.notEqual(restored.project.document.settings.headerRight, "mutated");
});

test("all fresh sample workspaces receive translation-visible developer defaults", async () => {
  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  assert.equal(createOmniSampleProject().project.document.settings.showTranslation, true);
  assert.match(page, /const createOmniSampleState[\s\S]*createDeveloperDefaultProject\("omni"\)/u);
  assert.doesNotMatch(page, /withSampleTranslationHidden/u);
  assert.match(page, /const sample = createOmniSampleState\(\)/u);
  assert.match(page, /Official OMNI sample restored/u);
});
