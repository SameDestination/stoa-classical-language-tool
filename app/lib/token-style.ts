/**
 * Shared token-style model for preview, export, and editor integrations.
 *
 * The model deliberately separates document defaults from sparse per-token
 * overrides.  A token therefore inherits future document-level changes unless
 * it explicitly overrides the affected property.
 */

export const TOKEN_STYLE_LAYERS = [
  "source",
  "gloss",
  "lemma",
  "pos",
  "morphology",
] as const;

export type TokenStyleLayer = (typeof TOKEN_STYLE_LAYERS)[number];

/** Every layer except the final morphology row can own the gap after itself. */
export const TOKEN_GAP_ANCHORS = ["source", "gloss", "lemma", "pos"] as const;

export type TokenGapAnchor = (typeof TOKEN_GAP_ANCHORS)[number];

export const TOKEN_FONT_SIZE_MIN_PT = 4;
export const TOKEN_FONT_SIZE_MAX_PT = 144;
export const TOKEN_FONT_SIZE_STEP_PT = 0.5;
export const TOKEN_LAYER_GAP_MIN_PX = 0;
export const TOKEN_LAYER_GAP_MAX_PX = 48;
export const TOKEN_LAYER_GAP_STEP_PX = 0.5;

/** Shared measurement constants used by both browser and vector renderers. */
export const TOKEN_LAYER_LINE_HEIGHT: Readonly<Record<TokenStyleLayer, number>> = {
  source: 1.18,
  gloss: 1.3,
  lemma: 1.2,
  pos: 1.2,
  morphology: 1.35,
};

export const DEFAULT_TOKEN_GAP_AFTER_PX: Readonly<Record<TokenGapAnchor, number>> = {
  source: 5,
  gloss: 3,
  lemma: 3,
  pos: 3,
};

export const TOKEN_CARD_METRICS = Object.freeze({
  paddingTopPx: 7,
  paddingRightPx: 8,
  paddingBottomPx: 8,
  paddingLeftPx: 8,
  borderPx: 1,
  horizontalChromePx: 18,
  verticalChromePx: 17,
});

