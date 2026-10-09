import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { lzo1xCompress } from "lzo1x";
import { decompress as decompressMdictLzo } from "../app/lib/mdict-lzo-browser.ts";
import {
  buildDictionarySrcDoc,
  buildDictionaryLookupCandidates,
  buildLatinDictionaryLookupCandidates,
  dictionaryBucketForKey,
  foldDictionaryKey,
  normalizeDictionaryKey,
  sanitizeDictionaryHtml,
  stripLatinMacrons,
} from "../app/lib/dictionary-runtime.ts";

const root = path.resolve(import.meta.dirname, "..");

const exists = async (filename) => {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
};

test("dictionary key normalization supports Greek folding and narrow Latin macron fallback", () => {
  assert.equal(normalizeDictionaryKey("  ΛΌΓΟΣ  "), "λόγος");
  assert.equal(normalizeDictionaryKey("λόγος"), "λόγος");
  assert.equal(foldDictionaryKey("λόγος"), "λογοσ");
  assert.equal(foldDictionaryKey("amō"), "amo");
  assert.equal(dictionaryBucketForKey("λόγος"), "u03bb");
  assert.equal(dictionaryBucketForKey("amō"), "u0061");
  assert.equal(dictionaryBucketForKey(""), "misc");

  assert.equal(stripLatinMacrons("ā ē ī ō ū ȳ Ā Ē Ī Ō Ū Ȳ"), "a e i o u y A E I O U Y");
  assert.equal(stripLatinMacrons("ă ĕ ĭ ŏ ŭ æ œ ë ï á"), "ă ĕ ĭ ŏ ŭ æ œ ë ï á");
  assert.deepEqual(buildLatinDictionaryLookupCandidates("mīror"), ["mīror", "miror"]);
  assert.deepEqual(buildLatinDictionaryLookupCandidates("mo\u0304ns"), ["mo\u0304ns", "mōns", "mons"]);
  assert.deepEqual(buildDictionaryLookupCandidates("latin", "mīror"), ["mīror", "miror"]);
  assert.deepEqual(buildDictionaryLookupCandidates("ancient-greek", "λόγος"), ["λόγος", "λογοσ"]);
});

test("the browser MDict LZO adapter uses the clean-room implementation", () => {
  const original = new TextEncoder().encode("λόγος · ratio · 道 ".repeat(64));
  const compressed = lzo1xCompress(original);
  assert.deepEqual(decompressMdictLzo(compressed, original.byteLength), original);
});

test("dictionary sanitizer preserves lexical markup but removes active content", () => {
  const dirty = `
    <dictionary id="LiddellScott1940">
      <link rel="stylesheet" href="remote.css">
      <headword onclick="alert(1)" style="font-size: 130%; display: block">λόγος</headword>
      <sense level="1"><a href="https://example.test" tabindex="0">word</a></sense>
      <entryFree srcdoc="<script>alert(2)</script>">definition</entryFree>
      <script>globalThis.compromised = true</script>
      <iframe src="https://example.test"></iframe>
    </dictionary>`;
  const clean = sanitizeDictionaryHtml(dirty);

  assert.match(clean, /<dictionary id="LiddellScott1940">/u);
  assert.match(clean, /<headword style="font-size: 130%; display: block">λόγος<\/headword>/u);
  assert.match(clean, /<sense level="1"><a>word<\/a><\/sense>/u);
  assert.match(clean, /<entryfree>definition<\/entryfree>/iu);
  assert.doesNotMatch(clean, /onclick|srcdoc|tabindex|https:\/\/|<script|<iframe|<link/iu);
  assert.doesNotMatch(clean, /compromised/u);
});

