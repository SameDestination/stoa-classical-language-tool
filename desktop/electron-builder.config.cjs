"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const rootPackage = require("../package.json");
const desktopPackage = require("./package.json");
const installedElectron = require("../node_modules/electron/package.json");

if (rootPackage.version !== desktopPackage.version) {
  throw new Error(
    `STOA package versions differ (root ${rootPackage.version}, desktop ${desktopPackage.version}).`,
  );
}

const stoaVersion = rootPackage.version;
const distributionBuild = process.env.STOA_DISTRIBUTION_BUILD === "1";

/**
 * Production desktop packaging is intentionally isolated here. The Electron
 * shell packages desktop/dist, which is built from the same renderer used by
 * the local web edition. Signing, notarization, licensing, and update metadata
 * can be added here later without leaking platform code into STOA components.
 */
module.exports = {
  appId: "studio.stoa.interlinear",
  productName: "STOA",
  copyright: "Copyright © STOA",
  asar: true,
  compression: "maximum",
  npmRebuild: false,
  toolsets: { wine: "1.0.1" },
  // macOS uses underscore/lproj names; Windows uses hyphenated PAK names.
  electronLanguages: ["en", "en-US", "en-GB", "zh_CN", "zh_TW", "zh-CN", "zh-TW", "ja"],
  // electron-builder must resolve a framework for each requested architecture.
  // Pointing at the host's unpacked Electron.app would silently put an arm64
  // executable in an artifact named x64 (or vice versa).
  electronVersion: installedElectron.version,
  directories: {
    app: "desktop",
    output: `outputs/STOA-Desktop-${stoaVersion}`,
    buildResources: "desktop/build",
  },
  files: [
    "main.mjs",
    "preload.cjs",
    "dist/**/*",
    "package.json",
    "!node_modules{,/**/*}",
  ],
  afterPack: "desktop/after-pack.mjs",
  extraMetadata: {
    version: stoaVersion,
    main: "main.mjs",
  },
  fileAssociations: [
    {
      ext: "stoa",
      name: "STOA Project",
      description: "STOA interlinear project",
      role: "Editor",
      rank: "Owner",
    },
  ],
  mac: {
    category: "public.app-category.education",
    icon: "desktop/build/icon-1024.png",
    // Local QA builds are ad-hoc signed by after-pack.mjs. Set
    // STOA_DISTRIBUTION_BUILD=1 with the normal electron-builder Apple signing
    // and notarization credentials for a Developer ID distribution build.
    identity: distributionBuild ? undefined : null,
    forceCodeSigning: distributionBuild,
    notarize: distributionBuild,
    hardenedRuntime: true,
    // Electron 44 and later need macOS 13.
    minimumSystemVersion: "13.0.0",
    artifactName: "STOA-macOS-arm64.dmg",
    target: [
      { target: "dmg", arch: ["arm64"] },
    ],
  },
  dmg: {
    title: `STOA ${stoaVersion}`,
    artifactName: "STOA-macOS-arm64.dmg",
    backgroundColor: "#e8e7e1",
    window: { width: 540, height: 380 },
    contents: [
      { x: 140, y: 190 },
      { x: 400, y: 190, type: "link", path: "/Applications" },
    ],
  },
  win: {
    target: [{ target: "msi", arch: ["x64"] }],
    icon: "desktop/build/icon-1024.png",
    artifactName: "STOA-Windows-x64.msi",
    // Future release builds must fail rather than silently ship unsigned.
    forceCodeSigning: distributionBuild,
  },
  msi: {
    artifactName: "STOA-Windows-x64.msi",
    perMachine: false,
    oneClick: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    // Keep this stable across versions so MSI upgrades replace STOA correctly.
    upgradeCode: "5DAC6A68-D808-4E95-923C-75393464B06A",
  },
};
