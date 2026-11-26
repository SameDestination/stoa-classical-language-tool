/**
 * Persistence and precedence rules for explicitly saved document token styles.
 *
 * This module deliberately has no `window`/`localStorage` dependency. Browser,
 * desktop, and test callers can all supply the same minimal string-store
 * adapter, while the serialized envelope remains versioned and deterministic.
 */

import {
  TOKEN_GAP_ANCHORS,
  TOKEN_STYLE_LAYERS,
  canonicalizeTokenColor,
  deriveDocumentTokenStyleDefaults,
  normalizeDocumentTokenStyle,
  type DocumentTokenStyle,
  type LegacyTokenStyleSettings,
  type TokenStyleLayer,
  type TokenTextStyle,
} from "./token-style";
import {
  STOA_WORKSPACE_LANGUAGE_IDS,
  isStoaWorkspaceLanguageId,
  type StoaWorkspaceLanguageId,
} from "./omni-language";
import { replaceRetiredFontFamilies } from "./font-registry";

export const USER_TOKEN_STYLE_DEFAULTS_FORMAT = "stoa-user-token-style-defaults" as const;
export const USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION = 1 as const;
export const USER_TOKEN_STYLE_DEFAULTS_STORAGE_KEY = "stoa-user-token-style-defaults" as const;

export type UserTokenStyleDefaults = {
  format: typeof USER_TOKEN_STYLE_DEFAULTS_FORMAT;
  schemaVersion: typeof USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION;
  byLanguage: Partial<Record<StoaWorkspaceLanguageId, DocumentTokenStyle>>;
};

export type BuiltInTokenStyles = Readonly<Record<StoaWorkspaceLanguageId, DocumentTokenStyle>>;

export type UserTokenStyleDefaultsIssueCode =
  | "invalid-json"
  | "invalid-format"
  | "unsupported-schema"
  | "invalid-payload"
  | "invalid-language-style"
  | "storage-read-failed"
  | "storage-write-failed"
  | "storage-remove-failed";

export type UserTokenStyleDefaultsIssue = {
  code: UserTokenStyleDefaultsIssueCode;
  path: string;
  message: string;
};

export type DecodedUserTokenStyleDefaults = {
  value: UserTokenStyleDefaults;
  /** Invalid language entries are skipped; valid sibling entries survive. */
  issues: UserTokenStyleDefaultsIssue[];
};

/** A localStorage-compatible interface without requiring a browser global. */
export interface TokenStyleDefaultsStringStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type TokenStyleDefaultsWriteResult =
  | { ok: true; serialized: string }
  | { ok: false; issue: UserTokenStyleDefaultsIssue };

export type DocumentTokenStyleSource = "project" | "user-default" | "built-in";

export type ResolvedImportedDocumentTokenStyle = {
  style: DocumentTokenStyle;
  source: DocumentTokenStyleSource;
};

export type ImportStyleSettings = LegacyTokenStyleSettings & {
  tokenStyle?: DocumentTokenStyle;
};

const LEGACY_DOCUMENT_TOKEN_STYLE_KEYS = [
  "greekFont",
  "englishFont",
  "lemmaFont",
  "morphFont",
  "greekSize",
  "glossSize",
  "lemmaSize",
  "posSize",
  "morphSize",
  "ink",
  "accent",
  "background",
] as const satisfies readonly (keyof LegacyTokenStyleSettings)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cloneDocumentTokenStyle = (style: DocumentTokenStyle): DocumentTokenStyle => ({
  layers: Object.fromEntries(TOKEN_STYLE_LAYERS.map((layer) => [
    layer,
    { ...style.layers[layer] },
  ])) as Record<TokenStyleLayer, TokenTextStyle>,
  gapAfterPx: { ...style.gapAfterPx },
  ...(style.pronunciation ? { pronunciation: { ...style.pronunciation } } : {}),
});

export const createEmptyUserTokenStyleDefaults = (): UserTokenStyleDefaults => ({
  format: USER_TOKEN_STYLE_DEFAULTS_FORMAT,
  schemaVersion: USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION,
  byLanguage: {},
});

