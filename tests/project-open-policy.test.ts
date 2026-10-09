import assert from "node:assert/strict";
import test from "node:test";
import { omniManualOverrideForProjectOpen } from "../app/lib/project-open-policy.ts";

const confirmedOverride = {
  languageId: "hbo",
  confirmed: true,
} as const;

test("exchange project JSON cannot import a pre-confirmed OMNI language override", () => {
  assert.equal(
    omniManualOverrideForProjectOpen("exchange", confirmedOverride),
    null,
  );
});

test("native desktop documents and bundled samples retain OMNI confirmation", () => {
  const desktop = omniManualOverrideForProjectOpen("desktop", confirmedOverride);
  const bundled = omniManualOverrideForProjectOpen("bundled", confirmedOverride);
  assert.deepEqual(desktop, confirmedOverride);
  assert.deepEqual(bundled, confirmedOverride);
  assert.notEqual(desktop, confirmedOverride);
  assert.notEqual(bundled, confirmedOverride);
});
