import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

const mdictReadChunk = fileURLToPath(new URL("../app/lib/mdict-read-chunk-browser.ts", import.meta.url));
const mdictAssert = fileURLToPath(new URL("../app/lib/mdict-assert-browser.ts", import.meta.url));
const mdictBaseBrowser = fileURLToPath(new URL("../app/lib/vendor/mdict-base-browser.cjs", import.meta.url));
const mdictLzo = fileURLToPath(new URL("../app/lib/mdict-lzo-browser.ts", import.meta.url));
const mdictUtil = fileURLToPath(new URL("../app/lib/mdict-util-browser.ts", import.meta.url));
const desktopOutput = fileURLToPath(new URL("./dist", import.meta.url));

const desktopContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data: blob:",
  "form-action 'none'",
  "frame-src 'self' data: blob:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const desktopSecurityPolicy = {
  name: "stoa-desktop-content-security-policy",
  transformIndexHtml() {
    return [{
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: desktopContentSecurityPolicy,
      },
      injectTo: "head-prepend" as const,
    }];
  },
};

const mdictBrowserCompat = {
  name: "stoa-mdict-browser-compat",
  enforce: "pre" as const,
  resolveId(source: string, importer?: string) {
    const normalizedImporter = importer?.replaceAll("\\", "/") ?? "";
    if (/(?:^|\/)lzo-wrapper(?:\.js)?$/u.test(source)
      && normalizedImporter.includes("/node_modules/mdict-js/lib/mdict-base.js")) {
      return mdictLzo;
    }
    return null;
  },
  load(id: string) {
    const normalizedId = id.replaceAll("\\", "/").split("?", 1)[0];
    if (!normalizedId.endsWith("/node_modules/mdict-js/lib/lzo-wrapper.js")) return null;
    return `export { default, decompress } from ${JSON.stringify(mdictLzo)};`;
  },
};

const removeWebsiteOnlyDesktopAssets = {
  name: "stoa-desktop-runtime-assets",
  async closeBundle() {
    await Promise.all([
      "dictionaries",
      "og.png",
      "favicon.svg",
      "file.svg",
      "globe.svg",
      "window.svg",
    ].map((entry) => rm(`${desktopOutput}/${entry}`, { recursive: true, force: true })));
  },
};

export default defineConfig({
  base: "./",
  publicDir: "../public",
  // Desktop does not need the portable edition's single-file transform. Keep
  // scripts as local packaged assets so the renderer can use a strict CSP
  // without permitting inline JavaScript.
  plugins: [
    mdictBrowserCompat,
    react(),
    desktopSecurityPolicy,
    removeWebsiteOnlyDesktopAssets,
  ],
  resolve: {
    alias: [
      { find: /^mdict-js\/lib\/mdict-base\.js$/u, replacement: mdictBaseBrowser },
      { find: /^read-chunk$/u, replacement: mdictReadChunk },
      { find: /^assert$/u, replacement: mdictAssert },
      { find: /^util$/u, replacement: mdictUtil },
    ],
  },
  build: {
    outDir: "../desktop/dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
  },
});
