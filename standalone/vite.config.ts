import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

const mdictReadChunk = fileURLToPath(new URL("../app/lib/mdict-read-chunk-browser.ts", import.meta.url));
const mdictAssert = fileURLToPath(new URL("../app/lib/mdict-assert-browser.ts", import.meta.url));
const mdictBaseBrowser = fileURLToPath(new URL("../app/lib/vendor/mdict-base-browser.cjs", import.meta.url));
const mdictLzo = fileURLToPath(new URL("../app/lib/mdict-lzo-browser.ts", import.meta.url));
const mdictUtil = fileURLToPath(new URL("../app/lib/mdict-util-browser.ts", import.meta.url));

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

export default defineConfig({
  base: "./",
  publicDir: "../public",
  plugins: [mdictBrowserCompat, react(), viteSingleFile()],
  resolve: {
    alias: [
      { find: /^mdict-js\/lib\/mdict-base\.js$/u, replacement: mdictBaseBrowser },
      { find: /^read-chunk$/u, replacement: mdictReadChunk },
      { find: /^assert$/u, replacement: mdictAssert },
      { find: /^util$/u, replacement: mdictUtil },
    ],
  },
  build: {
    outDir: "../outputs/STOA-Portable",
    emptyOutDir: true,
    cssCodeSplit: false,
    // Runtime fonts, dictionaries, and the PDF.js worker stay as one external
    // copy. The single-file plugin is used only for the app code and CSS.
    assetsInlineLimit: 0,
  },
});
