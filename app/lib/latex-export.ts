import {
  TOKEN_CARD_METRICS,
  TOKEN_LAYER_LINE_HEIGHT,
  deriveDocumentTokenStyleDefaults,
  deriveLegacyTokenLayerVisibility,
  normalizeDocumentTokenStyle,
  resolveTokenStyle,
  resolveVisibleTokenLayers,
  type DocumentTokenStyle,
  type LegacyTokenStyleSettings,
  type TokenStyleCarrier,
  type TokenStyleLayer,
} from "./token-style.ts";
import type { UserFontFaceStyle, UserFontReference } from "./user-fonts.ts";
import {
  CLASSICAL_CHINESE_BUILTIN_FONTS,
  findClassicalChineseBuiltinFont,
  type ClassicalChineseBuiltinFontDefinition,
} from "./classical-chinese-fonts.ts";
import {
  analysisNoteDestination,
  numberAnalysisNotes,
  normalizeAnalysisNotes,
  tokenNoteDestination,
  type AnalysisNoteInput,
} from "./analysis-notes.ts";
import {
  PRONUNCIATION_FONT_FAMILY,
  PRONUNCIATION_GAP_AFTER_PX,
  PRONUNCIATION_LINE_HEIGHT,
  resolvePronunciationStyle,
} from "./pronunciation.ts";

type BreakAfter = "none" | "line" | "paragraph";

export type LatexInterlinearToken = TokenStyleCarrier & {
  surface: string;
  punctuationBefore?: string;
  punctuationAfter?: string;
  gloss: string;
  lemma: string;
  pos: string;
  morphology: string;
  /** Canonical local classification; explicit false overrides legacy POS fallback. */
  isIndeclinable?: boolean;
  breakAfter?: BreakAfter;
  blankLinesAfter?: number;
  blankLineSpacing?: number;
  pinyin?: string;
  romanization?: string;
  pronunciationSize?: number;
  pronunciationColor?: string;
};

export type LatexInterlinearSettings = LegacyTokenStyleSettings & {
  tokenStyle?: DocumentTokenStyle;
  translationSize?: number;
  translationFont?: string;
  translationColor?: string;
  translationBold?: boolean;
  translationItalic?: boolean;
  translationUnderline?: boolean;
  showTranslation?: boolean;
  annotationTarget?: "english" | "chinese";
  wordGap: number;
  paperWidthMm: number;
  paperHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headerLeft: string;
  headerRight: string;
  footerLeft: string;
  footerRight: string;
  background: string;
  ink: string;
  showLemma: boolean;
  showPos: boolean;
  hideIndeclinableDetails: boolean;
  /** Analysis Notes are a classical-language publication feature. */
  showNotes?: boolean;
  /** Note markers can be hidden independently from the Notes section. */
  showNoteMarkers?: boolean;
  showPronunciation?: boolean;
  /** Device-local binary data is intentionally excluded; referenced files must accompany the .tex file. */
  fontReferences?: UserFontReference[];
};

export type LatexInterlinearAnalysis = {
  /** OMNI is deliberately excluded from the classical Analysis Notes workflow. */
  language?: string;
  tokens: LatexInterlinearToken[];
  literalTranslation?: string;
  naturalTranslation?: string;
  /** Accept legacy string notes as well as STOA 5.8 anchored notes. */
  notes?: readonly AnalysisNoteInput[];
};

const PT_TO_PX = 96 / 72;
const PX_TO_PT = 72 / 96;
const INDECLINABLE_PARTS_OF_SPEECH = new Set(["ADV", "ADP", "CCONJ", "SCONJ", "PART", "INTJ"]);

