/**
 * Session-only, workspace-local document history.
 *
 * Navigation is deliberately absent from this model: callers choose the
 * workspace key, and undo/redo can only return a snapshot from that key.
 */

export type WorkspaceHistoryEntry<Snapshot> = {
  undo: Snapshot[];
  redo: Snapshot[];
};

export type WorkspaceHistories<Language extends string, Snapshot> =
  Partial<Record<Language, WorkspaceHistoryEntry<Snapshot>>>;

export type WorkspaceHistoryStep<Language extends string, Snapshot> = {
  histories: WorkspaceHistories<Language, Snapshot>;
  snapshot: Snapshot;
};

const entryFor = <Language extends string, Snapshot>(
  histories: WorkspaceHistories<Language, Snapshot>,
  language: NoInfer<Language>,
): WorkspaceHistoryEntry<Snapshot> => histories[language] ?? { undo: [], redo: [] };

export const pushWorkspaceHistory = <Language extends string, Snapshot>(
  histories: WorkspaceHistories<Language, Snapshot>,
  language: NoInfer<Language>,
  snapshot: Snapshot,
  limit = 120,
): WorkspaceHistories<Language, Snapshot> => {
  const current = entryFor(histories, language);
  return {
    ...histories,
    [language]: {
      undo: [...current.undo, snapshot].slice(-Math.max(1, limit)),
      redo: [],
    },
  };
};

export const undoWorkspaceHistory = <Language extends string, Snapshot>(
  histories: WorkspaceHistories<Language, Snapshot>,
  language: NoInfer<Language>,
  present: Snapshot,
  limit = 120,
): WorkspaceHistoryStep<Language, Snapshot> | null => {
  const current = entryFor(histories, language);
  const snapshot = current.undo.at(-1);
  if (!snapshot) return null;
  return {
    snapshot,
    histories: {
      ...histories,
      [language]: {
        undo: current.undo.slice(0, -1),
        redo: [...current.redo, present].slice(-Math.max(1, limit)),
      },
    },
  };
};

export const redoWorkspaceHistory = <Language extends string, Snapshot>(
  histories: WorkspaceHistories<Language, Snapshot>,
  language: NoInfer<Language>,
  present: Snapshot,
  limit = 120,
): WorkspaceHistoryStep<Language, Snapshot> | null => {
  const current = entryFor(histories, language);
  const snapshot = current.redo.at(-1);
  if (!snapshot) return null;
  return {
    snapshot,
    histories: {
      ...histories,
      [language]: {
        undo: [...current.undo, present].slice(-Math.max(1, limit)),
        redo: current.redo.slice(0, -1),
      },
    },
  };
};
