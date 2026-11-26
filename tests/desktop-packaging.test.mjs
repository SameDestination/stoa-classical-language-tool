import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const config = require("../desktop/electron-builder.config.cjs");

test("desktop uses version 6.0.0 and the single shared renderer", async () => {
  assert.equal(require("../desktop/package.json").version, require("../package.json").version);
  const vite = await readFile(new URL("../desktop/vite.config.ts", import.meta.url), "utf8");
  const entry = await readFile(new URL("../standalone/main.tsx", import.meta.url), "utf8");
  assert.match(vite, /desktop\/dist|\.\.\/desktop\/dist/u);
  assert.match(entry, /app\/stoa-studio/u);
  assert.deepEqual(config.files, ["main.mjs", "preload.cjs", "dist/**/*", "package.json", "!node_modules{,/**/*}"]);
  for (const locale of ["en-US", "zh-CN", "zh-TW", "ja"]) assert.ok(config.electronLanguages.includes(locale));
});

test("only the requested MSI x64 and DMG arm64 are release targets", () => {
  assert.deepEqual(config.win.target, [{ target: "msi", arch: ["x64"] }]);
  assert.deepEqual(config.mac.target, [{ target: "dmg", arch: ["arm64"] }]);
  assert.equal(config.msi.artifactName, "STOA-Windows-x64.msi");
  assert.equal(config.dmg.artifactName, "STOA-macOS-arm64.dmg");
  assert.equal(config.appId, "studio.stoa.interlinear");
  assert.equal(config.msi.upgradeCode, "5DAC6A68-D808-4E95-923C-75393464B06A");
  assert.equal(config.mac.hardenedRuntime, true);
  assert.deepEqual(config.fileAssociations.map((entry) => entry.ext), ["stoa"]);
});
