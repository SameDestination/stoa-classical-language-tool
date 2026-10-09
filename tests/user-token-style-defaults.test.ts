import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { StoaLanguageId } from "../app/language-config.ts";
import {
  applyUserDefaultTokenStyleToImport,
  clearPersistedUserTokenStyleDefaults,
  createEmptyUserTokenStyleDefaults,
  decodeUserTokenStyleDefaults,
  encodeUserTokenStyleDefaults,
  getUserTokenStyleDefault,
  hasExplicitDocumentTokenStyle,
  readUserTokenStyleDefaults,
  removeUserTokenStyleDefault,
  resolveImportedDocumentTokenStyle,
  setUserTokenStyleDefault,
  USER_TOKEN_STYLE_DEFAULTS_FORMAT,
  USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION,
  USER_TOKEN_STYLE_DEFAULTS_STORAGE_KEY,
  writeUserTokenStyleDefaults,
  type BuiltInTokenStyles,
  type TokenStyleDefaultsStringStore,
} from "../app/lib/user-token-style-defaults.ts";
import {
  deriveDocumentTokenStyleDefaults,
  type DocumentTokenStyle,
  type LegacyTokenStyleSettings,
} from "../app/lib/token-style.ts";

type CanonicalProject = {
  document: {
    language: StoaLanguageId;
    settings: LegacyTokenStyleSettings & Record<string, unknown>;
    analysis: { tokens: Array<Record<string, unknown>> };
  };
};

const loadFixture = async (filename: string) => JSON.parse(await readFile(
  new URL(`./fixtures/canonical/${filename}`, import.meta.url),
  "utf8",
)) as CanonicalProject;

const loadCanonicalProjects = async () => Promise.all([
  loadFixture("stoa-ancient-greek-20260819-184926.stoa.json"),
  loadFixture("stoa-latin-20260819-191723.stoa.json"),
]);

const fixtureBuiltIns = async (): Promise<{
  projects: CanonicalProject[];
  styles: BuiltInTokenStyles;
}> => {
  const projects = await loadCanonicalProjects();
  return {
    projects,
    styles: Object.fromEntries(projects.map((project) => [
      project.document.language,
      deriveDocumentTokenStyleDefaults(project.document.settings),
    ])) as BuiltInTokenStyles,
  };
};

const customStyle = (
  base: DocumentTokenStyle,
  color: string,
  sizePt: number,
): DocumentTokenStyle => ({
  layers: {
    ...base.layers,
    source: { ...base.layers.source, color, sizePt, underline: true },
  },
  gapAfterPx: { ...base.gapAfterPx, source: 7.26 },
});

