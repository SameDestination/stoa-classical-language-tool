// Native Windows Installer UI, shared by the unsigned native MSI build path.
// UISequence is deliberately separate from ExecuteSequence: /qn stays supported.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function wizardTables() {
  const dialogs = [], controls = [], events = [];
  const control = (d, id, type, x, y, w, h, text = "", next = "", property = "", attributes = 3) =>
    controls.push([d, id, type, x, y, w, h, attributes, property, text, next, ""]);
  const event = (d, c, e, a, order = 1) => events.push([d, c, e, a, "1", order]);
  function page(id, title, body, buttons, modeless = false) {
    dialogs.push([id, 50, 50, 380, 260, modeless ? 1 : 3, "[ProductName] Setup", buttons[0][0], buttons[0][0], buttons.some(b => b[0] === "Cancel") ? "Cancel" : buttons[0][0]]);
    control(id, "Title", "Text", 22, 20, 336, 32, `{\\TitleFont}${title}`);
    control(id, "Body", "Text", 22, 66, 336, 133, body);
    control(id, "Divider", "Line", 0, 216, 380, 1);
    buttons.forEach(([name, label], i) => control(id, name, "PushButton", 380 - 22 - buttons.length * 80 + i * 80, 230, 74, 18, label, buttons[(i + 1) % buttons.length][0]));
  }
  page("WelcomeDlg", "Welcome to STOA", "This wizard will install STOA [ProductVersion] for your Windows account.\r\n\r\nClick Next to review the installation before making changes.", [["Next", "&Next >"], ["Cancel", "Cancel"]]);
  page("InstallDirDlg", "Choose installation folder", "Choose a folder your Windows account can write to. Type a full path or click Browse to select another drive or folder.", [["Back", "< &Back"], ["Next", "&Next >"], ["Cancel", "Cancel"]]);
  controls.find(r => r[0] === "InstallDirDlg" && r[1] === "Body")[6] = 38;
  control("InstallDirDlg", "FolderLabel", "Text", 22, 112, 336, 14, "Installation folder:");
  control("InstallDirDlg", "Folder", "PathEdit", 22, 130, 336, 20, "", "Browse", "APPLICATIONFOLDER");
  control("InstallDirDlg", "Browse", "PushButton", 22, 161, 90, 20, "&Browse...", "Back");
  dialogs.find(r => r[0] === "InstallDirDlg")[7] = "Folder";
  dialogs.find(r => r[0] === "InstallDirDlg")[8] = "Next";
  controls.find(r => r[0] === "InstallDirDlg" && r[1] === "Cancel")[10] = "Folder";
  page("BrowseDlg", "Select installation folder", "", [["OK", "&OK"], ["Cancel", "Cancel"]]);
  controls.splice(controls.findIndex(r => r[0] === "BrowseDlg" && r[1] === "Body"), 1);
  control("BrowseDlg", "DirectoryCombo", "DirectoryCombo", 22, 60, 220, 80, "", "Up", "APPLICATIONFOLDER", 3 | 0x20000 | 0x40000 | 0x10000);
  control("BrowseDlg", "Up", "PushButton", 249, 60, 40, 20, "&Up", "NewFolder");
  control("BrowseDlg", "NewFolder", "PushButton", 295, 60, 63, 20, "&New folder", "DirectoryList");
  control("BrowseDlg", "DirectoryList", "DirectoryList", 22, 86, 336, 85, "Folders", "Path", "APPLICATIONFOLDER", 7);
  control("BrowseDlg", "PathLabel", "Text", 22, 178, 336, 12, "Selected installation folder:");
  control("BrowseDlg", "Path", "PathEdit", 22, 193, 336, 18, "", "OK", "APPLICATIONFOLDER");
  dialogs.find(r => r[0] === "BrowseDlg")[7] = "DirectoryCombo";
  controls.find(r => r[0] === "BrowseDlg" && r[1] === "Cancel")[10] = "DirectoryCombo";
  event("BrowseDlg", "Up", "DirectoryListUp", "0");
  event("BrowseDlg", "NewFolder", "DirectoryListNew", "0");
  // Standard MSI path validation blocks the following event for invalid paths.
  event("BrowseDlg", "OK", "SetTargetPath", "APPLICATIONFOLDER");
  event("BrowseDlg", "OK", "EndDialog", "Return", 2);
  event("BrowseDlg", "Cancel", "Reset", "0");
  event("BrowseDlg", "Cancel", "EndDialog", "Return", 2);
  page("ReadyDlg", "Ready to install", "Install location:\r\n[APPLICATIONFOLDER]\r\n\r\nSetup will add Desktop and Start menu shortcuts and associate .stoa project files with STOA.\r\n\r\nClick Install to begin, or Back to review.", [["Install", "&Install"], ["Back", "< &Back"], ["Cancel", "Cancel"]]);
  page("MaintenanceDlg", "STOA is already installed", "Choose Repair to restore the installed application files, or Remove to uninstall STOA.\r\n\r\nSaved project files are not removed by this installer.", [["Repair", "&Repair"], ["Remove", "&Remove"], ["Cancel", "Cancel"]]);
  page("RemoveDlg", "Ready to remove STOA", "Click Remove to uninstall STOA from your Windows account.\r\n\r\nSaved project files will not be deleted.", [["Remove", "&Remove"], ["Cancel", "Cancel"]]);
  page("ProgressDlg", "Updating STOA", "Please wait while Windows Installer updates STOA.", [["Cancel", "Cancel"]], true);
  control("ProgressDlg", "Status", "Text", 22, 128, 336, 30, "Preparing...");
  control("ProgressDlg", "Progress", "ProgressBar", 22, 171, 336, 14);
  for (const [id, title, body] of [
    ["ExitDlg", "Setup completed", "The requested STOA setup operation has completed.\r\n\r\nIf installed, STOA is available from the Start menu and Desktop shortcut."],
    ["UserExitDlg", "Setup cancelled", "Setup was cancelled. Click Finish to close the wizard."],
    ["FatalErrorDlg", "Setup could not complete", "An error prevented setup from completing. Please try again or contact support with the Windows Installer log."],
  ]) {
    page(id, title, body, [["Finish", "&Finish"]]);
    event(id, "Finish", "EndDialog", "Return");
  }
  page("CancelDlg", "Cancel setup?", "Are you sure you want to cancel setup?", [["No", "&No"], ["Yes", "&Yes"]]);
  event("CancelDlg", "No", "EndDialog", "Return");
  event("CancelDlg", "Yes", "EndDialog", "Exit");
  for (const d of ["WelcomeDlg", "InstallDirDlg", "ReadyDlg", "MaintenanceDlg", "RemoveDlg", "ProgressDlg"]) event(d, "Cancel", "SpawnDialog", "CancelDlg");
  event("WelcomeDlg", "Next", "NewDialog", "InstallDirDlg");
  event("InstallDirDlg", "Back", "NewDialog", "WelcomeDlg");
  event("InstallDirDlg", "Browse", "SpawnDialog", "BrowseDlg");
  event("InstallDirDlg", "Next", "SetTargetPath", "APPLICATIONFOLDER");
  event("InstallDirDlg", "Next", "NewDialog", "ReadyDlg", 2);
  event("ReadyDlg", "Back", "NewDialog", "InstallDirDlg");
  event("ReadyDlg", "Install", "[ARPINSTALLLOCATION]", "[APPLICATIONFOLDER]");
  event("ReadyDlg", "Install", "EndDialog", "Return", 2);
  event("MaintenanceDlg", "Repair", "[REINSTALL]", "ALL");
  event("MaintenanceDlg", "Repair", "[REINSTALLMODE]", "omus", 2);
  event("MaintenanceDlg", "Repair", "EndDialog", "Return", 3);
  event("MaintenanceDlg", "Remove", "NewDialog", "RemoveDlg");
  event("RemoveDlg", "Remove", "[REMOVE]", "ALL");
  event("RemoveDlg", "Remove", "EndDialog", "Return", 2);
  return {
    Dialog: { columns: "Dialog HCentering VCentering Width Height Attributes Title Control_First Control_Default Control_Cancel", types: "s72 i2 i2 i2 i2 I4 L128 s50 S50 S50", keys: "Dialog", rows: dialogs },
    Control: { columns: "Dialog_ Control Type X Y Width Height Attributes Property Text Control_Next Help", types: "s72 s50 s20 i2 i2 i2 i2 I4 S72 L0 S50 L50", keys: "Dialog_ Control", rows: controls },
    ControlEvent: { columns: "Dialog_ Control_ Event Argument Condition Ordering", types: "s72 s50 s50 s255 S255 I2", keys: "Dialog_ Control_ Event Argument Condition", rows: events },
    TextStyle: { columns: "TextStyle FaceName Size Color StyleBits", types: "s72 l32 i2 I4 I2", keys: "TextStyle", rows: [["BodyFont", "Segoe UI", 9, 0, 0], ["TitleFont", "Segoe UI", 15, 0, 1]] },
    EventMapping: { columns: "Dialog_ Control_ Event Attribute", types: "s72 s50 s50 s50", keys: "Dialog_ Control_ Event", rows: [["ProgressDlg", "Progress", "SetProgress", "Progress"], ["ProgressDlg", "Status", "ActionText", "Text"], ["BrowseDlg", "DirectoryCombo", "IgnoreChange", "IgnoreChange"]] },
  };
}

