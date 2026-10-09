/**
 * User-local persistence for OMNI's experimental-warning preference.
 *
 * This deliberately has no browser, project, or document dependency. Callers
 * supply a localStorage-compatible adapter, and must not serialize this value
 * into a portable STOA project or include it in document undo history.
 */

import { OMNI_EXPERIMENTAL_WARNING } from "./omni-language";

export const OMNI_PREFERENCES_FORMAT = "stoa-omni-preferences" as const;
export const OMNI_PREFERENCES_SCHEMA_VERSION = 1 as const;
export const OMNI_PREFERENCES_STORAGE_KEY = OMNI_EXPERIMENTAL_WARNING.preferenceKey;

export type OmniPreferences = Readonly<{
  format: typeof OMNI_PREFERENCES_FORMAT;
  schemaVersion: typeof OMNI_PREFERENCES_SCHEMA_VERSION;
  experimentalWarningSuppressed: boolean;
}>;

export type OmniPreferencesIssueCode =
  | "invalid-json"
  | "invalid-payload"
  | "invalid-format"
  | "unsupported-schema"
  | "invalid-warning-preference"
  | "storage-read-failed"
  | "storage-write-failed"
  | "storage-remove-failed";

export type OmniPreferencesIssue = Readonly<{
  code: OmniPreferencesIssueCode;
  path: string;
  message: string;
}>;

export type DecodedOmniPreferences = Readonly<{
  value: OmniPreferences;
  issues: readonly OmniPreferencesIssue[];
}>;

/** A localStorage-compatible adapter that is also easy to use in desktop tests. */
export interface OmniPreferencesStringStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type OmniPreferencesWriteResult =
  | Readonly<{ ok: true; serialized: string }>
  | Readonly<{ ok: false; issue: OmniPreferencesIssue }>;

export type OmniPreferencesResetResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; issue: OmniPreferencesIssue }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const issue = (
  code: OmniPreferencesIssueCode,
  path: string,
  message: string,
): OmniPreferencesIssue => ({ code, path, message });

/** Safe default: first entry (and every corrupt state) shows the warning. */
export const createDefaultOmniPreferences = (): OmniPreferences => ({
  format: OMNI_PREFERENCES_FORMAT,
  schemaVersion: OMNI_PREFERENCES_SCHEMA_VERSION,
  experimentalWarningSuppressed: false,
});

export const shouldShowOmniExperimentalWarning = (
  preferences: Pick<OmniPreferences, "experimentalWarningSuppressed">,
): boolean => !preferences.experimentalWarningSuppressed;

export const setOmniExperimentalWarningSuppressed = (
  preferences: OmniPreferences,
  suppressed: boolean,
): OmniPreferences => ({
  ...preferences,
  experimentalWarningSuppressed: suppressed,
});

/**
 * Decode without throwing. Unsupported versions and malformed payloads are not
 * guessed or migrated: both return the warning-on safe default.
 */
export const decodeOmniPreferences = (
  serialized: string | null | undefined,
): DecodedOmniPreferences => {
  const fallback = createDefaultOmniPreferences();
  if (serialized === null || serialized === undefined || !serialized.trim()) {
    return { value: fallback, issues: [] };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(serialized) as unknown;
  } catch (error) {
    return {
      value: fallback,
      issues: [issue(
        "invalid-json",
        "$",
        error instanceof Error ? error.message : "invalid JSON",
      )],
    };
  }

  if (!isRecord(candidate)) {
    return {
      value: fallback,
      issues: [issue("invalid-payload", "$", "must be an object")],
    };
  }
  if (candidate.format !== OMNI_PREFERENCES_FORMAT) {
    return {
      value: fallback,
      issues: [issue(
        "invalid-format",
        "$.format",
        `must equal ${JSON.stringify(OMNI_PREFERENCES_FORMAT)}`,
      )],
    };
  }
  if (candidate.schemaVersion !== OMNI_PREFERENCES_SCHEMA_VERSION) {
    return {
      value: fallback,
      issues: [issue(
        "unsupported-schema",
        "$.schemaVersion",
        `unsupported schema version ${JSON.stringify(candidate.schemaVersion)}`,
      )],
    };
  }
  if (typeof candidate.experimentalWarningSuppressed !== "boolean") {
    return {
      value: fallback,
      issues: [issue(
        "invalid-warning-preference",
        "$.experimentalWarningSuppressed",
        "must be a boolean",
      )],
    };
  }

  return {
    value: {
      format: OMNI_PREFERENCES_FORMAT,
      schemaVersion: OMNI_PREFERENCES_SCHEMA_VERSION,
      experimentalWarningSuppressed: candidate.experimentalWarningSuppressed,
    },
    issues: [],
  };
};

/** Deterministic envelope; unknown input properties are never persisted. */
export const encodeOmniPreferences = (
  preferences: Pick<OmniPreferences, "experimentalWarningSuppressed">,
): string => JSON.stringify({
  format: OMNI_PREFERENCES_FORMAT,
  schemaVersion: OMNI_PREFERENCES_SCHEMA_VERSION,
  experimentalWarningSuppressed: preferences.experimentalWarningSuppressed === true,
});

export const readOmniPreferences = (
  store: OmniPreferencesStringStore,
): DecodedOmniPreferences => {
  try {
    return decodeOmniPreferences(store.getItem(OMNI_PREFERENCES_STORAGE_KEY));
  } catch (error) {
    return {
      value: createDefaultOmniPreferences(),
      issues: [issue(
        "storage-read-failed",
        "$",
        error instanceof Error ? error.message : "could not read OMNI preferences",
      )],
    };
  }
};

export const writeOmniPreferences = (
  store: OmniPreferencesStringStore,
  preferences: Pick<OmniPreferences, "experimentalWarningSuppressed">,
): OmniPreferencesWriteResult => {
  const serialized = encodeOmniPreferences(preferences);
  try {
    store.setItem(OMNI_PREFERENCES_STORAGE_KEY, serialized);
    return { ok: true, serialized };
  } catch (error) {
    return {
      ok: false,
      issue: issue(
        "storage-write-failed",
        "$",
        error instanceof Error ? error.message : "could not write OMNI preferences",
      ),
    };
  }
};

/** Settings "restore warnings" action: absence decodes to warning-on defaults. */
export const resetOmniPreferences = (
  store: OmniPreferencesStringStore,
): OmniPreferencesResetResult => {
  try {
    store.removeItem(OMNI_PREFERENCES_STORAGE_KEY);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      issue: issue(
        "storage-remove-failed",
        "$",
        error instanceof Error ? error.message : "could not reset OMNI preferences",
      ),
    };
  }
};
