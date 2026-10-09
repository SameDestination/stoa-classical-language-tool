import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const work = path.resolve(process.argv[2]);
const msi = path.join(work,"STOA-Windows-x64.msi");
const extracted = mkdtempSync(path.join(os.tmpdir(),"stoa-msi-inspect-"));
execFileSync("msiextract",["-C",extracted,msi],{stdio:"pipe"});
const walk = (directory) => readdirSync(directory,{withFileTypes:true}).flatMap((entry)=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
const recoveredFiles = walk(extracted);
const exe = recoveredFiles.find((filename)=>path.basename(filename)==="STOA.exe");
assert.ok(exe);
const recoveredRoot = path.dirname(exe);
const sourceRoot = path.join(work,"win-unpacked");
const payloadFiles = walk(sourceRoot);
assert.equal(recoveredFiles.length,payloadFiles.length,"MSI must contain exactly the full Windows payload");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const filename of payloadFiles) {
  const relative = path.relative(sourceRoot,filename);
  assert.equal(hash(readFileSync(filename)),hash(readFileSync(path.join(recoveredRoot,relative))),relative);
}
const windowsAsar = path.join(recoveredRoot,"resources/app.asar");
const macAsar = path.join(work,"mac-arm64/STOA.app/Contents/Resources/app.asar");
const macFiles = asar.listPackage(macAsar).map((file)=>file.replace(/^\//u,"")).filter((file)=>!asar.statFile(macAsar,file).files).sort();
const windowsFiles = asar.listPackage(windowsAsar).map((file)=>file.replace(/^\//u,"")).filter((file)=>!asar.statFile(windowsAsar,file).files).sort();
assert.deepEqual(windowsFiles,macFiles,"Both platforms must bundle the same shared application files");
assert.ok(!windowsFiles.some((file)=>file.startsWith("node_modules/")),"No duplicate runtime dependencies");
for (const file of macFiles) assert.equal(hash(asar.extractFile(macAsar,file)),hash(asar.extractFile(windowsAsar,file)),file);
const summary = execFileSync("msiinfo",["suminfo",msi],{encoding:"utf8"});
assert.match(summary,/x64;1033/);
for(const table of ["Upgrade","Registry","Shortcut","LaunchCondition","InstallExecuteSequence"]) {
  console.log(`MSI ${table}\n${execFileSync("msiinfo",["export",msi,table],{encoding:"utf8"})}`);
}
console.log(JSON.stringify({payloadFiles:payloadFiles.length,sharedFiles:macFiles.length,extracted,verified:true}));
