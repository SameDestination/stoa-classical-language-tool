"use client";

import { useState, type CSSProperties } from "react";
import type { StoaWorkspaceLanguageId } from "./lib/omni-language.ts";
import {
  TOKEN_FONT_SIZE_MAX_PT,
  TOKEN_FONT_SIZE_MIN_PT,
  TOKEN_FONT_SIZE_STEP_PT,
  TOKEN_GAP_ANCHORS,
  TOKEN_LAYER_GAP_MAX_PX,
  TOKEN_LAYER_GAP_MIN_PX,
  TOKEN_LAYER_GAP_STEP_PX,
  TOKEN_STYLE_LAYERS,
  aggregateEffectiveTokenStyles,
  clearSelectedTokenStyles,
  patchSelectedTokenStyles,
  resolveTokenStyle,
  type DocumentTokenStyle,
  type MixedTokenStyleValue,
  type TokenGapAnchor,
  type TokenStyleCarrier,
  type TokenStyleLayer,
  type TokenStylePatch,
  type TokenTextStyle,
} from "./lib/token-style.ts";
import { fontAvailableInWorkspace, mergeFontOptions, type StoaFontOption } from "./lib/font-registry.ts";
import { CompactAccordionSection, CompactStyleEditorFrame } from "./compact-style-editor.tsx";
import {
  PRONUNCIATION_FONT_FAMILY,
  PRONUNCIATION_MAX_SIZE_PT,
  PRONUNCIATION_MIN_SIZE_PT,
  PRONUNCIATION_SIZE_STEP_PT,
  academicPronunciationDefault,
  clampPronunciationSize,
  resolvePronunciationStyle,
} from "./lib/pronunciation.ts";
import styles from "./token-editor.module.css";

const MIXED_VALUE = "__stoa_mixed__";

export const TOKEN_EDITOR_COLOR_PRESETS = [
  { label: "Ink", value: "#29271f" },
  { label: "Rust", value: "#9e4a32" },
  { label: "Blue", value: "#2f5b78" },
  { label: "Green", value: "#3f6b4e" },
  { label: "Plum", value: "#704c78" },
] as const;

const LAYER_LABELS: Readonly<Record<TokenStyleLayer, string>> = {
  source: "Source", gloss: "Gloss", lemma: "Lemma", pos: "POS", morphology: "Morphology",
};
const GAP_LABELS: Readonly<Record<TokenGapAnchor, string>> = {
  source: "Source → Gloss", gloss: "Gloss → Lemma", lemma: "Lemma → POS", pos: "POS → Morphology",
};
const SAMPLE_CONTENT: Readonly<Record<StoaWorkspaceLanguageId, Record<TokenStyleLayer, string>>> = {
  "ancient-greek": { source: "λόγος", gloss: "word; reason", lemma: "λόγος", pos: "NOUN", morphology: "Nom. Sg. m." },
  latin: { source: "amāvit", gloss: "loved", lemma: "amō", pos: "VERB", morphology: "3S Perf. Act. Ind." },
  "classical-chinese": { source: "社稷", gloss: "the state", lemma: "社稷", pos: "NOUN", morphology: "Topic; lexicalized compound" },
  omni: { source: "語", gloss: "word", lemma: "headword", pos: "X", morphology: "language-specific form" },
};
const WORKSPACE_LABELS: Readonly<Record<StoaWorkspaceLanguageId, string>> = {
  "ancient-greek": "Ancient Greek", latin: "Latin", "classical-chinese": "Classical Chinese", omni: "OMNI · Experimental",
};
const PRONUNCIATION_SAMPLE: Readonly<Record<StoaWorkspaceLanguageId, string>> = {
  "ancient-greek": "",
  latin: "",
  "classical-chinese": "shè jì",
  omni: "sekai",
};

