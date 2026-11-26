/** Deterministic local publication policy for STOA OMNI documents. */

import type {
  OmniAnalysisProfile,
  OmniDocumentConfig,
  OmniTextDirection,
  OmniWritingMode,
} from "./omni-language";

export const OMNI_EXPORT_FORMATS = ["project", "pdf", "png", "latex"] as const;
export type OmniExportFormat = (typeof OMNI_EXPORT_FORMATS)[number];
export type OmniPdfOutputType = "vector" | "raster";

export const OMNI_VECTOR_STATUS = "Vector PDF — searchable and selectable text.";
export const OMNI_RASTER_STATUS = "Raster PDF — appearance preserved; text is not selectable.";

export const OMNI_PAGE_DEFAULT_EXPORT_COVERAGE = [
  "noto-serif-stoa-unicode",
  "liberation-sans-stoa-unicode",
] as const;
export type OmniDefaultExportCoverage =
  (typeof OMNI_PAGE_DEFAULT_EXPORT_COVERAGE)[number];

export const OMNI_DETECTABLE_SOURCE_SCRIPTS = [
  "latin", "greek", "cyrillic", "han", "hiragana", "katakana", "bopomofo",
  "arabic", "hebrew", "devanagari",
] as const;
export type OmniDetectedSourceScript =
  (typeof OMNI_DETECTABLE_SOURCE_SCRIPTS)[number];

export type OmniExportFontCapabilities = Readonly<{
  supportsAdditionalSourceCodePoint?: (codePoint: number, character: string) => boolean;
  additionalCoverageLabel?: string;
}>;

export type OmniExportFontUse = Readonly<{
  cssFamily: string;
  source: "bundled" | "system" | "user" | "unknown";
  available: boolean;
  embeddable: boolean | "unknown";
  coverageKnown: boolean;
  /** Exact text rendered with this family in the current publication preview. */
  renderedText?: string;
  /** Locally audited bundled coverage table; never supplied by AI or project JSON. */
  coverageId?: OmniDefaultExportCoverage;
}>;

export type OmniExportPreflightInput = Readonly<{
  sourceText: string;
  /** Every string that will actually be visible in the publication export. */
  renderedText?: string;
  direction: OmniTextDirection;
  writingMode: OmniWritingMode;
  analysisProfile?: OmniAnalysisProfile;
  /** Set only after the browser fonts and STOA's audited horizontal layout path are ready. */
  layoutParityVerified?: boolean;
  fontUses?: readonly OmniExportFontUse[];
  fontCapabilities?: OmniExportFontCapabilities;
}>;

export type OmniSourceCoverage = Readonly<{
  supported: boolean;
  scripts: readonly OmniDetectedSourceScript[];
  unsupportedCharacters: readonly string[];
  unsupportedCodePoints: readonly string[];
}>;

export type OmniVectorFallbackCode =
  | "vertical-writing"
  | "rtl-or-bidi"
  | "complex-shaping"
  | "emoji-or-color-glyph"
  | "unsupported-code-point"
  | "system-font"
  | "user-font-uncertain"
  | "font-substitution";

export type OmniVectorFallbackReason = Readonly<{
  code: OmniVectorFallbackCode;
  message: string;
  characters?: readonly string[];
  codePoints?: readonly string[];
  fontFamily?: string;
}>;

export type OmniExportUnsupportedReason =
  | Readonly<{
      code: "generic-mode-policy";
      message: string;
      format: "latex";
    }>
  | Readonly<{
      code: "font-unavailable";
      message: string;
      fontFamily: string;
    }>;

export type OmniPdfPreflight = Readonly<{
  outputType: OmniPdfOutputType;
  status: string;
  vectorSafe: boolean;
  reasons: readonly OmniVectorFallbackReason[];
}>;

export type OmniExportCapability =
  | Readonly<{
      format: OmniExportFormat;
      supported: true;
      derivedFrom?: "pdf";
      pdf?: OmniPdfPreflight;
    }>
  | Readonly<{
      format: OmniExportFormat;
      supported: false;
      reason: OmniExportUnsupportedReason;
      derivedFrom?: "pdf";
    }>;

