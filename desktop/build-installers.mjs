import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const asar = require("@electron/asar");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const resume = process.argv.find((arg) => arg.startsWith("--resume="))?.slice(9);
const work = resume ? path.resolve(resume) : mkdtempSync(path.join(os.tmpdir(), "stoa-installers-"));
const output = path.join(root, "outputs", `STOA-Desktop-${version}`);
const builder = path.join(root, "node_modules", ".bin", "electron-builder");
const installers = ["STOA-macOS-arm64.dmg", "STOA-Windows-x64.msi"];

// Build outside File Provider-managed folders: provenance xattrs can invalidate
// strict macOS signing. Keep intermediates for diagnosis, never deliver them.
console.log(`Packaging work directory: ${work}`);
if (existsSync(output)) throw new Error(`Refusing to replace existing release: ${output}`);
if (resume) {
  // A resume must never mix an old DMG with a newly edited renderer/main layer.
  for (const archive of ["mac-arm64/STOA.app/Contents/Resources/app.asar", "win-unpacked/resources/app.asar"]) {
    const filename = path.join(work,archive);
    if (!existsSync(filename)) continue;
    for (const file of asar.listPackage(filename).map((item)=>item.replace(/^\//u,""))) {
      if (file === "package.json" || asar.statFile(filename,file).files) continue;
      const current = path.join(root,"desktop",file);
      if (!existsSync(current) || !readFileSync(current).equals(asar.extractFile(filename,file))) throw new Error(`Cannot resume stale packaged file: ${file}. Start a fresh packaging run.`);
    }
    if (JSON.parse(asar.extractFile(filename,"package.json").toString()).version !== version) throw new Error("Cannot resume a different version");
  }
}
for (const [index, target] of [["--mac", "dmg", "--arm64"], ["--win", "msi", "--x64"]].entries()) {
  if (resume && existsSync(path.join(work, installers[index])) && statSync(path.join(work, installers[index])).size > 0) {
    console.log(`Preserving completed installer: ${installers[index]}`);
    continue;
  }
  const prepackaged = index === 1 && resume && existsSync(path.join(work, "win-unpacked/resources/app.asar"))
    ? [`--prepackaged=${path.join(work, "win-unpacked")}`] : [];
  if (index === 1 && process.platform === "darwin" && process.env.STOA_DISTRIBUTION_BUILD !== "1") {
    // Native MSI authoring avoids 32-bit WiX and broken Wine prefixes on modern
    // macOS. All actual application files still come from electron-builder.
    if (!prepackaged.length) execFileSync(builder, ["--config=desktop/electron-builder.config.cjs", `--config.directories.output=${work}`, "--win", "dir", "--x64", "--publish=never"], { cwd: root, stdio: "inherit" });
    execFileSync(process.execPath, [path.join(root,"desktop/build-msi-native.mjs"), work], { cwd: root, stdio: "inherit" });
    continue;
  }
  execFileSync(builder, ["--config=desktop/electron-builder.config.cjs", `--config.directories.output=${work}`, ...target, ...prepackaged, "--publish=never"], { cwd: root, stdio: "inherit" });
}
const application = path.join(work, "mac-arm64", "STOA.app");
const arch = execFileSync("/usr/bin/lipo", ["-archs", path.join(application, "Contents/MacOS/STOA")], { encoding: "utf8" }).trim();
if (arch !== "arm64") throw new Error(`Unexpected macOS architecture: ${arch}`);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", application], { stdio: "inherit" });
const executable = readFileSync(path.join(work, "win-unpacked/STOA.exe"));
const pe = executable.readUInt32LE(0x3c);
if (executable.toString("ascii", pe, pe + 4) !== "PE\0\0" || executable.readUInt16LE(pe + 4) !== 0x8664) throw new Error("Windows executable is not x64");
for (const locale of ["en-US", "zh-CN", "zh-TW", "ja"]) {
  if (!existsSync(path.join(work, "win-unpacked/locales", `${locale}.pak`))) throw new Error(`Missing Windows locale: ${locale}`);
}
for (const name of installers) {
  if (!existsSync(path.join(work, name)) || statSync(path.join(work, name)).size === 0) throw new Error(`Missing installer: ${name}`);
}
const msi = readFileSync(path.join(work, "STOA-Windows-x64.msi"));
if (msi.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") throw new Error("MSI is not a Windows Installer compound document");
mkdirSync(path.dirname(output), { recursive: true });
const staging = mkdtempSync(path.join(path.dirname(output), ".stoa-installers-"));
for (const name of installers) copyFileSync(path.join(work, name), path.join(staging, name));
if (readdirSync(staging).sort().join() !== installers.sort().join()) throw new Error("Unexpected release contents");
renameSync(staging, output);
console.log(`Exactly two installers ready: ${output}`);
console.log(`QA intermediates (not release artifacts): ${work}`);
