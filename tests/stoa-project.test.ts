import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  STOA_OMNI_PROFILE_ID,
  createOmniDocumentConfig,
} from "../app/lib/omni-language.ts";
import {
  DEFAULT_OMNI_LANGUAGE_DETECTION,
  STOA_GENERIC_MORPHOLOGY_STANDARD_ID,
} from "../app/lib/omni-language-profiles.ts";
import {
  STOA_PROJECT_V6_SCHEMA,
  StoaProjectCodecError,
  cloneParsedStoaProject,
  migrateStoaProjectToLatest,
  parseStoaProject,
  parseStoaProjectText,
  serializeStoaProject,
  stringifyStoaProject,
  type StoaJsonObject,
} from "../app/lib/stoa-project.ts";
import type { UserFontReference } from "../app/lib/user-fonts.ts";

const fixtures = [
  {
    filename: "stoa-ancient-greek-20260819-184926.stoa.json",
    sha256: "fd624656f743918b97d02647a2fe6e7999450af59099a0d4089f053e82faf7d7",
    language: "ancient-greek",
    tokenCount: 31,
  },
  {
    filename: "stoa-latin-20260819-191723.stoa.json",
    sha256: "7802402362f917d442d566ba1f19da22d098eb8d665bc958c263d8cd06110ce7",
    language: "latin",
    tokenCount: 24,
  },
] as const;

const fixtureText = (filename: string) =>
  readFile(new URL(`./fixtures/canonical/${filename}`, import.meta.url), "utf8");

const asLegacySchema = (
  value: StoaJsonObject,
  schemaVersion: 2 | 3 | 4 | 5,
): StoaJsonObject => {
  const legacy = structuredClone(value);
  legacy.schemaVersion = schemaVersion;
  const document = legacy.document as StoaJsonObject;
  const analysis = document.analysis as StoaJsonObject;
  const settings = document.settings as StoaJsonObject;
  if (schemaVersion < 5) {
    analysis.notes = (analysis.notes as StoaJsonObject[]).map((note) => String(note.text ?? ""));
    delete settings.showNotes;
    delete settings.showNoteMarkers;
  }
  delete settings.showPronunciation;
  const tokenStyle = settings.tokenStyle as StoaJsonObject | undefined;
  if (tokenStyle) delete tokenStyle.pronunciation;
  for (const token of analysis.tokens as StoaJsonObject[]) {
    delete token.pinyin;
    delete token.romanization;
    delete token.pronunciationSize;
    delete token.pronunciationColor;
  }
  return legacy;
};

test("canonical Greek and Latin fixture copies retain their original hashes", async () => {
  for (const fixture of fixtures) {
    const text = await fixtureText(fixture.filename);
    assert.equal(createHash("sha256").update(text).digest("hex"), fixture.sha256);
  }
});

test("canonical v1 projects parse and serialize without semantic narrowing", async () => {
  for (const fixture of fixtures) {
    const text = await fixtureText(fixture.filename);
    const raw = JSON.parse(text) as StoaJsonObject;
    const parsed = parseStoaProjectText(text);

    assert.equal(parsed.sourceSchemaVersion, 1);
    assert.equal(parsed.project.document.language, fixture.language);
    assert.equal(parsed.project.document.analysis.language, fixture.language);
    assert.equal(parsed.project.document.analysis.tokens.length, fixture.tokenCount);
    assert.equal(parsed.project.document.selectedTokenId, null);
    assert.deepEqual(serializeStoaProject(parsed), raw);
    assert.deepEqual(JSON.parse(stringifyStoaProject(parsed)), raw);
  }
});

test("canonical IDs, order, source, punctuation, features, and settings survive round-trip", async () => {
  for (const fixture of fixtures) {
    const raw = JSON.parse(await fixtureText(fixture.filename)) as StoaJsonObject;
    const parsed = parseStoaProject(raw);
    const serialized = serializeStoaProject(parsed);
    const rawDocument = raw.document as StoaJsonObject;
    const rawAnalysis = rawDocument.analysis as StoaJsonObject;
    const rawTokens = rawAnalysis.tokens as StoaJsonObject[];
    const outputDocument = serialized.document as StoaJsonObject;
    const outputAnalysis = outputDocument.analysis as StoaJsonObject;
    const outputTokens = outputAnalysis.tokens as StoaJsonObject[];

    assert.equal(outputDocument.sourceText, rawDocument.sourceText);
    assert.equal(outputAnalysis.sourceText, rawAnalysis.sourceText);
    assert.deepEqual(outputDocument.settings, rawDocument.settings);
    assert.deepEqual(
      outputTokens.map((token) => token.id),
      rawTokens.map((token) => token.id),
    );
    assert.deepEqual(
      outputTokens.map((token) => [
        token.surface,
        token.punctuationBefore,
        token.punctuationAfter,
      ]),
      rawTokens.map((token) => [
        token.surface,
        token.punctuationBefore,
        token.punctuationAfter,
      ]),
    );
    assert.deepEqual(
      outputTokens.map((token) => token.features),
      rawTokens.map((token) => token.features),
    );
  }
});

