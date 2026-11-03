import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync as unzipGzip } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");

const exists = async (filename) => {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
};

const directorySize = async (directory) => {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    total += entry.isDirectory() ? await directorySize(filename) : (await stat(filename)).size;
  }
  return total;
};

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("portable source keeps heavyweight runtime assets external", async () => {
  const [page, css, config, packageJson] = await Promise.all([
    readFile(path.join(root, "app/stoa-studio.tsx"), "utf8"),
    readFile(path.join(root, "app/globals.css"), "utf8"),
    readFile(path.join(root, "standalone/vite.config.ts"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
  ]);
  assert.doesNotMatch(page, /\.ttf\?url|\.otf\?url|\.txt\?url/u);
  assert.doesNotMatch(page, /pdf\.worker\.min\.mjs\?url/u);
  assert.match(page, /const notoSerifRegularFontUrl = "fonts\/NotoSerif-Regular\.ttf"/u);
  assert.doesNotMatch(page, /vu3r|Vusillus/iu);
  assert.match(page, /"vendor\/pdf\.worker\.min\.mjs"/u);
  assert.match(page, /unicodePdfFontsBase64Promise = null/u);
  assert.match(page, /classicalChineseFontBase64Promises\.delete\(url\)/u);
  assert.match(css, /url\("\/fonts\/NotoSerif-Regular\.ttf"\)/u);
  assert.doesNotMatch(css, /vu3r|Vusillus/iu);
  assert.match(config, /assetsInlineLimit:\s*0/u);
  assert.match(packageJson, /node scripts\/optimize-portable\.mjs/u);
});

test("portable optimizer excludes bundled dictionaries and retains lossless gzip assets", async () => {
  const [optimizer, server, packageJson, portableReadme] = await Promise.all([
    readFile(path.join(root, "scripts/optimize-portable.mjs"), "utf8"),
    readFile(path.join(root, "standalone/portable/serve_stoa.py"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "standalone/portable/README-使用说明.txt"), "utf8"),
  ]);
  assert.doesNotMatch(optimizer, /stoa-lexica-binary-gzip|optimizeDictionary|manifest\.json\.gz/u);
  assert.match(optimizer, /rm\(path\.join\(outputRoot, "dictionaries"\), \{ force: true, recursive: true \}\)/u);
  assert.match(optimizer, /rm\(path\.join\(outputRoot, "trial-app"\), \{ force: true, recursive: true \}\)/u);
  assert.match(optimizer, /\["og\.png", "favicon\.svg"\]/u);
  assert.match(optimizer, /rm\(path\.join\(outputRoot, websiteOnlyAsset\), \{ force: true \}\)/u);
  assert.match(optimizer, /"stoa-omni\.stoa\.json"/u);
  assert.match(optimizer, /\(\?:ttf\|otf\|mjs\)/u);
  assert.match(optimizer, /totalBytes > 95_000_000/u);
  assert.match(optimizer, /filename\.endsWith\("\.bat"\)/u);
  assert.match(optimizer, /script\.replace\(\/\\r\?\\n\/gu, "\\r\\n"\)/u);
  assert.doesNotMatch(packageJson, /build:dictionaries/u);
  assert.equal(await exists(path.join(root, "scripts/build-dictionary-pack.mjs")), false);
  assert.match(portableReadme, /LSJ、OLD 等词典不再随程序附带/u);
  assert.match(portableReadme, /OMNI 四份官方样本/u);
  assert.match(server, /HOST = "127\.0\.0\.1"/u);
  assert.match(server, /Content-Encoding", "gzip"/u);
  assert.match(server, /"\.mjs": "application\/javascript; charset=utf-8"/u);
  assert.match(server, /"\.ttf": "font\/ttf"/u);
  assert.match(server, /"\.otf": "font\/otf"/u);
  assert.match(server, /compressed_path = Path\(f"\{requested_path\}\.gz"\)/u);
  assert.match(server, /ThreadingHTTPServer\(\(HOST, 0\)/u);
  assert.match(server, /Port \{PREFERRED_PORT\} was busy/u);
  assert.match(server, /LAUNCH_QUERY_PARAMETER = "stoa-launch"/u);
  assert.match(server, /token_hex\(16\)/u);
});

test("generated slim folder meets size and byte-integrity gates when present", async (context) => {
  const buildOutput = path.join(root, "outputs/STOA-Portable");
  const releaseOutput = path.join(root, "outputs/STOA-5.1-Final-Samples-Portable");
  const output = await exists(path.join(buildOutput, "index.html")) ? buildOutput : releaseOutput;
  if (!await exists(path.join(output, "index.html"))) {
    context.skip("portable build output is not present");
    return;
  }

  const index = await readFile(path.join(output, "index.html"), "utf8");
  assert.ok(Buffer.byteLength(index) < 6_000_000);
  assert.doesNotMatch(index, /data:font\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]{1000}/iu);
  assert.ok(await directorySize(output) < 95_000_000);

  const fontPairs = [
    ["fonts/NotoSerif-Regular.ttf", "fonts/NotoSerif-Regular.ttf.gz"],
    ["fonts/classical-chinese/SourceHanSerifSC-Regular.otf", "fonts/classical-chinese/SourceHanSerifSC-Regular.otf.gz"],
    ["vendor/pdf.worker.min.mjs", "vendor/pdf.worker.min.mjs.gz"],
  ];
  for (const [sourceRelative, compressedRelative] of fontPairs) {
    assert.equal(await exists(path.join(output, sourceRelative)), false);
    const [source, compressed] = await Promise.all([
      readFile(path.join(root, "public", sourceRelative.replace(/^vendor\//u, "vendor/"))),
      readFile(path.join(output, compressedRelative)),
    ]);
    assert.equal(digest(unzipGzip(compressed)), digest(source));
  }
  assert.equal(await exists(path.join(output, "fonts/vu3r.ttf")), false);
  assert.equal(await exists(path.join(output, "fonts/vu3r.ttf.gz")), false);

  assert.equal(await exists(path.join(output, "dictionaries")), false);
  assert.equal(await exists(path.join(output, "trial-app")), false);
  assert.equal(await exists(path.join(output, "og.png")), false);
  assert.equal(await exists(path.join(output, "favicon.svg")), false);

  for (const filename of [
    "stoa-ancient-greek.stoa.json",
    "stoa-latin.stoa.json",
    "stoa-classical-chinese.stoa.json",
    "stoa-omni.stoa.json",
  ]) {
    const [source, copied] = await Promise.all([
      readFile(path.join(root, "app/developer-defaults/samples", filename)),
      readFile(path.join(output, "official-samples", filename)),
    ]);
    assert.equal(digest(copied), digest(source));
  }
});
