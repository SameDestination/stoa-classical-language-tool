import type { StoaWorkspaceLanguageId } from "./omni-language.ts";
import {
  TOKEN_FONT_SIZE_MAX_PT,
  TOKEN_FONT_SIZE_MIN_PT,
  TOKEN_FONT_SIZE_STEP_PT,
  canonicalizeTokenColor,
  clampTokenFontSize,
  type DocumentTokenStyle,
  type PronunciationTextStyle,
  type TokenTextStyle,
} from "./token-style.ts";

/**
 * Shared publication contract for the reading aid rendered above a source
 * token. The fixed sans-serif face follows common pinyin/ruby practice and is
 * already bundled for searchable vector PDF and portable LaTeX output.
 */
export const PRONUNCIATION_FONT_FAMILY = "'Liberation Sans STOA', Arial, sans-serif";
export const PRONUNCIATION_LINE_HEIGHT = 1.14;
export const PRONUNCIATION_GAP_AFTER_PX = 2;
export const PRONUNCIATION_DEFAULT_SIZE_RATIO = 0.5;
export const PRONUNCIATION_MIN_SIZE_PT = Math.max(7, TOKEN_FONT_SIZE_MIN_PT);
export const PRONUNCIATION_MAX_SIZE_PT = TOKEN_FONT_SIZE_MAX_PT;
export const PRONUNCIATION_SIZE_STEP_PT = TOKEN_FONT_SIZE_STEP_PT;

export const clampPronunciationSize = (value: number): number => Math.min(
  PRONUNCIATION_MAX_SIZE_PT,
  Math.max(PRONUNCIATION_MIN_SIZE_PT, clampTokenFontSize(value)),
);

export type PronunciationTokenFields = {
  surface: string;
  /** Modern Standard Mandarin Hanyu Pinyin for Classical Chinese tokens. */
  pinyin?: string;
  /** Pronunciation-oriented Latin romanization for non-Latin OMNI tokens. */
  romanization?: string;
  /** Sparse per-token overrides. The typeface and emphasis are intentionally fixed. */
  pronunciationSize?: number;
  pronunciationColor?: string;
};

const LATIN_SCRIPT_LETTER = /\p{Script_Extensions=Latin}/u;
const LETTER = /\p{L}/u;

export const containsNonLatinScriptLetters = (value: string): boolean =>
  [...value].some((character) => LETTER.test(character) && !LATIN_SCRIPT_LETTER.test(character));

export const supportsPronunciationLayer = (
  language: StoaWorkspaceLanguageId,
  sourceText: string,
): boolean => language === "classical-chinese"
  || (language === "omni" && containsNonLatinScriptLetters(sourceText));

export const pronunciationLabelFor = (
  language: StoaWorkspaceLanguageId,
  sourceText: string,
): "Pinyin" | "Romanization" | null => language === "classical-chinese"
  ? "Pinyin"
  : language === "omni" && containsNonLatinScriptLetters(sourceText)
    ? "Romanization"
    : null;

export const pronunciationTextFor = (
  token: PronunciationTokenFields,
  language: StoaWorkspaceLanguageId,
): string => {
  const value = language === "classical-chinese"
    ? token.pinyin
    : language === "omni" && containsNonLatinScriptLetters(token.surface)
      ? token.romanization
      : "";
  return typeof value === "string" ? value.normalize("NFC") : "";
};

const roundedAcademicDefaultSize = (sourceSizePt: number) => Math.max(
  PRONUNCIATION_MIN_SIZE_PT,
  Math.round(sourceSizePt * PRONUNCIATION_DEFAULT_SIZE_RATIO / PRONUNCIATION_SIZE_STEP_PT)
    * PRONUNCIATION_SIZE_STEP_PT,
);

export const academicPronunciationDefault = (
  sourceStyle: TokenTextStyle,
): PronunciationTextStyle => ({
  sizePt: roundedAcademicDefaultSize(sourceStyle.sizePt),
  color: sourceStyle.color,
});

export const withAcademicPronunciationDefault = (
  style: DocumentTokenStyle,
): DocumentTokenStyle => ({
  ...style,
  pronunciation: style.pronunciation ?? academicPronunciationDefault(style.layers.source),
});

export const resolvePronunciationStyle = (
  token: Pick<PronunciationTokenFields, "pronunciationSize" | "pronunciationColor">,
  sourceStyle: TokenTextStyle,
  documentDefault?: PronunciationTextStyle,
): TokenTextStyle => ({
  fontFamily: PRONUNCIATION_FONT_FAMILY,
  sizePt: typeof token.pronunciationSize === "number" && Number.isFinite(token.pronunciationSize)
    ? clampPronunciationSize(token.pronunciationSize)
    : documentDefault
      ? clampPronunciationSize(documentDefault.sizePt)
      : roundedAcademicDefaultSize(sourceStyle.sizePt),
  color: canonicalizeTokenColor(token.pronunciationColor)
    ?? canonicalizeTokenColor(documentDefault?.color)
    ?? sourceStyle.color,
  bold: false,
  italic: false,
  underline: false,
});
