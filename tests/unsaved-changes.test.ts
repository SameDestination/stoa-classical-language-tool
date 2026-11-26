import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  confirmLeavingPage,
  createSavedRevisionTracker,
} from "../app/lib/unsaved-changes.ts";

type Workspace = "greek" | "latin";

const documents = (initial: Record<Workspace, string>) => {
  const current = { ...initial };
  return { current, revisionFor: (workspace: Workspace) => current[workspace] };
};

test("a workspace is unsaved only after it changes from its first revision", () => {
  const tracker = createSavedRevisionTracker<Workspace>();
  const docs = documents({ greek: "sample", latin: "sample" });
  tracker.observe("greek", () => docs.current.greek);
  assert.equal(tracker.hasUnsavedChanges(docs.revisionFor), false);

  docs.current.greek = "edited";
  tracker.observe("greek", () => docs.current.greek);
  assert.equal(tracker.isDirty("greek", () => docs.current.greek), true);
  assert.equal(tracker.hasUnsavedChanges(docs.revisionFor), true);

  docs.current.greek = "sample";
  assert.equal(tracker.hasUnsavedChanges(docs.revisionFor), false, "undoing back to the saved revision is clean");
});

test("workspaces that were never shown are not checked", () => {
  const tracker = createSavedRevisionTracker<Workspace>();
  const docs = documents({ greek: "sample", latin: "sample" });
  tracker.observe("greek", () => docs.current.greek);
  docs.current.latin = "changed elsewhere";
  assert.equal(tracker.isDirty("latin", () => docs.current.latin), false);
  assert.equal(tracker.hasUnsavedChanges(docs.revisionFor), false);
});

test("edits in a workspace the user switched away from still count", () => {
  const tracker = createSavedRevisionTracker<Workspace>();
  const docs = documents({ greek: "sample", latin: "sample" });
  tracker.observe("greek", () => docs.current.greek);
  tracker.observe("latin", () => docs.current.latin);
  docs.current.greek = "edited";
  assert.equal(tracker.hasUnsavedChanges(docs.revisionFor), true);
});

test("exporting sets a new saved point", () => {
  const tracker = createSavedRevisionTracker<Workspace>();
  const docs = documents({ greek: "sample", latin: "sample" });
  tracker.observe("greek", () => docs.current.greek);
  docs.current.greek = "edited";
  tracker.markSaved("greek", docs.current.greek);
  assert.equal(tracker.hasUnsavedChanges(docs.revisionFor), false);
});

test("after forget, the next observe sets the saved point to the replacement", () => {
  const tracker = createSavedRevisionTracker<Workspace>();
  const docs = documents({ greek: "sample", latin: "sample" });
  tracker.observe("greek", () => docs.current.greek);
  tracker.forget("greek");
  docs.current.greek = "opened project";
  tracker.observe("greek", () => docs.current.greek);
  assert.equal(tracker.hasUnsavedChanges(docs.revisionFor), false);
  docs.current.greek = "opened project, edited";
  assert.equal(tracker.hasUnsavedChanges(docs.revisionFor), true);
});

test("observe computes a revision only the first time", () => {
  const tracker = createSavedRevisionTracker<Workspace>();
  let calls = 0;
  const revision = () => {
    calls += 1;
    return "sample";
  };
  tracker.observe("greek", revision);
  tracker.observe("greek", revision);
  assert.equal(calls, 1);
});

test("confirmLeavingPage asks the browser to show its leave-page dialog", () => {
  let prevented = false;
  const event = {
    preventDefault: () => {
      prevented = true;
    },
    returnValue: undefined as unknown,
  } as unknown as BeforeUnloadEvent;
  confirmLeavingPage(event);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, true);
});

test("the renderer warns before leaving only outside Desktop", async () => {
  const renderer = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  const handler = renderer.match(/const warnBeforeLeaving = \(event: BeforeUnloadEvent\) => \{([\s\S]*?)\n {4}\};/u);
  assert.ok(handler, "the beforeunload handler must exist");
  const body = handler[1];
  assert.ok(
    body.indexOf("getDesktopDocumentsBridge()") >= 0
      && body.indexOf("getDesktopDocumentsBridge()") < body.indexOf("confirmLeavingPage(event)"),
    "Desktop must return before the prompt, or a renderer prompt would block quitting",
  );
  assert.match(renderer, /window\.addEventListener\("beforeunload", warnBeforeLeaving\)/u);
  assert.match(renderer, /browserSaves\.markSaved\(language, /u, "exporting a project sets the saved point");
});
