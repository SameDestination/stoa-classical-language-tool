"use client";

import { useId, useState, type CSSProperties } from "react";
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
  type DocumentTokenStyle,
  type TokenGapAnchor,
  type TokenStyleLayer,
  type TokenTextStyle,
} from "./lib/token-style.ts";
import { cloneCompositionStyle, compositionStylesEqual, patchCompositionStyle, type CompositionStylePatch } from "./lib/composition-style.ts";
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
  withAcademicPronunciationDefault,
} from "./lib/pronunciation.ts";
import styles from "./composition-style-editor.module.css";

export const COMPOSITION_COLOR_PRESETS = [
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

export type CompositionDefaultSaveStatus = "idle" | "saving" | "saved" | "error";
export type CompositionStyleEditorProps = {
  language: StoaWorkspaceLanguageId;
  value: DocumentTokenStyle;
  builtInStyle: DocumentTokenStyle;
  savedDefault?: DocumentTokenStyle | null;
  fontOptions?: readonly StoaFontOption[];
  defaultSaveStatus?: CompositionDefaultSaveStatus;
  pronunciationLabel?: "Pinyin" | "Romanization" | null;
  onApply: (next: DocumentTokenStyle) => void;
  onCancel: () => void;
  onUseAsDefault: (nextDefault: DocumentTokenStyle) => void;
  onClearSavedDefault?: () => void;
};

const textStyleToCss = (style: TokenTextStyle): CSSProperties => ({
  color: style.color,
  fontFamily: style.fontFamily,
  fontSize: `${style.sizePt}pt`,
  fontStyle: style.italic ? "italic" : "normal",
  fontWeight: style.bold ? 700 : 400,
  textDecoration: style.underline ? "underline" : "none",
  textDecorationThickness: style.underline ? "from-font" : undefined,
  textUnderlineOffset: style.underline ? "0.12em" : undefined,
});
const textStylesEqual = (left: TokenTextStyle, right: TokenTextStyle) =>
  left.fontFamily === right.fontFamily && left.sizePt === right.sizePt && left.color === right.color && left.bold === right.bold && left.italic === right.italic && left.underline === right.underline;
const colorName = (value: string) => COMPOSITION_COLOR_PRESETS.find((color) => color.value === value)?.label ?? value.toUpperCase();
const emphasisSummary = (value: TokenTextStyle) => {
  const active = [value.bold && "Bold", value.italic && "Italic", value.underline && "Underline"].filter(Boolean);
  return active.length ? active.join(" + ") : "Regular";
};
export const summarizeCompositionLayer = (value: TokenTextStyle, fonts: readonly StoaFontOption[]) => {
  const family = fonts.find((font) => font.cssFamily === value.fontFamily)?.label ?? value.fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  return `${family} · ${value.sizePt} pt · ${emphasisSummary(value)} · ${colorName(value.color)}`;
};

function DocumentLayerControls({ layer, value, fonts, onPatch }: {
  layer: TokenStyleLayer;
  value: TokenTextStyle;
  fonts: readonly StoaFontOption[];
  onPatch: (patch: CompositionStylePatch) => void;
}) {
  const patchProperty = <Property extends keyof TokenTextStyle>(property: Property, next: TokenTextStyle[Property]) => onPatch({ layers: { [layer]: { [property]: next } } });
  const availableFonts = fonts.some((font) => font.cssFamily === value.fontFamily)
    ? fonts
    : [...fonts, { id: `current:${layer}`, label: "Current document font", cssFamily: value.fontFamily, source: "system" as const, scripts: ["greek", "latin"] as const }];
  return <div className={styles.controlGrid}>
    <label className={`${styles.field} ${styles.fontField}`}><span className={styles.fieldLabel}>Font family</span><select value={value.fontFamily} onChange={(event) => patchProperty("fontFamily", event.currentTarget.value)} aria-label={`${LAYER_LABELS[layer]} default font family`}>{availableFonts.map((font) => <option key={font.id} value={font.cssFamily}>{font.label}</option>)}</select></label>
    <label className={styles.field}><span className={styles.fieldLabel}>Size</span><span className={styles.unitInput}><input type="number" min={TOKEN_FONT_SIZE_MIN_PT} max={TOKEN_FONT_SIZE_MAX_PT} step={TOKEN_FONT_SIZE_STEP_PT} value={value.sizePt} onChange={(event) => Number.isFinite(event.currentTarget.valueAsNumber) && patchProperty("sizePt", event.currentTarget.valueAsNumber)} aria-label={`${LAYER_LABELS[layer]} default font size in points`} /><span aria-hidden="true">pt</span></span></label>
    <fieldset className={styles.field}><legend className={styles.fieldLabel}>Style</legend><div className={styles.emphasisButtons}>{(["bold", "italic", "underline"] as const).map((property) => {
      const label = property === "bold" ? "Bold" : property === "italic" ? "Italic" : "Underline";
      const glyph = property === "bold" ? "B" : property === "italic" ? "I" : "U";
      return <button key={property} type="button" className={styles.emphasisButton} data-state={value[property] ? "on" : "off"} aria-label={`${LAYER_LABELS[layer]} default ${label}`} aria-pressed={value[property]} title={label} onClick={() => patchProperty(property, !value[property])}><span data-format={property}>{glyph}</span></button>;
    })}</div></fieldset>
    <fieldset className={`${styles.field} ${styles.colorField}`}><legend className={styles.fieldLabel}>Color</legend><div className={styles.colorControls}><div className={styles.presetColors} aria-label={`${LAYER_LABELS[layer]} preset colors`}>{COMPOSITION_COLOR_PRESETS.map((color) => <button key={color.value} type="button" className={styles.colorSwatch} style={{ backgroundColor: color.value }} aria-label={`${color.label} ${color.value}`} aria-pressed={value.color === color.value} title={`${color.label} · ${color.value}`} onClick={() => patchProperty("color", color.value)} />)}</div><label className={styles.customColor} title="Custom color"><input type="color" value={value.color} onChange={(event) => patchProperty("color", event.currentTarget.value)} aria-label={`${LAYER_LABELS[layer]} custom default color`} /><span>Custom</span></label></div></fieldset>
  </div>;
}

function DocumentPronunciationControls({ label, value, onPatch }: {
  label: "Pinyin" | "Romanization";
  value: NonNullable<DocumentTokenStyle["pronunciation"]>;
  onPatch: (patch: CompositionStylePatch) => void;
}) {
  return <div className={styles.controlGrid}>
    <div className={`${styles.field} ${styles.fontField}`}>
      <span className={styles.fieldLabel}>Typeface</span>
      <div className={styles.fixedTypeface} title={PRONUNCIATION_FONT_FAMILY}>
        Liberation Sans STOA · fixed scholarly reading-aid face
      </div>
    </div>
    <label className={styles.field}>
      <span className={styles.fieldLabel}>Size</span>
      <span className={styles.unitInput}>
        <input
          type="number"
          min={PRONUNCIATION_MIN_SIZE_PT}
          max={PRONUNCIATION_MAX_SIZE_PT}
          step={PRONUNCIATION_SIZE_STEP_PT}
          value={value.sizePt}
          onChange={(event) => Number.isFinite(event.currentTarget.valueAsNumber)
            && onPatch({ pronunciation: { sizePt: clampPronunciationSize(event.currentTarget.valueAsNumber) } })}
          aria-label={`${label} default font size in points`}
        />
        <span aria-hidden="true">pt</span>
      </span>
    </label>
    <fieldset className={`${styles.field} ${styles.colorField}`}>
      <legend className={styles.fieldLabel}>Color</legend>
      <div className={styles.colorControls}>
        <div className={styles.presetColors} aria-label={`${label} default preset colors`}>
          {COMPOSITION_COLOR_PRESETS.map((color) => <button
            key={color.value}
            type="button"
            className={styles.colorSwatch}
            style={{ backgroundColor: color.value }}
            aria-label={`${color.label} ${color.value}`}
            aria-pressed={value.color === color.value}
            title={`${color.label} · ${color.value}`}
            onClick={() => onPatch({ pronunciation: { color: color.value } })}
          />)}
        </div>
        <span className={styles.restrictedHint}>Five publication-safe colours</span>
      </div>
    </fieldset>
    <p className={styles.inlineHint}>Typeface and regular emphasis are fixed; only the document default size and colour can change.</p>
  </div>;
}

export function CompositionStyleEditor({ language, value, builtInStyle, savedDefault = null, fontOptions = [], defaultSaveStatus = "idle", pronunciationLabel = null, onApply, onCancel, onUseAsDefault, onClearSavedDefault }: CompositionStyleEditorProps) {
  const reactId = useId();
  const idPrefix = `composition-style-${reactId.replaceAll(":", "")}`;
  const [draft, setDraft] = useState<DocumentTokenStyle>(() => cloneCompositionStyle(
    pronunciationLabel ? withAcademicPronunciationDefault(value) : value,
  ));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(["source"]));
  const toggle = (key: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const fonts = mergeFontOptions(fontOptions);
  const sourceScript = language === "ancient-greek" ? "greek" : language === "classical-chinese" ? "cjk" : "latin";
  const sample = SAMPLE_CONTENT[language];
  const workspaceLabel = WORKSPACE_LABELS[language];
  const patch = (nextPatch: CompositionStylePatch) => setDraft((current) => patchCompositionStyle(current, nextPatch));
  const builtInPronunciation = builtInStyle.pronunciation
    ?? academicPronunciationDefault(builtInStyle.layers.source);
  const draftPronunciation = draft.pronunciation
    ?? academicPronunciationDefault(draft.layers.source);
  const layerFonts = (layer: TokenStyleLayer) => fonts.filter((font) => fontAvailableInWorkspace(font, language) && (language === "omni" && (layer === "source" || layer === "lemma") ? true : font.scripts.includes(language === "classical-chinese" ? "cjk" : layer === "source" || layer === "lemma" ? sourceScript : "latin")));
  const matchesSavedDefault = savedDefault ? compositionStylesEqual(draft, savedDefault) : false;
  const matchesBuiltIn = compositionStylesEqual(draft, builtInStyle);
  const defaultStatusText = defaultSaveStatus === "saving" ? "Saving future default…" : defaultSaveStatus === "error" ? "The future default could not be saved." : matchesSavedDefault || defaultSaveStatus === "saved" ? "Current draft is saved for future documents." : savedDefault ? "A different style is saved for future documents." : "Future documents use STOA defaults.";
  const spacingSummary = TOKEN_GAP_ANCHORS.map((anchor) => `${draft.gapAfterPx[anchor]} px`).join(" · ");
  const futureSummary = matchesSavedDefault ? "Draft matches saved default" : savedDefault ? "Saved default available" : "Built-in default";

  const intro = <div className={styles.editorIntro}><div><b>{pronunciationLabel ? `${pronunciationLabel} + five Details defaults` : "Five-layer default style"}</b><span>Edits remain local until Apply.</span></div><span>Current document · {workspaceLabel}</span></div>;
  const controls = <>
    {pronunciationLabel && (
      <CompactAccordionSection
        id={`${idPrefix}-pronunciation`}
        index="01"
        title={pronunciationLabel}
        summary={`Liberation Sans STOA · ${draftPronunciation.sizePt} pt · ${colorName(draftPronunciation.color)}`}
        expanded={expanded.has("pronunciation")}
        onToggle={() => toggle("pronunciation")}
        action={<button
          type="button"
          className={styles.compactAction}
          onClick={() => patch({ pronunciation: { ...builtInPronunciation } })}
          disabled={draftPronunciation.sizePt === builtInPronunciation.sizePt
            && draftPronunciation.color === builtInPronunciation.color}
        >Reset</button>}
      >
        <DocumentPronunciationControls
          label={pronunciationLabel}
          value={draftPronunciation}
          onPatch={patch}
        />
      </CompactAccordionSection>
    )}
    {TOKEN_STYLE_LAYERS.map((layer, index) => {
      const available = layerFonts(layer);
      return <CompactAccordionSection key={layer} id={`${idPrefix}-${layer}`} index={String(index + (pronunciationLabel ? 2 : 1)).padStart(2, "0")} title={LAYER_LABELS[layer]} summary={summarizeCompositionLayer(draft.layers[layer], available)} expanded={expanded.has(layer)} onToggle={() => toggle(layer)} action={<button type="button" className={styles.compactAction} onClick={() => patch({ layers: { [layer]: { ...builtInStyle.layers[layer] } } })} disabled={textStylesEqual(draft.layers[layer], builtInStyle.layers[layer])}>Reset</button>}><DocumentLayerControls layer={layer} value={draft.layers[layer]} fonts={available} onPatch={patch} /></CompactAccordionSection>;
    })}
    <CompactAccordionSection id={`${idPrefix}-spacing`} index={pronunciationLabel ? "07" : "06"} title="Spacing and position" summary={spacingSummary} expanded={expanded.has("spacing")} onToggle={() => toggle("spacing")}>
      <p className={styles.inlineHint}>Hidden layers never consume a gap.</p>
      <div className={styles.gapGrid}>{TOKEN_GAP_ANCHORS.map((anchor) => <div className={styles.gapControl} key={anchor}><label htmlFor={`${idPrefix}-gap-${anchor}`}>{GAP_LABELS[anchor]}</label><div className={styles.gapInputs}><input id={`${idPrefix}-gap-${anchor}`} type="range" min={TOKEN_LAYER_GAP_MIN_PX} max={TOKEN_LAYER_GAP_MAX_PX} step={TOKEN_LAYER_GAP_STEP_PX} value={draft.gapAfterPx[anchor]} onChange={(event) => patch({ gapAfterPx: { [anchor]: event.currentTarget.valueAsNumber } })} aria-valuetext={`${draft.gapAfterPx[anchor]} pixels`} /><span className={styles.unitInput}><input type="number" min={TOKEN_LAYER_GAP_MIN_PX} max={TOKEN_LAYER_GAP_MAX_PX} step={TOKEN_LAYER_GAP_STEP_PX} value={draft.gapAfterPx[anchor]} onChange={(event) => Number.isFinite(event.currentTarget.valueAsNumber) && patch({ gapAfterPx: { [anchor]: event.currentTarget.valueAsNumber } })} aria-label={`${GAP_LABELS[anchor]} default gap in pixels`} /><span aria-hidden="true">px</span></span></div></div>)}</div>
    </CompactAccordionSection>
  </>;

  const pronunciationPreviewStyle = resolvePronunciationStyle(
    {},
    draft.layers.source,
    draftPronunciation,
  );
  const pronunciationPreview = pronunciationLabel === "Pinyin" ? "shè jì" : "sekai";
  const preview = <section className={styles.previewSection} aria-labelledby={`${idPrefix}-preview`}><div className={styles.previewHeading}><div><span>PREVIEW</span><h3 id={`${idPrefix}-preview`}>Document defaults</h3></div><small>Non-destructive</small></div><div className={styles.previewFrame}><div className={styles.previewToken} aria-label="Document default token style sample">{pronunciationLabel && <div className={styles.previewLayer} data-layer="pronunciation" style={{ ...textStyleToCss(pronunciationPreviewStyle), marginBottom: "2px" }}>{pronunciationPreview}</div>}{TOKEN_STYLE_LAYERS.map((layer, index) => <div key={layer} className={styles.previewLayer} data-layer={layer} style={{ ...textStyleToCss(draft.layers[layer]), marginBottom: index < TOKEN_STYLE_LAYERS.length - 1 ? `${draft.gapAfterPx[layer as TokenGapAnchor] ?? 0}px` : 0 }}>{sample[layer]}</div>)}</div></div><p>The document and token overrides are unchanged until Apply.</p></section>;
  const future = <CompactAccordionSection id={`${idPrefix}-future`} title="Future document defaults" summary={futureSummary} expanded={expanded.has("future")} onToggle={() => toggle("future")}>
    <div className={styles.defaultSection}><p role="status" aria-live="polite" data-status={defaultSaveStatus}>{defaultStatusText}</p><small>Imported projects keep explicit styles. Token overrides retain highest priority.</small><div className={styles.defaultActions}><button type="button" className={styles.primaryAction} onClick={() => onUseAsDefault(cloneCompositionStyle(draft))} disabled={matchesSavedDefault || defaultSaveStatus === "saving"}>{matchesSavedDefault ? "Saved as future default" : "Use draft for future documents"}</button>{savedDefault && !matchesSavedDefault && <button type="button" className={styles.secondaryAction} onClick={() => setDraft(cloneCompositionStyle(savedDefault))}>Load saved default into draft</button>}<button type="button" className={styles.secondaryAction} onClick={() => setDraft(cloneCompositionStyle(builtInStyle))} disabled={matchesBuiltIn}>Reset draft to built-in</button>{savedDefault && onClearSavedDefault && <button type="button" className={styles.tertiaryAction} onClick={onClearSavedDefault}>Use built-in for future documents</button>}</div></div>
  </CompactAccordionSection>;
  const footer = <><span className={styles.footerStatus}>{compositionStylesEqual(draft, value) ? "No unapplied changes" : "Unapplied document changes"}</span><div className={styles.footerActions}><button type="button" className={styles.cancelAction} onClick={onCancel}>Cancel</button><button type="button" className={styles.applyAction} data-modal-primary onClick={() => onApply(cloneCompositionStyle(draft))}>Apply to document</button></div></>;
  return <CompactStyleEditorFrame intro={intro} controls={controls} aside={<>{preview}{future}</>} footer={footer} />;
}

export default CompositionStyleEditor;