test("canonical Greek and Latin remain OMNI-free and stable through v2-v6", async () => {
  for (const fixture of fixtures) {
    const parsedV1 = parseStoaProjectText(await fixtureText(fixture.filename));
    assert.equal(parsedV1.project.document.settings.omni, undefined);
    assert.equal(Object.hasOwn(
      (serializeStoaProject(parsedV1).document as StoaJsonObject).settings as StoaJsonObject,
      "omni",
    ), false);

    const migratedFromV1 = migrateStoaProjectToLatest(parsedV1);
    const serializedV6 = serializeStoaProject(migratedFromV1);
    const settingsV6 = (serializedV6.document as StoaJsonObject).settings as StoaJsonObject;
    assert.equal(migratedFromV1.project.schemaVersion, STOA_PROJECT_V6_SCHEMA);
    assert.equal(migratedFromV1.project.document.language, fixture.language);
    assert.equal(migratedFromV1.project.document.settings.omni, undefined);
    assert.equal(Object.hasOwn(settingsV6, "omni"), false);
    assert.equal(settingsV6.showNotes, true);
    assert.equal(settingsV6.showNoteMarkers, true);
    assert.equal(settingsV6.showPronunciation, true);
    assert.deepEqual(serializeStoaProject(parseStoaProject(serializedV6)), serializedV6);

    const serializedV5 = asLegacySchema(serializedV6, 5);
    const parsedV5 = parseStoaProject(serializedV5);
    assert.equal(parsedV5.sourceSchemaVersion, 5);
    assert.deepEqual(
      serializeStoaProject(parsedV5),
      serializedV5,
      "schema v5 remains an exact parse/serialize compatibility format",
    );
    assert.deepEqual(
      serializeStoaProject(migrateStoaProjectToLatest(parsedV5)),
      serializedV6,
      "schema v5 promotes only the schema-v6 pronunciation visibility default",
    );

    const serializedV4 = asLegacySchema(serializedV6, 4);
    const parsedV4 = parseStoaProject(serializedV4);
    assert.equal(parsedV4.sourceSchemaVersion, 4);
    assert.deepEqual(serializeStoaProject(parsedV4), serializedV4);

    const serializedV3 = asLegacySchema(serializedV6, 3);
    const parsedV3 = parseStoaProject(serializedV3);
    assert.equal(parsedV3.sourceSchemaVersion, 3);
    assert.deepEqual(
      serializeStoaProject(parsedV3),
      serializedV3,
      "schema v3 remains an exact parse/serialize compatibility format",
    );

    const serializedV2 = asLegacySchema(serializedV6, 2);
    const parsedV2 = parseStoaProject(serializedV2);
    assert.equal(parsedV2.sourceSchemaVersion, 2);
    assert.deepEqual(
      serializeStoaProject(parsedV2),
      serializedV2,
      "schema v2 remains an exact parse/serialize compatibility format",
    );

    const migratedFromV2 = migrateStoaProjectToLatest(parsedV2);
    const migratedV2Json = serializeStoaProject(migratedFromV2);
    const migratedV2Document = migratedV2Json.document as StoaJsonObject;
    const migratedV2Settings = migratedV2Document.settings as StoaJsonObject;
    assert.equal(migratedV2Json.schemaVersion, STOA_PROJECT_V6_SCHEMA);
    assert.equal(Object.hasOwn(migratedV2Settings, "omni"), false);
    assert.deepEqual(migratedV2Json, serializedV6);
  }
});

test("schema v4 serializes complete OMNI document metadata faithfully", async () => {
  const migrated = migrateStoaProjectToLatest(
    parseStoaProjectText(await fixtureText(fixtures[1].filename)),
  );
  const omni = createOmniDocumentConfig({
    languageHint: "ar",
    direction: "rtl",
    writingMode: "vertical-rl",
    tokenizationOrigin: "user",
  });
  migrated.project.document.language = "omni";
  migrated.project.document.analysis.language = "omni";
  migrated.project.document.settings.omni = omni;

  const serialized = serializeStoaProject(migrated);
  const outputSettings = (serialized.document as StoaJsonObject).settings as StoaJsonObject;
  assert.deepEqual(outputSettings.omni, {
    profile: STOA_OMNI_PROFILE_ID,
    languageHint: "ar",
    direction: "rtl",
    writingMode: "vertical-rl",
    tokenizationOrigin: "user",
    annotationTarget: "english",
    languageDetection: DEFAULT_OMNI_LANGUAGE_DETECTION,
    analysisProfile: "generic",
    morphologyStandard: STOA_GENERIC_MORPHOLOGY_STANDARD_ID,
    manualLanguageOverride: null,
  });

  const reparsed = parseStoaProject(serialized);
  assert.deepEqual(reparsed.project.document.settings.omni, omni);
  assert.deepEqual(serializeStoaProject(reparsed), serialized);
});

test("schema v4 round-trips device-local font references without binary data", async () => {
  const migrated = migrateStoaProjectToLatest(
    parseStoaProjectText(await fixtureText(fixtures[0].filename)),
  );
  const reference: UserFontReference = {
    id: "user-font-0123456789abcdef01234567",
    familyId: "user-family-0123456789abcdef0123",
    familyName: "Scholarly Serif",
    subfamilyName: "Regular",
    postscriptName: "ScholarlySerif-Regular",
    cssFamily: "'STOAUser-0123456789abcdef'",
    filename: "Scholarly Serif.otf",
    sha256: "0123456789abcdef".repeat(4),
    format: "otf",
    faceStyle: "normal",
    byteLength: 456789,
  };
  migrated.project.document.settings.fontReferences = [reference];
  const serialized = serializeStoaProject(migrated);
  const reparsed = parseStoaProject(serialized);
  assert.deepEqual(reparsed.project.document.settings.fontReferences, [reference]);
  assert.deepEqual(serializeStoaProject(reparsed), serialized);
  assert.equal(JSON.stringify(serialized).includes("fontBytes"), false);

  const duplicate = structuredClone(serialized);
  const duplicateSettings = (duplicate.document as StoaJsonObject).settings as StoaJsonObject;
  duplicateSettings.fontReferences = [reference as unknown as StoaJsonObject, reference as unknown as StoaJsonObject];
  assert.throws(
    () => parseStoaProject(duplicate),
    (error) => error instanceof StoaProjectCodecError
      && error.code === "invalid-project"
      && error.path.endsWith("fontReferences[1].id"),
  );
});