export type TokenEditorToken = TokenStyleCarrier & {
  surface?: string;
  gloss?: string;
  lemma?: string;
  pos?: string;
  morphology?: string;
  pinyin?: string;
  romanization?: string;
  pronunciationSize?: number;
  pronunciationColor?: string;
};
export type TokenEditorProps = {
  language: StoaWorkspaceLanguageId;
  selectionCount: number;
  selectedTokens: readonly TokenEditorToken[];
  selectedIds: readonly string[];
  focusedToken?: TokenEditorToken | null;
  documentStyle: DocumentTokenStyle;
  fontOptions?: readonly StoaFontOption[];
  pronunciationLabel?: "Pinyin" | "Romanization" | null;
  onApply: (draftTokens: readonly TokenEditorToken[]) => void;
  onCancel: () => void;
};

const mixedLabel = <Value,>(value: MixedTokenStyleValue<Value>) =>
  value.kind === "mixed" ? "Mixed" : value.kind === "empty" ? "No selection" : null;
const valueOr = <Value,>(value: MixedTokenStyleValue<Value>, fallback: Value): Value =>
  value.kind === "uniform" ? value.value : fallback;
export const nextTokenEditorBoolean = (value: MixedTokenStyleValue<boolean>): boolean =>
  value.kind === "uniform" ? !value.value : true;
const textStyleToCss = (style: TokenTextStyle): CSSProperties => ({
  color: style.color,
  fontFamily: style.fontFamily,
  fontSize: `${style.sizePt}pt`,
  fontStyle: style.italic ? "italic" : "normal",
  fontWeight: style.bold ? 700 : 400,
  textDecoration: style.underline ? "underline" : "none",
});
const uniformSummary = <Value,>(value: MixedTokenStyleValue<Value>, formatter: (item: Value) => string) =>
  value.kind === "uniform" ? formatter(value.value) : value.kind === "mixed" ? "Mixed" : "None";
