import vinext from "vinext";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const mdictReadChunk = fileURLToPath(new URL("./app/lib/mdict-read-chunk-browser.ts", import.meta.url));
const mdictAssert = fileURLToPath(new URL("./app/lib/mdict-assert-browser.ts", import.meta.url));
const mdictBaseBrowser = fileURLToPath(new URL("./app/lib/vendor/mdict-base-browser.cjs", import.meta.url));
const mdictLzo = fileURLToPath(new URL("./app/lib/mdict-lzo-browser.ts", import.meta.url));
const mdictUtil = fileURLToPath(new URL("./app/lib/mdict-util-browser.ts", import.meta.url));

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

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    resolve: {
      alias: [
        { find: /^mdict-js\/lib\/mdict-base\.js$/u, replacement: mdictBaseBrowser },
        { find: /^read-chunk$/u, replacement: mdictReadChunk },
        { find: /^assert$/u, replacement: mdictAssert },
        { find: /^util$/u, replacement: mdictUtil },
      ],
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      mdictBrowserCompat,
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