export function addMsiWizard(msi, work) {
  const folder = path.join(work, "msi-wizard");
  mkdirSync(folder, { recursive: true });
  const tables = wizardTables();
  // Preserve compiler-authored costing, upgrade and launch-condition actions.
  const sequence = execFileSync("msiinfo", ["export", msi, "InstallUISequence"], { encoding: "utf8" }).trimEnd().split(/\r?\n/);
  const added = [["RemoveDlg", 'Installed AND REMOVE="ALL"', 1099], ["WelcomeDlg", "NOT Installed", 1100], ["MaintenanceDlg", 'Installed AND NOT (REMOVE="ALL")', 1101], ["ProgressDlg", "1", 1250], ["ExitDlg", "1", -1], ["UserExitDlg", "1", -2], ["FatalErrorDlg", "1", -3]];
  const ids = new Set(added.map(row => row[0]));
  tables.InstallUISequence = { columns: "Action Condition Sequence", types: "s72 S255 I2", keys: "Action", rows: [...sequence.slice(3).filter(row => !ids.has(row.split("\t")[0])).map(row => row.split("\t")), ...added] };
  for (const [name, table] of Object.entries(tables)) {
    // IDT stores embedded line breaks using the MSI archive escape characters.
    const cell = value => String(value).replaceAll("\r", "\x11").replaceAll("\n", "\x19");
    const lines = [table.columns.split(" "), table.types.split(" "), [name, ...table.keys.split(" ")], ...table.rows];
    const file = path.join(folder, `${name}.idt`);
    writeFileSync(file, lines.map(row => row.map(cell).join("\t")).join("\r\n") + "\r\n");
    execFileSync("msibuild", [msi, "-i", file], { stdio: "inherit" });
  }
  execFileSync("msibuild", [msi, "-q", "DELETE FROM `Property` WHERE `Property` = 'DefaultUIFont'", "-q", "INSERT INTO `Property` (`Property`, `Value`) VALUES ('DefaultUIFont', 'BodyFont')"], { stdio: "inherit" });
  const properties = execFileSync("msiinfo", ["export", msi, "Property"], { encoding: "utf8" });
  const secure = properties.split(/\r?\n/).find(line => line.startsWith("SecureCustomProperties\t"))?.split("\t")[1] ?? "";
  const securePaths = [...new Set([...secure.split(";").filter(Boolean), "APPLICATIONFOLDER", "ARPINSTALLLOCATION"])].join(";");
  execFileSync("msibuild", [msi, "-q", "DELETE FROM `Property` WHERE `Property` = 'SecureCustomProperties'", "-q", `INSERT INTO \`Property\` (\`Property\`, \`Value\`) VALUES ('SecureCustomProperties', '${securePaths.replaceAll("'", "''")}')`], { stdio: "inherit" });
  // A changed MSI database must have a new package code, even with the same app.
  execFileSync("msibuild", [msi, "-s", "STOA Windows x64 Setup", "STOA", "x64;1033", `{${randomUUID().toUpperCase()}}`], { stdio: "inherit" });
  for (const [name, table] of Object.entries(tables)) {
    const keys = new Set(table.rows.map(row => String(row[0])));
    // msiinfo expands archived multiline Text cells on export.
    const actual = execFileSync("msiinfo", ["export", msi, name], { encoding: "utf8" }).trimEnd().split(/\r?\n/).slice(3).filter(line => line.includes("\t") && keys.has(line.split("\t")[0]));
    if (actual.length !== table.rows.length) throw new Error(`MSI wizard table ${name} did not round-trip`);
  }
}
