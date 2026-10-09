import test from "node:test";
import assert from "node:assert/strict";
import { wizardTables } from "../desktop/msi-wizard.mjs";

test("MSI wizard references valid dialogs, controls and keyboard targets", () => {
  const t = wizardTables();
  const dialogs = new Set(t.Dialog.rows.map(r => r[0]));
  const controls = new Set(t.Control.rows.map(r => `${r[0]}/${r[1]}`));
  for (const table of Object.values(t)) for (const row of table.rows) assert.equal(row.length, table.columns.split(" ").length);
  for (const row of t.Dialog.rows) for (const target of row.slice(8)) assert.ok(controls.has(`${row[0]}/${target}`));
  for (const row of t.Control.rows) if (row[10]) assert.ok(controls.has(`${row[0]}/${row[10]}`));
  for (const [d,c,e,a] of t.ControlEvent.rows) {
    assert.ok(controls.has(`${d}/${c}`));
    if (["NewDialog", "SpawnDialog"].includes(e)) assert.ok(dialogs.has(a));
  }
});
test("Next only navigates; explicit Install is required; repair/remove and cancellation remain available", () => {
  const events = wizardTables().ControlEvent.rows;
  assert.deepEqual(events.filter(r => r[0] === "WelcomeDlg" && r[1] === "Next").map(r => r.slice(2,4)), [["NewDialog", "InstallDirDlg"]]);
  assert.ok(events.some(r => r[0] === "ReadyDlg" && r[1] === "Install" && r[2] === "EndDialog" && r[3] === "Return"));
  assert.ok(events.some(r => r[0] === "CancelDlg" && r[1] === "Yes" && r[3] === "Exit"));
  assert.ok(events.some(r => r[2] === "[REINSTALL]"));
  assert.ok(events.some(r => r[2] === "[REMOVE]"));
  assert.equal(wizardTables().Dialog.rows.find(r => r[0] === "ProgressDlg")[5], 1);
});
test("folder editing and browsing share the real target directory and validate before advancing", () => {
  const t = wizardTables();
  for (const [d,c] of [["InstallDirDlg","Folder"], ["BrowseDlg","Path"], ["BrowseDlg","DirectoryList"], ["BrowseDlg","DirectoryCombo"]]) {
    assert.equal(t.Control.rows.find(r => r[0] === d && r[1] === c)[8], "APPLICATIONFOLDER");
  }
  for (const [d,c,exit] of [["InstallDirDlg","Next","NewDialog"], ["BrowseDlg","OK","EndDialog"]]) {
    const events = t.ControlEvent.rows.filter(r => r[0] === d && r[1] === c).sort((a,b) => a[5]-b[5]);
    assert.deepEqual(events.map(r => r.slice(2,4)), [["SetTargetPath","APPLICATIONFOLDER"], [exit, exit === "NewDialog" ? "ReadyDlg" : "Return"]]);
  }
  assert.deepEqual(t.ControlEvent.rows.filter(r => r[0] === "BrowseDlg" && r[1] === "Cancel").map(r => r.slice(2,4)), [["Reset","0"], ["EndDialog","Return"]]);
  assert.ok(t.ControlEvent.rows.some(r => r[0] === "ReadyDlg" && r[1] === "Back" && r[3] === "InstallDirDlg"));
  // Repair/remove never retarget installed components to a new location.
  assert.ok(!t.ControlEvent.rows.some(r => ["MaintenanceDlg","RemoveDlg"].includes(r[0]) && ["SetTargetPath","InstallDirDlg"].some(v => r.includes(v))));
});