const texEscape = (value: string) => {
  const replacements: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "&": "\\&",
    "%": "\\%",
    "$": "\\$",
    "#": "\\#",
    "_": "\\_",
    "{": "\\{",
    "}": "\\}",
  };
  return value.replace(/[\\&%$#_{}]/g, (character) => replacements[character]);
};

const texMultiline = (value: string, underline: boolean) => value
  .split(/\r\n|\r|\n/)
  .map((line) => {
    const escaped = line ? texEscape(line) : "\\strut";
    return underline ? `\\underline{${escaped}}` : escaped;
  })
  .join("\\\\");

/**
 * Translation prose must remain ordinary breakable LaTeX paragraphs. Using a
 * tabular, shortstack, parbox, or minipage here would keep a long translation
 * together and reintroduce the page-overflow bug fixed in Preview and PDF.
 */
const texTranslationParagraphs = (value: string) => value
  .split(/\r\n|\r|\n/u)
  .map((line) => line ? texEscape(line) : "\\mbox{}")
  .join("\\par\n");

const normalizedTranslationSize = (value: number | undefined) => Number.isFinite(value)
  ? Math.min(72, Math.max(4, value as number))
  : 10.5;

const translationSection = (
  label: string,
  text: string,
  translationSize: number,
  settings: LatexInterlinearSettings,
  importedFonts: readonly UserFontReference[],
) => {
  if (!text.trim()) return "";
  const lineHeight = (translationSize * 1.55).toFixed(1);
  const font = latexInlineFontCommand(settings.translationFont ?? settings.englishFont ?? "'Noto Serif STOA', serif", settings.translationBold ?? false, settings.translationItalic !== false, importedFonts);
  const emphasis = (settings.translationBold ? "\\bfseries" : "\\mdseries") + (settings.translationItalic === false ? "\\upshape" : "\\itshape");
  const content = texTranslationParagraphs(text);
  const decorated = settings.translationUnderline ? "\\uline{" + content + "}" : content;
  return `\\par\\vspace{22.50pt}
\\noindent{\\color{Ink!14}\\rule{\\linewidth}{0.40pt}}\\par
\\vspace{14.25pt}
{\\NoteFont\\fontsize{8}{10}\\selectfont\\bfseries\\addfontfeatures{LetterSpace=15}\\color{Accent}${texEscape(label)}\\par}
\\vspace{6.75pt}
{${font}\\fontsize{${translationSize}}{${lineHeight}}\\selectfont${emphasis}\\color[HTML]{${(settings.translationColor ?? settings.ink).slice(1).toUpperCase()}}${decorated}\\par}
\\nopagebreak[4]\\vspace{14.25pt}
\\noindent{\\color{Ink!14}\\rule{\\linewidth}{0.40pt}}`;
};

const normalizedAnalysisNoteSize = (translationSize: number) =>
  Math.max(7, translationSize * 0.86);

const texAnalysisNoteText = (value: string) => value
  .split(/\r\n|\r|\n/u)
  .map((line) => line ? texEscape(line) : "\\mbox{}")
  .join("\\linebreak{}\n");

type NumberedAnalysisNote = ReturnType<typeof numberAnalysisNotes>[number];

/**
 * Notes remain ordinary paragraphs so long scholarly prose can break naturally
 * across pages. The number column and hanging indent follow conventional
 * scholarly endnote typography without wrapping the section in a minipage.
 */
const analysisNotesSection = (
  notes: readonly NumberedAnalysisNote[],
  translationSize: number,
) => {
  if (!notes.length) return "";
  const noteSize = normalizedAnalysisNoteSize(translationSize);
  const lineHeight = (noteSize * 1.42).toFixed(1);
  const items = notes.map((note) => note.tokenId
    ? `\\StoaAnchoredAnalysisNote{${analysisNoteDestination(note.id)}}{${tokenNoteDestination(note.tokenId)}}{${note.number}}{${texAnalysisNoteText(note.text)}}`
    : `\\StoaUnanchoredAnalysisNote{${analysisNoteDestination(note.id)}}{${note.number}}{${texAnalysisNoteText(note.text)}}`)
    .join("\n\\vspace{4.50pt}\n");
  const minimumOpeningHeight = 22.5 + 0.4 + 14.25 + 10 + 6.75 + Number(lineHeight);
  return `\\par\\Needspace{${minimumOpeningHeight.toFixed(1)}pt}\\vspace{22.50pt}
\\noindent{\\color{Ink!14}\\rule{\\linewidth}{0.40pt}}\\par
\\vspace{14.25pt}
{\\NoteFont\\fontsize{8}{10}\\selectfont\\bfseries\\addfontfeatures{LetterSpace=15}\\color{Accent}ANALYSIS NOTES\\par}
\\vspace{6.75pt}
\\begingroup
\\NoteFont\\fontsize{${noteSize.toFixed(1)}}{${lineHeight}}\\selectfont\\color{Ink}
${items}
\\par\\endgroup`;
};

const latexFontName = (family: string) => {
  const bundledChinese = findClassicalChineseBuiltinFont(family);
  if (bundledChinese) return bundledChinese.latexFamilyName;
  if (/Noto\s+Serif\s+STOA/iu.test(family)) return "Noto Serif";
  if (/Liberation\s+Sans\s+STOA/iu.test(family)) return "Liberation Sans";
  if (/Noto\s+Sans\s+(?:CJK\s+)?SC|NotoSansSC/iu.test(family)) return "Noto Sans CJK SC";
  if (/Noto\s+Sans\s+(?:CJK\s+)?JP|NotoSansJP/iu.test(family)) return "Noto Sans CJK JP";
  if (/^['"]?Times New Roman['"]?(?:,|$)/i.test(family)) return "Times New Roman";
  if (family.includes("Times")) return "TeX Gyre Termes";
  if (family.includes("Georgia")) return "TeX Gyre Schola";
  if (family.includes("Palatino")) return "TeX Gyre Pagella";
  if (family.includes("Arial") || family.includes("Inter") || family.includes("sans-serif")) {
    return "TeX Gyre Heros";
  }
  const firstFamily = family.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return firstFamily || "TeX Gyre Termes";
};

const faceStyle = (bold: boolean, italic: boolean): UserFontFaceStyle => {
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
};

const importedFontFor = (
  family: string,
  bold: boolean,
  italic: boolean,
  references: readonly UserFontReference[],
) => references.find((font) => font.cssFamily === family && font.faceStyle === faceStyle(bold, italic))
  ?? references.find((font) => font.cssFamily === family && font.faceStyle === "normal");

const safeLatexFilename = (filename: string) => filename.replace(/[{}]/gu, "_");

const bundledFontFilename = (assetPath: string) => assetPath.split("/").at(-1) ?? assetPath;
const sourceHanScFallback = CLASSICAL_CHINESE_BUILTIN_FONTS.find((font) =>
  font.id === "bundled:source-han-serif-sc");

const bundledChineseFaceOptions = (
  font: ClassicalChineseBuiltinFontDefinition,
  bold: boolean,
  italic: boolean,
) => [
  "Path=./fonts/",
  bold && !font.faces.bold ? "FakeBold=2" : "",
  italic ? "FakeSlant=0.2" : "",
].filter(Boolean);

const sourceHanFallbackOption = (bold: boolean, italic: boolean) => {
  if (!sourceHanScFallback) return "";
  const options = [
    "Path=./fonts/",
    bold ? "FakeBold=2" : "",
    italic ? "FakeSlant=0.2" : "",
  ].filter(Boolean).join(",");
  return `FallBack={ [${options}]${bundledFontFilename(sourceHanScFallback.faces.normal)} }`;
};

const bundledChineseInlineFont = (
  font: ClassicalChineseBuiltinFontDefinition,
  bold: boolean,
  italic: boolean,
) => {
  const selectedFace = bold && font.faces.bold ? font.faces.bold : font.faces.normal;
  const fontspecOptions = bundledChineseFaceOptions(font, bold, italic).join(",");
  const cjkOptions = [
    ...bundledChineseFaceOptions(font, bold, italic),
    font.id !== sourceHanScFallback?.id ? sourceHanFallbackOption(bold, italic) : "",
  ].filter(Boolean).join(",");
  const filename = safeLatexFilename(bundledFontFilename(selectedFace));
  return `\\fontspec[${fontspecOptions}]{${filename}}\\CJKfontspec[${cjkOptions}]{${filename}}`;
};

const latexInlineFontCommand = (
  family: string,
  bold: boolean,
  italic: boolean,
  references: readonly UserFontReference[],
) => {
  const bundledChinese = findClassicalChineseBuiltinFont(family);
  if (bundledChinese) return bundledChineseInlineFont(bundledChinese, bold, italic);
  const imported = importedFontFor(family, bold, italic, references);
  if (imported) return `\\fontspec[Path=./]{\\detokenize{${safeLatexFilename(imported.filename)}}}`;
  return family.includes("Vusillus")
    ? "\\fontspec[Path=./]{vu3r.ttf}"
    : `\\fontspec{${texEscape(latexFontName(family))}}`;
};

const latexPageText = (template: string, tokenCount: number) => template
  .split(/(\{page:02\}|\{page\}|\{pages\}|\{tokens\})/g)
  .map((part) => {
    if (part === "{page:02}" || part === "{page}") return "\\thepage";
    if (part === "{pages}") return "\\pageref{LastPage}";
    if (part === "{tokens}") return String(tokenCount);
    return texEscape(part);
  })
  .join("");

const sourceText = (token: LatexInterlinearToken) =>
  `${token.punctuationBefore ?? ""}${token.surface}${token.punctuationAfter ?? ""}`;

const layerText = (token: LatexInterlinearToken, layer: TokenStyleLayer) => {
  if (layer === "source") return sourceText(token);
  if (layer === "gloss") return token.gloss;
  if (layer === "lemma") return token.lemma;
  if (layer === "pos") return token.pos.toUpperCase();
  return token.morphology;
};

const paragraphSpacingPt = (
  token: LatexInterlinearToken,
  documentStyle: DocumentTokenStyle,
) => {
  const lines = Number.isFinite(token.blankLinesAfter)
    ? Math.min(20, Math.max(1, Math.round(token.blankLinesAfter as number)))
    : 1;
  const defaultPx = Math.max(18, documentStyle.layers.source.sizePt * PT_TO_PX * 0.65);
  const spacingPx = Number.isFinite(token.blankLineSpacing)
    ? Math.min(200, Math.max(1, token.blankLineSpacing as number))
    : defaultPx;
  return lines * spacingPx * PX_TO_PT;
};

const styleDocument = (settings: LatexInterlinearSettings) => {
  const fallback = deriveDocumentTokenStyleDefaults(settings);
  return settings.tokenStyle
    ? normalizeDocumentTokenStyle(settings.tokenStyle, fallback)
    : fallback;
};

export const buildStoaLatex = (
  analysis: LatexInterlinearAnalysis,
  settings: LatexInterlinearSettings,
) => {
  const documentStyle = styleDocument(settings);
  const supportsAnalysisNotes = analysis.language !== "omni";
  const numberedNotes: NumberedAnalysisNote[] = supportsAnalysisNotes
    ? numberAnalysisNotes(normalizeAnalysisNotes(
        analysis.notes,
        analysis.tokens.map((token) => token.id),
      ))
    : [];
  const showNotes = supportsAnalysisNotes && settings.showNotes !== false;
  const showNoteMarkers = supportsAnalysisNotes && settings.showNoteMarkers !== false;
  const notesByToken = new Map<string, NumberedAnalysisNote[]>();
  numberedNotes.forEach((note) => {
    if (!note.tokenId) return;
    const current = notesByToken.get(note.tokenId) ?? [];
    current.push(note);
    notesByToken.set(note.tokenId, current);
  });
  const importedFonts = settings.fontReferences ?? [];
  const requiredBundledChineseFonts = new Map<string, ClassicalChineseBuiltinFontDefinition>();
  const noteBundledChineseFont = findClassicalChineseBuiltinFont(
    settings.englishFont ?? documentStyle.layers.gloss.fontFamily,
  );
  if (noteBundledChineseFont) requiredBundledChineseFonts.set(noteBundledChineseFont.id, noteBundledChineseFont);
  if (settings.showTranslation !== false && settings.translationFont) {
    const translationFont = findClassicalChineseBuiltinFont(settings.translationFont);
    if (translationFont) requiredBundledChineseFonts.set(translationFont.id, translationFont);
  }
  for (const style of Object.values(documentStyle.layers)) {
    const font = findClassicalChineseBuiltinFont(style.fontFamily);
    if (font) requiredBundledChineseFonts.set(font.id, font);
  }
  for (const token of analysis.tokens) {
    const resolved = resolveTokenStyle(documentStyle, token);
    for (const style of Object.values(resolved.layers)) {
      const font = findClassicalChineseBuiltinFont(style.fontFamily);
      if (font) requiredBundledChineseFonts.set(font.id, font);
    }
  }
  if (requiredBundledChineseFonts.size && sourceHanScFallback) {
    requiredBundledChineseFonts.set(sourceHanScFallback.id, sourceHanScFallback);
  }
  const usesCjk = analysis.tokens.some((item) =>
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}]/u.test(
      `${sourceText(item)}${item.gloss}${item.lemma}${item.pos}${item.morphology}`,
    ),
  ) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}]/u.test(
    `${settings.headerLeft}${settings.headerRight}${settings.footerLeft}${settings.footerRight}${analysis.literalTranslation ?? ""}${analysis.naturalTranslation ?? ""}${numberedNotes.map((note) => note.text).join("\n")}`,
  ) || requiredBundledChineseFonts.size > 0;
  const usesPinyin = analysis.language === "classical-chinese"
    && settings.showPronunciation !== false
    && analysis.tokens.some((token) => Boolean(token.pinyin?.trim()));
  const words = analysis.tokens.map((token) => {
    const tokenNotes = notesByToken.get(token.id) ?? [];
    const hideDetails = settings.hideIndeclinableDetails
      && (typeof token.isIndeclinable === "boolean"
        ? token.isIndeclinable
        : INDECLINABLE_PARTS_OF_SPEECH.has(token.pos.trim().toUpperCase()));
    const visibility = deriveLegacyTokenLayerVisibility(settings, { hideDetails });
    for (const layer of ["source", "gloss", "lemma", "pos", "morphology"] as const) {
      if (!layerText(token, layer).length) visibility[layer] = false;
    }
    const resolved = resolveTokenStyle(documentStyle, token);
    const detailRows = resolveVisibleTokenLayers(resolved, visibility).map((layer, index, visible) => {
      const style = layer.style;
      const importedFace = importedFontFor(style.fontFamily, style.bold, style.italic, importedFonts);
      const bundledChineseFace = findClassicalChineseBuiltinFont(style.fontFamily);
      const commands = [
        latexInlineFontCommand(style.fontFamily, style.bold, style.italic, importedFonts),
        `\\fontsize{${style.sizePt}}{${(style.sizePt * TOKEN_LAYER_LINE_HEIGHT[layer.layer]).toFixed(1)}}\\selectfont`,
        `\\color[HTML]{${style.color.slice(1).toUpperCase()}}`,
        style.bold && !importedFace && !bundledChineseFace ? "\\bfseries" : "",
        style.italic && !importedFace && !bundledChineseFace ? "\\itshape" : "",
      ].join("");
      const markerSize = Math.max(5.5, style.sizePt * 0.48);
      const markerNumbers = layer.layer === "source" && showNoteMarkers && tokenNotes.length
        ? tokenNotes.map((note) => showNotes
          ? `\\hyperlink{${analysisNoteDestination(note.id)}}{${note.number}}`
          : String(note.number)).join("\\,")
        : "";
      const marker = markerNumbers
        ? `{\\NoteFont\\fontsize{${markerSize.toFixed(1)}}{${(markerSize * 1.1).toFixed(1)}}\\selectfont\\bfseries\\color{Accent}\\smash{\\raisebox{0.55em}{${markerNumbers}}}}`
        : "";
      const row = `{${commands}\\shortstack{${texMultiline(layerText(token, layer.layer), style.underline)}}${marker}}`;
      return index < visible.length - 1
        ? `${row}\\\\[${(layer.gapAfterPx * PX_TO_PT).toFixed(2)}pt]`
        : row;
    });
    const pinyin = analysis.language === "classical-chinese"
      && settings.showPronunciation !== false
      ? token.pinyin?.normalize("NFC") ?? ""
      : "";
    const pronunciationRow = pinyin
      ? (() => {
          const pronunciationStyle = resolvePronunciationStyle(
            token,
            resolved.layers.source,
            documentStyle.pronunciation,
          );
          return `{\\PronunciationFont\\fontsize{${pronunciationStyle.sizePt}}{${(pronunciationStyle.sizePt * PRONUNCIATION_LINE_HEIGHT).toFixed(1)}}\\selectfont\\color[HTML]{${pronunciationStyle.color.slice(1).toUpperCase()}}\\shortstack{${texMultiline(pinyin, false)}}}\\\\[${(PRONUNCIATION_GAP_AFTER_PX * PX_TO_PT).toFixed(2)}pt]`;
        })()
      : "";
    const rows = [pronunciationRow, ...detailRows].filter(Boolean).join("\n");
    const breakCommand = (token.breakAfter ?? "none") === "line"
      ? "\\par\\noindent"
      : token.breakAfter === "paragraph"
        ? `\\par\\vspace{${paragraphSpacingPt(token, documentStyle).toFixed(2)}pt}\\noindent`
        : "";
    const tokenDestination = showNotes && tokenNotes.length
      ? `\\hypertarget{${tokenNoteDestination(token.id)}}{}`
      : "";
    return `${tokenDestination}\\begin{tabular}[t]{@{}c@{}}\n${rows}\n\\end{tabular}`
      + `\\hspace{${Math.max(0, settings.wordGap * PX_TO_PT).toFixed(2)}pt}${breakCommand}`;
  }).join("\n");

  const noteFamily = settings.englishFont ?? documentStyle.layers.gloss.fontFamily;
  const noteFont = latexFontName(noteFamily);
  const importedNoteFont = importedFontFor(noteFamily, false, false, importedFonts);
  const bundledChineseNoteFont = findClassicalChineseBuiltinFont(noteFamily);
  const noteFontSetup = importedNoteFont
    ? `\\setmainfont[Path=./]{\\detokenize{${safeLatexFilename(importedNoteFont.filename)}}}\n\\newfontfamily\\NoteFont[Path=./]{\\detokenize{${safeLatexFilename(importedNoteFont.filename)}}}`
    : bundledChineseNoteFont
      ? `\\setmainfont[Path=./fonts/]{${safeLatexFilename(bundledFontFilename(bundledChineseNoteFont.faces.normal))}}\n\\newfontfamily\\NoteFont[Path=./fonts/]{${safeLatexFilename(bundledFontFilename(bundledChineseNoteFont.faces.normal))}}`
    : `\\setmainfont{${noteFont}}\n\\newfontfamily\\NoteFont{${noteFont}}`;
  const headerLeft = latexPageText(settings.headerLeft, analysis.tokens.length);
  const headerRight = latexPageText(settings.headerRight, analysis.tokens.length);
  const footerLeft = latexPageText(settings.footerLeft, analysis.tokens.length);
  const footerRight = latexPageText(settings.footerRight, analysis.tokens.length);
  const headerRuleWidth = settings.headerLeft.trim() || settings.headerRight.trim() ? "0.4pt" : "0pt";
  const translationSize = normalizedTranslationSize(settings.translationSize);
  const annotationTargetLabel = settings.annotationTarget === "chinese" ? "CHINESE" : "ENGLISH";
  const analysisNotes = showNotes
    ? analysisNotesSection(numberedNotes, translationSize)
    : "";
  const translations = settings.showTranslation !== false
    ? [
        translationSection(
          `LITERAL ${annotationTargetLabel} TRANSLATION`,
          analysis.literalTranslation ?? "",
          translationSize,
          settings,
          importedFonts,
        ),
        translationSection(
          `IDIOMATIC ${annotationTargetLabel} TRANSLATION`,
          analysis.naturalTranslation ?? "",
          translationSize,
          settings,
          importedFonts,
        ),
      ].filter(Boolean).join("\n")
    : "";
  const analysisNoteHyperref = analysisNotes
    ? `\\usepackage{needspace}
\\usepackage[hidelinks]{hyperref}
\\newcommand{\\StoaAnchoredAnalysisNote}[4]{%
  \\par\\noindent\\hypertarget{#1}{}\\hangindent=2.15em\\hangafter=1%
  \\makebox[1.65em][r]{\\hyperlink{#2}{\\textsuperscript{#3}}}\\hspace{0.50em}#4\\par}
\\newcommand{\\StoaUnanchoredAnalysisNote}[3]{%
  \\par\\noindent\\hypertarget{#1}{}\\hangindent=2.15em\\hangafter=1%
  \\makebox[1.65em][r]{\\textsuperscript{#2}}\\hspace{0.50em}#3\\par}`
    : "";

  const bundledChineseMainFont = findClassicalChineseBuiltinFont(documentStyle.layers.source.fontFamily);
  const cjkSetup = usesCjk
    ? bundledChineseMainFont
      ? `\\usepackage{xeCJK}\n\\xeCJKenablefallback\n\\setCJKmainfont[${[
          "Path=./fonts/",
          bundledChineseMainFont.id !== sourceHanScFallback?.id
            ? sourceHanFallbackOption(false, false)
            : "",
        ].filter(Boolean).join(",")}]{${safeLatexFilename(bundledFontFilename(bundledChineseMainFont.faces.normal))}}`
      : "\\usepackage{xeCJK}\n\\xeCJKenablefallback\n\\setCJKmainfont{Noto Sans CJK SC}"
    : "";
  const bundledChineseFiles = [...requiredBundledChineseFonts.values()]
    .flatMap((font) => Object.values(font.faces))
    .map(bundledFontFilename);
  const baseCompileNote = usesCjk && bundledChineseFiles.length
    ? `% Compile with XeLaTeX. Keep these STOA open-font files in ./fonts/:\n${bundledChineseFiles.map((filename) => `% - ${filename}`).join("\n")}`
    : usesCjk
      ? "% Compile with XeLaTeX. The TeX environment must provide Noto Sans CJK SC."
      : "% Compile with XeLaTeX or LuaLaTeX. If Vusillus is used, upload vu3r.ttf beside this file.";
  const importedFontNote = importedFonts.length
    ? `\n% User fonts are not embedded for licensing reasons. Put these device-local files beside this .tex file:\n${importedFonts.map((font) => `% - ${safeLatexFilename(font.filename)} (${font.familyName} ${font.subfamilyName})`).join("\n")}`
    : "";
  const pronunciationFontNote = usesPinyin
    ? "\n% - LiberationSans-Regular.ttf (fixed Pinyin reading-aid face)"
    : "";
  const compileNote = `${baseCompileNote}${pronunciationFontNote}${importedFontNote}`;
  const pronunciationFontSetup = usesPinyin
    ? `\\newfontfamily\\PronunciationFont[Path=./fonts/]{LiberationSans-Regular.ttf}% ${texEscape(PRONUNCIATION_FONT_FAMILY)}`
    : "";

  return `\\documentclass[12pt]{article}
${compileNote}
\\usepackage[paperwidth=${settings.paperWidthMm}mm,paperheight=${settings.paperHeightMm}mm,top=${settings.marginTopMm}mm,right=${settings.marginRightMm}mm,bottom=${settings.marginBottomMm}mm,left=${settings.marginLeftMm}mm]{geometry}
\\usepackage{fontspec}
\\usepackage{iftex}
${cjkSetup}
\\ifXeTeX\\XeTeXgenerateactualtext=1\\fi
\\usepackage{xcolor}
\\usepackage[normalem]{ulem}
\\usepackage{array}
\\usepackage{fancyhdr}
\\usepackage{lastpage}
${analysisNoteHyperref}
${noteFontSetup}
${pronunciationFontSetup}
\\definecolor{Paper}{HTML}{${settings.background.slice(1).toUpperCase()}}
\\definecolor{Ink}{HTML}{${settings.ink.slice(1).toUpperCase()}}
\\definecolor{Accent}{HTML}{${(settings.accent ?? settings.ink).slice(1).toUpperCase()}}
\\pagecolor{Paper}
\\color{Ink}
\\setlength{\\parindent}{0pt}
\\setlength{\\tabcolsep}{0pt}
\\setlength{\\emergencystretch}{2em}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\NoteFont\\fontsize{6}{7}\\selectfont ${headerLeft}}
\\fancyhead[R]{\\NoteFont\\fontsize{6}{7}\\selectfont ${headerRight}}
\\fancyfoot[L]{\\NoteFont\\fontsize{6}{7}\\selectfont ${footerLeft}}
\\fancyfoot[R]{\\NoteFont\\fontsize{6}{7}\\selectfont ${footerRight}}
\\renewcommand{\\headrulewidth}{${headerRuleWidth}}
\\renewcommand{\\footrulewidth}{0pt}
\\begin{document}
${words}
${analysisNotes}
${translations}
\\end{document}
`;
};

export const LATEX_TOKEN_HORIZONTAL_CHROME_PT = TOKEN_CARD_METRICS.horizontalChromePx * PX_TO_PT;
