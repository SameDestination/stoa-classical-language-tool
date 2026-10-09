/**
 * Groups a burst of edits from one direct control into one application-level
 * Undo step. The caller still applies every intermediate value immediately;
 * this helper only decides whether the pre-edit snapshot needs to be pushed.
 *
 * The state is intentionally kept outside persisted project data. A save,
 * Undo/Redo, document replacement, or workspace switch should discard it so
 * those operations always form explicit history boundaries.
 */

export const DEFAULT_HISTORY_COALESCE_WINDOW_MS = 1_000;

export type HistoryCoalescingState<Workspace extends string> = {
  workspace: Workspace;
  key: string;
  lastEditAt: number;
};

export type HistoryCoalescingDecision<Workspace extends string> = {
  recordSnapshot: boolean;
  state: HistoryCoalescingState<Workspace> | null;
};

export const resolveHistoryCoalescing = <Workspace extends string>(
  current: HistoryCoalescingState<Workspace> | null,
  workspace: Workspace,
  key: string | undefined,
  now = Date.now(),
  windowMs = DEFAULT_HISTORY_COALESCE_WINDOW_MS,
): HistoryCoalescingDecision<Workspace> => {
  const normalizedKey = key?.trim();
  if (!normalizedKey) {
    return { recordSnapshot: true, state: null };
  }

  const elapsed = current ? now - current.lastEditAt : Number.POSITIVE_INFINITY;
  const continuesCurrentBurst = current?.workspace === workspace
    && current.key === normalizedKey
    && elapsed >= 0
    && elapsed <= Math.max(0, windowMs);

  return {
    recordSnapshot: !continuesCurrentBurst,
    state: {
      workspace,
      key: normalizedKey,
      lastEditAt: now,
    },
  };
};
