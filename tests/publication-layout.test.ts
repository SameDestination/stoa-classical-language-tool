import assert from "node:assert/strict";
import test from "node:test";

import {
  TRAILING_TEXT_HORIZONTAL_PADDING_PX,
  resolveTrailingTextMeasurePx,
} from "../app/lib/publication-layout.ts";

test("Notes and translations expand to the full usable measure without a desktop-width cap", () => {
  const narrowMeasure = resolveTrailingTextMeasurePx(500);
  const a3Measure = resolveTrailingTextMeasurePx(1_200);
  const customWideMeasure = resolveTrailingTextMeasurePx(1_600);

  assert.equal(narrowMeasure, 500 - TRAILING_TEXT_HORIZONTAL_PADDING_PX);
  assert.equal(a3Measure, 1_200 - TRAILING_TEXT_HORIZONTAL_PADDING_PX);
  assert.equal(customWideMeasure, 1_600 - TRAILING_TEXT_HORIZONTAL_PADDING_PX);

  // A3 and custom paper must gain every additional pixel of usable width.
  // A fixed readable-measure cap (the former 680 px behavior) would fail both
  // the threshold and the linear-growth assertions below.
  assert.ok(a3Measure > 680);
  assert.equal(customWideMeasure - a3Measure, 400);
});

test("trailing prose measure keeps its horizontal inset and safely clamps invalid widths", () => {
  assert.equal(resolveTrailingTextMeasurePx(TRAILING_TEXT_HORIZONTAL_PADDING_PX + 1), 1);
  assert.equal(resolveTrailingTextMeasurePx(TRAILING_TEXT_HORIZONTAL_PADDING_PX - 1), 1);
  assert.equal(resolveTrailingTextMeasurePx(-500), 1);
  assert.equal(resolveTrailingTextMeasurePx(Number.NaN), 1);
  assert.equal(resolveTrailingTextMeasurePx(Number.POSITIVE_INFINITY), 1);
});
