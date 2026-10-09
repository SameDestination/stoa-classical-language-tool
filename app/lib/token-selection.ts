export type TokenSelectionState = {
  /** Selected token IDs, always normalized to document order. */
  selectedIds: string[];
  /** The stable end of a range selection. The anchor need not itself be selected. */
  anchorId: string | null;
  /** The token that currently owns selection focus. */
  focusId: string | null;
};

export type PointerSelectionModifiers = {
  /** Cmd on macOS, Ctrl on Windows/Linux. */
  toggle?: boolean;
  /** Shift on every platform. Range selection takes precedence over toggle. */
  range?: boolean;
};

export type TokenFocusDirection = "previous" | "next" | "first" | "last";

export type MixedSelectionValue<T> =
  | { kind: "empty" }
  | { kind: "uniform"; value: T }
  | { kind: "mixed" };

export const EMPTY_TOKEN_SELECTION: TokenSelectionState = {
  selectedIds: [],
  anchorId: null,
  focusId: null,
};

const uniqueDocumentIds = (documentIds: readonly string[]) => {
  const seen = new Set<string>();
  return documentIds.filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const idsInDocumentOrder = (
  selectedIds: Iterable<string>,
  documentIds: readonly string[],
) => {
  const selected = new Set(selectedIds);
  return uniqueDocumentIds(documentIds).filter((id) => selected.has(id));
};

const contiguousRange = (
  documentIds: readonly string[],
  anchorId: string,
  focusId: string,
) => {
  const ordered = uniqueDocumentIds(documentIds);
  const anchorIndex = ordered.indexOf(anchorId);
  const focusIndex = ordered.indexOf(focusId);
  if (anchorIndex < 0 || focusIndex < 0) return [];
  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);
  return ordered.slice(start, end + 1);
};

export const createTokenSelection = (
  documentIds: readonly string[],
  selectedIds: Iterable<string> = [],
  anchorId: string | null = null,
  focusId: string | null = null,
): TokenSelectionState => sanitizeTokenSelection(
  { selectedIds: [...selectedIds], anchorId, focusId },
  documentIds,
);

export const clearTokenSelection = (): TokenSelectionState => ({
  selectedIds: [],
  anchorId: null,
  focusId: null,
});

/**
 * Removes IDs that disappeared after deletion/import and restores a usable
 * anchor/focus without changing the surviving document order.
 */
export const sanitizeTokenSelection = (
  state: TokenSelectionState,
  documentIds: readonly string[],
): TokenSelectionState => {
  const ordered = uniqueDocumentIds(documentIds);
  const available = new Set(ordered);
  const selectedIds = idsInDocumentOrder(state.selectedIds, ordered);
  if (!selectedIds.length) {
    return clearTokenSelection();
  }
  return {
    selectedIds,
    anchorId: state.anchorId && available.has(state.anchorId)
      ? state.anchorId
      : selectedIds[0],
    focusId: state.focusId && available.has(state.focusId)
      ? state.focusId
      : selectedIds[selectedIds.length - 1],
  };
};

/** Applies desktop-editor click conventions to a token selection. */
export const applyPointerSelection = (
  state: TokenSelectionState,
  documentIds: readonly string[],
  tokenId: string,
  modifiers: PointerSelectionModifiers = {},
): TokenSelectionState => {
  const ordered = uniqueDocumentIds(documentIds);
  if (!ordered.includes(tokenId)) return sanitizeTokenSelection(state, ordered);
  const current = sanitizeTokenSelection(state, ordered);

  if (modifiers.range) {
    const anchorId = state.anchorId && ordered.includes(state.anchorId)
      ? state.anchorId
      : state.focusId && ordered.includes(state.focusId)
        ? state.focusId
        : current.selectedIds[0] ?? tokenId;
    return {
      selectedIds: contiguousRange(ordered, anchorId, tokenId),
      anchorId,
      focusId: tokenId,
    };
  }

  if (modifiers.toggle) {
    const selected = new Set(current.selectedIds);
    if (selected.has(tokenId)) selected.delete(tokenId);
    else selected.add(tokenId);
    const selectedIds = idsInDocumentOrder(selected, ordered);
    return {
      selectedIds,
      // Retaining the clicked token as anchor makes a following Shift-click
      // predictable even when this click toggled the last selected token off.
      anchorId: tokenId,
      focusId: tokenId,
    };
  }

  return {
    selectedIds: [tokenId],
    anchorId: tokenId,
    focusId: tokenId,
  };
};