const emphasisSummary = (aggregate: ReturnType<typeof aggregateEffectiveTokenStyles>["layers"][TokenStyleLayer]) => {
  const active = (["bold", "italic", "underline"] as const)
    .filter((property) => aggregate[property].kind === "uniform" && aggregate[property].value)
    .map((property) => property === "bold" ? "Bold" : property === "italic" ? "Italic" : "Underline");
  return active.length ? active.join(" + ") : "Regular";
};
export const summarizeTokenLayer = (
  aggregate: ReturnType<typeof aggregateEffectiveTokenStyles>["layers"][TokenStyleLayer],
  fonts: readonly StoaFontOption[],
) => {
  const family = uniformSummary(aggregate.fontFamily, (value) => fonts.find((font) => font.cssFamily === value)?.label ?? value.split(",")[0].trim().replace(/^['"]|['"]$/g, ""));
  const size = uniformSummary(aggregate.sizePt, (value) => `${value} pt`);
  return `${family} · ${size} · ${emphasisSummary(aggregate)}`;
};

function LayerControls({ layer, aggregate, focusedStyle, fonts, disabled, onPatch }: {
  layer: TokenStyleLayer;
  aggregate: ReturnType<typeof aggregateEffectiveTokenStyles>["layers"][TokenStyleLayer];
  focusedStyle: TokenTextStyle;
  fonts: readonly StoaFontOption[];
  disabled: boolean;
  onPatch: (patch: TokenStylePatch) => void;
}) {
  const patchProperty = <Property extends keyof TokenTextStyle>(property: Property, value: TokenTextStyle[Property]) =>
    onPatch({ layers: { [layer]: { [property]: value } } });
  const effectiveFont = valueOr(aggregate.fontFamily, focusedStyle.fontFamily);
  const effectiveColor = valueOr(aggregate.color, focusedStyle.color);
  const availableFonts = fonts.some((font) => font.cssFamily === effectiveFont)
    ? fonts
    : [...fonts, { id: `current:${layer}`, label: "Current document font", cssFamily: effectiveFont, source: "system" as const, scripts: ["greek", "latin"] as const }];
  return (
    <div className={styles.controlGrid}>
      <label className={`${styles.field} ${styles.fontField}`}>
        <span className={styles.fieldLabel}>Font family {mixedLabel(aggregate.fontFamily) && <i>{mixedLabel(aggregate.fontFamily)}</i>}</span>
        <select value={aggregate.fontFamily.kind === "mixed" ? MIXED_VALUE : effectiveFont} onChange={(event) => event.currentTarget.value !== MIXED_VALUE && patchProperty("fontFamily", event.currentTarget.value)} disabled={disabled} aria-label={`${LAYER_LABELS[layer]} font family`}>
          {aggregate.fontFamily.kind === "mixed" && <option value={MIXED_VALUE}>— Mixed fonts —</option>}
          {availableFonts.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Size {mixedLabel(aggregate.sizePt) && <i>{mixedLabel(aggregate.sizePt)}</i>}</span>
        <span className={styles.unitInput}><input type="number" min={TOKEN_FONT_SIZE_MIN_PT} max={TOKEN_FONT_SIZE_MAX_PT} step={TOKEN_FONT_SIZE_STEP_PT} value={aggregate.sizePt.kind === "uniform" ? aggregate.sizePt.value : ""} placeholder={aggregate.sizePt.kind === "mixed" ? "Mixed" : undefined} onChange={(event) => Number.isFinite(event.currentTarget.valueAsNumber) && patchProperty("sizePt", event.currentTarget.valueAsNumber)} disabled={disabled} aria-label={`${LAYER_LABELS[layer]} font size in points`} /><span aria-hidden="true">pt</span></span>
      </label>
      <fieldset className={styles.field}>
        <legend className={styles.fieldLabel}>Style</legend>
        <div className={styles.emphasisButtons}>
          {(["bold", "italic", "underline"] as const).map((property) => {
            const label = property === "bold" ? "Bold" : property === "italic" ? "Italic" : "Underline";
            const glyph = property === "bold" ? "B" : property === "italic" ? "I" : "U";
            const value = aggregate[property];
            const state = value.kind === "mixed" ? "mixed" : value.kind === "uniform" && value.value ? "on" : "off";
            return <button key={property} type="button" className={styles.emphasisButton} data-state={state} aria-label={`${LAYER_LABELS[layer]} ${label}${state === "mixed" ? ", mixed" : ""}`} aria-pressed={state === "mixed" ? "mixed" : state === "on"} onClick={() => patchProperty(property, nextTokenEditorBoolean(value))} disabled={disabled} title={state === "mixed" ? `${label}: mixed` : label}><span data-format={property}>{glyph}</span></button>;
          })}
        </div>
      </fieldset>
      <fieldset className={`${styles.field} ${styles.colorField}`}>
        <legend className={styles.fieldLabel}>Color {mixedLabel(aggregate.color) && <i>{mixedLabel(aggregate.color)}</i>}</legend>
        <div className={styles.colorControls}>
          <div className={styles.presetColors} aria-label={`${LAYER_LABELS[layer]} preset colors`}>
            {TOKEN_EDITOR_COLOR_PRESETS.map((color) => <button key={color.value} type="button" className={styles.colorSwatch} style={{ backgroundColor: color.value }} aria-label={`${color.label} ${color.value}`} aria-pressed={aggregate.color.kind === "uniform" && aggregate.color.value === color.value} title={`${color.label} · ${color.value}`} onClick={() => patchProperty("color", color.value)} disabled={disabled} />)}
          </div>
          <label className={styles.customColor} title="Custom color"><input type="color" value={effectiveColor} onChange={(event) => patchProperty("color", event.currentTarget.value)} disabled={disabled} aria-label={`${LAYER_LABELS[layer]} custom color`} /><span>Custom</span></label>
        </div>
      </fieldset>
    </div>
  );
}

const aggregateDraftValue = <Value,>(
  tokens: readonly TokenEditorToken[],
  selectedIds: ReadonlySet<string>,
  read: (token: TokenEditorToken) => Value,
): MixedTokenStyleValue<Value> => {
  const values = tokens.filter((token) => selectedIds.has(token.id)).map(read);
  if (!values.length) return { kind: "empty" };
  return values.slice(1).every((value) => Object.is(value, values[0]))
    ? { kind: "uniform", value: values[0] }
    : { kind: "mixed" };
};

function PronunciationControls({
  label,
  size,
  color,
  disabled,
  onSize,
  onColor,
}: {
  label: "Pinyin" | "Romanization";
  size: MixedTokenStyleValue<number>;
  color: MixedTokenStyleValue<string>;
  disabled: boolean;
  onSize: (value: number) => void;
  onColor: (value: string) => void;
}) {
  return <div className={styles.controlGrid}>
    <div className={`${styles.field} ${styles.fontField}`}>
      <span className={styles.fieldLabel}>Typeface</span>
      <div className={styles.fixedTypeface} title={PRONUNCIATION_FONT_FAMILY}>
        Liberation Sans STOA · fixed scholarly reading-aid face
      </div>
    </div>
    <label className={styles.field}>
      <span className={styles.fieldLabel}>Size {mixedLabel(size) && <i>{mixedLabel(size)}</i>}</span>
      <span className={styles.unitInput}>
        <input
          type="number"
          min={PRONUNCIATION_MIN_SIZE_PT}
          max={PRONUNCIATION_MAX_SIZE_PT}
          step={PRONUNCIATION_SIZE_STEP_PT}
          value={size.kind === "uniform" ? size.value : ""}
          placeholder={size.kind === "mixed" ? "Mixed" : undefined}
          onChange={(event) => Number.isFinite(event.currentTarget.valueAsNumber)
            && onSize(clampPronunciationSize(event.currentTarget.valueAsNumber))}
          disabled={disabled}
          aria-label={`${label} font size in points`}
        />
        <span aria-hidden="true">pt</span>
      </span>
    </label>
    <fieldset className={`${styles.field} ${styles.colorField}`}>
      <legend className={styles.fieldLabel}>Color {mixedLabel(color) && <i>{mixedLabel(color)}</i>}</legend>
      <div className={styles.colorControls}>
        <div className={styles.presetColors} aria-label={`${label} preset colors`}>
          {TOKEN_EDITOR_COLOR_PRESETS.map((preset) => <button
            key={preset.value}
            type="button"
            className={styles.colorSwatch}
            style={{ backgroundColor: preset.value }}
            aria-label={`${preset.label} ${preset.value}`}
            aria-pressed={color.kind === "uniform" && color.value === preset.value}
            title={`${preset.label} · ${preset.value}`}
            onClick={() => onColor(preset.value)}
            disabled={disabled}
          />)}
        </div>
        <span className={styles.restrictedHint}>Five publication-safe colours</span>
      </div>
    </fieldset>
    <p className={styles.inlineHint}>Typeface and regular emphasis are fixed; only size and colour can be overridden.</p>
  </div>;
}

export function TokenEditor({ language, selectionCount, selectedTokens, selectedIds, focusedToken, documentStyle, fontOptions = [], pronunciationLabel = null, onApply, onCancel }: TokenEditorProps) {
  const [draftTokens, setDraftTokens] = useState<TokenEditorToken[]>(() => selectedTokens.map((token) => ({ ...token })));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(["source"]));
  const toggle = (key: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const aggregate = aggregateEffectiveTokenStyles(draftTokens, selectedIds, documentStyle);
  const focusedDraftToken = draftTokens.find((token) => token.id === focusedToken?.id) ?? draftTokens[0];
  const focusedStyle = resolveTokenStyle(documentStyle, focusedDraftToken);
  const pronunciationDefault = documentStyle.pronunciation
    ?? academicPronunciationDefault(focusedStyle.layers.source);
  const selectedIdSet = new Set(selectedIds);
  const pronunciationSize = aggregateDraftValue(
    draftTokens,
    selectedIdSet,
    (token) => token.pronunciationSize ?? pronunciationDefault.sizePt,
  );
  const pronunciationColor = aggregateDraftValue(
    draftTokens,
    selectedIdSet,
    (token) => token.pronunciationColor ?? pronunciationDefault.color,
  );
  const focusedPronunciationStyle = resolvePronunciationStyle(
    focusedDraftToken ?? { surface: "" },
    focusedStyle.layers.source,
    pronunciationDefault,
  );
  const fonts = mergeFontOptions(fontOptions);
  const sourceScript = language === "ancient-greek" ? "greek" : language === "classical-chinese" ? "cjk" : "latin";
  const disabled = selectionCount < 1 || selectedIds.length < 1;
  const sample = SAMPLE_CONTENT[language];
  const workspaceLabel = WORKSPACE_LABELS[language];
  const layerFonts = (layer: TokenStyleLayer) => fonts.filter((font) => fontAvailableInWorkspace(font, language) && (language === "omni" && (layer === "source" || layer === "lemma") ? true : font.scripts.includes(language === "classical-chinese" ? "cjk" : layer === "source" || layer === "lemma" ? sourceScript : "latin")));
  const patchDraft = (patch: TokenStylePatch) => setDraftTokens((current) => patchSelectedTokenStyles(current, selectedIds, patch, documentStyle));
  const patchPronunciation = (patch: Pick<TokenEditorToken, "pronunciationSize" | "pronunciationColor">) =>
    setDraftTokens((current) => current.map((token) => selectedIdSet.has(token.id)
      ? { ...token, ...patch }
      : token));
  const clearPronunciation = () => setDraftTokens((current) => current.map((token) => selectedIdSet.has(token.id)
    ? { ...token, pronunciationSize: undefined, pronunciationColor: undefined }
    : token));
  const clearLayer = (layer: TokenStyleLayer) => patchDraft({ layers: { [layer]: null }, ...(layer === "morphology" ? {} : { gapAfterPx: { [layer]: null } }) });
  const spacingSummary = TOKEN_GAP_ANCHORS.every((anchor) => aggregate.gapAfterPx[anchor].kind === "uniform")
    ? TOKEN_GAP_ANCHORS.map((anchor) => `${valueOr(aggregate.gapAfterPx[anchor], focusedStyle.gapAfterPx[anchor])} px`).join(" · ")
    : "Mixed spacing";

  const controls = <>
    {disabled && <div className={styles.emptyState}>Select one or more tokens in the document to edit their typography.</div>}
    {pronunciationLabel && (
      <CompactAccordionSection
        id="token-editor-pronunciation"
        index="01"
        title={pronunciationLabel}
        summary={`${uniformSummary(pronunciationSize, (value) => `${value} pt`)} · ${uniformSummary(pronunciationColor, (value) => TOKEN_EDITOR_COLOR_PRESETS.find((color) => color.value === value)?.label ?? value.toUpperCase())} · Fixed face`}
        expanded={expanded.has("pronunciation")}
        onToggle={() => toggle("pronunciation")}
        action={<button type="button" className={styles.compactAction} onClick={clearPronunciation} disabled={disabled}>Clear</button>}
      >
        <PronunciationControls
          label={pronunciationLabel}
          size={pronunciationSize}
          color={pronunciationColor}
          disabled={disabled}
          onSize={(value) => patchPronunciation({ pronunciationSize: value })}
          onColor={(value) => patchPronunciation({ pronunciationColor: value })}
        />
      </CompactAccordionSection>
    )}
    {TOKEN_STYLE_LAYERS.map((layer, index) => {
      const available = layerFonts(layer);
      return <CompactAccordionSection key={layer} id={`token-editor-${layer}`} index={String(index + (pronunciationLabel ? 2 : 1)).padStart(2, "0")} title={LAYER_LABELS[layer]} summary={summarizeTokenLayer(aggregate.layers[layer], available)} expanded={expanded.has(layer)} onToggle={() => toggle(layer)} action={<button type="button" className={styles.compactAction} onClick={() => clearLayer(layer)} disabled={disabled}>Clear</button>}><LayerControls layer={layer} aggregate={aggregate.layers[layer]} focusedStyle={focusedStyle.layers[layer]} fonts={available} disabled={disabled} onPatch={patchDraft} /></CompactAccordionSection>;
    })}
    <CompactAccordionSection id="token-editor-spacing" index={pronunciationLabel ? "07" : "06"} title="Spacing and position" summary={spacingSummary} expanded={expanded.has("spacing")} onToggle={() => toggle("spacing")}>
      <p className={styles.inlineHint}>Hidden layers do not consume space.</p>
      <div className={styles.gapGrid}>{TOKEN_GAP_ANCHORS.map((anchor) => {
        const gap = aggregate.gapAfterPx[anchor];
        const rangeValue = valueOr(gap, focusedStyle.gapAfterPx[anchor]);
        return <div className={styles.gapControl} key={anchor}><label htmlFor={`token-gap-${anchor}`}>{GAP_LABELS[anchor]} {mixedLabel(gap) && <i>{mixedLabel(gap)}</i>}</label><div className={styles.gapInputs}><input id={`token-gap-${anchor}`} type="range" min={TOKEN_LAYER_GAP_MIN_PX} max={TOKEN_LAYER_GAP_MAX_PX} step={TOKEN_LAYER_GAP_STEP_PX} value={rangeValue} onChange={(event) => patchDraft({ gapAfterPx: { [anchor]: event.currentTarget.valueAsNumber } })} disabled={disabled} aria-valuetext={gap.kind === "mixed" ? `Mixed; previewing ${rangeValue} pixels` : `${rangeValue} pixels`} /><span className={styles.unitInput}><input type="number" min={TOKEN_LAYER_GAP_MIN_PX} max={TOKEN_LAYER_GAP_MAX_PX} step={TOKEN_LAYER_GAP_STEP_PX} value={gap.kind === "uniform" ? gap.value : ""} placeholder={gap.kind === "mixed" ? "Mixed" : undefined} onChange={(event) => Number.isFinite(event.currentTarget.valueAsNumber) && patchDraft({ gapAfterPx: { [anchor]: event.currentTarget.valueAsNumber } })} disabled={disabled} aria-label={`${GAP_LABELS[anchor]} in pixels`} /><span aria-hidden="true">px</span></span></div></div>;
      })}</div>
    </CompactAccordionSection>
  </>;

  const intro = <div className={styles.editorIntro}><div><b>{selectionCount === 1 ? "1 selected token" : `${selectionCount} selected tokens`}</b><span>Changes remain a draft until Apply.</span></div><span>{workspaceLabel}</span></div>;
  const pronunciationSample = pronunciationLabel
    ? pronunciationLabel === "Pinyin"
      ? focusedDraftToken?.pinyin || PRONUNCIATION_SAMPLE[language]
      : focusedDraftToken?.romanization || PRONUNCIATION_SAMPLE[language]
    : "";
  const aside = <section className={styles.previewSection} aria-labelledby="token-editor-preview"><div className={styles.previewHeading}><div><span>PREVIEW</span><h3 id="token-editor-preview">Focused token</h3></div><small>Non-destructive</small></div><div className={styles.previewFrame}><div className={styles.previewToken} aria-label={`${workspaceLabel} token style sample`}>{pronunciationLabel && <div className={styles.previewLayer} data-layer="pronunciation" style={{ ...textStyleToCss(focusedPronunciationStyle), marginBottom: "2px" }}>{pronunciationSample}</div>}{TOKEN_STYLE_LAYERS.map((layer, index) => <div key={layer} className={styles.previewLayer} data-layer={layer} style={{ ...textStyleToCss(focusedStyle.layers[layer]), marginBottom: index < TOKEN_STYLE_LAYERS.length - 1 ? `${focusedStyle.gapAfterPx[layer as TokenGapAnchor] ?? 0}px` : 0 }}>{sample[layer]}</div>)}</div></div><p>This sample follows the focused token’s effective draft style.</p></section>;
  const footer = <><button type="button" className={styles.clearAll} onClick={() => setDraftTokens((current) => clearSelectedTokenStyles(current, selectedIds).map((token) => selectedIdSet.has(token.id) ? { ...token, pronunciationSize: undefined, pronunciationColor: undefined } : token))} disabled={disabled}>Clear all token styles</button><div className={styles.footerActions}><button type="button" className={styles.cancelAction} onClick={onCancel}>Cancel</button><button type="button" className={styles.applyAction} data-modal-primary onClick={() => onApply(draftTokens)} disabled={disabled}>Apply to selection</button></div></>;
  return <CompactStyleEditorFrame intro={intro} controls={controls} aside={aside} footer={footer} />;
}

export default TokenEditor;