const invalidCompleteStylePath = (value: unknown): string | null => {
  if (!isRecord(value)) return "";
  if (!isRecord(value.layers)) return ".layers";
  if (!isRecord(value.gapAfterPx)) return ".gapAfterPx";

  for (const layer of TOKEN_STYLE_LAYERS) {
    const layerValue = value.layers[layer];
    if (!isRecord(layerValue)) return `.layers.${layer}`;
    if (typeof layerValue.fontFamily !== "string" || !layerValue.fontFamily.trim()) {
      return `.layers.${layer}.fontFamily`;
    }
    if (typeof layerValue.sizePt !== "number" || !Number.isFinite(layerValue.sizePt)) {
      return `.layers.${layer}.sizePt`;
    }
    if (!canonicalizeTokenColor(layerValue.color)) return `.layers.${layer}.color`;
    for (const property of ["bold", "italic", "underline"] as const) {
      if (typeof layerValue[property] !== "boolean") return `.layers.${layer}.${property}`;
    }
  }

  for (const anchor of TOKEN_GAP_ANCHORS) {
    const gap = value.gapAfterPx[anchor];
    if (typeof gap !== "number" || !Number.isFinite(gap)) return `.gapAfterPx.${anchor}`;
  }
  if (Object.hasOwn(value, "pronunciation")) {
    if (!isRecord(value.pronunciation)) return ".pronunciation";
    if (
      typeof value.pronunciation.sizePt !== "number"
      || !Number.isFinite(value.pronunciation.sizePt)
    ) return ".pronunciation.sizePt";
    if (!canonicalizeTokenColor(value.pronunciation.color)) return ".pronunciation.color";
  }
  return null;
};

const normalizeCompleteStyle = (
  value: unknown,
  fallback: DocumentTokenStyle | undefined,
  path: string,
): { style?: DocumentTokenStyle; issue?: UserTokenStyleDefaultsIssue } => {
  const invalidPath = invalidCompleteStylePath(value);
  if (invalidPath !== null) {
    return {
      issue: {
        code: "invalid-language-style",
        path: `${path}${invalidPath}`,
        message: "must be a complete five-layer DocumentTokenStyle with an optional restricted pronunciation style",
      },
    };
  }
  return {
    // A complete valid style can safely normalize against itself. This keeps
    // legacy Greek/Latin-only built-in registries able to read a newer OMNI
    // preference until the caller supplies an explicit OMNI built-in.
    style: normalizeDocumentTokenStyle(value, fallback ?? (value as DocumentTokenStyle)),
  };
};

/**
 * Decodes saved defaults without throwing. A missing value is the normal
 * first-run state. Corrupt top-level data falls back to an empty registry;
 * corrupt language entries are isolated so another language's default is not
 * lost.
 */
export const decodeUserTokenStyleDefaults = (
  serialized: string | null | undefined,
  builtIns: BuiltInTokenStyles,
): DecodedUserTokenStyleDefaults => {
  const empty = createEmptyUserTokenStyleDefaults();
  if (serialized === null || serialized === undefined || !serialized.trim()) {
    return { value: empty, issues: [] };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(serialized) as unknown;
  } catch (error) {
    return {
      value: empty,
      issues: [{
        code: "invalid-json",
        path: "$",
        message: error instanceof Error ? error.message : "invalid JSON",
      }],
    };
  }

  if (!isRecord(candidate)) {
    return {
      value: empty,
      issues: [{ code: "invalid-payload", path: "$", message: "must be an object" }],
    };
  }
  if (candidate.format !== USER_TOKEN_STYLE_DEFAULTS_FORMAT) {
    return {
      value: empty,
      issues: [{
        code: "invalid-format",
        path: "$.format",
        message: `must equal ${JSON.stringify(USER_TOKEN_STYLE_DEFAULTS_FORMAT)}`,
      }],
    };
  }
  if (candidate.schemaVersion !== USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION) {
    return {
      value: empty,
      issues: [{
        code: "unsupported-schema",
        path: "$.schemaVersion",
        message: `unsupported schema version ${JSON.stringify(candidate.schemaVersion)}`,
      }],
    };
  }
  if (!isRecord(candidate.byLanguage)) {
    return {
      value: empty,
      issues: [{
        code: "invalid-payload",
        path: "$.byLanguage",
        message: "must be an object",
      }],
    };
  }

  const value = createEmptyUserTokenStyleDefaults();
  const issues: UserTokenStyleDefaultsIssue[] = [];
  for (const [language, rawStyle] of Object.entries(candidate.byLanguage)) {
    if (!isStoaWorkspaceLanguageId(language)) {
      // Unknown language IDs are ignored by this schema. This lets a client
      // safely encounter data from a later catalogue without applying it to a
      // different language.
      continue;
    }
    const result = normalizeCompleteStyle(
      // Saved defaults may name a font STOA no longer bundles.
      replaceRetiredFontFamilies(rawStyle),
      builtIns[language],
      `$.byLanguage.${language}`,
    );
    if (result.style) value.byLanguage[language] = result.style;
    if (result.issue) issues.push(result.issue);
  }
  return { value, issues };
};

