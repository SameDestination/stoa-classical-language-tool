import assert from "node:assert/strict";
import test from "node:test";

import {
  STOA_BUILTIN_FONTS,
  findFontByCssFamily,
  fontAvailableInWorkspace,
  mergeFontOptions,
} from "../app/lib/font-registry.ts";
import {
  CLASSICAL_CHINESE_BUILTIN_FONTS,
  CLASSICAL_CHINESE_BUILTIN_FONT_IDS,
  SOURCE_HAN_SERIF_SC_STOA,
} from "../app/lib/classical-chinese-fonts.ts";
import { LANGUAGE_CONFIGS } from "../app/language-config.ts";

test("built-in STOA fonts have stable unique IDs and resolvable CSS families", () => {
  const ids = STOA_BUILTIN_FONTS.map((font) => font.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(STOA_BUILTIN_FONTS.some((font) => font.id === "bundled:vusillus"));
  assert.ok(STOA_BUILTIN_FONTS.some((font) => font.id === "system:inter"));
  assert.ok(STOA_BUILTIN_FONTS.some((font) => font.id === "system:arial"));
  assert.ok(STOA_BUILTIN_FONTS.some((font) => font.id === "system:arial-unicode"));
  for (const font of STOA_BUILTIN_FONTS) {
    assert.equal(findFontByCssFamily(font.cssFamily)?.id, font.id);
  }
});

test("the six bundled Chinese families are exclusive to the Classical Chinese workspace", () => {
  assert.equal(CLASSICAL_CHINESE_BUILTIN_FONTS.length, 6);
  assert.equal(CLASSICAL_CHINESE_BUILTIN_FONT_IDS.length, 6);
  assert.equal(new Set(CLASSICAL_CHINESE_BUILTIN_FONT_IDS).size, 6);
  for (const definition of CLASSICAL_CHINESE_BUILTIN_FONTS) {
    const option = STOA_BUILTIN_FONTS.find((font) => font.id === definition.id);
    assert.ok(option, `missing registry option ${definition.id}`);
    assert.equal(option.cssFamily, definition.cssFamily);
    assert.equal(fontAvailableInWorkspace(option, "classical-chinese"), true);
    assert.equal(fontAvailableInWorkspace(option, "ancient-greek"), false);
    assert.equal(fontAvailableInWorkspace(option, "latin"), false);
    assert.equal(fontAvailableInWorkspace(option, "omni"), false);
  }
  assert.equal(LANGUAGE_CONFIGS["classical-chinese"].fonts.source, SOURCE_HAN_SERIF_SC_STOA);
  assert.equal(LANGUAGE_CONFIGS["ancient-greek"].fonts.source === SOURCE_HAN_SERIF_SC_STOA, false);
  assert.equal(LANGUAGE_CONFIGS.latin.fonts.source === SOURCE_HAN_SERIF_SC_STOA, false);
});

test("future user fonts merge by stable ID without duplicating built-ins", () => {
  const merged = mergeFontOptions([
    {
      id: "user:abc123",
      label: "My Scholarly Serif",
      cssFamily: "'STOA User abc123', serif",
      source: "user",
      scripts: ["greek", "latin"],
    },
    {
      ...STOA_BUILTIN_FONTS[0],
      label: "Vusillus bundled override",
    },
  ]);
  assert.equal(merged.filter((font) => font.id === "bundled:vusillus").length, 1);
  assert.equal(merged.find((font) => font.id === "user:abc123")?.source, "user");
});