/**
 * Moves keyboard focus in logical document order. With `extend`, the move is
 * equivalent to Shift-clicking the destination token.
 */
export const moveTokenSelectionFocus = (
  state: TokenSelectionState,
  documentIds: readonly string[],
  direction: TokenFocusDirection,
  options: { extend?: boolean } = {},
): TokenSelectionState => {
  const ordered = uniqueDocumentIds(documentIds);
  if (!ordered.length) return clearTokenSelection();
  const current = sanitizeTokenSelection(state, ordered);
  const currentFocus = state.focusId && ordered.includes(state.focusId)
    ? state.focusId
    : current.focusId;
  const currentIndex = currentFocus ? ordered.indexOf(currentFocus) : -1;
  let nextIndex: number;
  if (direction === "first") nextIndex = 0;
  else if (direction === "last") nextIndex = ordered.length - 1;
  else if (direction === "previous") {
    nextIndex = currentIndex < 0
      ? ordered.length - 1
      : Math.max(0, currentIndex - 1);
  } else {
    nextIndex = currentIndex < 0
      ? 0
      : Math.min(ordered.length - 1, currentIndex + 1);
  }
  const tokenId = ordered[nextIndex];
  return applyPointerSelection(
    state,
    ordered,
    tokenId,
    options.extend ? { range: true } : {},
  );
};

/** Cmd/Ctrl+Space-style toggle for the focused token. */
export const toggleFocusedToken = (
  state: TokenSelectionState,
  documentIds: readonly string[],
): TokenSelectionState => {
  const ordered = uniqueDocumentIds(documentIds);
  if (!ordered.length) return clearTokenSelection();
  const tokenId = state.focusId && ordered.includes(state.focusId)
    ? state.focusId
    : ordered[0];
  return applyPointerSelection(state, ordered, tokenId, { toggle: true });
};

export const selectedItemsInDocumentOrder = <T extends { id: string }>(
  items: readonly T[],
  selectedIds: Iterable<string>,
) => {
  const selected = new Set(selectedIds);
  return items.filter((item) => selected.has(item.id));
};

/**
 * Returns an explicit mixed state. A uniform `undefined` remains a legitimate
 * uniform value, which is important for sparse style overrides.
 */
export const aggregateSelectedValue = <T extends { id: string }, V>(
  items: readonly T[],
  selectedIds: Iterable<string>,
  read: (item: T) => V,
  equals: (left: V, right: V) => boolean = Object.is,
): MixedSelectionValue<V> => {
  const selected = selectedItemsInDocumentOrder(items, selectedIds);
  if (!selected.length) return { kind: "empty" };
  const value = read(selected[0]);
  return selected.slice(1).every((item) => equals(value, read(item)))
    ? { kind: "uniform", value }
    : { kind: "mixed" };
};

/**
 * Applies one bulk edit while retaining array order, token IDs, and the object
 * identity of every unselected token.
 */
export const updateSelectedItems = <T extends { id: string }>(
  items: readonly T[],
  selectedIds: Iterable<string>,
  update: (item: T) => T,
): T[] => {
  const selected = new Set(selectedIds);
  return items.map((item) => selected.has(item.id) ? update(item) : item);
};

/**
 * Removes a multi-selection in one document operation and chooses the closest
 * surviving token at the first removed source position. The input selection is
 * left untouched so an undo snapshot can restore it exactly.
 */
export const removeSelectedItems = <T extends { id: string }>(
  items: readonly T[],
  selection: TokenSelectionState,
): { items: T[]; selection: TokenSelectionState; removedIds: string[] } => {
  const orderedIds = items.map((item) => item.id);
  const normalized = sanitizeTokenSelection(selection, orderedIds);
  const removedIds = normalized.selectedIds;
  if (!removedIds.length) {
    return { items: [...items], selection: normalized, removedIds };
  }
  const removed = new Set(removedIds);
  const firstRemovedIndex = items.findIndex((item) => removed.has(item.id));
  const remaining = items.filter((item) => !removed.has(item.id));
  const nextId = remaining[Math.min(firstRemovedIndex, remaining.length - 1)]?.id ?? null;
  return {
    items: remaining,
    selection: createTokenSelection(
      remaining.map((item) => item.id),
      nextId ? [nextId] : [],
      nextId,
      nextId,
    ),
    removedIds,
  };
};
