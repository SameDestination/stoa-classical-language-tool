import assert from "node:assert/strict";
import test from "node:test";
import {
  pushWorkspaceHistory,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  type WorkspaceHistories,
} from "../app/lib/workspace-history.ts";

type Language = "ancient-greek" | "latin" | "classical-chinese" | "omni";
type Snapshot = { text: string };

test("undo and redo are isolated by workspace and navigation is not represented", () => {
  let histories: WorkspaceHistories<Language, Snapshot> = {};
  histories = pushWorkspaceHistory(histories, "ancient-greek", { text: "Greek A" });
  histories = pushWorkspaceHistory(histories, "latin", { text: "Latin A" });

  const greekUndo = undoWorkspaceHistory(
    histories,
    "ancient-greek",
    { text: "Greek B" },
  );
  assert.ok(greekUndo);
  assert.equal(greekUndo.snapshot.text, "Greek A");
  assert.deepEqual(greekUndo.histories.latin?.undo, [{ text: "Latin A" }]);

  const greekRedo = redoWorkspaceHistory(
    greekUndo.histories,
    "ancient-greek",
    greekUndo.snapshot,
  );
  assert.ok(greekRedo);
  assert.equal(greekRedo.snapshot.text, "Greek B");

  const latinUndo = undoWorkspaceHistory(
    greekRedo.histories,
    "latin",
    { text: "Latin B" },
  );
  assert.ok(latinUndo);
  assert.equal(latinUndo.snapshot.text, "Latin A");
});

test("a new edit clears redo only in the edited workspace", () => {
  let histories: WorkspaceHistories<Language, Snapshot> = {};
  histories = pushWorkspaceHistory(histories, "ancient-greek", { text: "Greek A" });
  histories = pushWorkspaceHistory(histories, "latin", { text: "Latin A" });
  const latinUndo = undoWorkspaceHistory(histories, "latin", { text: "Latin B" });
  assert.ok(latinUndo);

  const editedGreek = pushWorkspaceHistory(
    latinUndo.histories,
    "ancient-greek",
    { text: "Greek B" },
  );
  assert.equal(editedGreek.latin?.redo.length, 1);
  assert.equal(editedGreek["ancient-greek"]?.redo.length, 0);
});

test("history is bounded independently for every workspace", () => {
  let histories: WorkspaceHistories<Language, Snapshot> = {};
  for (let index = 0; index < 5; index += 1) {
    histories = pushWorkspaceHistory(
      histories,
      "omni",
      { text: String(index) },
      3,
    );
  }
  assert.deepEqual(histories.omni?.undo.map((snapshot) => snapshot.text), ["2", "3", "4"]);
});

