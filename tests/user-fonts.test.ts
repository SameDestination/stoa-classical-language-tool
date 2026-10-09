import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  UserFontError,
  missingUserFontReferences,
  parseUserFont,
  userFontOptions,
  userFontReference,
} from "../app/lib/user-fonts.ts";

const arrayBuffer = (buffer: Buffer) => buffer.buffer.slice(
  buffer.byteOffset,
  buffer.byteOffset + buffer.byteLength,
) as ArrayBuffer;

test("valid TTF files receive stable digest IDs and detected names", async () => {
  const bytes = arrayBuffer(await readFile(new URL("../public/fonts/vu3r.ttf", import.meta.url)));
  const first = await parseUserFont("vusillus.ttf", bytes);
  const second = await parseUserFont("renamed.ttf", bytes);
  assert.equal(first.id, second.id);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.format, "ttf");
  assert.ok(first.familyName.length > 0);
  assert.match(first.cssFamily, /^'STOAUser-[0-9a-f]{16}'$/u);
  assert.equal(first.byteLength, bytes.byteLength);
});

test("OTF containers follow the validated SFNT metadata path", async () => {
  // The metadata reader is outline-agnostic; FontFace/jsPDF perform the final
  // CFF-outline validation in the preview/export runtime.
  const ttf = new Uint8Array(arrayBuffer(await readFile(new URL("../public/fonts/vu3r.ttf", import.meta.url))));
  const otfContainer = ttf.slice();
  otfContainer.set(new TextEncoder().encode("OTTO"), 0);
  const record = await parseUserFont("scholarly-serif.otf", otfContainer.buffer);
  assert.equal(record.format, "otf");
  assert.equal(record.filename, "scholarly-serif.otf");
  assert.ok(record.familyName.length > 0);
});

test("invalid, truncated, WOFF and wrong-extension files fail explicitly", async () => {
  await assert.rejects(() => parseUserFont("bad.ttf", new ArrayBuffer(12)), UserFontError);
  const woff = new Uint8Array(64);
  woff.set(new TextEncoder().encode("wOFF"));
  await assert.rejects(
    () => parseUserFont("font.woff", woff.buffer),
    (error: unknown) => error instanceof UserFontError && error.code === "unsupported-format",
  );
  const valid = arrayBuffer(await readFile(new URL("../public/fonts/vu3r.ttf", import.meta.url)));
  await assert.rejects(
    () => parseUserFont("font.exe", valid),
    (error: unknown) => error instanceof UserFontError && error.code === "unsupported-format",
  );
});

test("font references omit bytes, group faces by family, and report missing files", async () => {
  const bytes = arrayBuffer(await readFile(new URL("../public/fonts/vu3r.ttf", import.meta.url)));
  const record = await parseUserFont("vusillus.ttf", bytes);
  const reference = userFontReference(record);
  assert.equal("bytes" in reference, false);
  assert.equal(userFontOptions([reference, { ...reference, id: `${reference.id}-copy` }]).length, 1);
  assert.deepEqual(missingUserFontReferences([reference], [reference]), []);
  assert.deepEqual(missingUserFontReferences([reference], []), [reference]);
});
