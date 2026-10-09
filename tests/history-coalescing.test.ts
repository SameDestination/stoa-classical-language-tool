import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveHistoryCoalescing,
  type HistoryCoalescingState,
} from "../app/lib/history-coalescing.ts";
import {
  pushWorkspaceHistory,
  undoWorkspaceHistory,
  type WorkspaceHistories,
} from "../app/lib/workspace-history.ts";

type Workspace = "ancient-greek" | "latin" | "classical-chinese" | "omni";

test("continuous edits from one control record one pre-edit snapshot", () => {
  let state: HistoryCoalescingState<Workspace> | null = null;
  const first = resolveHistoryCoalescing(state, "latin", "token:la-1:lemma", 1_000, 1_000);
  assert.equal(first.recordSnapshot, true);
  state = first.state;

  const second = resolveHistoryCoalescing(state, "latin", "token:la-1:lemma", 1_450, 1_000);
  assert.equal(second.recordSnapshot, false);
  state = second.state;

  const third = resolveHistoryCoalescing(state, "latin", "token:la-1:lemma", 2_300, 1_000);
  assert.equal(third.recordSnapshot, false, "the idle window advances with each edit in the burst");
});

test("idle pauses and distinct controls start new undo steps", () => {
  const first = resolveHistoryCoalescing<Workspace>(null, "ancient-greek", "setting:greekSize", 100, 500);
  const afterPause = resolveHistoryCoalescing(first.state, "ancient-greek", "setting:greekSize", 700, 500);
  assert.equal(afterPause.recordSnapshot, true);

  const otherControl = resolveHistoryCoalescing(afterPause.state, "ancient-greek", "setting:lineGap", 710, 500);
  assert.equal(otherControl.recordSnapshot, true);
});

test("coalescing never crosses workspace or explicit action boundaries", () => {
  const greek = resolveHistoryCoalescing<Workspace>(null, "ancient-greek", "setting:wordGap", 100, 1_000);
  const latin = resolveHistoryCoalescing(greek.state, "latin", "setting:wordGap", 120, 1_000);
  assert.equal(latin.recordSnapshot, true);

  const explicit = resolveHistoryCoalescing(latin.state, "latin", undefined, 130, 1_000);
  assert.equal(explicit.recordSnapshot, true);
  assert.equal(explicit.state, null);

  const afterExplicit = resolveHistoryCoalescing(explicit.state, "latin", "setting:wordGap", 140, 1_000);
  assert.equal(afterExplicit.recordSnapshot, true);
});

test("a backwards clock does not accidentally merge edits", () => {
  const first = resolveHistoryCoalescing<Workspace>(null, "omni", "token:o-1:gloss", 500, 1_000);
  const backwards = resolveHistoryCoalescing(first.state, "omni", "token:o-1:gloss", 499, 1_000);
  assert.equal(backwards.recordSnapshot, true);
});

test("a coalesced burst undoes to its first value and Save can establish a clean boundary", () => {
  type Snapshot = { value: number };
  let histories: WorkspaceHistories<Workspace, Snapshot> = {};
  let state: HistoryCoalescingState<Workspace> | null = null;

  const apply = (before: number, at: number) => {
    const decision = resolveHistoryCoalescing(state, "latin", "setting:wordGap", at, 1_000);
    state = decision.state;
    if (decision.recordSnapshot) {
      histories = pushWorkspaceHistory(histories, "latin", { value: before });
    }
  };

  apply(10, 100);
  apply(11, 200);
  apply(12, 300);
  assert.deepEqual(histories.latin?.undo, [{ value: 10 }]);
  assert.equal(undoWorkspaceHistory(histories, "latin", { value: 13 })?.snapshot.value, 10);

  // The renderer clears this transient state after a successful Save. The
  // next edit therefore stores the saved value as a distinct undo target.
  state = null;
  apply(13, 350);
  assert.deepEqual(histories.latin?.undo, [{ value: 10 }, { value: 13 }]);
});
