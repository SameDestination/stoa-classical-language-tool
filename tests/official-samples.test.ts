import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  OFFICIAL_SAMPLE_MANIFEST,
  createOfficialSampleProject,
} from "../app/lib/official-samples.ts";
import { STOA_LANGUAGE_IDS, type StoaLanguageId } from "../app/language-config.ts";
import {
  parseStoaProject,
  serializeStoaProject,
  stringifyStoaProject,
  STOA_PROJECT_V6_SCHEMA,
} from "../app/lib/stoa-project.ts";
import {
  buildStoaLatex,
  type LatexInterlinearSettings,
} from "../app/lib/latex-export.ts";

const expectedTokenCounts: Record<StoaLanguageId, number> = {
  "ancient-greek": 112,
  latin: 105,
  "classical-chinese": 226,
};

test("the three supplied files map to the correct official language and retain their exact bytes", async () => {
  assert.deepEqual(Object.keys(OFFICIAL_SAMPLE_MANIFEST), [...STOA_LANGUAGE_IDS]);
  for (const language of STOA_LANGUAGE_IDS) {
    const manifest = OFFICIAL_SAMPLE_MANIFEST[language];
    const bytes = await readFile(new URL(`../app/developer-defaults/samples/${manifest.filename}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256);
    const project = createOfficialSampleProject(language);
    assert.equal(project.project.schemaVersion, STOA_PROJECT_V6_SCHEMA);
    assert.equal(project.project.document.language, language);
    assert.equal(project.project.document.analysis.language, language);
    assert.equal(project.project.document.analysis.tokens.length, expectedTokenCounts[language]);
    assert.ok(project.project.document.selectedTokenId === null || project.project.document.analysis.tokens.some((token) => token.id === project.project.document.selectedTokenId));
    assert.equal(project.project.document.settings.showPronunciation, true);
  }
});

test("Restore Sample can always obtain a pristine copy and never mutates the canonical project", () => {
  const baseline = stringifyStoaProject(createOfficialSampleProject("classical-chinese"));
  const edited = createOfficialSampleProject("classical-chinese");
  edited.project.document.sourceText = "已修改";
  edited.project.document.analysis.sourceText = "已修改";
  edited.project.document.analysis.tokens[0].surface = "改";
  edited.project.document.analysis.tokens[0].pinyin = "gǎi";
  edited.project.document.analysis.tokens[0].pronunciationColor = "#336699";
  edited.project.document.analysis.tokens[0].features.futureMutation = "must not leak";
  edited.project.document.analysis.notes.push({
    id: "note-user-edit",
    tokenId: edited.project.document.analysis.tokens[0].id,
    text: "must not leak",
  });
  edited.project.document.settings.headerLeft = "must not leak";
  edited.project.document.settings.showPronunciation = false;
  assert.ok(edited.project.document.settings.tokenStyle);
  edited.project.document.settings.tokenStyle.pronunciation = {
    sizePt: 14,
    color: "#336699",
  };

  const restored = createOfficialSampleProject("classical-chinese");
  assert.equal(stringifyStoaProject(restored), baseline);
  assert.notEqual(restored.project.document.sourceText, "已修改");
  assert.notEqual(restored.project.document.analysis.tokens[0].surface, "改");
  assert.notEqual(restored.project.document.analysis.tokens[0].pinyin, "gǎi");
  assert.notEqual(restored.project.document.analysis.tokens[0].pronunciationColor, "#336699");
  assert.equal(restored.project.document.settings.showPronunciation, true);
  assert.notDeepEqual(restored.project.document.settings.tokenStyle?.pronunciation, {
    sizePt: 14,
    color: "#336699",
  });
  assert.equal(restored.project.document.analysis.tokens[0].features.futureMutation, undefined);
  assert.equal(
    restored.project.document.analysis.notes.some((note) => note.text === "must not leak"),
    false,
  );
});

test("official samples remain normal STOA projects for round-trip and LaTeX export", () => {
  for (const language of STOA_LANGUAGE_IDS) {
    const project = createOfficialSampleProject(language);
    const serialized = serializeStoaProject(project);
    assert.deepEqual(serializeStoaProject(parseStoaProject(serialized)), serialized);
    const document = project.project.document;
    const latex = buildStoaLatex(
      document.analysis,
      document.settings as LatexInterlinearSettings,
    );
    assert.match(latex, /\\begin\{document\}/u);
    assert.match(latex, /\\end\{document\}/u);
    for (const token of document.analysis.tokens) assert.ok(latex.includes(token.surface));
  }
});

test("the page uses fresh developer samples for web startup, first workspace visit, and Restore Sample", async () => {
  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  assert.match(page, /const imported = createOfficialSampleState\("ancient-greek"\)/u);
  assert.match(page, /if \(!saved && isStoaLanguageId\(nextLanguage\)\)[\s\S]*createOfficialSampleState\(nextLanguage\)/u);
  assert.match(page, /const sample = createOfficialSampleState\(language\)/u);
  assert.match(page, /commitDocument\([\s\S]*sample\.analysis,[\s\S]*sample\.settings/u);
  assert.doesNotMatch(page, /resolveOfficialSampleVisit/u);
  assert.doesNotMatch(page, /writeOfficialSampleWorkingProject/u);
});
