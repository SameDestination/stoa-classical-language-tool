import assert from "node:assert/strict";
import test from "node:test";

import {
  OMNI_PREFERENCES_FORMAT,
  OMNI_PREFERENCES_SCHEMA_VERSION,
  OMNI_PREFERENCES_STORAGE_KEY,
  createDefaultOmniPreferences,
  decodeOmniPreferences,
  encodeOmniPreferences,
  readOmniPreferences,
  resetOmniPreferences,
  setOmniExperimentalWarningSuppressed,
  shouldShowOmniExperimentalWarning,
  writeOmniPreferences,
  type OmniPreferencesStringStore,
} from "../app/lib/omni-preferences.ts";

class MemoryStringStore implements OmniPreferencesStringStore {
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

test("OMNI warning preferences use a minimal versioned user-local envelope", () => {
  const defaults = createDefaultOmniPreferences();
  assert.equal(shouldShowOmniExperimentalWarning(defaults), true);
  const suppressed = setOmniExperimentalWarningSuppressed(defaults, true);
  assert.equal(shouldShowOmniExperimentalWarning(suppressed), false);
  assert.equal(defaults.experimentalWarningSuppressed, false, "updates remain immutable");

  const serialized = encodeOmniPreferences(suppressed);
  assert.deepEqual(JSON.parse(serialized), {
    format: OMNI_PREFERENCES_FORMAT,
    schemaVersion: OMNI_PREFERENCES_SCHEMA_VERSION,
    experimentalWarningSuppressed: true,
  });
  assert.deepEqual(Object.keys(JSON.parse(serialized)), [
    "format",
    "schemaVersion",
    "experimentalWarningSuppressed",
  ]);
  assert.equal(OMNI_PREFERENCES_STORAGE_KEY, "stoa.omni.experimental-warning.dismissed");

  const decoded = decodeOmniPreferences(serialized);
  assert.deepEqual(decoded.issues, []);
  assert.equal(decoded.value.experimentalWarningSuppressed, true);
});

test("missing, corrupt, malformed and future preferences safely show the warning", () => {
  for (const serialized of [null, undefined, "", "   "]) {
    const decoded = decodeOmniPreferences(serialized);
    assert.deepEqual(decoded.issues, []);
    assert.equal(shouldShowOmniExperimentalWarning(decoded.value), true);
  }

  const cases = [
    ["{broken", "invalid-json"],
    ["true", "invalid-payload"],
    [JSON.stringify({ format: "other", schemaVersion: 1, experimentalWarningSuppressed: true }), "invalid-format"],
    [JSON.stringify({ format: OMNI_PREFERENCES_FORMAT, schemaVersion: 99, experimentalWarningSuppressed: true }), "unsupported-schema"],
    [JSON.stringify({ format: OMNI_PREFERENCES_FORMAT, schemaVersion: 1, experimentalWarningSuppressed: "yes" }), "invalid-warning-preference"],
  ] as const;
  for (const [serialized, code] of cases) {
    const decoded = decodeOmniPreferences(serialized);
    assert.equal(decoded.issues[0]?.code, code);
    assert.equal(shouldShowOmniExperimentalWarning(decoded.value), true);
  }
});

test("storage adapters persist, restore and reset warning suppression", () => {
  const store = new MemoryStringStore();
  assert.equal(shouldShowOmniExperimentalWarning(readOmniPreferences(store).value), true);

  const preferences = setOmniExperimentalWarningSuppressed(
    createDefaultOmniPreferences(),
    true,
  );
  const write = writeOmniPreferences(store, preferences);
  assert.equal(write.ok, true);
  assert.ok(store.values.has(OMNI_PREFERENCES_STORAGE_KEY));
  assert.equal(readOmniPreferences(store).value.experimentalWarningSuppressed, true);

  assert.deepEqual(resetOmniPreferences(store), { ok: true });
  assert.equal(store.values.has(OMNI_PREFERENCES_STORAGE_KEY), false);
  assert.equal(shouldShowOmniExperimentalWarning(readOmniPreferences(store).value), true);
});

test("storage failures never throw and retain warning-on behavior", () => {
  const store: OmniPreferencesStringStore = {
    getItem() { throw new Error("read denied"); },
    setItem() { throw new Error("quota exceeded"); },
    removeItem() { throw new Error("remove denied"); },
  };

  const read = readOmniPreferences(store);
  assert.equal(read.issues[0]?.code, "storage-read-failed");
  assert.equal(shouldShowOmniExperimentalWarning(read.value), true);

  const preferences = setOmniExperimentalWarningSuppressed(
    createDefaultOmniPreferences(),
    true,
  );
  const write = writeOmniPreferences(store, preferences);
  assert.equal(write.ok, false);
  if (!write.ok) assert.equal(write.issue.code, "storage-write-failed");

  const reset = resetOmniPreferences(store);
  assert.equal(reset.ok, false);
  if (!reset.ok) assert.equal(reset.issue.code, "storage-remove-failed");
});