const SCRIPT_PATTERNS: ReadonlyArray<readonly [OmniDetectedSourceScript, RegExp]> = [
  ["latin", /\p{Script_Extensions=Latin}/u],
  ["greek", /\p{Script_Extensions=Greek}/u],
  ["cyrillic", /\p{Script_Extensions=Cyrillic}/u],
  ["han", /\p{Script_Extensions=Han}/u],
  ["hiragana", /\p{Script_Extensions=Hiragana}/u],
  ["katakana", /\p{Script_Extensions=Katakana}/u],
  ["bopomofo", /\p{Script_Extensions=Bopomofo}/u],
  ["arabic", /\p{Script_Extensions=Arabic}/u],
  ["hebrew", /\p{Script_Extensions=Hebrew}/u],
  ["devanagari", /\p{Script_Extensions=Devanagari}/u],
];

type CodePointRange = readonly [number, number];

/** Intersections of all four bundled faces, generated from the shipped font cmap tables. */
const LIBERATION_SANS_AUDITED_RANGES: readonly CodePointRange[] = [
  [32, 126],
  [160, 879],
  [884, 885],
  [890, 894],
  [900, 906],
  [908, 908],
  [910, 929],
  [931, 974],
  [976, 1299],
  [1306, 1309],
  [1425, 1479],
  [1488, 1514],
  [1520, 1524],
  [7424, 7626],
  [7678, 7835],
  [7838, 7838],
  [7840, 7929],
  [7936, 7957],
  [7960, 7965],
  [7968, 8005],
  [8008, 8013],
  [8016, 8023],
  [8025, 8025],
  [8027, 8027],
  [8029, 8029],
  [8031, 8061],
  [8064, 8116],
  [8118, 8132],
  [8134, 8147],
  [8150, 8155],
  [8157, 8175],
  [8178, 8180],
  [8182, 8190],
  [8192, 8208],
  [8210, 8226],
  [8230, 8230],
  [8234, 8240],
  [8242, 8244],
  [8249, 8250],
  [8252, 8252],
  [8254, 8254],
  [8260, 8260],
  [8286, 8286],
  [8298, 8303],
  [8308, 8313],
  [8319, 8329],
  [8336, 8340],
  [8352, 8373],
  [8383, 8383],
  [8432, 8432],
  [8453, 8453],
  [8467, 8467],
  [8470, 8471],
  [8482, 8482],
  [8486, 8486],
  [8494, 8494],
  [8525, 8526],
  [8531, 8532],
  [8539, 8542],
  [8580, 8580],
  [8592, 8597],
  [8616, 8616],
  [8660, 8660],
  [8706, 8706],
  [8710, 8710],
  [8719, 8719],
  [8721, 8722],
  [8725, 8725],
  [8729, 8730],
  [8734, 8735],
  [8745, 8745],
  [8747, 8747],
  [8776, 8776],
  [8800, 8802],
  [8804, 8805],
  [8962, 8962],
  [8976, 8976],
  [8992, 8993],
  [9472, 9472],
  [9474, 9474],
  [9484, 9484],
  [9488, 9488],
  [9492, 9492],
  [9496, 9496],
  [9500, 9500],
  [9508, 9508],
  [9516, 9516],
  [9524, 9524],
  [9532, 9532],
  [9552, 9580],
  [9600, 9600],
  [9604, 9604],
  [9608, 9608],
  [9612, 9612],
  [9616, 9619],
  [9632, 9633],
  [9642, 9644],
  [9650, 9650],
  [9658, 9658],
  [9660, 9660],
  [9668, 9668],
  [9674, 9676],
  [9679, 9689],
  [9702, 9702],
  [9786, 9788],
  [9791, 9799],
  [9824, 9824],
  [9827, 9827],
  [9829, 9830],
  [9833, 9836],
  [9839, 9839],
  [11360, 11373],
  [11377, 11383],
  [11799, 11799],
  [42775, 42785],
  [42888, 42892],
  [64257, 64258],
  [64285, 64310],
  [64312, 64316],
  [64318, 64318],
  [64320, 64321],
  [64323, 64324],
  [64326, 64335],
  [65056, 65059],
  [65532, 65532],
];