test("schema v4 preserves unknown fields inside settings.omni while known edits win", async () => {
  const migrated = migrateStoaProjectToLatest(
    parseStoaProjectText(await fixtureText(fixtures[0].filename)),
  );
  migrated.project.document.settings.omni = createOmniDocumentConfig({
    languageHint: null,
    direction: "ltr",
    writingMode: "horizontal-tb",
    tokenizationOrigin: "model",
  });
  const raw = serializeStoaProject(migrated);
  const rawSettings = (raw.document as StoaJsonObject).settings as StoaJsonObject;
  const rawOmni = rawSettings.omni as StoaJsonObject;
  rawOmni.futureLayoutEngine = {
    axes: ["inline", "block"],
    shaping: { version: 3, enabled: true },
  };
  rawOmni.futureBoolean = false;
  (rawOmni.languageDetection as StoaJsonObject).futureDetector = {
    engine: "future-local-detector",
    revision: 7,
  };
  rawOmni.manualLanguageOverride = {
    languageId: "de",
    confirmed: true,
    futureConfirmationSource: "explicit-user-action",
  };

  const parsed = parseStoaProject(raw);
  if (!parsed.project.document.settings.omni) throw new Error("Expected parsed OMNI settings.");
  parsed.project.document.settings.omni = {
    ...parsed.project.document.settings.omni,
    direction: "rtl",
    manualLanguageOverride: { languageId: "fr", confirmed: true },
  };
  const serialized = serializeStoaProject(parsed);
  const outputOmni = (
    (serialized.document as StoaJsonObject).settings as StoaJsonObject
  ).omni as StoaJsonObject;

  assert.equal(outputOmni.direction, "rtl");
  assert.deepEqual(outputOmni.futureLayoutEngine, rawOmni.futureLayoutEngine);
  assert.equal(outputOmni.futureBoolean, false);
  assert.deepEqual(
    (outputOmni.languageDetection as StoaJsonObject).futureDetector,
    (rawOmni.languageDetection as StoaJsonObject).futureDetector,
  );
  assert.deepEqual(outputOmni.manualLanguageOverride, {
    languageId: "fr",
    confirmed: true,
    futureConfirmationSource: "explicit-user-action",
  });
  assert.deepEqual(serializeStoaProject(parseStoaProject(serialized)), serialized);
});

test("schema v4 rejects missing, incomplete, or invalid known OMNI metadata", async () => {
  const migrated = migrateStoaProjectToLatest(
    parseStoaProjectText(await fixtureText(fixtures[0].filename)),
  );
  migrated.project.document.language = "omni";
  migrated.project.document.analysis.language = "omni";
  migrated.project.document.settings.omni = createOmniDocumentConfig({ languageHint: "he" });
  const valid = serializeStoaProject(migrated);

  const invalidValues: Array<[string, unknown]> = [
    ["profile", "legacy-omni"],
    ["languageHint", 17],
    ["languageHint", "  he  "],
    ["direction", "auto"],
    ["writingMode", "sideways-rl"],
    ["tokenizationOrigin", "inferred"],
    ["annotationTarget", "french"],
  ];
  for (const [key, value] of invalidValues) {
    const candidate = structuredClone(valid);
    const omni = ((candidate.document as StoaJsonObject).settings as StoaJsonObject).omni as StoaJsonObject;
    omni[key] = value as never;
    assert.throws(
      () => parseStoaProject(candidate),
      (error) => error instanceof StoaProjectCodecError
        && error.code === "invalid-project"
        && error.path === `$.document.settings.omni.${key}`,
      `expected ${key} to be rejected`,
    );
  }

  const incomplete = structuredClone(valid);
  const incompleteOmni = (
    ((incomplete.document as StoaJsonObject).settings as StoaJsonObject).omni
  ) as StoaJsonObject;
  delete incompleteOmni.languageHint;
  assert.throws(
    () => parseStoaProject(incomplete),
    (error) => error instanceof StoaProjectCodecError
      && error.code === "invalid-project"
      && error.path === "$.document.settings.omni.languageHint",
  );

  const missing = structuredClone(valid);
  delete ((missing.document as StoaJsonObject).settings as StoaJsonObject).omni;
  assert.throws(
    () => parseStoaProject(missing),
    (error) => error instanceof StoaProjectCodecError
      && error.code === "invalid-project"
      && error.path === "$.document.settings.omni",
  );
});