export type TokenTextStyle = {
  fontFamily: string;
  sizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type SparseTokenTextStyle = Partial<TokenTextStyle>;

/**
 * Restricted document default for the pronunciation row. It deliberately is
 * not a sixth TOKEN_STYLE_LAYERS member: its academic typeface and regular
 * emphasis are fixed, while only size and colour are configurable.
 */
export type PronunciationTextStyle = Pick<TokenTextStyle, "sizePt" | "color">;

export type DocumentTokenStyle = {
  layers: Record<TokenStyleLayer, TokenTextStyle>;
  /** A gap is consumed only when its owner and a following layer are visible. */
  gapAfterPx: Record<TokenGapAnchor, number>;
  pronunciation?: PronunciationTextStyle;
};

export type TokenStyleOverride = {
  layers?: Partial<Record<TokenStyleLayer, SparseTokenTextStyle>>;
  gapAfterPx?: Partial<Record<TokenGapAnchor, number>>;
};

export type TokenTextStylePatch = {
  [Property in keyof TokenTextStyle]?: TokenTextStyle[Property] | null;
};

export type TokenStylePatch = {
  /** `null` clears every override on that layer. */
  layers?: Partial<Record<TokenStyleLayer, TokenTextStylePatch | null>>;
  /** `null` clears that gap override. */
  gapAfterPx?: Partial<Record<TokenGapAnchor, number | null>>;
};

export type LegacyTokenStyleSettings = {
  greekFont?: string;
  englishFont?: string;
  lemmaFont?: string;
  morphFont?: string;
  greekSize?: number;
  glossSize?: number;
  lemmaSize?: number;
  posSize?: number;
  morphSize?: number;
  ink?: string;
  accent?: string;
  background?: string;
};

export type LegacyTokenStyleFields = {
  wordFont?: string;
  wordSize?: number;
  wordColor?: string;
  wordBold?: boolean;
  wordItalic?: boolean;
  wordUnderline?: boolean;
  lemmaColor?: string;
  lemmaUnderline?: boolean;
  morphColor?: string;
  morphUnderline?: boolean;
};

export type TokenStyleCarrier = LegacyTokenStyleFields & {
  id: string;
  styleOverrides?: TokenStyleOverride;
};

export type TokenLayerVisibility = Record<TokenStyleLayer, boolean>;

export type VisibleTokenLayer = {
  layer: TokenStyleLayer;
  style: TokenTextStyle;
  /** Zero on the final visible layer. Hidden layers never contribute a gap. */
  gapAfterPx: number;
};

export type MeasuredTokenLayer = Pick<VisibleTokenLayer, "style" | "gapAfterPx"> & {
  text: string;
  lineHeight: number;
};

/**
 * Deterministic vertical measurement contract shared by Preview and vector
 * export. CSS/PDF line boxes are explicit, so font family affects horizontal
 * wrapping while the resolved size, leading, visible layers and custom gaps
 * determine the complete atomic token height.
 */
export const measureTokenLayerStackHeight = (
  layers: readonly MeasuredTokenLayer[],
  pointToUnit: number,
  cssPixelToUnit: number,
) => TOKEN_CARD_METRICS.verticalChromePx * cssPixelToUnit + layers.reduce(
  (height, layer) => height
    + layer.text.split(/\r\n|\r|\n/u).length
      * layer.style.sizePt
      * pointToUnit
      * layer.lineHeight
    + layer.gapAfterPx * cssPixelToUnit,
  0,
);

/** A visual row is atomic and is always as tall as its tallest complete token. */
export const maximumAtomicRowHeight = <T>(
  tokens: readonly T[],
  measureToken: (token: T) => number,
) => tokens.reduce((maximum, token) => Math.max(maximum, measureToken(token)), 0);

export type MixedTokenStyleValue<Value> =
  | { kind: "empty" }
  | { kind: "uniform"; value: Value }
  | { kind: "mixed" };

export type AggregatedTokenTextStyle = {
  [Property in keyof TokenTextStyle]: MixedTokenStyleValue<TokenTextStyle[Property]>;
};

export type AggregatedTokenStyles = {
  layers: Record<TokenStyleLayer, AggregatedTokenTextStyle>;
  gapAfterPx: Record<TokenGapAnchor, MixedTokenStyleValue<number>>;
};

const DEFAULT_SOURCE_FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, serif";
const DEFAULT_ANNOTATION_FONT = "'Noto Serif STOA', 'Times New Roman', Times, serif";
const DEFAULT_INK = "#29271f";
const DEFAULT_ACCENT = "#9e4a32";
const DEFAULT_BACKGROUND = "#eee2cc";

const STYLE_PROPERTIES = [
  "fontFamily",
  "sizePt",
  "color",
  "bold",
  "italic",
  "underline",
] as const satisfies readonly (keyof TokenTextStyle)[];

const LEGACY_STYLE_KEYS = [
  "wordFont",
  "wordSize",
  "wordColor",
  "wordBold",
  "wordItalic",
  "wordUnderline",
  "lemmaColor",
  "lemmaUnderline",
  "morphColor",
  "morphUnderline",
] as const satisfies readonly (keyof LegacyTokenStyleFields)[];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const roundToStep = (value: number, step: number) =>
  Math.round(value / step) * step;

export const clampTokenFontSize = (value: number) => {
  const finite = Number.isFinite(value) ? value : TOKEN_FONT_SIZE_MIN_PT;
  return clamp(
    roundToStep(finite, TOKEN_FONT_SIZE_STEP_PT),
    TOKEN_FONT_SIZE_MIN_PT,
    TOKEN_FONT_SIZE_MAX_PT,
  );
};

export const clampTokenLayerGap = (value: number) => {
  const finite = Number.isFinite(value) ? value : TOKEN_LAYER_GAP_MIN_PX;
  return clamp(
    roundToStep(finite, TOKEN_LAYER_GAP_STEP_PX),
    TOKEN_LAYER_GAP_MIN_PX,
    TOKEN_LAYER_GAP_MAX_PX,
  );
};

/**
 * Converts three- or six-digit CSS hex input to a stable lower-case #rrggbb.
 * Alpha-bearing or non-hex colors are rejected so project/PDF color behavior
 * remains deterministic.
 */
export const canonicalizeTokenColor = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const color = value.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(color);
  if (short) {
    return `#${Array.from(short[1], (character) => `${character}${character}`).join("")}`;
  }
  return /^#[0-9a-f]{6}$/.test(color) ? color : null;
};

