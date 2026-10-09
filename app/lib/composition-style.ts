import {
  TOKEN_GAP_ANCHORS,
  TOKEN_STYLE_LAYERS,
  normalizeDocumentTokenStyle,
  type DocumentTokenStyle,
  type TokenGapAnchor,
  type TokenStyleLayer,
  type TokenTextStyle,
} from "./token-style.ts";

export type CompositionStylePatch = {
  layers?: Partial<Record<TokenStyleLayer, Partial<TokenTextStyle>>>;
  gapAfterPx?: Partial<Record<TokenGapAnchor, number>>;
  pronunciation?: Partial<NonNullable<DocumentTokenStyle["pronunciation"]>>;
};

/** Creates a detached value suitable for React state or persistence. */
export const cloneCompositionStyle = (
  value: DocumentTokenStyle,
): DocumentTokenStyle => ({
  layers: Object.fromEntries(TOKEN_STYLE_LAYERS.map((layer) => [
    layer,
    { ...value.layers[layer] },
  ])) as DocumentTokenStyle["layers"],
  gapAfterPx: { ...value.gapAfterPx },
  ...(value.pronunciation ? { pronunciation: { ...value.pronunciation } } : {}),
});

/**
 * Applies one explicit Composition-editor change immutably. The shared style
 * normalizer supplies the canonical colour and numeric bounds used by preview,
 * project export, PDF, and LaTeX.
 */
export const patchCompositionStyle = (
  current: DocumentTokenStyle,
  patch: CompositionStylePatch,
): DocumentTokenStyle => normalizeDocumentTokenStyle({
  layers: Object.fromEntries(TOKEN_STYLE_LAYERS.map((layer) => [
    layer,
    { ...current.layers[layer], ...patch.layers?.[layer] },
  ])),
  gapAfterPx: Object.fromEntries(TOKEN_GAP_ANCHORS.map((anchor) => [
    anchor,
    patch.gapAfterPx?.[anchor] ?? current.gapAfterPx[anchor],
  ])),
  ...(current.pronunciation || patch.pronunciation
    ? { pronunciation: { ...current.pronunciation, ...patch.pronunciation } }
    : {}),
}, current);

/** Stable semantic equality, independent of object identity or key order. */
export const compositionStylesEqual = (
  left: DocumentTokenStyle | null | undefined,
  right: DocumentTokenStyle | null | undefined,
): boolean => {
  if (!left || !right) return left === right;
  for (const layer of TOKEN_STYLE_LAYERS) {
    const a = left.layers[layer];
    const b = right.layers[layer];
    if (
      a.fontFamily !== b.fontFamily
      || a.sizePt !== b.sizePt
      || a.color !== b.color
      || a.bold !== b.bold
      || a.italic !== b.italic
      || a.underline !== b.underline
    ) return false;
  }
  if (
    left.pronunciation?.sizePt !== right.pronunciation?.sizePt
    || left.pronunciation?.color !== right.pronunciation?.color
  ) return false;
  return TOKEN_GAP_ANCHORS.every((anchor) =>
    left.gapAfterPx[anchor] === right.gapAfterPx[anchor]);
};