test("legacy opaque omni extensions survive v4 migration without collisions", async () => {
  const validRaw = JSON.parse(await fixtureText(fixtures[0].filename)) as StoaJsonObject;
  const validDocument = validRaw.document as StoaJsonObject;
  const validAnalysis = validDocument.analysis as StoaJsonObject;
  const validSettings = validDocument.settings as StoaJsonObject;
  validDocument.language = "omni";
  validAnalysis.language = "omni";
  validSettings.omni = {
    ...createOmniDocumentConfig({
      languageHint: "syr",
      direction: "rtl",
      writingMode: "horizontal-tb",
      tokenizationOrigin: "model",
    }),
    futureShaper: { engine: "portable-extension" },
  };
  const parsedV1 = parseStoaProject(validRaw);
  assert.equal(parsedV1.project.document.settings.omni, undefined);
  assert.deepEqual(serializeStoaProject(parsedV1), validRaw);

  const promoted = serializeStoaProject(migrateStoaProjectToLatest(parsedV1));
  const promotedOmni = (
    (promoted.document as StoaJsonObject).settings as StoaJsonObject
  ).omni as StoaJsonObject;
  assert.equal(promotedOmni.profile, STOA_OMNI_PROFILE_ID);
  assert.deepEqual(promotedOmni.futureShaper, { engine: "portable-extension" });

  const invalidRaw = JSON.parse(await fixtureText(fixtures[1].filename)) as StoaJsonObject;
  const invalidSettings = (invalidRaw.document as StoaJsonObject).settings as StoaJsonObject;
  const opaqueLegacyOmni: StoaJsonObject = {
    profile: "unrelated-v1-extension",
    direction: "spiral",
    futurePayload: { witness: "A" },
  };
  invalidSettings.omni = opaqueLegacyOmni;
  invalidSettings.legacyV1OmniExtensionValue = { preexisting: true };

  const retained = serializeStoaProject(
    migrateStoaProjectToLatest(parseStoaProject(invalidRaw)),
  );
  const retainedSettings = (retained.document as StoaJsonObject).settings as StoaJsonObject;
  assert.equal(Object.hasOwn(retainedSettings, "omni"), false);
  assert.deepEqual(retainedSettings.legacyV1OmniExtensionValue, { preexisting: true });
  assert.deepEqual(retainedSettings.legacyV1OmniExtensionValue2, opaqueLegacyOmni);
  assert.deepEqual(serializeStoaProject(parseStoaProject(retained)), retained);

  const v2Raw = asLegacySchema(serializeStoaProject(migrateStoaProjectToLatest(
    parseStoaProjectText(await fixtureText(fixtures[1].filename)),
  )), 2);
  const v2Settings = (v2Raw.document as StoaJsonObject).settings as StoaJsonObject;
  const opaqueV2Omni: StoaJsonObject = {
    profile: "unrelated-v2-extension",
    direction: "boustrophedon",
    nested: { edition: 2 },
  };
  v2Settings.omni = opaqueV2Omni;
  v2Settings.legacyV2OmniExtensionValue = "occupied";
  const parsedV2 = parseStoaProject(v2Raw);
  assert.equal(parsedV2.project.document.settings.omni, undefined);
  assert.deepEqual(serializeStoaProject(parsedV2), v2Raw);

  const retainedV2 = serializeStoaProject(migrateStoaProjectToLatest(parsedV2));
  const retainedV2Settings = (
    retainedV2.document as StoaJsonObject
  ).settings as StoaJsonObject;
  assert.equal(retainedV2.schemaVersion, STOA_PROJECT_V6_SCHEMA);
  assert.equal(Object.hasOwn(retainedV2Settings, "omni"), false);
  assert.equal(retainedV2Settings.legacyV2OmniExtensionValue, "occupied");
  assert.deepEqual(retainedV2Settings.legacyV2OmniExtensionValue2, opaqueV2Omni);
});

test("explicit v1 to v6 migration creates complete defaults and sparse token overrides", async () => {
  const raw = JSON.parse(await fixtureText(fixtures[0].filename)) as StoaJsonObject;
  const document = raw.document as StoaJsonObject;
  const analysis = document.analysis as StoaJsonObject;
  const tokens = analysis.tokens as StoaJsonObject[];
  const settings = document.settings as StoaJsonObject;
  tokens[0].wordFont = "Scholarly Test Face";
  tokens[0].wordSize = 31;
  tokens[0].wordColor = "#112233";
  tokens[0].wordBold = true;
  tokens[0].lemmaColor = "#445566";
  tokens[0].morphUnderline = true;
  // An override equal to its v1 document default must remain sparse.
  tokens[1].wordSize = settings.greekSize;

  const parsedV1 = parseStoaProject(raw);
  const migrated = migrateStoaProjectToLatest(parsedV1);
  assert.equal(migrated.sourceSchemaVersion, 1);
  assert.equal(migrated.project.schemaVersion, STOA_PROJECT_V6_SCHEMA);

  const migratedJson = serializeStoaProject(migrated);
  const migratedDocument = migratedJson.document as StoaJsonObject;
  const migratedSettings = migratedDocument.settings as StoaJsonObject;
  const tokenStyle = migratedSettings.tokenStyle as StoaJsonObject;
  const layers = tokenStyle.layers as StoaJsonObject;
  const gaps = tokenStyle.gapAfterPx as StoaJsonObject;
  assert.deepEqual(Object.keys(layers), ["source", "gloss", "lemma", "pos", "morphology"]);
  assert.deepEqual(gaps, { source: 5, gloss: 3, lemma: 3, pos: 3 });
  assert.equal((layers.source as StoaJsonObject).sizePt, 24);
  assert.equal((layers.gloss as StoaJsonObject).fontFamily, settings.englishFont);
  assert.equal(Object.hasOwn(migratedSettings, "greekSize"), false);
  assert.equal(Object.hasOwn(migratedSettings, "greekFont"), false);

  const migratedTokens = ((migratedDocument.analysis as StoaJsonObject).tokens) as StoaJsonObject[];
  const firstOverrides = migratedTokens[0].styleOverrides as StoaJsonObject;
  const firstOverrideLayers = firstOverrides.layers as StoaJsonObject;
  assert.deepEqual(firstOverrideLayers.source, {
    fontFamily: "Scholarly Test Face",
    sizePt: 31,
    color: "#112233",
    bold: true,
  });
  assert.deepEqual(firstOverrideLayers.lemma, { color: "#445566" });
  assert.deepEqual(firstOverrideLayers.morphology, { underline: true });
  assert.equal(Object.hasOwn(migratedTokens[0], "wordFont"), false);
  assert.equal(Object.hasOwn(migratedTokens[0], "lemmaColor"), false);
  assert.equal(Object.hasOwn(migratedTokens[1], "styleOverrides"), false);
  assert.deepEqual(
    migratedTokens.map((token) => token.id),
    tokens.map((token) => token.id),
  );

  // A v3 parse/serialize cycle is stable and migration is idempotent.
  const reparsed = parseStoaProject(migratedJson);
  assert.deepEqual(serializeStoaProject(reparsed), migratedJson);
  assert.deepEqual(
    serializeStoaProject(migrateStoaProjectToLatest(reparsed)),
    migratedJson,
  );
});