const NOTO_SERIF_AUDITED_RANGES: readonly CodePointRange[] = [
  [0, 0], [13, 13], [32, 126], [160, 887], [890, 895], [900, 906], [908, 908],
  [910, 929], [931, 993], [1008, 1327], [6832, 6848], [6853, 6853], [6855, 6862],
  [7296, 7304], [7424, 7673], [7675, 7957], [7960, 7965], [7968, 8005],
  [8008, 8013], [8016, 8023], [8025, 8025], [8027, 8027], [8029, 8029],
  [8031, 8061], [8064, 8116], [8118, 8132], [8134, 8147], [8150, 8155],
  [8157, 8175], [8178, 8180], [8182, 8190], [8192, 8292], [8294, 8305],
  [8308, 8334], [8336, 8348], [8352, 8383], [8432, 8432], [8448, 8543],
  [8580, 8580], [8585, 8585], [8722, 8722], [9676, 9676], [11360, 11391],
  [11744, 11869], [42560, 42655], [42752, 42954], [42960, 42961], [42963, 42963],
  [42965, 42969], [42994, 43007], [43310, 43310], [43824, 43883], [64256, 64262],
  [65024, 65024], [65056, 65071], [65279, 65279], [65532, 65533], [67471, 67471],
  [122624, 122648], [122650, 122652],
];

const isInRanges = (
  codePoint: number,
  ranges: readonly (readonly [number, number])[],
) => ranges.some(([start, end]) => codePoint >= start && codePoint <= end);

const graphemeSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("und", { granularity: "grapheme" })
  : null;
const graphemeClusters = (text: string): string[] => graphemeSegmenter
  ? [...graphemeSegmenter.segment(text)].map(({ segment }) => segment)
  : [...text];

