import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LANGUAGE_CONFIGS,
  buildLanguageAnalysisPrompts,
} from "../app/language-config.ts";
import { createDeveloperDefaultProject } from "../app/developer-defaults/index.ts";
import {
  CLASSICAL_CHINESE_MODEL_RECOMMENDATION,
} from "../app/lib/classical-chinese.ts";
import {
  CLASSICAL_CHINESE_BUILTIN_FONTS,
  SOURCE_HAN_SERIF_SC_STOA,
} from "../app/lib/classical-chinese-fonts.ts";
import {
  createManualAnalysisSession,
  restoreManualAnalysisSession,
  serializeManualAnalysisSession,
} from "../app/lib/manual-ai-session.ts";
import {
  createStoaProject,
  parseStoaProjectText,
  stringifyStoaProject,
  type StoaProjectTokenStyle,
} from "../app/lib/stoa-project.ts";
import { buildStoaLatex } from "../app/lib/latex-export.ts";
import { tokenizeStoaText } from "../app/lib/ai-pipeline.ts";

const config = LANGUAGE_CONFIGS["classical-chinese"];
const classicalChineseFamily = config.fonts.source;
const sample = createDeveloperDefaultProject("classical-chinese").project.document.analysis;

const cloneStringRecord = (value: Record<string, unknown> | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(value ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

const tokenStyle: StoaProjectTokenStyle = {
  layers: {
    source: { fontFamily: classicalChineseFamily, sizePt: 27, color: "#29271f", bold: false, italic: false, underline: false },
    gloss: { fontFamily: classicalChineseFamily, sizePt: 11, color: "#29271f", bold: true, italic: false, underline: false },
    lemma: { fontFamily: classicalChineseFamily, sizePt: 9, color: "#625f55", bold: false, italic: false, underline: false },
    pos: { fontFamily: classicalChineseFamily, sizePt: 8, color: "#9e4a32", bold: true, italic: false, underline: false },
    morphology: { fontFamily: classicalChineseFamily, sizePt: 9, color: "#625f55", bold: false, italic: false, underline: false },
  },
  gapAfterPx: { source: 3, gloss: 2, lemma: 2, pos: 2 },
};

test("Classical Chinese full prompts preserve source and support English or Chinese targets", () => {
  const source = "民為貴，社稷次之，君為輕。";
  const english = buildLanguageAnalysisPrompts("classical-chinese", source, {
    annotationTarget: "english",
  });
  const chinese = buildLanguageAnalysisPrompts("classical-chinese", source, {
    annotationTarget: "chinese",
  });
  assert.match(english.systemPrompt, /philologically meaningful lexical or grammatical study units/u);
  assert.match(english.systemPrompt, /PINYIN READING AID — REQUIRED/u);
  assert.match(english.systemPrompt, /Modern Standard Mandarin Hanyu Pinyin/u);
  assert.match(english.systemPrompt, /Unicode tone marks/u);
  assert.match(english.systemPrompt, /never by mechanically applying Modern Standard Chinese categories/u);
  assert.match(chinese.systemPrompt, /annotation target is Chinese/u);
  assert.match(chinese.systemPrompt, /现代汉语/u);
  assert.ok(english.userPrompt.includes(source));
  assert.ok(chinese.userPrompt.includes(source));
  assert.match(CLASSICAL_CHINESE_MODEL_RECOMMENDATION, /recommends trying Qwen first/u);
  assert.match(CLASSICAL_CHINESE_MODEL_RECOMMENDATION, /not a guarantee/u);
});

test("Classical Chinese local tokens preserve punctuation, offsets, stable IDs and unspaced reconstruction", () => {
  const source = "民為貴，社稷次之。\n\n君為輕。";
  const first = tokenizeStoaText(source, "classical-chinese");
  const second = tokenizeStoaText(source, "classical-chinese");
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.equal(first.at(-1)?.punctuationAfter, "。");
  assert.ok(first.some((item) => item.punctuationAfter.includes("，")));
  assert.ok(first.some((item) => item.breakAfter === "paragraph"));
  assert.equal(first.map((item) => `${item.punctuationBefore}${item.surface}${item.punctuationAfter}${
    item.breakAfter === "paragraph" ? "\n\n" : item.separatorAfter ?? ""
  }`).join(""), source);
});

test("manual Classical Chinese sessions retain the selected annotation language", () => {
  const session = createManualAnalysisSession({
    text: "學而時習之，不亦說乎？",
    language: "classical-chinese",
    annotationTarget: "chinese",
  });
  assert.equal(session.annotationTarget, "chinese");
  const restored = restoreManualAnalysisSession(serializeManualAnalysisSession(session));
  assert.equal(restored.language, "classical-chinese");
  assert.equal(restored.annotationTarget, "chinese");
});

test("schema-v3 Classical Chinese projects round-trip target, tokens and typography", () => {
  const project = createStoaProject({
    format: "stoa-project",
    schemaVersion: 3,
    appVersion: "5.1.0",
    exportedAt: "2026-08-22T00:00:00.000Z",
    document: {
      language: "classical-chinese",
      sourceText: sample.sourceText,
      selectedTokenId: null,
      analysis: {
        ...sample,
        tokens: sample.tokens.map((item) => ({
          ...item,
          features: cloneStringRecord(item.features),
          alternatives: [...item.alternatives],
        })),
      },
      settings: {
        tokenStyle,
        annotationTarget: "chinese",
        wordGap: 18,
        paperWidthMm: 210,
        paperHeightMm: 297,
      },
    },
  });
  const restored = parseStoaProjectText(stringifyStoaProject(project));
  assert.equal(restored.project.schemaVersion, 3);
  assert.equal(restored.project.document.language, "classical-chinese");
  assert.equal(restored.project.document.settings.annotationTarget, "chinese");
  assert.deepEqual(
    restored.project.document.analysis.tokens.map((item) => item.surface),
    sample.tokens.map((item) => item.surface),
  );
  assert.equal(restored.project.document.settings.tokenStyle?.layers.source.fontFamily, classicalChineseFamily);
});

test("schema-v3 projects preserve all six built-in Classical Chinese families without device-local references", () => {
  const families = CLASSICAL_CHINESE_BUILTIN_FONTS.map((font) => font.cssFamily);
  const project = createStoaProject({
    format: "stoa-project",
    schemaVersion: 3,
    appVersion: "5.1.0",
    exportedAt: "2026-08-22T00:00:00.000Z",
    document: {
      language: "classical-chinese",
      sourceText: sample.sourceText,
      selectedTokenId: null,
      analysis: {
        ...sample,
        tokens: sample.tokens.map((item, index) => ({
          ...item,
          features: cloneStringRecord(item.features),
          alternatives: [...item.alternatives],
          ...(index === 0 ? { wordFont: families[5] } : {}),
        })),
      },
      settings: {
        tokenStyle: {
          ...tokenStyle,
          layers: {
            source: { ...tokenStyle.layers.source, fontFamily: families[0] },
            gloss: { ...tokenStyle.layers.gloss, fontFamily: families[1] },
            lemma: { ...tokenStyle.layers.lemma, fontFamily: families[2] },
            pos: { ...tokenStyle.layers.pos, fontFamily: families[3] },
            morphology: { ...tokenStyle.layers.morphology, fontFamily: families[4] },
          },
        },
        annotationTarget: "english",
      },
    },
  });
  const restored = parseStoaProjectText(stringifyStoaProject(project)).project;
  const restoredStyle = restored.document.settings.tokenStyle;
  assert.ok(restoredStyle);
  assert.deepEqual(
    Object.values(restoredStyle.layers).map((layer) => layer.fontFamily),
    families.slice(0, 5),
  );
  assert.equal(restored.document.analysis.tokens[0]?.wordFont, families[5]);
  assert.deepEqual(restored.document.settings.fontReferences ?? [], []);
});

test("Classical Chinese LaTeX uses a Unicode CJK strategy without altering token text", async () => {
  const latex = buildStoaLatex(sample, {
    tokenStyle,
    greekSize: 27,
    glossSize: 11,
    lemmaSize: 9,
    posSize: 8,
    morphSize: 9,
    greekFont: classicalChineseFamily,
    englishFont: classicalChineseFamily,
    lemmaFont: classicalChineseFamily,
    morphFont: classicalChineseFamily,
    wordGap: 18,
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginTopMm: 16,
    marginRightMm: 16,
    marginBottomMm: 16,
    marginLeftMm: 16,
    headerLeft: "文言文",
    headerRight: "Classical Chinese",
    footerLeft: "STOA",
    footerRight: "{page}",
    background: "#f6f0e4",
    ink: "#29271f",
    showLemma: true,
    showPos: true,
    hideIndeclinableDetails: false,
  });
  assert.match(latex, /\\usepackage\{xeCJK\}/u);
  assert.equal(classicalChineseFamily, SOURCE_HAN_SERIF_SC_STOA);
  assert.match(latex, /\\setCJKmainfont\[Path=\.\/fonts\/\]\{SourceHanSerifSC-Regular\.otf\}/u);
  assert.match(latex, /% - SourceHanSerifSC-Regular\.otf/u);
  for (const item of sample.tokens) assert.ok(latex.includes(item.surface));

  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  assert.match(page, /notoSansScFontBase64/);
  assert.match(page, /CLASSICAL_CHINESE_FONT_URLS/);
  assert.match(page, /bundledClassicalChineseFonts/);
  assert.match(page, /embeddedForVectorPdf: true/);
  assert.match(page, /Preserve their exact cssFamily values so Preview, vector PDF, PDF-derived PNG, project transfer, and LaTeX remain synchronized/u);
  assert.match(page, /GPL-Fandol-with-font-exception\.txt/u);
  assert.match(page, /CLASSICAL_CHINESE_MODEL_RECOMMENDATION/);
  assert.match(page, /Annotation & translation language/);
});

test("Classical Chinese LaTeX renders fixed-face Pinyin with per-token size and color", () => {
  const analysis = {
    ...sample,
    language: "classical-chinese",
    tokens: sample.tokens.slice(0, 2).map((item, index) => ({
      ...item,
      pinyin: index ? "wéi" : "mín",
      ...(index === 0 ? { pronunciationSize: 14, pronunciationColor: "#3366cc" } : {}),
    })),
  };
  const latex = buildStoaLatex(analysis, {
    tokenStyle: { ...tokenStyle, pronunciation: { sizePt: 12, color: "#29271f" } },
    greekSize: 27,
    glossSize: 11,
    lemmaSize: 9,
    posSize: 8,
    morphSize: 9,
    greekFont: classicalChineseFamily,
    englishFont: classicalChineseFamily,
    lemmaFont: classicalChineseFamily,
    morphFont: classicalChineseFamily,
    wordGap: 18,
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginTopMm: 16,
    marginRightMm: 16,
    marginBottomMm: 16,
    marginLeftMm: 16,
    headerLeft: "",
    headerRight: "",
    footerLeft: "",
    footerRight: "",
    background: "#f6f0e4",
    ink: "#29271f",
    showLemma: true,
    showPos: true,
    hideIndeclinableDetails: false,
    showPronunciation: true,
  });
  assert.match(latex, /\\newfontfamily\\PronunciationFont\[Path=\.\/fonts\/\]\{LiberationSans-Regular\.ttf\}/u);
  assert.match(latex, /\\PronunciationFont\\fontsize\{14\}[^\n]*\\color\[HTML\]\{3366CC\}[^\n]*mín/u);
  assert.ok(latex.includes("wéi"));
});