test("schema v6 round-trips Pinyin, Romanization, visibility, and restricted pronunciation styles", async () => {
  const project = migrateStoaProjectToLatest(
    parseStoaProjectText(await fixtureText(fixtures[0].filename)),
  );
  const settings = project.project.document.settings;
  assert.ok(settings.tokenStyle);
  settings.showPronunciation = false;
  settings.tokenStyle = {
    ...settings.tokenStyle,
    pronunciation: { sizePt: 10.5, color: "#245b78" },
  };
  const [pinyinToken, romanizationToken] = project.project.document.analysis.tokens;
  pinyinToken.pinyin = "nǚ";
  pinyinToken.pronunciationSize = 9.5;
  pinyinToken.pronunciationColor = "#336699";
  romanizationToken.romanization = "šālôm";

  const raw = serializeStoaProject(project);
  assert.equal(raw.schemaVersion, STOA_PROJECT_V6_SCHEMA);
  const rawDocument = raw.document as StoaJsonObject;
  const rawSettings = rawDocument.settings as StoaJsonObject;
  const rawStyle = rawSettings.tokenStyle as StoaJsonObject;
  const rawPronunciation = rawStyle.pronunciation as StoaJsonObject;
  const rawTokens = (rawDocument.analysis as StoaJsonObject).tokens as StoaJsonObject[];
  rawPronunciation.futureBaselinePolicy = { edition: 7 };
  rawTokens[0].futureReadingMetadata = { standard: "GB/T 16159-2012" };

  const parsed = parseStoaProject(raw);
  assert.equal(parsed.project.document.settings.showPronunciation, false);
  assert.deepEqual(parsed.project.document.settings.tokenStyle?.pronunciation, {
    sizePt: 10.5,
    color: "#245b78",
  });
  assert.equal(parsed.project.document.analysis.tokens[0].pinyin, "nǚ");
  assert.equal(parsed.project.document.analysis.tokens[0].pronunciationSize, 9.5);
  assert.equal(parsed.project.document.analysis.tokens[0].pronunciationColor, "#336699");
  assert.equal(parsed.project.document.analysis.tokens[1].romanization, "šālôm");
  assert.deepEqual(
    Object.keys(parsed.project.document.settings.tokenStyle?.layers ?? {}),
    ["source", "gloss", "lemma", "pos", "morphology"],
    "the pronunciation row remains separate from STOA's five Details layers",
  );

  const serialized = serializeStoaProject(parsed);
  const serializedDocument = serialized.document as StoaJsonObject;
  const serializedSettings = serializedDocument.settings as StoaJsonObject;
  const serializedPronunciation = (
    serializedSettings.tokenStyle as StoaJsonObject
  ).pronunciation as StoaJsonObject;
  const serializedTokens = (
    serializedDocument.analysis as StoaJsonObject
  ).tokens as StoaJsonObject[];
  assert.deepEqual(serializedPronunciation.futureBaselinePolicy, { edition: 7 });
  assert.deepEqual(serializedTokens[0].futureReadingMetadata, {
    standard: "GB/T 16159-2012",
  });
  assert.deepEqual(serializeStoaProject(parseStoaProject(serialized)), serialized);

  const boundedSizes = structuredClone(serialized);
  const boundedDocument = boundedSizes.document as StoaJsonObject;
  const boundedSettings = boundedDocument.settings as StoaJsonObject;
  const boundedStyle = boundedSettings.tokenStyle as StoaJsonObject;
  (boundedStyle.pronunciation as StoaJsonObject).sizePt = 2;
  const boundedTokens = (boundedDocument.analysis as StoaJsonObject).tokens as StoaJsonObject[];
  boundedTokens[0].pronunciationSize = 500;
  const bounded = parseStoaProject(boundedSizes);
  assert.equal(bounded.project.document.settings.tokenStyle?.pronunciation?.sizePt, 7);
  assert.equal(bounded.project.document.analysis.tokens[0].pronunciationSize, 144);

  const invalidColor = structuredClone(serialized);
  const invalidColorTokens = (
    (invalidColor.document as StoaJsonObject).analysis as StoaJsonObject
  ).tokens as StoaJsonObject[];
  const invalidColorToken = invalidColorTokens[0];
  invalidColorToken.pronunciationColor = "blue";
  assert.throws(
    () => parseStoaProject(invalidColor),
    (error) => error instanceof StoaProjectCodecError
      && error.code === "invalid-project"
      && error.path.endsWith(".pronunciationColor"),
  );

  const invalidSize = structuredClone(serialized);
  const invalidSizeSettings = (
    invalidSize.document as StoaJsonObject
  ).settings as StoaJsonObject;
  const invalidSizeStyle = (
    invalidSizeSettings.tokenStyle as StoaJsonObject
  ).pronunciation as StoaJsonObject;
  invalidSizeStyle.sizePt = 0;
  assert.throws(
    () => parseStoaProject(invalidSize),
    (error) => error instanceof StoaProjectCodecError
      && error.code === "invalid-project"
      && error.path.endsWith(".pronunciation.sizePt"),
  );
});

test("v1-v4 scholarly notes discard blank legacy entries and migrate retained prose deterministically", async () => {
  const raw = JSON.parse(await fixtureText(fixtures[0].filename)) as StoaJsonObject;
  const document = raw.document as StoaJsonObject;
  const analysis = document.analysis as StoaJsonObject;
  const settings = document.settings as StoaJsonObject;
  analysis.notes = ["", "First legacy note.", "   ", "Second legacy note."];
  settings.showNotes = "legacy extension value";

  const parsed = parseStoaProject(raw);
  assert.deepEqual(parsed.project.document.analysis.notes, [
    { id: "legacy-note-0001", tokenId: null, text: "First legacy note." },
    { id: "legacy-note-0002", tokenId: null, text: "Second legacy note." },
  ]);
  const parsedLegacyJson = serializeStoaProject(parsed);
  assert.deepEqual(
    ((parsedLegacyJson.document as StoaJsonObject).analysis as StoaJsonObject).notes,
    ["First legacy note.", "Second legacy note."],
    "blank legacy Notes are removed without leaving numbering gaps",
  );

  const migrated = serializeStoaProject(migrateStoaProjectToLatest(parsed));
  const migratedDocument = migrated.document as StoaJsonObject;
  const migratedAnalysis = migratedDocument.analysis as StoaJsonObject;
  const migratedSettings = migratedDocument.settings as StoaJsonObject;
  assert.equal(migrated.schemaVersion, STOA_PROJECT_V6_SCHEMA);
  assert.deepEqual(migratedAnalysis.notes, [
    { id: "legacy-note-0001", tokenId: null, text: "First legacy note." },
    { id: "legacy-note-0002", tokenId: null, text: "Second legacy note." },
  ]);
  assert.equal(migratedSettings.showNotes, true);
  assert.equal(migratedSettings.showNoteMarkers, true);
  assert.equal(migratedSettings.legacyV1ShowNotesExtensionValue, "legacy extension value");
  assert.deepEqual(serializeStoaProject(parseStoaProject(migrated)), migrated);

  const v4 = asLegacySchema(migrated, 4);
  const remigrated = serializeStoaProject(migrateStoaProjectToLatest(parseStoaProject(v4)));
  assert.deepEqual(
    ((remigrated.document as StoaJsonObject).analysis as StoaJsonObject).notes,
    migratedAnalysis.notes,
  );
});

