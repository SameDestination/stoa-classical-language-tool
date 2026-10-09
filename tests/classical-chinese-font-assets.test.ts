import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { CLASSICAL_CHINESE_BUILTIN_FONTS } from "../app/lib/classical-chinese-fonts.ts";

const publicAssetUrl = (assetPath: string) =>
  new URL(`../public${assetPath}`, import.meta.url);

test("all six Classical Chinese families ship valid OpenType assets and declared faces", async () => {
  assert.equal(CLASSICAL_CHINESE_BUILTIN_FONTS.length, 6);
  const filenames = new Set<string>();
  for (const font of CLASSICAL_CHINESE_BUILTIN_FONTS) {
    assert.ok(font.faces.normal, `${font.label} must have an upright face`);
    for (const assetPath of Object.values(font.faces)) {
      const url = publicAssetUrl(assetPath);
      const info = await stat(url);
      const header = await readFile(url).then((bytes) => bytes.subarray(0, 4).toString("ascii"));
      assert.equal(header, "OTTO", `${assetPath} must be OpenType/CFF`);
      assert.ok(info.size > 1_000_000, `${assetPath} appears truncated`);
      assert.equal(filenames.has(assetPath), false, `${assetPath} is declared twice`);
      filenames.add(assetPath);
    }
  }
  assert.equal(filenames.size, 8, "six families should include the two real Fandol bold faces");
});

test("redistribution notices for Source Han Serif and Fandol ship with the app", async () => {
  const sourceHanLicense = await readFile(
    new URL("../public/fonts/classical-chinese/OFL-SourceHanSerif.txt", import.meta.url),
    "utf8",
  );
  const fandolLicense = await readFile(
    new URL("../public/fonts/classical-chinese/GPL-Fandol-with-font-exception.txt", import.meta.url),
    "utf8",
  );
  const fandolReadme = await readFile(
    new URL("../public/fonts/classical-chinese/README-Fandol.txt", import.meta.url),
    "utf8",
  );
  assert.match(sourceHanLicense, /SIL OPEN FONT LICENSE Version 1\.1/u);
  assert.match(fandolLicense, /GNU GENERAL PUBLIC LICENSE/u);
  assert.match(fandolLicense, /embed this font or unaltered portions of this font into the document/u);
  assert.match(fandolLicense, /does not by itself cause the resulting document to be covered/u);
  assert.match(fandolReadme, /four\s+styles: Song, Hei, Kai, Fang/u);
  assert.match(fandolReadme, /All the fonts are OpenType/u);
});
