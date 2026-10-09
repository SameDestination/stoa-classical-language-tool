import assert from "node:assert/strict";
import test from "node:test";

import {
  analysisNoteDestination,
  deleteAnalysisNote,
  insertAnalysisNote,
  moveAnalysisNote,
  numberAnalysisNotes,
  normalizeAnalysisNotes,
  tokenNoteDestination,
} from "../app/lib/analysis-notes";

test("legacy string notes migrate without guessing a token anchor", () => {
  assert.deepEqual(normalizeAnalysisNotes(["First.", "Second."], ["tok-1"]), [
    { id: "note-0001", tokenId: null, text: "First." },
    { id: "note-0002", tokenId: null, text: "Second." },
  ]);
});

test("blank imported notes are discarded before IDs and publication numbers are assigned", () => {
  const normalized = normalizeAnalysisNotes([
    "First.",
    "  ",
    { text: "Second." },
    { id: "blank-with-id", tokenId: "tok-1", text: "\n" },
    { id: "third", tokenId: "tok-1", text: " Third. " },
  ], ["tok-1"]);

  assert.deepEqual(normalized, [
    { id: "note-0001", tokenId: null, text: "First." },
    { id: "note-0002", tokenId: null, text: "Second." },
    { id: "third", tokenId: "tok-1", text: "Third." },
  ]);
  assert.deepEqual(numberAnalysisNotes(normalized).map((note) => [note.number, note.id]), [
    [1, "note-0001"],
    [2, "note-0002"],
    [3, "third"],
  ]);
});

test("publication numbering defensively ignores transient blank note records", () => {
  assert.deepEqual(numberAnalysisNotes([
    { id: "one", tokenId: "tok-1", text: " One. " },
    { id: "blank", tokenId: "tok-1", text: "\t" },
    { id: "two", tokenId: "tok-1", text: "Two." },
  ]), [
    { id: "one", tokenId: "tok-1", text: "One.", number: 1 },
    { id: "two", tokenId: "tok-1", text: "Two.", number: 2 },
  ]);
});

test("anchored notes retain stable IDs while insertion, movement and deletion renumber by order", () => {
  const initial = normalizeAnalysisNotes([
    { id: "alpha", tokenId: "tok-1", text: "Alpha." },
    { id: "beta", tokenId: "tok-2", text: "Beta." },
    { id: "gamma", tokenId: "tok-3", text: "Gamma." },
  ], ["tok-1", "tok-2", "tok-3"]);

  const inserted = insertAnalysisNote(initial, {
    id: "inserted",
    tokenId: "tok-2",
    text: "Inserted.",
  }, 2);
  assert.deepEqual(inserted.map((note) => note.id), ["alpha", "inserted", "beta", "gamma"]);

  const moved = moveAnalysisNote(inserted, "gamma", 2);
  assert.deepEqual(moved.map((note) => note.id), ["alpha", "gamma", "inserted", "beta"]);

  const deleted = deleteAnalysisNote(moved, "inserted");
  assert.deepEqual(deleted.map((note) => note.id), ["alpha", "gamma", "beta"]);
  assert.deepEqual(deleted.map((note, index) => [index + 1, note.id]), [
    [1, "alpha"],
    [2, "gamma"],
    [3, "beta"],
  ]);
});

test("invalid imported anchors preserve prose as unanchored notes", () => {
  assert.deepEqual(normalizeAnalysisNotes([
    { id: "note-a", tokenId: "missing", text: "Do not lose this note." },
  ], ["tok-1"]), [
    { id: "note-a", tokenId: null, text: "Do not lose this note." },
  ]);
});

test("note destinations are deterministic, collision-safe, and export-safe for arbitrary Unicode IDs", () => {
  const ids = [
    "a b",
    "a-b",
    "é",
    "e\u0301",
    "汉字",
    "\u{1D504}",
    "",
    "\u0000",
    "\uD800",
    "\uD801",
  ];
  const tokenDestinations = ids.map(tokenNoteDestination);
  const noteDestinations = ids.map(analysisNoteDestination);

  assert.equal(new Set(tokenDestinations).size, ids.length);
  assert.equal(new Set(noteDestinations).size, ids.length);
  assert.equal(tokenNoteDestination("a b"), tokenNoteDestination("a b"));
  assert.notEqual(tokenNoteDestination("a b"), tokenNoteDestination("a-b"));
  assert.notEqual(tokenNoteDestination("é"), tokenNoteDestination("e\u0301"));
  for (const destination of [...tokenDestinations, ...noteDestinations]) {
    assert.match(destination, /^stoa-(?:token-note|analysis-note)-u[0-9a-f]*$/u);
  }
});