test("schema v5 anchors notes by stable IDs and preserves note extensions through edits and reordering", async () => {
  const migrated = serializeStoaProject(migrateStoaProjectToLatest(
    parseStoaProjectText(await fixtureText(fixtures[1].filename)),
  ));
  const document = migrated.document as StoaJsonObject;
  const analysis = document.analysis as StoaJsonObject;
  const tokens = analysis.tokens as StoaJsonObject[];
  tokens[0].isIndeclinable = true;
  analysis.notes = [
    {
      id: "note-a",
      tokenId: tokens[0].id,
      text: "A token-anchored note.",
      futureCitation: { witness: "A", page: 17 },
    },
    {
      id: "note-b",
      tokenId: null,
      text: "An unanchored editorial note.",
      futureEditorialState: "draft",
    },
  ];

  const parsed = parseStoaProject(migrated);
  parsed.project.document.analysis.notes.reverse();
  parsed.project.document.analysis.notes[1].text = "An edited token-anchored note.";
  const serialized = serializeStoaProject(parsed);
  const outputAnalysis = ((serialized.document as StoaJsonObject).analysis as StoaJsonObject);
  const outputNotes = outputAnalysis.notes as StoaJsonObject[];
  const outputTokens = outputAnalysis.tokens as StoaJsonObject[];
  assert.deepEqual(outputNotes.map((note) => note.id), ["note-b", "note-a"]);
  assert.equal(outputNotes[0].futureEditorialState, "draft");
  assert.deepEqual(outputNotes[1].futureCitation, { witness: "A", page: 17 });
  assert.equal(outputNotes[1].text, "An edited token-anchored note.");
  assert.equal(outputTokens[0].isIndeclinable, true);
  assert.deepEqual(serializeStoaProject(parseStoaProject(serialized)), serialized);

  const duplicate = structuredClone(serialized);
  const duplicateNotes = ((((duplicate.document as StoaJsonObject).analysis as StoaJsonObject).notes) as StoaJsonObject[]);
  duplicateNotes[1].id = duplicateNotes[0].id;
  assert.throws(
    () => parseStoaProject(duplicate),
    (error) => error instanceof StoaProjectCodecError && error.code === "duplicate-note-id",
  );

  const unknownAnchor = structuredClone(serialized);
  const unknownAnchorNotes = ((((unknownAnchor.document as StoaJsonObject).analysis as StoaJsonObject).notes) as StoaJsonObject[]);
  unknownAnchorNotes[0].tokenId = "missing-token";
  assert.throws(
    () => parseStoaProject(unknownAnchor),
    (error) => error instanceof StoaProjectCodecError
      && error.code === "invalid-project"
      && error.path.endsWith(".tokenId"),
  );

  const anchoredEmpty = structuredClone(serialized);
  const anchoredEmptyDocument = anchoredEmpty.document as StoaJsonObject;
  const anchoredEmptyAnalysis = anchoredEmptyDocument.analysis as StoaJsonObject;
  const anchoredEmptyNotes = anchoredEmptyAnalysis.notes as StoaJsonObject[];
  anchoredEmptyNotes[1].tokenId = (anchoredEmptyAnalysis.tokens as StoaJsonObject[])[0].id;
  anchoredEmptyNotes[1].text = "   ";
  assert.throws(
    () => parseStoaProject(anchoredEmpty),
    (error) => error instanceof StoaProjectCodecError
      && error.code === "invalid-project"
      && error.path.endsWith(".text"),
    "schema v5 must reject an anchored Note whose text is blank",
  );
});

