import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  aggregateSelectedValue,
  applyPointerSelection,
  clearTokenSelection,
  createTokenSelection,
  moveTokenSelectionFocus,
  removeSelectedItems,
  sanitizeTokenSelection,
  selectedItemsInDocumentOrder,
  toggleFocusedToken,
  updateSelectedItems,
} from "../app/lib/token-selection.ts";

const greekTokens = [
  { id: "grc-01", surface: "ἡ", size: 22 },
  { id: "grc-02", surface: "ψυχὴ", size: 22 },
  { id: "grc-03", surface: "τὰ", size: 26 },
  { id: "grc-04", surface: "καλὰ", size: undefined },
  { id: "grc-05", surface: "φιλεῖ", size: undefined },
];

const latinTokens = [
  { id: "lat-01", surface: "Gallia", bold: false },
  { id: "lat-02", surface: "est", bold: false },
  { id: "lat-03", surface: "omnis", bold: true },
  { id: "lat-04", surface: "divisa", bold: false },
];

const greekIds = greekTokens.map((token) => token.id);
const latinIds = latinTokens.map((token) => token.id);

type CanonicalProjectToken = {
  id: string;
  surface: string;
  wordBold?: boolean;
};

const readCanonicalTokens = (filename: string): CanonicalProjectToken[] => {
  const project = JSON.parse(readFileSync(
    new URL(`./fixtures/canonical/${filename}`, import.meta.url),
    "utf8",
  )) as { document: { analysis: { tokens: CanonicalProjectToken[] } } };
  return project.document.analysis.tokens;
};

test("single click replaces selection and establishes anchor and focus", () => {
  const initial = createTokenSelection(greekIds, ["grc-01", "grc-03"], "grc-01", "grc-03");
  const next = applyPointerSelection(initial, greekIds, "grc-04");
  assert.deepEqual(next, {
    selectedIds: ["grc-04"],
    anchorId: "grc-04",
    focusId: "grc-04",
  });
  assert.deepEqual(applyPointerSelection(next, greekIds, "grc-04"), next);
});

test("Cmd/Ctrl click toggles tokens while preserving document order", () => {
  let selection = createTokenSelection(latinIds, ["lat-03"], "lat-03", "lat-03");
  selection = applyPointerSelection(selection, latinIds, "lat-01", { toggle: true });
  assert.deepEqual(selection.selectedIds, ["lat-01", "lat-03"]);
  selection = applyPointerSelection(selection, latinIds, "lat-03", { toggle: true });
  assert.deepEqual(selection, {
    selectedIds: ["lat-01"],
    anchorId: "lat-03",
    focusId: "lat-03",
  });
});

test("Shift click selects a contiguous range in either direction", () => {
  const initial = createTokenSelection(greekIds, ["grc-02"], "grc-02", "grc-02");
  const forward = applyPointerSelection(initial, greekIds, "grc-05", { range: true });
  assert.deepEqual(forward.selectedIds, ["grc-02", "grc-03", "grc-04", "grc-05"]);
  assert.equal(forward.anchorId, "grc-02");
  assert.equal(forward.focusId, "grc-05");

  const backward = applyPointerSelection(forward, greekIds, "grc-01", { range: true });
  assert.deepEqual(backward.selectedIds, ["grc-01", "grc-02"]);
  assert.equal(backward.anchorId, "grc-02");
  assert.equal(backward.focusId, "grc-01");
});

test("range takes precedence if Shift and Cmd/Ctrl are both present", () => {
  const initial = createTokenSelection(latinIds, ["lat-02"], "lat-02", "lat-02");
  const next = applyPointerSelection(initial, latinIds, "lat-04", {
    range: true,
    toggle: true,
  });
  assert.deepEqual(next.selectedIds, ["lat-02", "lat-03", "lat-04"]);
});

test("clear removes selection, anchor, and focus", () => {
  assert.deepEqual(clearTokenSelection(), {
    selectedIds: [],
    anchorId: null,
    focusId: null,
  });
});

test("sanitize removes deleted/import-stale IDs and restores anchor and focus", () => {
  const stale = {
    selectedIds: ["gone", "grc-04", "grc-02", "grc-04"],
    anchorId: "gone",
    focusId: "also-gone",
  };
  assert.deepEqual(sanitizeTokenSelection(stale, greekIds), {
    selectedIds: ["grc-02", "grc-04"],
    anchorId: "grc-02",
    focusId: "grc-04",
  });
  assert.deepEqual(sanitizeTokenSelection(stale, latinIds), clearTokenSelection());
});

test("keyboard arrows replace selection or extend it from the stable anchor", () => {
  let selection = createTokenSelection(greekIds, ["grc-02"], "grc-02", "grc-02");
  selection = moveTokenSelectionFocus(selection, greekIds, "next");
  assert.deepEqual(selection, {
    selectedIds: ["grc-03"],
    anchorId: "grc-03",
    focusId: "grc-03",
  });
  selection = moveTokenSelectionFocus(selection, greekIds, "next", { extend: true });
  assert.deepEqual(selection.selectedIds, ["grc-03", "grc-04"]);
  selection = moveTokenSelectionFocus(selection, greekIds, "last", { extend: true });
  assert.deepEqual(selection.selectedIds, ["grc-03", "grc-04", "grc-05"]);
  selection = moveTokenSelectionFocus(selection, greekIds, "previous", { extend: true });
  assert.deepEqual(selection.selectedIds, ["grc-03", "grc-04"]);
});

