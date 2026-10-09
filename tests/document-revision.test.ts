import assert from "node:assert/strict";
import test from "node:test";
import { createDeveloperDefaultProject } from "../app/developer-defaults/index.ts";
import { documentRevision } from "../app/lib/document-revision.ts";

test("document revision ignores export time and current token selection", () => {
  const first = createDeveloperDefaultProject("latin");
  const second = createDeveloperDefaultProject("latin");
  first.project.exportedAt = "2026-01-01T00:00:00.000Z";
  second.project.exportedAt = "2030-01-01T00:00:00.000Z";
  first.project.document.selectedTokenId = first.project.document.analysis.tokens[0]?.id ?? null;
  second.project.document.selectedTokenId = null;
  assert.equal(documentRevision(first), documentRevision(second));
});

test("document revision changes for content and layout edits and returns after undo", () => {
  const project = createDeveloperDefaultProject("classical-chinese");
  const saved = documentRevision(project);
  const originalSurface = project.project.document.analysis.tokens[0]?.surface ?? "";
  if (!project.project.document.analysis.tokens[0]) throw new Error("Sample token missing.");
  project.project.document.analysis.tokens[0].surface = `${originalSurface}改`;
  assert.notEqual(documentRevision(project), saved);
  project.project.document.analysis.tokens[0].surface = originalSurface;
  assert.equal(documentRevision(project), saved);
  project.project.document.settings.paperWidthMm = 420;
  assert.notEqual(documentRevision(project), saved);
});