const codePointLabel = (character: string) => {
  const codePoint = character.codePointAt(0);
  return codePoint === undefined
    ? "U+0000"
    : `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
};

const isVerifiedCommonVectorCodePoint = (codePoint: number) =>
  codePoint === 0x0009
  || codePoint === 0x000a
  || codePoint === 0x000d
  || (codePoint >= 0x0020 && codePoint <= 0x007e)
  || (codePoint >= 0x00a0 && codePoint <= 0x00bf)
  || (codePoint >= 0x2000 && codePoint <= 0x206f)
  || (codePoint >= 0x20a0 && codePoint <= 0x20cf);
const isKnownEuropeanVectorCharacter = (character: string) => {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return false;
  return /[\p{Script_Extensions=Latin}\p{Script_Extensions=Greek}\p{Script_Extensions=Cyrillic}]/u.test(character)
    || (codePoint >= 0x0300 && codePoint <= 0x036f)
    || isVerifiedCommonVectorCodePoint(codePoint);
};

export const inspectOmniSourceCoverage = (
  sourceText: string,
  fontCapabilities: OmniExportFontCapabilities = {},
): OmniSourceCoverage => {
  const scripts = new Set<OmniDetectedSourceScript>();
  const unsupported = new Map<string, string>();
  for (const cluster of graphemeClusters(sourceText)) {
    for (const character of [...cluster]) {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined) continue;
      if (/\p{Letter}/u.test(character)) {
        const script = SCRIPT_PATTERNS.find(([, pattern]) => pattern.test(character))?.[0];
        if (script) scripts.add(script);
      }
      const supportedByExplicitFont = fontCapabilities.supportsAdditionalSourceCodePoint
        ?.call(undefined, codePoint, character) === true;
      if (!isKnownEuropeanVectorCharacter(character) && !supportedByExplicitFont) {
        unsupported.set(character, codePointLabel(character));
      }
    }
  }
  return {
    supported: unsupported.size === 0,
    scripts: OMNI_DETECTABLE_SOURCE_SCRIPTS.filter((script) => scripts.has(script)),
    unsupportedCharacters: [...unsupported.keys()],
    unsupportedCodePoints: [...unsupported.values()],
  };
};

const fallbackReason = (
  code: OmniVectorFallbackCode,
  message: string,
  details: Partial<OmniVectorFallbackReason> = {},
): OmniVectorFallbackReason => ({ code, message, ...details });

const hasBidiControls = (text: string) => /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(text);
const hasRtlScript = (text: string) => /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(text);
const hasComplexShapingScript = (text: string) => /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gujarati}\p{Script=Gurmukhi}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Myanmar}\p{Script=Khmer}]/u.test(text);
const hasEmojiOrColorGlyph = (text: string) =>
  /\p{Extended_Pictographic}/u.test(text)
  || text.includes("\u200d")
  || text.includes("\ufe0f");

const bundledCoverageSupports = (
  coverageId: OmniDefaultExportCoverage,
  codePoint: number,
  character: string,
) => {
  if (/\s/u.test(character) || codePoint < 0x20 || codePoint === 0x7f) return true;
  return isInRanges(
    codePoint,
    coverageId === "noto-serif-stoa-unicode"
      ? NOTO_SERIF_AUDITED_RANGES
      : LIBERATION_SANS_AUDITED_RANGES,
  );
};

const fontFallbackReasons = (fontUses: readonly OmniExportFontUse[]) => {
  const reasons: OmniVectorFallbackReason[] = [];
  for (const font of fontUses) {
    if (font.source === "system") {
      reasons.push(fallbackReason(
        "system-font",
        `The selected system font ${font.cssFamily} is rendered by the browser but is not available as the exact embedded PDF face.`,
        { fontFamily: font.cssFamily },
      ));
    } else if (font.source === "user" && (font.embeddable !== true || !font.coverageKnown)) {
      reasons.push(fallbackReason(
        "user-font-uncertain",
        `The imported font ${font.cssFamily} does not have verified embeddability and complete glyph coverage.`,
        { fontFamily: font.cssFamily },
      ));
    } else if (font.source === "unknown") {
      reasons.push(fallbackReason(
        "font-substitution",
        `The selected font ${font.cssFamily} cannot be reproduced exactly by the vector engine.`,
        { fontFamily: font.cssFamily },
      ));
    } else if (font.embeddable !== true || !font.coverageKnown || !font.coverageId) {
      reasons.push(fallbackReason(
        "font-substitution",
        `The selected bundled font ${font.cssFamily} does not have a complete audited vector-export mapping.`,
        { fontFamily: font.cssFamily },
      ));
    } else {
      if (font.renderedText === undefined) {
        reasons.push(fallbackReason(
          "font-substitution",
          `The exact text rendered with ${font.cssFamily} was not supplied, so its glyph assignment cannot be audited.`,
          { fontFamily: font.cssFamily },
        ));
        continue;
      }
      const missing = [...(font.renderedText ?? "")].filter((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined
          && !bundledCoverageSupports(font.coverageId!, codePoint, character);
      });
      if (missing.length) {
        const characters = [...new Set(missing)];
        reasons.push(fallbackReason(
          "unsupported-code-point",
          `The selected font ${font.cssFamily} has no audited vector coverage for ${characters.map(codePointLabel).join(", ")}.`,
          {
            fontFamily: font.cssFamily,
            characters,
            codePoints: characters.map(codePointLabel),
          },
        ));
      }
    }
  }
  return reasons;
};

export const preflightOmniPdf = (input: OmniExportPreflightInput): OmniPdfPreflight => {
  const text = input.renderedText ?? input.sourceText;
  const reasons: OmniVectorFallbackReason[] = [];
  if (input.writingMode !== "horizontal-tb") {
    reasons.push(fallbackReason("vertical-writing", "Vertical writing requires the browser-rendered PDF path."));
  }
  if (input.direction === "rtl" || hasRtlScript(text) || hasBidiControls(text)) {
    reasons.push(fallbackReason("rtl-or-bidi", "RTL or bidirectional content requires the browser-rendered PDF path."));
  }
  if (hasComplexShapingScript(text)) {
    reasons.push(fallbackReason("complex-shaping", "This script requires shaping that STOA's vector engine cannot reproduce deterministically."));
  }
  if (hasEmojiOrColorGlyph(text)) {
    reasons.push(fallbackReason("emoji-or-color-glyph", "Emoji, variation selectors, or color-glyph sequences require browser rendering."));
  }
  if (input.layoutParityVerified !== true) {
    reasons.push(fallbackReason(
      "font-substitution",
      "Browser fonts or the audited horizontal layout path are not ready, so vector-preview parity cannot be proven.",
    ));
  }
  const coverage = inspectOmniSourceCoverage(text, input.fontCapabilities);
  if (!coverage.supported) {
    reasons.push(fallbackReason(
      "unsupported-code-point",
      `The vector font set has no verified coverage for ${coverage.unsupportedCodePoints.join(", ")}.`,
      { characters: coverage.unsupportedCharacters, codePoints: coverage.unsupportedCodePoints },
    ));
  }
  if (!input.fontUses?.length) {
    reasons.push(fallbackReason(
      "font-substitution",
      "The active preview fonts were not supplied to preflight, so exact vector reproduction cannot be proven.",
    ));
  } else {
    reasons.push(...fontFallbackReasons(input.fontUses));
  }
  const deduplicated = reasons.filter((reason, index) => reasons.findIndex((candidate) =>
    candidate.code === reason.code
    && candidate.fontFamily === reason.fontFamily
    && candidate.message === reason.message) === index);
  const vectorSafe = deduplicated.length === 0;
  return {
    outputType: vectorSafe ? "vector" : "raster",
    status: vectorSafe ? OMNI_VECTOR_STATUS : OMNI_RASTER_STATUS,
    vectorSafe,
    reasons: deduplicated,
  };
};

const unavailableFont = (input: OmniExportPreflightInput): OmniExportUnsupportedReason | null => {
  const font = input.fontUses?.find((item) => !item.available);
  return font
    ? {
        code: "font-unavailable",
        fontFamily: font.cssFamily,
        message: `Re-import or install ${font.cssFamily} before export so the preview can be reproduced exactly.`,
      }
    : null;
};

const genericPolicyReason = (
  format: "latex",
): OmniExportUnsupportedReason => ({
  code: "generic-mode-policy",
  format,
  message: "Generic Mode supports Project, PDF, and PDF-derived PNG export. Confirm a locally validated inflectional-language profile to enable Unicode LaTeX.",
});

export const getOmniExportCapability = (
  format: OmniExportFormat,
  input: OmniExportPreflightInput,
): OmniExportCapability => {
  const mode = input.analysisProfile ?? "generic";
  if (mode === "generic" && format === "latex") {
    return { format, supported: false, reason: genericPolicyReason(format) };
  }
  const missingFont = unavailableFont(input);
  if (missingFont && format !== "project") return { format, supported: false, reason: missingFont };
  const pdf = preflightOmniPdf(input);
  if (format === "pdf") return { format, supported: true, pdf };
  if (format === "png") return { format, supported: true, derivedFrom: "pdf", pdf };
  return { format, supported: true };
};

export const getOmniExportCapabilities = (
  input: OmniExportPreflightInput,
): Readonly<Record<OmniExportFormat, OmniExportCapability>> => ({
  project: getOmniExportCapability("project", input),
  pdf: getOmniExportCapability("pdf", input),
  png: getOmniExportCapability("png", input),
  latex: getOmniExportCapability("latex", input),
});

export class OmniExportPreflightError extends Error {
  readonly format: OmniExportFormat;
  readonly reason: OmniExportUnsupportedReason;

  constructor(format: OmniExportFormat, reason: OmniExportUnsupportedReason) {
    super(reason.message);
    this.name = "OmniExportPreflightError";
    this.format = format;
    this.reason = reason;
  }
}

export const assertOmniExportSupported = (
  format: OmniExportFormat,
  input: OmniExportPreflightInput,
): OmniExportCapability => {
  const capability = getOmniExportCapability(format, input);
  if (!capability.supported) throw new OmniExportPreflightError(format, capability.reason);
  return capability;
};

export type OmniExportPreflightDetails = Readonly<{
  renderedText?: string;
  layoutParityVerified?: boolean;
  fontUses?: readonly OmniExportFontUse[];
  fontCapabilities?: OmniExportFontCapabilities;
}>;

/** Convenience adapter for callers holding a canonical, locally resolved config. */
export const omniExportPreflightInput = (
  sourceText: string,
  document: Pick<OmniDocumentConfig, "direction" | "writingMode" | "analysisProfile">,
  details: OmniExportPreflightDetails = {},
): OmniExportPreflightInput => ({
  sourceText,
  direction: document.direction,
  writingMode: document.writingMode,
  analysisProfile: document.analysisProfile,
  ...details,
});