test("keyboard toggle uses focused token and works from an empty selection", () => {
  let selection = createTokenSelection(latinIds, ["lat-02"], "lat-02", "lat-02");
  selection = toggleFocusedToken(selection, latinIds);
  assert.deepEqual(selection.selectedIds, []);
  assert.equal(selection.anchorId, "lat-02");
  assert.equal(selection.focusId, "lat-02");

  selection = toggleFocusedToken(clearTokenSelection(), latinIds);
  assert.deepEqual(selection.selectedIds, ["lat-01"]);
  assert.equal(selection.focusId, "lat-01");
});

test("selected items and mixed values follow document order", () => {
  assert.deepEqual(
    selectedItemsInDocumentOrder(greekTokens, ["grc-05", "grc-02", "grc-04"])
      .map((token) => token.id),
    ["grc-02", "grc-04", "grc-05"],
  );
  assert.deepEqual(
    aggregateSelectedValue(greekTokens, ["grc-01", "grc-02"], (token) => token.size),
    { kind: "uniform", value: 22 },
  );
  assert.deepEqual(
    aggregateSelectedValue(greekTokens, ["grc-02", "grc-03"], (token) => token.size),
    { kind: "mixed" },
  );
  assert.deepEqual(
    aggregateSelectedValue(greekTokens, ["grc-04", "grc-05"], (token) => token.size),
    { kind: "uniform", value: undefined },
  );
  assert.deepEqual(
    aggregateSelectedValue(greekTokens, ["missing"], (token) => token.size),
    { kind: "empty" },
  );
});

test("one bulk edit preserves IDs, order, and unselected object identities", () => {
  const updated = updateSelectedItems(
    latinTokens,
    ["lat-04", "lat-02"],
    (token) => ({ ...token, bold: true }),
  );
  assert.deepEqual(updated.map((token) => token.id), latinIds);
  assert.deepEqual(updated.map((token) => token.surface), latinTokens.map((token) => token.surface));
  assert.deepEqual(updated.map((token) => token.bold), [false, true, true, true]);
  assert.equal(updated[0], latinTokens[0]);
  assert.equal(updated[2], latinTokens[2]);
  assert.notEqual(updated[1], latinTokens[1]);
  assert.notEqual(updated[3], latinTokens[3]);
});

test("unknown pointer IDs never corrupt the surviving selection", () => {
  const initial = createTokenSelection(greekIds, ["grc-03"], "grc-03", "grc-03");
  assert.deepEqual(
    applyPointerSelection(initial, greekIds, "not-a-token", { toggle: true }),
    initial,
  );
});

test("one bulk removal chooses the nearest survivor and keeps the undo inputs intact", () => {
  const selection = createTokenSelection(
    greekIds,
    ["grc-02", "grc-03"],
    "grc-02",
    "grc-03",
  );
  const result = removeSelectedItems(greekTokens, selection);
  assert.deepEqual(result.removedIds, ["grc-02", "grc-03"]);
  assert.deepEqual(result.items.map((token) => token.id), ["grc-01", "grc-04", "grc-05"]);
  assert.deepEqual(result.selection, {
    selectedIds: ["grc-04"],
    anchorId: "grc-04",
    focusId: "grc-04",
  });
  assert.deepEqual(selection.selectedIds, ["grc-02", "grc-03"]);
  assert.deepEqual(greekTokens.map((token) => token.id), greekIds);

  const final = removeSelectedItems(
    latinTokens,
    createTokenSelection(latinIds, ["lat-03", "lat-04"], "lat-03", "lat-04"),
  );
  assert.deepEqual(final.selection.selectedIds, ["lat-02"]);
});

for (const fixture of [
  "stoa-ancient-greek-20260819-184926.stoa.json",
  "stoa-latin-20260819-191723.stoa.json",
]) {
  test(`${fixture} supports stable-ID range selection and bulk editing`, () => {
    const tokens = readCanonicalTokens(fixture);
    const ids = tokens.map((token) => token.id);
    assert.ok(ids.length >= 5);
    const initial = createTokenSelection(ids, [ids[1]], ids[1], ids[1]);
    const range = applyPointerSelection(initial, ids, ids[4], { range: true });
    assert.deepEqual(range.selectedIds, ids.slice(1, 5));
    const updated = updateSelectedItems(tokens, range.selectedIds, (token) => ({
      ...token,
      wordBold: true,
    }));
    assert.deepEqual(updated.map((token) => token.id), ids);
    assert.equal(updated[0], tokens[0]);
    assert.ok(updated.slice(1, 5).every((token) => token.wordBold === true));
  });
}