test("v1 extensions using future style names survive migration with generated style keys winning", async () => {
  const raw = JSON.parse(await fixtureText(fixtures[0].filename)) as StoaJsonObject;
  const document = raw.document as StoaJsonObject;
  const settings = document.settings as StoaJsonObject;
  const tokens = ((document.analysis as StoaJsonObject).tokens) as StoaJsonObject[];

  settings.tokenStyle = {
    futureStyleRoot: { edition: "extension" },
    layers: {
      futureLayer: { baselineShift: 2 },
      source: {
        sizePt: 999,
        futureSourceProperty: "preserve me",
      },
    },
    gapAfterPx: {
      source: 99,
      futureGap: 17,
    },
  };
  tokens[0].wordColor = "#123456";
  tokens[0].styleOverrides = {
    futureOverrideRoot: ["witness-A"],
    layers: {
      futureLayer: { tracking: 0.2 },
      source: {
        color: "#abcdef",
        italic: true,
        futureOverrideProperty: { source: "v1 extension" },
      },
    },
    gapAfterPx: {
      source: 8,
      futureGap: 13,
    },
  };

  const migrated = migrateStoaProjectToLatest(parseStoaProject(raw));
  const serialized = serializeStoaProject(migrated);
  const outputDocument = serialized.document as StoaJsonObject;
  const outputSettings = outputDocument.settings as StoaJsonObject;
  const outputStyle = outputSettings.tokenStyle as StoaJsonObject;
  const outputLayers = outputStyle.layers as StoaJsonObject;
  const outputSource = outputLayers.source as StoaJsonObject;
  const outputGaps = outputStyle.gapAfterPx as StoaJsonObject;
  const outputTokens = ((outputDocument.analysis as StoaJsonObject).tokens) as StoaJsonObject[];
  const outputOverrides = outputTokens[0].styleOverrides as StoaJsonObject;
  const outputOverrideLayers = outputOverrides.layers as StoaJsonObject;
  const outputOverrideSource = outputOverrideLayers.source as StoaJsonObject;
  const outputOverrideGaps = outputOverrides.gapAfterPx as StoaJsonObject;

  assert.deepEqual(outputStyle.futureStyleRoot, { edition: "extension" });
  assert.deepEqual(outputLayers.futureLayer, { baselineShift: 2 });
  assert.equal(outputSource.futureSourceProperty, "preserve me");
  assert.equal(outputSource.sizePt, 24, "generated complete source size wins");
  assert.equal(outputGaps.source, 5, "generated complete source gap wins");
  assert.equal(outputGaps.futureGap, 17);

  assert.deepEqual(outputOverrides.futureOverrideRoot, ["witness-A"]);
  assert.deepEqual(outputOverrideLayers.futureLayer, { tracking: 0.2 });
  assert.deepEqual(outputOverrideSource.futureOverrideProperty, { source: "v1 extension" });
  assert.equal(outputOverrideSource.color, "#123456", "generated flat-field migration wins");
  assert.equal(outputOverrideSource.italic, true, "non-conflicting future v2 field survives");
  assert.equal(outputOverrideGaps.source, 8);
  assert.equal(outputOverrideGaps.futureGap, 13);

  assert.deepEqual(
    serializeStoaProject(parseStoaProject(serialized)),
    serialized,
    "merged style data remains lossless on subsequent round-trips",
  );
});

test("non-object v1 values under future style names are retained losslessly", async () => {
  const raw = JSON.parse(await fixtureText(fixtures[1].filename)) as StoaJsonObject;
  const document = raw.document as StoaJsonObject;
  const settings = document.settings as StoaJsonObject;
  const tokens = ((document.analysis as StoaJsonObject).tokens) as StoaJsonObject[];
  settings.tokenStyle = "legacy-token-style-extension";
  tokens[0].styleOverrides = ["legacy", "override"];

  const serialized = serializeStoaProject(
    migrateStoaProjectToLatest(parseStoaProject(raw)),
  );
  const outputDocument = serialized.document as StoaJsonObject;
  const outputStyle = (outputDocument.settings as StoaJsonObject).tokenStyle as StoaJsonObject;
  const outputToken = (((outputDocument.analysis as StoaJsonObject).tokens) as StoaJsonObject[])[0];
  const outputOverrides = outputToken.styleOverrides as StoaJsonObject;

  assert.equal(outputStyle.legacyV1ExtensionValue, "legacy-token-style-extension");
  assert.deepEqual(outputOverrides.legacyV1ExtensionValue, ["legacy", "override"]);
  assert.ok(outputStyle.layers);
  assert.ok(outputStyle.gapAfterPx);
});

test("v2 preserves unknown fields at tokenStyle, layer, gap, and styleOverrides locations", async () => {
  const canonical = parseStoaProjectText(await fixtureText(fixtures[1].filename));
  canonical.project.document.analysis.tokens[0].wordColor = "#123456";
  const raw = asLegacySchema(serializeStoaProject(migrateStoaProjectToLatest(canonical)), 2);
  const document = raw.document as StoaJsonObject;
  const settings = document.settings as StoaJsonObject;
  const tokenStyle = settings.tokenStyle as StoaJsonObject;
  const layers = tokenStyle.layers as StoaJsonObject;
  const sourceLayer = layers.source as StoaJsonObject;
  const gaps = tokenStyle.gapAfterPx as StoaJsonObject;
  const tokens = ((document.analysis as StoaJsonObject).tokens) as StoaJsonObject[];
  const overrides = tokens[0].styleOverrides as StoaJsonObject;
  const overrideLayers = overrides.layers as StoaJsonObject;
  const overrideSource = overrideLayers.source as StoaJsonObject;

  tokenStyle.futureStyleSystem = { opticalSizing: true };
  layers.futureLayer = { baselineShift: 2 };
  sourceLayer.futureLayerProperty = "source-extension";
  gaps.futureGap = 11;
  overrides.futureOverrideSystem = ["portable"];
  overrideLayers.futureLayer = { tracking: 0.1 };
  overrideSource.futureOverrideProperty = { witness: "A" };
  overrides.gapAfterPx = { source: 8, futureGap: 13 };

  const parsed = parseStoaProject(raw);
  assert.equal(parsed.sourceSchemaVersion, 2);
  parsed.project.document.analysis.tokens[0].styleOverrides = {
    ...parsed.project.document.analysis.tokens[0].styleOverrides,
    layers: {
      ...parsed.project.document.analysis.tokens[0].styleOverrides?.layers,
      source: {
        ...parsed.project.document.analysis.tokens[0].styleOverrides?.layers?.source,
        sizePt: 33,
      },
    },
  };
  const serialized = serializeStoaProject(parsed);
  const outputDocument = serialized.document as StoaJsonObject;
  const outputSettings = outputDocument.settings as StoaJsonObject;
  const outputStyle = outputSettings.tokenStyle as StoaJsonObject;
  const outputLayers = outputStyle.layers as StoaJsonObject;
  const outputTokens = ((outputDocument.analysis as StoaJsonObject).tokens) as StoaJsonObject[];
  const outputOverrides = outputTokens[0].styleOverrides as StoaJsonObject;
  const outputOverrideLayers = outputOverrides.layers as StoaJsonObject;

  assert.deepEqual(outputStyle.futureStyleSystem, tokenStyle.futureStyleSystem);
  assert.deepEqual(outputLayers.futureLayer, layers.futureLayer);
  assert.equal((outputLayers.source as StoaJsonObject).futureLayerProperty, "source-extension");
  assert.equal((outputStyle.gapAfterPx as StoaJsonObject).futureGap, 11);
  assert.deepEqual(outputOverrides.futureOverrideSystem, overrides.futureOverrideSystem);
  assert.deepEqual(outputOverrideLayers.futureLayer, overrideLayers.futureLayer);
  assert.deepEqual(
    (outputOverrideLayers.source as StoaJsonObject).futureOverrideProperty,
    overrideSource.futureOverrideProperty,
  );
  assert.equal((outputOverrideLayers.source as StoaJsonObject).sizePt, 33);
  assert.equal((outputOverrides.gapAfterPx as StoaJsonObject).futureGap, 13);
});