const normalizeFontFamily = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const family = value.trim();
  return family ? family : null;
};

const fallbackColor = (value: unknown, fallback: string) =>
  canonicalizeTokenColor(value) ?? fallback;

const colorChannels = (color: string) => [
  Number.parseInt(color.slice(1, 3), 16),
  Number.parseInt(color.slice(3, 5), 16),
  Number.parseInt(color.slice(5, 7), 16),
] as const;

/** Equivalent to compositing `foreground` at opacity over an opaque background. */
export const mixTokenColors = (
  foreground: string,
  background: string,
  foregroundRatio: number,
): string => {
  const front = colorChannels(fallbackColor(foreground, DEFAULT_INK));
  const back = colorChannels(fallbackColor(background, DEFAULT_BACKGROUND));
  const ratio = clamp(
    Number.isFinite(foregroundRatio) ? foregroundRatio : 1,
    0,
    1,
  );
  const channels = front.map((channel, index) =>
    Math.round(channel * ratio + back[index] * (1 - ratio)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Converts the pre-5.1 document typography fields into complete defaults. */
export const deriveDocumentTokenStyleDefaults = (
  settings: LegacyTokenStyleSettings,
): DocumentTokenStyle => {
  const sourceFont = normalizeFontFamily(settings.greekFont) ?? DEFAULT_SOURCE_FONT;
  const annotationFont = normalizeFontFamily(settings.englishFont) ?? DEFAULT_ANNOTATION_FONT;
  const lemmaFont = normalizeFontFamily(settings.lemmaFont) ?? sourceFont;
  const morphologyFont = normalizeFontFamily(settings.morphFont) ?? annotationFont;
  const ink = fallbackColor(settings.ink, DEFAULT_INK);
  const accent = fallbackColor(settings.accent, DEFAULT_ACCENT);
  const background = fallbackColor(settings.background, DEFAULT_BACKGROUND);

  return {
    layers: {
      source: {
        fontFamily: sourceFont,
        sizePt: clampTokenFontSize(finiteOr(settings.greekSize, 24)),
        color: ink,
        bold: false,
        italic: false,
        underline: false,
      },
      gloss: {
        fontFamily: annotationFont,
        sizePt: clampTokenFontSize(finiteOr(settings.glossSize, 12)),
        color: ink,
        bold: true,
        italic: false,
        underline: false,
      },
      lemma: {
        fontFamily: lemmaFont,
        sizePt: clampTokenFontSize(finiteOr(settings.lemmaSize, 10)),
        color: mixTokenColors(ink, background, 0.66),
        bold: false,
        italic: true,
        underline: false,
      },
      pos: {
        fontFamily: annotationFont,
        sizePt: clampTokenFontSize(finiteOr(settings.posSize, 8)),
        color: accent,
        bold: true,
        italic: false,
        underline: false,
      },
      morphology: {
        fontFamily: morphologyFont,
        sizePt: clampTokenFontSize(finiteOr(settings.morphSize, 9)),
        color: mixTokenColors(ink, background, 0.72),
        bold: false,
        italic: false,
        underline: false,
      },
    },
    // The legacy grid used a 3 px row gap plus a 2 px source→gloss margin.
    gapAfterPx: { ...DEFAULT_TOKEN_GAP_AFTER_PX },
  };
};

/**
 * Validates a complete/partial v2 document token-style value. Missing or
 * invalid fields inherit from `fallback`; valid fields are canonicalized.
 */
export const normalizeDocumentTokenStyle = (
  value: unknown,
  fallback: DocumentTokenStyle,
): DocumentTokenStyle => {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const layersSource = source.layers && typeof source.layers === "object" && !Array.isArray(source.layers)
    ? source.layers as Record<string, unknown>
    : {};
  const gapsSource = source.gapAfterPx && typeof source.gapAfterPx === "object" && !Array.isArray(source.gapAfterPx)
    ? source.gapAfterPx as Record<string, unknown>
    : {};

  const layers = Object.fromEntries(TOKEN_STYLE_LAYERS.map((layer) => {
    const base = fallback.layers[layer];
    const candidate = layersSource[layer] && typeof layersSource[layer] === "object"
      && !Array.isArray(layersSource[layer])
      ? layersSource[layer] as Record<string, unknown>
      : {};
    return [layer, {
      fontFamily: normalizeFontFamily(candidate.fontFamily) ?? base.fontFamily,
      sizePt: typeof candidate.sizePt === "number" && Number.isFinite(candidate.sizePt)
        ? clampTokenFontSize(candidate.sizePt)
        : base.sizePt,
      color: canonicalizeTokenColor(candidate.color) ?? base.color,
      bold: typeof candidate.bold === "boolean" ? candidate.bold : base.bold,
      italic: typeof candidate.italic === "boolean" ? candidate.italic : base.italic,
      underline: typeof candidate.underline === "boolean" ? candidate.underline : base.underline,
    }];
  })) as Record<TokenStyleLayer, TokenTextStyle>;

  const gapAfterPx = Object.fromEntries(TOKEN_GAP_ANCHORS.map((anchor) => {
    const candidate = gapsSource[anchor];
    return [anchor, typeof candidate === "number" && Number.isFinite(candidate)
      ? clampTokenLayerGap(candidate)
      : fallback.gapAfterPx[anchor]];
  })) as Record<TokenGapAnchor, number>;

  const pronunciationSource = source.pronunciation && typeof source.pronunciation === "object"
    && !Array.isArray(source.pronunciation)
    ? source.pronunciation as Record<string, unknown>
    : null;
  const pronunciationFallback = fallback.pronunciation;
  const pronunciation = pronunciationSource || pronunciationFallback
    ? {
        sizePt: typeof pronunciationSource?.sizePt === "number"
          && Number.isFinite(pronunciationSource.sizePt)
          ? Math.max(7, clampTokenFontSize(pronunciationSource.sizePt))
          : Math.max(7, pronunciationFallback?.sizePt ?? clampTokenFontSize(12)),
        color: canonicalizeTokenColor(pronunciationSource?.color)
          ?? pronunciationFallback?.color
          ?? fallback.layers.source.color,
      }
    : undefined;

  return { layers, gapAfterPx, ...(pronunciation ? { pronunciation } : {}) };
};

const normalizeTextStyle = (value: unknown): SparseTokenTextStyle => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: SparseTokenTextStyle = {};
  const fontFamily = normalizeFontFamily(source.fontFamily);
  if (fontFamily) result.fontFamily = fontFamily;
  if (typeof source.sizePt === "number" && Number.isFinite(source.sizePt)) {
    result.sizePt = clampTokenFontSize(source.sizePt);
  }
  const color = canonicalizeTokenColor(source.color);
  if (color) result.color = color;
  if (typeof source.bold === "boolean") result.bold = source.bold;
  if (typeof source.italic === "boolean") result.italic = source.italic;
  if (typeof source.underline === "boolean") result.underline = source.underline;
  return result;
};

const compactTextStyle = (
  value: SparseTokenTextStyle,
  defaults?: TokenTextStyle,
): SparseTokenTextStyle => Object.fromEntries(
  Object.entries(value).filter(([property, propertyValue]) =>
    !defaults || defaults[property as keyof TokenTextStyle] !== propertyValue),
) as SparseTokenTextStyle;

/**
 * Sanitizes imported override data and optionally drops values equal to the
 * document defaults. Invalid fields are ignored, never leaked to renderers.
 */
export const normalizeTokenStyleOverride = (
  value: unknown,
  defaults?: DocumentTokenStyle,
): TokenStyleOverride | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const layersSource = source.layers && typeof source.layers === "object" && !Array.isArray(source.layers)
    ? source.layers as Record<string, unknown>
    : {};
  const gapsSource = source.gapAfterPx && typeof source.gapAfterPx === "object" && !Array.isArray(source.gapAfterPx)
    ? source.gapAfterPx as Record<string, unknown>
    : {};
  const layers: Partial<Record<TokenStyleLayer, SparseTokenTextStyle>> = {};
  const gapAfterPx: Partial<Record<TokenGapAnchor, number>> = {};

  for (const layer of TOKEN_STYLE_LAYERS) {
    const normalized = compactTextStyle(
      normalizeTextStyle(layersSource[layer]),
      defaults?.layers[layer],
    );
    if (Object.keys(normalized).length) layers[layer] = normalized;
  }
  for (const anchor of TOKEN_GAP_ANCHORS) {
    const value = gapsSource[anchor];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const normalized = clampTokenLayerGap(value);
    if (!defaults || normalized !== defaults.gapAfterPx[anchor]) gapAfterPx[anchor] = normalized;
  }

  const result: TokenStyleOverride = {};
  if (Object.keys(layers).length) result.layers = layers;
  if (Object.keys(gapAfterPx).length) result.gapAfterPx = gapAfterPx;
  return Object.keys(result).length ? result : undefined;
};

/** Maps existing flat word/lemma/morph fields into the 5.1 override model. */
export const legacyTokenStyleOverride = (
  token: LegacyTokenStyleFields,
  defaults?: DocumentTokenStyle,
): TokenStyleOverride | undefined => {
  const source: SparseTokenTextStyle = {};
  const lemma: SparseTokenTextStyle = {};
  const morphology: SparseTokenTextStyle = {};
  const wordFont = normalizeFontFamily(token.wordFont);
  if (wordFont) source.fontFamily = wordFont;
  if (typeof token.wordSize === "number" && Number.isFinite(token.wordSize)) {
    source.sizePt = clampTokenFontSize(token.wordSize);
  }
  const wordColor = canonicalizeTokenColor(token.wordColor);
  if (wordColor) source.color = wordColor;
  if (typeof token.wordBold === "boolean") source.bold = token.wordBold;
  if (typeof token.wordItalic === "boolean") source.italic = token.wordItalic;
  if (typeof token.wordUnderline === "boolean") source.underline = token.wordUnderline;
  const lemmaColor = canonicalizeTokenColor(token.lemmaColor);
  if (lemmaColor) lemma.color = lemmaColor;
  if (typeof token.lemmaUnderline === "boolean") lemma.underline = token.lemmaUnderline;
  const morphColor = canonicalizeTokenColor(token.morphColor);
  if (morphColor) morphology.color = morphColor;
  if (typeof token.morphUnderline === "boolean") morphology.underline = token.morphUnderline;
  return normalizeTokenStyleOverride({
    layers: { source, lemma, morphology },
  }, defaults);
};

const mergeOverrides = (
  base: TokenStyleOverride | undefined,
  preferred: TokenStyleOverride | undefined,
  defaults?: DocumentTokenStyle,
) => normalizeTokenStyleOverride({
  layers: Object.fromEntries(TOKEN_STYLE_LAYERS.map((layer) => [
    layer,
    { ...base?.layers?.[layer], ...preferred?.layers?.[layer] },
  ])),
  gapAfterPx: { ...base?.gapAfterPx, ...preferred?.gapAfterPx },
}, defaults);

/** New nested fields win over their legacy flat equivalents during migration. */
export const tokenStyleOverrideFor = (
  token: TokenStyleCarrier,
  defaults?: DocumentTokenStyle,
) => mergeOverrides(
  // Normalize only after merging so an explicit nested value equal to a
  // document default can still supersede an older non-default flat value.
  legacyTokenStyleOverride(token),
  normalizeTokenStyleOverride(token.styleOverrides),
  defaults,
);

/** Resolves one token to the complete styles consumed by renderers. */
export const resolveTokenStyle = (
  defaults: DocumentTokenStyle,
  tokenOrOverride?: TokenStyleCarrier | TokenStyleOverride,
): DocumentTokenStyle => {
  const override = tokenOrOverride && "id" in tokenOrOverride
    ? tokenStyleOverrideFor(tokenOrOverride, defaults)
    : normalizeTokenStyleOverride(tokenOrOverride, defaults);
  return {
    layers: Object.fromEntries(TOKEN_STYLE_LAYERS.map((layer) => [
      layer,
      { ...defaults.layers[layer], ...override?.layers?.[layer] },
    ])) as Record<TokenStyleLayer, TokenTextStyle>,
    gapAfterPx: {
      ...defaults.gapAfterPx,
      ...override?.gapAfterPx,
    },
  };
};

export const ALL_TOKEN_LAYERS_VISIBLE: TokenLayerVisibility = {
  source: true,
  gloss: true,
  lemma: true,
  pos: true,
  morphology: true,
};

/** Bridges the existing showLemma/showPos/detail-hiding settings into 5.1. */
export const deriveLegacyTokenLayerVisibility = (
  settings: { showLemma?: boolean; showPos?: boolean },
  options: { hideDetails?: boolean } = {},
): TokenLayerVisibility => ({
  source: true,
  gloss: true,
  lemma: !options.hideDetails && Boolean(settings.showLemma),
  pos: !options.hideDetails && Boolean(settings.showPos),
  morphology: !options.hideDetails,
});

/**
 * Produces a render flow without charging gaps for hidden rows. If Gloss is
 * followed by Morphology because Lemma/POS are hidden, only Gloss's gap is used.
 */
export const resolveVisibleTokenLayers = (
  style: DocumentTokenStyle,
  visibility: Partial<TokenLayerVisibility> = ALL_TOKEN_LAYERS_VISIBLE,
): VisibleTokenLayer[] => {
  const visibleLayers = TOKEN_STYLE_LAYERS.filter((layer) => visibility[layer] ?? true);
  return visibleLayers.map((layer, index) => ({
    layer,
    style: style.layers[layer],
    gapAfterPx: index < visibleLayers.length - 1 && layer !== "morphology"
      ? style.gapAfterPx[layer]
      : 0,
  }));
};

const aggregate = <Value>(values: readonly Value[]): MixedTokenStyleValue<Value> => {
  if (!values.length) return { kind: "empty" };
  return values.slice(1).every((value) => Object.is(value, values[0]))
    ? { kind: "uniform", value: values[0] }
    : { kind: "mixed" };
};

/** Aggregates resolved (effective) values, not merely sparse override values. */
export const aggregateEffectiveTokenStyles = <Token extends TokenStyleCarrier>(
  tokens: readonly Token[],
  selectedIds: Iterable<string>,
  defaults: DocumentTokenStyle,
): AggregatedTokenStyles => {
  const selected = new Set(selectedIds);
  const styles = tokens
    .filter((token) => selected.has(token.id))
    .map((token) => resolveTokenStyle(defaults, token));

  return {
    layers: Object.fromEntries(TOKEN_STYLE_LAYERS.map((layer) => [
      layer,
      Object.fromEntries(STYLE_PROPERTIES.map((property) => [
        property,
        aggregate(styles.map((style) => style.layers[layer][property])),
      ])) as AggregatedTokenTextStyle,
    ])) as Record<TokenStyleLayer, AggregatedTokenTextStyle>,
    gapAfterPx: Object.fromEntries(TOKEN_GAP_ANCHORS.map((anchor) => [
      anchor,
      aggregate(styles.map((style) => style.gapAfterPx[anchor])),
    ])) as Record<TokenGapAnchor, MixedTokenStyleValue<number>>,
  };
};

const normalizePatchValue = <Property extends keyof TokenTextStyle>(
  property: Property,
  value: TokenTextStyle[Property],
): TokenTextStyle[Property] | undefined => {
  if (property === "fontFamily") {
    return (normalizeFontFamily(value) ?? undefined) as TokenTextStyle[Property] | undefined;
  }
  if (property === "sizePt") {
    return clampTokenFontSize(value as number) as TokenTextStyle[Property];
  }
  if (property === "color") {
    return (canonicalizeTokenColor(value) ?? undefined) as TokenTextStyle[Property] | undefined;
  }
  return typeof value === "boolean" ? value : undefined;
};

/** Applies only explicitly present patch fields; untouched mixed fields survive. */
export const patchTokenStyleOverride = (
  current: TokenStyleOverride | undefined,
  patch: TokenStylePatch,
  defaults?: DocumentTokenStyle,
): TokenStyleOverride | undefined => {
  const nextLayers: Partial<Record<TokenStyleLayer, SparseTokenTextStyle>> = {};
  const nextGaps: Partial<Record<TokenGapAnchor, number>> = { ...current?.gapAfterPx };
  for (const layer of TOKEN_STYLE_LAYERS) {
    const currentLayer = { ...current?.layers?.[layer] };
    const layerPatch = patch.layers?.[layer];
    if (layerPatch === null) {
      continue;
    }
    if (layerPatch) {
      for (const property of STYLE_PROPERTIES) {
        if (!Object.hasOwn(layerPatch, property)) continue;
        const value = layerPatch[property];
        if (value === null || value === undefined) {
          delete currentLayer[property];
          continue;
        }
        const normalized = normalizePatchValue(property, value as never);
        if (normalized === undefined) continue;
        (currentLayer as Record<string, unknown>)[property] = normalized;
      }
    }
    if (Object.keys(currentLayer).length) nextLayers[layer] = currentLayer;
  }
  for (const anchor of TOKEN_GAP_ANCHORS) {
    if (!Object.hasOwn(patch.gapAfterPx ?? {}, anchor)) continue;
    const value = patch.gapAfterPx?.[anchor];
    if (value === null || value === undefined) delete nextGaps[anchor];
    else nextGaps[anchor] = clampTokenLayerGap(value);
  }
  return normalizeTokenStyleOverride(
    { layers: nextLayers, gapAfterPx: nextGaps },
    defaults,
  );
};

const stripLegacyStyleFields = <Token extends TokenStyleCarrier>(token: Token) => {
  const next = { ...token } as Token & Record<string, unknown>;
  for (const key of LEGACY_STYLE_KEYS) delete next[key];
  return next;
};

/**
 * Bulk-patches selected tokens while retaining token IDs/order and the exact
 * object identity of every unselected token.
 */
export const patchSelectedTokenStyles = <Token extends TokenStyleCarrier>(
  tokens: readonly Token[],
  selectedIds: Iterable<string>,
  patch: TokenStylePatch,
  defaults: DocumentTokenStyle,
): Token[] => {
  const selected = new Set(selectedIds);
  return tokens.map((token) => {
    if (!selected.has(token.id)) return token;
    const next = stripLegacyStyleFields(token);
    const styleOverrides = patchTokenStyleOverride(
      tokenStyleOverrideFor(token, defaults),
      patch,
      defaults,
    );
    if (styleOverrides) next.styleOverrides = styleOverrides;
    else delete next.styleOverrides;
    return next;
  });
};

/** Clears nested and legacy per-token styles for the complete selection. */
export const clearSelectedTokenStyles = <Token extends TokenStyleCarrier>(
  tokens: readonly Token[],
  selectedIds: Iterable<string>,
): Token[] => {
  const selected = new Set(selectedIds);
  return tokens.map((token) => {
    if (!selected.has(token.id)) return token;
    const next = stripLegacyStyleFields(token);
    delete next.styleOverrides;
    return next;
  });
};