class MemoryStringStore implements TokenStyleDefaultsStringStore {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("per-language defaults persist in a versioned canonical envelope", async () => {
  const { styles } = await fixtureBuiltIns();
  const greek = customStyle(styles["ancient-greek"], "#ABC", 17.26);
  const latin = customStyle(styles.latin, "#123456", 22);
  let defaults = createEmptyUserTokenStyleDefaults();
  defaults = setUserTokenStyleDefault(defaults, "ancient-greek", greek, styles["ancient-greek"]);
  defaults = setUserTokenStyleDefault(defaults, "latin", latin, styles.latin);

  const serialized = encodeUserTokenStyleDefaults(defaults, styles);
  const raw = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(raw.format, USER_TOKEN_STYLE_DEFAULTS_FORMAT);
  assert.equal(raw.schemaVersion, USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION);
  assert.ok(serialized.indexOf("ancient-greek") < serialized.indexOf("latin"));

  const decoded = decodeUserTokenStyleDefaults(serialized, styles);
  assert.deepEqual(decoded.issues, []);
  assert.equal(decoded.value.byLanguage["ancient-greek"]?.layers.source.color, "#aabbcc");
  assert.equal(decoded.value.byLanguage["ancient-greek"]?.layers.source.sizePt, 17.5);
  assert.equal(decoded.value.byLanguage["ancient-greek"]?.gapAfterPx.source, 7.5);
  assert.equal(decoded.value.byLanguage.latin?.layers.source.color, "#123456");

  const detached = getUserTokenStyleDefault(decoded.value, "ancient-greek");
  assert.ok(detached);
  detached.layers.source.color = "#000000";
  assert.equal(decoded.value.byLanguage["ancient-greek"]?.layers.source.color, "#aabbcc");

  const withoutGreek = removeUserTokenStyleDefault(decoded.value, "ancient-greek");
  assert.equal(withoutGreek.byLanguage["ancient-greek"], undefined);
  assert.ok(withoutGreek.byLanguage.latin);
  assert.ok(decoded.value.byLanguage["ancient-greek"]);
});

test("an explicit OMNI default round-trips after official languages in deterministic workspace order", async () => {
  const { styles } = await fixtureBuiltIns();
  const omniBuiltIn = customStyle(styles.latin, "#334455", 18);
  const builtIns: BuiltInTokenStyles = { ...styles, omni: omniBuiltIn };
  let defaults = createEmptyUserTokenStyleDefaults();
  defaults = setUserTokenStyleDefault(
    defaults,
    "ancient-greek",
    customStyle(styles["ancient-greek"], "#123456", 17),
    styles["ancient-greek"],
  );
  defaults = setUserTokenStyleDefault(
    defaults,
    "latin",
    customStyle(styles.latin, "#234567", 19),
    styles.latin,
  );
  defaults = setUserTokenStyleDefault(
    defaults,
    "omni",
    customStyle(omniBuiltIn, "#abcdef", 23.26),
    omniBuiltIn,
  );

  const serialized = encodeUserTokenStyleDefaults(defaults, builtIns);
  assert.ok(serialized.indexOf("ancient-greek") < serialized.indexOf("latin"));
  assert.ok(serialized.indexOf("latin") < serialized.indexOf("omni"));
  const decoded = decodeUserTokenStyleDefaults(serialized, builtIns);
  assert.deepEqual(decoded.issues, []);
  assert.equal(decoded.value.byLanguage.omni?.layers.source.color, "#abcdef");
  assert.equal(decoded.value.byLanguage.omni?.layers.source.sizePt, 23.5);
  assert.equal(getUserTokenStyleDefault(decoded.value, "omni")?.layers.source.color, "#abcdef");

  // Older callers may still provide only the two official built-ins. Because
  // the stored OMNI style is complete, it remains safely readable by itself.
  const decodedWithLegacyBuiltIns = decodeUserTokenStyleDefaults(serialized, styles);
  assert.deepEqual(decodedWithLegacyBuiltIns.issues, []);
  assert.equal(decodedWithLegacyBuiltIns.value.byLanguage.omni?.layers.source.color, "#abcdef");

  const withoutOmni = removeUserTokenStyleDefault(decoded.value, "omni");
  assert.equal(withoutOmni.byLanguage.omni, undefined);
  assert.ok(withoutOmni.byLanguage["ancient-greek"]);
  assert.ok(withoutOmni.byLanguage.latin);
});

test("safe decoding isolates corrupt entries and rejects incompatible envelopes", async () => {
  const { styles } = await fixtureBuiltIns();
  const invalidJson = decodeUserTokenStyleDefaults("{broken", styles);
  assert.equal(invalidJson.issues[0]?.code, "invalid-json");
  assert.deepEqual(invalidJson.value.byLanguage, {});

  const future = decodeUserTokenStyleDefaults(JSON.stringify({
    format: USER_TOKEN_STYLE_DEFAULTS_FORMAT,
    schemaVersion: 99,
    byLanguage: {},
  }), styles);
  assert.equal(future.issues[0]?.code, "unsupported-schema");

  const latin = customStyle(styles.latin, "#445566", 20);
  const partialRecovery = decodeUserTokenStyleDefaults(JSON.stringify({
    format: USER_TOKEN_STYLE_DEFAULTS_FORMAT,
    schemaVersion: USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION,
    byLanguage: {
      "ancient-greek": { layers: {} },
      latin,
      "future-language": customStyle(styles.latin, "#000000", 12),
    },
  }), styles);
  assert.equal(partialRecovery.issues.length, 1);
  assert.equal(partialRecovery.issues[0]?.code, "invalid-language-style");
  assert.equal(partialRecovery.issues[0]?.path, "$.byLanguage.ancient-greek.gapAfterPx");
  assert.equal(partialRecovery.value.byLanguage["ancient-greek"], undefined);
  assert.equal(partialRecovery.value.byLanguage.latin?.layers.source.color, "#445566");
  assert.equal(Object.hasOwn(partialRecovery.value.byLanguage, "future-language"), false);
});

test("storage adapter round-trips across restarts without a browser global", async () => {
  const { styles } = await fixtureBuiltIns();
  const store = new MemoryStringStore();
  const saved = setUserTokenStyleDefault(
    createEmptyUserTokenStyleDefaults(),
    "latin",
    customStyle(styles.latin, "#654321", 19),
    styles.latin,
  );

  const write = writeUserTokenStyleDefaults(store, saved, styles);
  assert.equal(write.ok, true);
  assert.ok(store.getItem(USER_TOKEN_STYLE_DEFAULTS_STORAGE_KEY));
  const restarted = readUserTokenStyleDefaults(store, styles);
  assert.deepEqual(restarted.issues, []);
  assert.equal(restarted.value.byLanguage.latin?.layers.source.color, "#654321");

  assert.deepEqual(clearPersistedUserTokenStyleDefaults(store), { ok: true });
  assert.equal(store.getItem(USER_TOKEN_STYLE_DEFAULTS_STORAGE_KEY), null);

  const failingStore = {
    getItem() { throw new Error("read denied"); },
    setItem() { throw new Error("quota exceeded"); },
    removeItem() { throw new Error("remove denied"); },
  };
  assert.equal(readUserTokenStyleDefaults(failingStore, styles).issues[0]?.code, "storage-read-failed");
  assert.equal(writeUserTokenStyleDefaults(failingStore, saved, styles).ok, false);
  assert.equal(clearPersistedUserTokenStyleDefaults(failingStore).ok, false);
});

test("canonical Greek and Latin project styles outrank saved user defaults", async () => {
  const { projects, styles } = await fixtureBuiltIns();
  let defaults = createEmptyUserTokenStyleDefaults();
  for (const language of ["ancient-greek", "latin"] as const) {
    defaults = setUserTokenStyleDefault(
      defaults,
      language,
      customStyle(styles[language], "#ff0000", 99),
      styles[language],
    );
  }

  for (const project of projects) {
    const { language, settings } = project.document;
    assert.equal(hasExplicitDocumentTokenStyle(settings), true);
    const resolved = resolveImportedDocumentTokenStyle(
      settings,
      language,
      defaults,
      styles[language],
    );
    assert.equal(resolved.source, "project");
    assert.deepEqual(resolved.style, deriveDocumentTokenStyleDefaults(settings));
    assert.notEqual(resolved.style.layers.source.color, "#ff0000");

    const applied = applyUserDefaultTokenStyleToImport(settings, language, defaults);
    assert.equal(applied, settings, "explicit canonical settings retain object identity");
  }
});

test("a complete schema-v2 project style outranks the saved user style", async () => {
  const { styles } = await fixtureBuiltIns();
  const projectStyle = customStyle(styles.latin, "#102030", 16);
  const userStyle = customStyle(styles.latin, "#aabbcc", 40);
  const defaults = setUserTokenStyleDefault(
    createEmptyUserTokenStyleDefaults(),
    "latin",
    userStyle,
    styles.latin,
  );
  const settings = { tokenStyle: projectStyle };

  const resolved = resolveImportedDocumentTokenStyle(settings, "latin", defaults, styles.latin);
  assert.equal(resolved.source, "project");
  assert.equal(resolved.style.layers.source.color, "#102030");
  assert.equal(applyUserDefaultTokenStyleToImport(settings, "latin", defaults), settings);
});

test("partial legacy project fields overlay the correct language built-in", async () => {
  const { styles } = await fixtureBuiltIns();
  const defaults = setUserTokenStyleDefault(
    createEmptyUserTokenStyleDefaults(),
    "latin",
    customStyle(styles.latin, "#ff0000", 88),
    styles.latin,
  );
  const settings = { greekSize: 30 };

  const resolved = resolveImportedDocumentTokenStyle(settings, "latin", defaults, styles.latin);
  assert.equal(resolved.source, "project");
  assert.equal(resolved.style.layers.source.sizePt, 30);
  assert.equal(
    resolved.style.layers.source.fontFamily,
    styles.latin.layers.source.fontFamily,
    "a partial Latin project must not acquire the generic Palatino fallback",
  );
  assert.deepEqual(resolved.style.layers.gloss, styles.latin.layers.gloss);
  assert.deepEqual(resolved.style.layers.lemma, styles.latin.layers.lemma);
  assert.deepEqual(resolved.style.layers.pos, styles.latin.layers.pos);
  assert.deepEqual(resolved.style.layers.morphology, styles.latin.layers.morphology);
  assert.deepEqual(resolved.style.gapAfterPx, styles.latin.gapAfterPx);
});

test("style-less imports inherit only their language default and retain token overrides", async () => {
  const { styles } = await fixtureBuiltIns();
  const greekDefault = customStyle(styles["ancient-greek"], "#abcdef", 26);
  const defaults = setUserTokenStyleDefault(
    createEmptyUserTokenStyleDefaults(),
    "ancient-greek",
    greekDefault,
    styles["ancient-greek"],
  );
  const settings = { showLemma: true, showPos: false };
  const token = {
    id: "kept-token",
    styleOverrides: { layers: { source: { bold: true } } },
  };

  assert.equal(hasExplicitDocumentTokenStyle(settings), false);
  const applied = applyUserDefaultTokenStyleToImport(settings, "ancient-greek", defaults);
  assert.notEqual(applied, settings);
  assert.deepEqual(applied.tokenStyle, getUserTokenStyleDefault(defaults, "ancient-greek"));
  assert.deepEqual(token.styleOverrides, { layers: { source: { bold: true } } });

  const resolved = resolveImportedDocumentTokenStyle(
    settings,
    "ancient-greek",
    defaults,
    styles["ancient-greek"],
  );
  assert.equal(resolved.source, "user-default");
  assert.equal(resolved.style.layers.source.color, "#abcdef");

  const emptyDefaults = createEmptyUserTokenStyleDefaults();
  const untouched = applyUserDefaultTokenStyleToImport(settings, "latin", emptyDefaults);
  assert.equal(untouched, settings);
  const builtIn = resolveImportedDocumentTokenStyle(settings, "latin", emptyDefaults, styles.latin);
  assert.equal(builtIn.source, "built-in");
  assert.deepEqual(builtIn.style, styles.latin);
});