test("v2 rejects incomplete default styles and duplicate IDs without reordering tokens", async () => {
  const migrated = migrateStoaProjectToLatest(
    parseStoaProjectText(await fixtureText(fixtures[1].filename)),
  );
  const raw = asLegacySchema(serializeStoaProject(migrated), 2);
  const document = raw.document as StoaJsonObject;
  const tokenStyle = (document.settings as StoaJsonObject).tokenStyle as StoaJsonObject;
  const incomplete = structuredClone(raw);
  const incompleteDocument = incomplete.document as StoaJsonObject;
  const incompleteStyle = (incompleteDocument.settings as StoaJsonObject).tokenStyle as StoaJsonObject;
  delete (incompleteStyle.layers as StoaJsonObject).morphology;
  assert.throws(
    () => parseStoaProject(incomplete),
    (error) => error instanceof StoaProjectCodecError
      && error.code === "invalid-project"
      && error.path.endsWith(".layers.morphology"),
  );

  const duplicated = structuredClone(raw);
  const duplicatedTokens = (((duplicated.document as StoaJsonObject).analysis as StoaJsonObject).tokens) as StoaJsonObject[];
  duplicatedTokens[1].id = duplicatedTokens[0].id;
  assert.throws(
    () => parseStoaProject(duplicated),
    (error) => error instanceof StoaProjectCodecError && error.code === "duplicate-token-id",
  );

  assert.deepEqual(
    ((document.analysis as StoaJsonObject).tokens as StoaJsonObject[]).map((token) => token.id),
    migrated.project.document.analysis.tokens.map((token) => token.id),
  );
  assert.ok(tokenStyle.layers);
});

test("unknown fields are retained at every required schema location", async () => {
  const raw = JSON.parse(await fixtureText(fixtures[0].filename)) as StoaJsonObject;
  const document = raw.document as StoaJsonObject;
  const analysis = document.analysis as StoaJsonObject;
  const settings = document.settings as StoaJsonObject;
  const tokens = analysis.tokens as StoaJsonObject[];
  raw.futureRoot = { edition: 2, enabled: true };
  document.futureDocument = ["portable", { mode: "scholarly" }];
  analysis.futureAnalysis = { apparatus: null };
  settings.futureSetting = { opticalSize: 18 };
  tokens[0].futureToken = { witness: "A", certainty: 0.91 };

  const parsed = parseStoaProject(raw);
  parsed.project.document.analysis.tokens[0].gloss = "edited gloss";
  const firstToken = parsed.project.document.analysis.tokens.shift();
  assert.ok(firstToken);
  parsed.project.document.analysis.tokens.push(firstToken);
  const serialized = serializeStoaProject(parsed);
  const serializedDocument = serialized.document as StoaJsonObject;
  const serializedAnalysis = serializedDocument.analysis as StoaJsonObject;
  const serializedSettings = serializedDocument.settings as StoaJsonObject;
  const serializedTokens = serializedAnalysis.tokens as StoaJsonObject[];
  const movedToken = serializedTokens.find((token) => token.id === firstToken.id);

  assert.deepEqual(serialized.futureRoot, raw.futureRoot);
  assert.deepEqual(serializedDocument.futureDocument, document.futureDocument);
  assert.deepEqual(serializedAnalysis.futureAnalysis, analysis.futureAnalysis);
  assert.deepEqual(serializedSettings.futureSetting, settings.futureSetting);
  assert.deepEqual(movedToken?.futureToken, tokens[0].futureToken);
  assert.equal(movedToken?.gloss, "edited gloss");
  assert.equal(serializedDocument.selectedTokenId, null);
  assert.equal(Object.hasOwn(serialized, "preserved"), false);
});

test("lossless clones retain unknown fields and remain independently editable", async () => {
  const raw = JSON.parse(await fixtureText(fixtures[1].filename)) as StoaJsonObject;
  raw.futureRoot = "retained";
  const original = parseStoaProject(raw);
  const cloned = cloneParsedStoaProject(original);
  cloned.project.document.analysis.tokens[0].surface = "Changed";

  assert.equal(original.project.document.analysis.tokens[0].surface, "Et");
  assert.equal((serializeStoaProject(cloned)).futureRoot, "retained");
});

test("unsupported schemas and duplicate token IDs fail explicitly", async () => {
  const raw = JSON.parse(await fixtureText(fixtures[1].filename)) as StoaJsonObject;
  const unsupported = structuredClone(raw);
  unsupported.schemaVersion = 99;
  assert.throws(
    () => parseStoaProject(unsupported),
    (error) => error instanceof StoaProjectCodecError && error.code === "unsupported-schema",
  );

  const parsed = parseStoaProject(raw);
  parsed.project.document.analysis.tokens[1].id = parsed.project.document.analysis.tokens[0].id;
  assert.throws(
    () => serializeStoaProject(parsed),
    (error) => error instanceof StoaProjectCodecError && error.code === "duplicate-token-id",
  );
});

test("invalid JSON produces a stable codec error", () => {
  assert.throws(
    () => parseStoaProjectText("{ definitely-not-json"),
    (error) => error instanceof StoaProjectCodecError && error.code === "invalid-json",
  );
});