/** Emits a deterministic, canonical payload in catalogue order. */
export const encodeUserTokenStyleDefaults = (
  value: UserTokenStyleDefaults,
  builtIns: BuiltInTokenStyles,
): string => {
  const byLanguage: Partial<Record<StoaWorkspaceLanguageId, DocumentTokenStyle>> = {};
  for (const language of STOA_WORKSPACE_LANGUAGE_IDS) {
    const rawStyle = value.byLanguage[language];
    if (!rawStyle) continue;
    const result = normalizeCompleteStyle(
      rawStyle,
      builtIns[language],
      `$.byLanguage.${language}`,
    );
    if (!result.style) {
      throw new TypeError(`${result.issue?.path ?? "$.byLanguage"}: ${result.issue?.message ?? "invalid style"}`);
    }
    byLanguage[language] = result.style;
  }
  return JSON.stringify({
    format: USER_TOKEN_STYLE_DEFAULTS_FORMAT,
    schemaVersion: USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION,
    byLanguage,
  });
};

export const getUserTokenStyleDefault = (
  value: UserTokenStyleDefaults,
  language: StoaWorkspaceLanguageId,
): DocumentTokenStyle | undefined => {
  const style = value.byLanguage[language];
  return style ? cloneDocumentTokenStyle(style) : undefined;
};

/** Immutable explicit-save operation used by “Use as default”. */
export const setUserTokenStyleDefault = (
  value: UserTokenStyleDefaults,
  language: StoaWorkspaceLanguageId,
  style: DocumentTokenStyle,
  builtIn: DocumentTokenStyle,
): UserTokenStyleDefaults => {
  const normalized = normalizeCompleteStyle(
    style,
    builtIn,
    `$.byLanguage.${language}`,
  );
  if (!normalized.style) {
    throw new TypeError(`${normalized.issue?.path}: ${normalized.issue?.message}`);
  }
  return {
    format: USER_TOKEN_STYLE_DEFAULTS_FORMAT,
    schemaVersion: USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION,
    byLanguage: {
      ...value.byLanguage,
      [language]: normalized.style,
    },
  };
};

export const removeUserTokenStyleDefault = (
  value: UserTokenStyleDefaults,
  language: StoaWorkspaceLanguageId,
): UserTokenStyleDefaults => {
  if (!value.byLanguage[language]) return value;
  const byLanguage = { ...value.byLanguage };
  delete byLanguage[language];
  return {
    format: USER_TOKEN_STYLE_DEFAULTS_FORMAT,
    schemaVersion: USER_TOKEN_STYLE_DEFAULTS_SCHEMA_VERSION,
    byLanguage,
  };
};

export const readUserTokenStyleDefaults = (
  store: Pick<TokenStyleDefaultsStringStore, "getItem">,
  builtIns: BuiltInTokenStyles,
  key = USER_TOKEN_STYLE_DEFAULTS_STORAGE_KEY,
): DecodedUserTokenStyleDefaults => {
  try {
    return decodeUserTokenStyleDefaults(store.getItem(key), builtIns);
  } catch (error) {
    return {
      value: createEmptyUserTokenStyleDefaults(),
      issues: [{
        code: "storage-read-failed",
        path: key,
        message: error instanceof Error ? error.message : "storage read failed",
      }],
    };
  }
};

export const writeUserTokenStyleDefaults = (
  store: Pick<TokenStyleDefaultsStringStore, "setItem">,
  value: UserTokenStyleDefaults,
  builtIns: BuiltInTokenStyles,
  key = USER_TOKEN_STYLE_DEFAULTS_STORAGE_KEY,
): TokenStyleDefaultsWriteResult => {
  try {
    const serialized = encodeUserTokenStyleDefaults(value, builtIns);
    store.setItem(key, serialized);
    return { ok: true, serialized };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "storage-write-failed",
        path: key,
        message: error instanceof Error ? error.message : "storage write failed",
      },
    };
  }
};

export const clearPersistedUserTokenStyleDefaults = (
  store: Pick<TokenStyleDefaultsStringStore, "removeItem">,
  key = USER_TOKEN_STYLE_DEFAULTS_STORAGE_KEY,
): { ok: true } | { ok: false; issue: UserTokenStyleDefaultsIssue } => {
  try {
    store.removeItem(key);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "storage-remove-failed",
        path: key,
        message: error instanceof Error ? error.message : "storage remove failed",
      },
    };
  }
};

