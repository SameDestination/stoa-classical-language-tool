/**
 * Unsaved-change tracking for Web and Portable, which have no Save command.
 *
 * Each workspace has a saved point: the revision it had when it was first
 * shown, when it was exported, or when a project replaced a clean document.
 * Any other revision counts as unsaved. Desktop tracks saves in its main
 * process instead and asks before a window closes.
 */

export type SavedRevisionTracker<W extends string> = {
  /** Sets the saved point if the workspace has none yet. */
  observe: (workspace: W, revision: () => string) => void;
  markSaved: (workspace: W, revision: string) => void;
  /** Clears the saved point so the next observe() sets it again. */
  forget: (workspace: W) => void;
  isDirty: (workspace: W, revision: () => string) => boolean;
  hasUnsavedChanges: (revisionFor: (workspace: W) => string) => boolean;
};

export const createSavedRevisionTracker = <W extends string>(): SavedRevisionTracker<W> => {
  const saved = new Map<W, string>();
  return {
    observe: (workspace, revision) => {
      if (!saved.has(workspace)) saved.set(workspace, revision());
    },
    markSaved: (workspace, revision) => {
      saved.set(workspace, revision);
    },
    forget: (workspace) => {
      saved.delete(workspace);
    },
    isDirty: (workspace, revision) =>
      saved.has(workspace) && saved.get(workspace) !== revision(),
    hasUnsavedChanges: (revisionFor) =>
      [...saved].some(([workspace, revision]) => revisionFor(workspace) !== revision),
  };
};

/** Asks the browser to confirm leaving the page. Browsers use their own wording. */
export const confirmLeavingPage = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  // Chrome and Edge before version 119 also need returnValue.
  event.returnValue = true;
};