test("dictionary iframe preserves source CSS in an isolated selectable document", () => {
  const source = buildDictionarySrcDoc({
    title: "Imported lexicon <entry>",
    documentLanguage: "zh-Hant",
    styleCss: "dictionary sense { display: block; }",
    entries: [{
      key: "道\"",
      html: '<dictionary><headword onmouseover="bad()">道</headword></dictionary>',
    }],
  });

  assert.match(source, /^<!doctype html>/u);
  assert.match(source, /<html lang="zh-Hant">/u);
  assert.match(source, /default-src 'none'/u);
  assert.match(source, /font-src data:/u);
  assert.match(source, /dictionary sense \{ display: block; \}/u);
  assert.match(source, /user-select: text !important/u);
  assert.match(source, /data-entry-key="道&quot;"/u);
  assert.match(source, /<headword>道<\/headword>/u);
  assert.doesNotMatch(source, /onmouseover/u);
});

test("dictionary import is device-local for the three classical workspaces and absent from OMNI", async () => {
  const [studio, popover, library, worker, standalone, desktop, web, browserBase, browserLicense] = await Promise.all([
    readFile(path.join(root, "app/stoa-studio.tsx"), "utf8"),
    readFile(path.join(root, "app/dictionary-popover.tsx"), "utf8"),
    readFile(path.join(root, "app/lib/user-dictionaries.ts"), "utf8"),
    readFile(path.join(root, "app/lib/mdict-worker.ts"), "utf8"),
    readFile(path.join(root, "standalone/vite.config.ts"), "utf8"),
    readFile(path.join(root, "desktop/vite.config.ts"), "utf8"),
    readFile(path.join(root, "vite.config.ts"), "utf8"),
    readFile(path.join(root, "app/lib/vendor/mdict-base-browser.cjs"), "utf8"),
    readFile(path.join(root, "app/lib/vendor/MDICT-JS-LICENSE.txt"), "utf8"),
  ]);

  assert.match(studio, /supportsUserDictionary = isStoaLanguageId\(language\)/u);
  assert.match(studio, /accept="\.mdx,\.mdd"/u);
  assert.match(studio, /OMNI intentionally has no dictionary library/u);
  assert.match(studio, /dictionaryLookupEnabled/u);
  assert.match(popover, /lookupUserDictionaryLemma/u);
  assert.doesNotMatch(popover, /lookupDictionaryLemma/u);
  assert.match(library, /stoa-user-dictionary-library/u);
  assert.match(library, /indexedDB\.open/u);
  assert.match(library, /\["ancient-greek", "latin", "classical-chinese"\]/u);
  assert.match(library, /@@@LINK=/u);
  assert.match(worker, /import\("mdict-js\/lib\/mdict-base\.js"\)/u);
  assert.match(worker, /Reading MDX headwords/u);
  for (const config of [standalone, desktop, web]) {
    assert.match(config, /stoa-mdict-browser-compat/u);
    assert.match(config, /mdict-base-browser\.cjs/u);
    assert.match(config, /mdict-lzo-browser\.ts/u);
    assert.match(config, /find: \/\^read-chunk\$\//u);
    assert.match(config, /find: \/\^util\$\//u);
  }
  assert.match(browserBase, /derived from mdict-js 10\.0\.1 \(MIT\)/u);
  assert.match(browserBase, /require\("\.\.\/mdict-lzo-browser"\)/u);
  assert.doesNotMatch(browserBase, /require\("\.\/lzo-wrapper"\)/u);
  assert.doesNotMatch(browserBase, /require\("fs"\)/u);
  assert.match(browserLicense, /MIT License/u);
});

test("the former bundled LSJ and OLD trees are absent", async () => {
  assert.equal(await exists(path.join(root, "public/dictionaries/stoa-lexica-v1/lsj")), false);
  assert.equal(await exists(path.join(root, "public/dictionaries/stoa-lexica-v1/old")), false);
});

test("generated browser bundle excludes the legacy GPL-backed LZO path when present", async (context) => {
  const indexPath = path.join(root, "outputs/STOA-Portable/index.html");
  if (!await exists(indexPath)) {
    context.skip("portable browser bundle is not present");
    return;
  }
  const bundle = await readFile(indexPath, "utf8");
  assert.doesNotMatch(bundle, /skipToFirstLiteralFun|INPUT_OVERRUN/u);
  assert.match(bundle, /lzo1x: unexpected end of input/u);
  assert.doesNotMatch(bundle, /stoa-lexica-v1|Oxford Latin Dictionary|Liddell & Scott/u);
});