/**
 * A project owns its document token style if it has schema-v2 defaults or any
 * legacy document typography field. Presence is intentional: malformed
 * imports should be rejected by the project codec, never silently replaced by
 * a user preference.
 */
export const hasExplicitDocumentTokenStyle = (settings: unknown): boolean => {
  if (!isRecord(settings)) return false;
  if (Object.hasOwn(settings, "tokenStyle")) return true;
  return LEGACY_DOCUMENT_TOKEN_STYLE_KEYS.some((key) => Object.hasOwn(settings, key));
};

/**
 * Applies only present pre-5.1 fields over the language's built-in style.
 * Calling `deriveDocumentTokenStyleDefaults(settings)` directly would fill a
 * partial Latin import with the helper's generic Palatino fallback. Keeping a
 * sparse patch here preserves the language-specific built-in tier.
 */
const resolveLegacyDocumentTokenStyle = (
  settings: ImportStyleSettings,
  builtIn: DocumentTokenStyle,
): DocumentTokenStyle => {
  const derived = deriveDocumentTokenStyleDefaults(settings);
  const has = (key: keyof LegacyTokenStyleSettings) => Object.hasOwn(settings, key);
  const layers: Partial<Record<TokenStyleLayer, Partial<TokenTextStyle>>> = {};
  const patch = (layer: TokenStyleLayer, property: keyof TokenTextStyle) => {
    layers[layer] = {
      ...layers[layer],
      [property]: derived.layers[layer][property],
    };
  };

  if (has("greekFont")) {
    patch("source", "fontFamily");
    // This is the legacy fallback when no independent lemma font was saved.
    if (!has("lemmaFont")) patch("lemma", "fontFamily");
  }
  if (has("englishFont")) {
    patch("gloss", "fontFamily");
    patch("pos", "fontFamily");
    // This is the legacy fallback when no independent morphology font exists.
    if (!has("morphFont")) patch("morphology", "fontFamily");
  }
  if (has("lemmaFont")) patch("lemma", "fontFamily");
  if (has("morphFont")) patch("morphology", "fontFamily");

  for (const [legacyKey, layer] of [
    ["greekSize", "source"],
    ["glossSize", "gloss"],
    ["lemmaSize", "lemma"],
    ["posSize", "pos"],
    ["morphSize", "morphology"],
  ] as const) {
    if (has(legacyKey)) patch(layer, "sizePt");
  }

  if (has("ink")) {
    patch("source", "color");
    patch("gloss", "color");
  }
  if (has("accent")) patch("pos", "color");
  // The old model derives both subdued annotation colors from ink/background.
  if (has("ink") || has("background")) {
    patch("lemma", "color");
    patch("morphology", "color");
  }

  return normalizeDocumentTokenStyle({ layers }, builtIn);
};

/** Resolves document-level precedence without consulting token overrides. */
export const resolveImportedDocumentTokenStyle = (
  settings: unknown,
  language: StoaWorkspaceLanguageId,
  userDefaults: UserTokenStyleDefaults,
  builtIn: DocumentTokenStyle,
): ResolvedImportedDocumentTokenStyle => {
  if (hasExplicitDocumentTokenStyle(settings)) {
    const imported = isRecord(settings) ? settings as ImportStyleSettings : {};
    return {
      style: imported.tokenStyle && isRecord(imported.tokenStyle)
        ? normalizeDocumentTokenStyle(imported.tokenStyle, builtIn)
        : resolveLegacyDocumentTokenStyle(imported, builtIn),
      source: "project",
    };
  }

  const userDefault = getUserTokenStyleDefault(userDefaults, language);
  if (userDefault) return { style: userDefault, source: "user-default" };
  return { style: cloneDocumentTokenStyle(builtIn), source: "built-in" };
};

/**
 * Applies only the saved user-default tier to a style-less import. Existing
 * project styles return the original settings object unchanged. Token data is
 * deliberately outside this helper, so sparse token overrides cannot be
 * rewritten or discarded.
 */
export const applyUserDefaultTokenStyleToImport = <Settings extends object>(
  settings: Settings,
  language: StoaWorkspaceLanguageId,
  userDefaults: UserTokenStyleDefaults,
): Settings & { tokenStyle?: DocumentTokenStyle } => {
  if (hasExplicitDocumentTokenStyle(settings)) return settings;
  const userDefault = getUserTokenStyleDefault(userDefaults, language);
  return userDefault ? { ...settings, tokenStyle: userDefault } : settings;
};
