import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

import {
  createVectorPdf,
  VectorPdfLayoutMismatchError,
  type VectorPdfInput,
  type VectorPdfSettings,
  type VectorPdfToken,
} from "../app/vector-pdf.ts";
import {
  SMART_ROW_GAP_MAXIMUM_RATIO,
  SMART_ROW_GAP_MINIMUM_RATIO,
  type ResolvedInterlinearPaginationPlan,
} from "../app/lib/page-flow.ts";
import {
  deriveDocumentTokenStyleDefaults,
  deriveLegacyTokenLayerVisibility,
  measureTokenLayerStackHeight,
  resolveVisibleTokenLayers,
  TOKEN_LAYER_LINE_HEIGHT,
} from "../app/lib/token-style.ts";
import { parseUserFont, userFontReference } from "../app/lib/user-fonts.ts";
import {
  CLASSICAL_CHINESE_BUILTIN_FONTS,
  type ClassicalChineseBuiltinFontDefinition,
} from "../app/lib/classical-chinese-fonts.ts";

const fontBase64 = (path: string) => readFile(new URL(path, import.meta.url), "base64");
const arrayBuffer = (buffer: Buffer) => buffer.buffer.slice(
  buffer.byteOffset,
  buffer.byteOffset + buffer.byteLength,
) as ArrayBuffer;

const notoSansScFont = fontBase64("../public/fonts/NotoSansSC-Variable.ttf");
const notoSansJpFont = fontBase64("../public/fonts/NotoSansJP-Variable.ttf");
const fontFaces = async (prefix: string) => ({
  normal: await fontBase64(`../public/fonts/${prefix}-Regular.ttf`),
  bold: await fontBase64(`../public/fonts/${prefix}-Bold.ttf`),
  italic: await fontBase64(`../public/fonts/${prefix}-Italic.ttf`),
  bolditalic: await fontBase64(`../public/fonts/${prefix}-BoldItalic.ttf`),
});
const notoSerifFonts = fontFaces("NotoSerif");
const liberationSansFonts = fontFaces("LiberationSans");
const bundledClassicalChineseFont = async (font: ClassicalChineseBuiltinFontDefinition) => ({
  cssFamily: font.cssFamily,
  familyName: font.familyName,
  faces: Object.fromEntries(await Promise.all(
    (Object.entries(font.faces)).map(async ([style, assetPath]) => [
      style,
      await fontBase64(`../public${assetPath}`),
    ]),
  )) as { normal: string; bold?: string },
});

const settingsFor = (family: string): VectorPdfSettings => ({
  greekSize: 25,
  glossSize: 11,
  lemmaSize: 9,
  posSize: 8,
  morphSize: 9,
  translationSize: 10,
  wordGap: 14,
  lineGap: 18,
  greekFont: family,
  englishFont: family,
  lemmaFont: family,
  morphFont: family,
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
  accent: "#9e4a32",
  showLemma: true,
  showPos: true,
  hideIndeclinableDetails: false,
  showTranslation: true,
});

const token = (overrides: Partial<VectorPdfToken>): VectorPdfToken => ({
  id: "token-1",
  surface: "word",
  punctuationBefore: "",
  punctuationAfter: "",
  lemma: "lemma",
  gloss: "gloss",
  pos: "NOUN",
  morphology: "morphology",
  ...overrides,
});

const tokenHeightPx = (item: VectorPdfToken, settings: VectorPdfSettings) => {
  const style = deriveDocumentTokenStyleDefaults(settings);
  const visibility = deriveLegacyTokenLayerVisibility(settings, { hideDetails: false });
  const text = {
    source: `${item.punctuationBefore ?? ""}${item.surface}${item.punctuationAfter}`,
    gloss: item.gloss,
    lemma: item.lemma,
    pos: item.pos.toUpperCase(),
    morphology: item.morphology,
  } as const;
  for (const layer of ["source", "gloss", "lemma", "pos", "morphology"] as const) {
    if (!text[layer]) visibility[layer] = false;
  }
  return measureTokenLayerStackHeight(
    resolveVisibleTokenLayers(style, visibility).map((layer) => ({
      ...layer,
      text: text[layer.layer],
      lineHeight: TOKEN_LAYER_LINE_HEIGHT[layer.layer],
    })),
    96 / 72,
    1,
  );
};

const inspectPdf = async (bytes: Uint8Array) => {
  const loadingTask = getDocument({ data: bytes.slice() });
  const document = await loadingTask.promise;
  let text = "";
  const pageTexts: string[] = [];
  let hasRasterImage = false;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => "str" in item ? item.str : "")
      .join("\n");
    pageTexts.push(pageText);
    text += `${pageText}\n`;
    const operators = await page.getOperatorList();
    hasRasterImage ||= operators.fnArray.some((operator) =>
      operator === OPS.paintImageXObject ||
      operator === OPS.paintInlineImageXObject ||
      operator === OPS.paintImageMaskXObject,
    );
    page.cleanup();
  }
  await loadingTask.destroy();
  return { text, pageTexts, hasRasterImage, pageCount: document.numPages };
};

const assertSearchableVectorText = async (
  input: VectorPdfInput,
  expected: string[],
) => {
  const result = await createVectorPdf(input);
  assert.ok(result.bytes.byteLength > 1_000, "PDF should contain an embedded vector document");
  const inspected = await inspectPdf(result.bytes);
  assert.equal(inspected.pageCount, result.pageCount);
  assert.equal(inspected.hasRasterImage, false, "interlinear page content must stay vector, not a raster snapshot");
  expected.forEach((value) => {
    assert.ok(inspected.text.includes(value), `expected selectable PDF text ${JSON.stringify(value)} in ${JSON.stringify(inspected.text)}`);
  });
};

test("Chinese source, annotations, running text, and translation remain searchable vector text", async () => {
  const settings = settingsFor("'Noto Sans SC', sans-serif");
  settings.headerLeft = "中文页眉";
  settings.headerRight = "学习文本";
  settings.footerLeft = "中文页脚";
  settings.footerRight = "第一册";

  await assertSearchableVectorText({
    title: "中文逐词阅读",
    naturalTranslation: "我喜欢学习古典语言。",
    translationLabel: "意译",
    tokens: [token({
      surface: "学习",
      punctuationAfter: "。",
      gloss: "学习释义",
      lemma: "学习",
      pos: "动词",
      morphology: "现代汉语",
      wordItalic: true,
    })],
    settings,
    notoSansScFontBase64: await notoSansScFont,
  }, [
    "中文页眉",
    "学习文本",
    "中文页脚",
    "第一册",
    "学习。",
    "学习释义",
    "学习",
    "动词",
    "现代汉语",
    "意译",
    "我喜欢学习古典语言。",
  ]);
});

test("Classical Chinese with English annotations remains searchable vector text", async () => {
  const settings = settingsFor("'Noto Sans SC', sans-serif");
  settings.englishFont = "'Noto Sans SC', sans-serif";
  settings.headerRight = "Classical Chinese · English annotations";

  await assertSearchableVectorText({
    title: "Classical Chinese Interlinear Reading",
    naturalTranslation: "The people matter most; the state comes next; the ruler matters least.",
    translationLabel: "IDIOMATIC ENGLISH TRANSLATION",
    tokens: [
      token({ id: "lzh-1", surface: "民", gloss: "the people", lemma: "民", pos: "NOUN", morphology: "Topic" }),
      token({ id: "lzh-2", surface: "為", gloss: "are", lemma: "為", pos: "VERB", morphology: "Copular predicate" }),
      token({ id: "lzh-3", surface: "貴", punctuationAfter: "。", gloss: "most important", lemma: "貴", pos: "ADJ", morphology: "Predicate; superlative by context" }),
    ],
    settings,
    notoSansScFontBase64: await notoSansScFont,
  }, [
    "民",
    "為",
    "貴。",
    "the people",
    "Copular predicate",
    "IDIOMATIC ENGLISH TRANSLATION",
    "The people matter most; the state comes next; the ruler matters least.",
  ]);
});

test("Classical Chinese Pinyin remains centered searchable vector text and never rasterizes", async () => {
  const settings = settingsFor("'Noto Sans SC', sans-serif");
  settings.showTranslation = false;
  settings.showPronunciation = true;
  settings.tokenStyle = {
    ...deriveDocumentTokenStyleDefaults(settings),
    pronunciation: { sizePt: 12, color: "#3366cc" },
  };

  await assertSearchableVectorText({
    language: "classical-chinese",
    title: "Pinyin vector regression",
    naturalTranslation: "",
    tokens: [token({
      surface: "學",
      pinyin: "xué nǚ lǜ lǚ shuǐ hǎo ǹ ḿ ê",
      pronunciationSize: 14,
      pronunciationColor: "#3366cc",
      gloss: "learn",
      lemma: "學",
      pos: "VERB",
      morphology: "Predicate",
    })],
    settings,
    notoSansScFontBase64: await notoSansScFont,
    unicodeSansFontBase64: await liberationSansFonts,
  }, ["xué nǚ lǜ lǚ shuǐ hǎo ǹ ḿ ê", "學", "learn", "Predicate"]);
});

test("all six bundled Classical Chinese families embed as searchable vector text without Noto fallback", async () => {
  const sourceHanFallback = CLASSICAL_CHINESE_BUILTIN_FONTS[0];
  for (const [index, font] of CLASSICAL_CHINESE_BUILTIN_FONTS.entries()) {
    const settings = settingsFor(font.cssFamily);
    settings.headerLeft = `文言字體${index + 1}`;
    settings.headerRight = "經史子集";
    settings.footerLeft = "思源與 Fandol";
    settings.footerRight = "第一頁";
    settings.showTranslation = false;
    await assertSearchableVectorText({
      title: `STOA ${font.familyName}`,
      naturalTranslation: "",
      tokens: [token({
        id: `font-${index + 1}`,
        surface: "學而時習之",
        punctuationAfter: "，",
        gloss: "不亦說乎",
        lemma: "學",
        pos: "動詞",
        morphology: "承接複句；賓語省略",
        wordBold: true,
        wordItalic: true,
      })],
      settings,
      classicalChineseFonts: await Promise.all(
        font.id === sourceHanFallback.id
          ? [font].map(bundledClassicalChineseFont)
          : [sourceHanFallback, font].map(bundledClassicalChineseFont),
      ),
    }, [
      `文言字體${index + 1}`,
      "經史子集",
      "第一頁",
      "學而時習之，",
      "不亦說乎",
      "承接複句；賓語省略",
    ]);
  }
});

test("a Source Han Classical Chinese page rasterizes to PNG from its final vector PDF", async () => {
  const font = CLASSICAL_CHINESE_BUILTIN_FONTS[0];
  const settings = settingsFor(font.cssFamily);
  settings.showTranslation = false;
  const vectorPdf = await createVectorPdf({
    title: "Source Han PDF-derived PNG",
    naturalTranslation: "",
    tokens: [token({ surface: "民為貴", punctuationAfter: "。", gloss: "百姓最為重要" })],
    settings,
    classicalChineseFonts: [await bundledClassicalChineseFont(font)],
  });
  const inspected = await inspectPdf(vectorPdf.bytes);
  assert.equal(inspected.hasRasterImage, false);
  assert.ok(inspected.text.includes("民為貴。"));

  const loadingTask = getDocument({ data: vectorPdf.bytes.slice() });
  const document = await loadingTask.promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  const png = canvas.toBuffer("image/png");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.byteLength > 10_000);
  page.cleanup();
  await loadingTask.destroy();
});

test("Japanese kana and kanji use the JP font and remain searchable vector text", async () => {
  const settings = settingsFor("'Noto Sans JP', sans-serif");
  settings.headerLeft = "日本語の見出し";
  settings.footerLeft = "日本語の脚注";

  await assertSearchableVectorText({
    title: "日本語逐語訳",
    naturalTranslation: "私は古典語を勉強しています。",
    translationLabel: "自然な翻訳",
    tokens: [token({
      surface: "勉強する",
      punctuationAfter: "。",
      gloss: "学ぶ",
      lemma: "勉強する",
      pos: "動詞",
      morphology: "サ変動詞",
      wordItalic: true,
    })],
    settings,
    notoSansJpFontBase64: await notoSansJpFont,
  }, [
    "日本語の見出し",
    "日本語の脚注",
    "勉強する。",
    "学ぶ",
    "動詞",
    "サ変動詞",
    "自然な翻訳",
    "私は古典語を勉強しています。",
  ]);
});

test("non-Latin OMNI Romanization remains searchable vector text and survives PDF-derived PNG", async () => {
  const settings = settingsFor("'Noto Sans JP', sans-serif");
  settings.showPronunciation = true;
  settings.showTranslation = false;
  settings.tokenStyle = {
    ...deriveDocumentTokenStyleDefaults(settings),
    pronunciation: { sizePt: 11, color: "#2f5b78" },
  };
  const result = await createVectorPdf({
    language: "omni",
    title: "OMNI Romanization vector regression",
    naturalTranslation: "",
    tokens: [token({
      id: "omni-japanese-1",
      surface: "日本語",
      romanization: "Nihongo Tōkyō ḥ ṣ ṭ ʿ ʾ",
      gloss: "Japanese language",
      lemma: "日本語",
      pos: "NOUN",
      morphology: "Common noun",
    })],
    settings,
    notoSansJpFontBase64: await notoSansJpFont,
    unicodeSansFontBase64: await liberationSansFonts,
  });
  const inspected = await inspectPdf(result.bytes);
  assert.equal(inspected.hasRasterImage, false);
  assert.ok(inspected.text.includes("Nihongo Tōkyō ḥ ṣ ṭ ʿ ʾ"));
  assert.ok(inspected.text.includes("日本語"));

  const loadingTask = getDocument({ data: result.bytes.slice() });
  const document = await loadingTask.promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  const png = canvas.toBuffer("image/png");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.byteLength > 10_000);
  page.cleanup();
  await loadingTask.destroy();
});

test("a classic Greek export in Noto Serif STOA remains searchable without CJK assets", async () => {
  const settings = settingsFor("'Noto Serif STOA', 'Times New Roman', Times, serif");
  settings.englishFont = "'Noto Serif STOA', serif";
  settings.morphFont = "'Noto Serif STOA', serif";
  settings.showTranslation = false;

  await assertSearchableVectorText({
    title: "Ancient Greek Interlinear",
    naturalTranslation: "",
    tokens: [token({
      surface: "λόγος",
      punctuationAfter: ".",
      gloss: "word",
      lemma: "λόγος",
      pos: "NOUN",
      morphology: "Nom. Sg. m.",
      lemmaColor: "#2f5f8f",
      lemmaUnderline: true,
      morphColor: "#376b5c",
      morphUnderline: true,
    })],
    settings,
    unicodeSerifFontBase64: await notoSerifFonts,
  }, ["λόγος.", "word", "NOUN", "Nom. Sg. m."]);
});

test("an imported TTF is embedded as searchable vector text and missing faces fail explicitly", async () => {
  const bytes = await readFile(new URL("../public/fonts/LiberationSerif-Regular.ttf", import.meta.url));
  const record = await parseUserFont("scholarly-serif.ttf", arrayBuffer(bytes));
  const settings = settingsFor(record.cssFamily);
  settings.englishFont = "'Noto Serif STOA', serif";
  settings.lemmaFont = "'Noto Serif STOA', serif";
  settings.morphFont = "'Noto Serif STOA', serif";
  settings.showLemma = false;
  settings.showPos = false;
  settings.showTranslation = false;
  const input: VectorPdfInput = {
    title: "Imported font PDF",
    naturalTranslation: "",
    tokens: [token({ surface: "λόγος", punctuationAfter: ".", gloss: "word" })],
    settings,
    unicodeSerifFontBase64: await notoSerifFonts,
    importedFonts: [{ ...userFontReference(record), dataBase64: bytes.toString("base64") }],
  };
  await assertSearchableVectorText(input, ["λόγος.", "word"]);
  await assert.rejects(
    () => createVectorPdf({
      ...input,
      tokens: [{ ...input.tokens[0], wordItalic: true }],
    }),
    /has no italic face/u,
  );
});

test("Times New Roman never silently substitutes and embeds the real locally supplied faces", async (t) => {
  const settings = settingsFor("'Times New Roman', Times, serif");
  settings.translationBold = true;
  settings.translationItalic = false;
  settings.translationUnderline = true;
  settings.translationColor = "#3366cc";
  const input: VectorPdfInput = {
    language: "latin", title: "Times fidelity", settings,
    naturalTranslation: "The reader learns.", literalTranslation: "Reader learns.",
    tokens: [token({ surface: "lector", gloss: "reader", lemma: "lector", pos: "NOUN", morphology: "Nom. Sg. m." })],
    unicodeSerifFontBase64: await notoSerifFonts,
  };
  await assert.rejects(() => createVectorPdf(input), /Times New Roman needs its original font files/);
  const filenames = ["Times New Roman.ttf", "Times New Roman Bold.ttf", "Times New Roman Italic.ttf", "Times New Roman Bold Italic.ttf"];
  const importedFonts = [];
  for (const filename of filenames) {
    let bytes: Buffer;
    try { bytes = await readFile(`/System/Library/Fonts/Supplemental/${filename}`); }
    catch { t.diagnostic("Local Times New Roman integration unavailable on this host; no-substitution check passed."); return; }
    const record = await parseUserFont(filename, arrayBuffer(bytes));
    importedFonts.push({ ...userFontReference(record), dataBase64: bytes.toString("base64") });
  }
  const result = await createVectorPdf({ ...input, importedFonts });
  const inspected = await inspectPdf(result.bytes);
  assert.equal(inspected.hasRasterImage, false);
  assert.ok(inspected.text.includes("The reader learns."));
  assert.match(Buffer.from(result.bytes).toString("latin1"), /TimesNewRomanPS/);
});

test("Latin Extended text accepts decomposed source code points and remains searchable", async () => {
  const family = "'Noto Serif STOA', 'Times New Roman', serif";
  const settings = settingsFor(family);
  settings.showLemma = false;
  settings.showPos = false;
  settings.showTranslation = true;
  settings.headerLeft = "Ā Ē Ī Ō Ū Ȳ";
  const decomposedMacrons = "a\u0304 e\u0304 i\u0304 o\u0304 u\u0304 y\u0304";
  const tokens = [
    token({ id: "macron-regular", surface: "ā ē ī ō ū ȳ", gloss: "eō homō mīror" }),
    token({ id: "macron-bold", surface: "Ā Ē Ī Ō Ū Ȳ", gloss: "mōns ingēns", wordBold: true }),
    token({ id: "macron-italic", surface: "lātus amō amās", gloss: "amāmus", wordItalic: true }),
    token({
      id: "macron-bolditalic",
      surface: decomposedMacrons,
      gloss: "ă ĕ ĭ ŏ ŭ æ œ ë ï",
      wordBold: true,
      wordItalic: true,
    }),
  ];
  const result = await createVectorPdf({
    title: "Latin macron regression",
    naturalTranslation: "eō homō mīror mōns ingēns lātus amō amās amāmus",
    tokens,
    settings,
    unicodeSerifFontBase64: await notoSerifFonts,
    unicodeSansFontBase64: await liberationSansFonts,
  });
  assert.equal(tokens[3].surface, decomposedMacrons, "STOA must not mutate decomposed source text");
  assert.ok(result.bytes.byteLength > 1_000, "PDF should contain an embedded vector document");
  const inspected = await inspectPdf(result.bytes);
  assert.equal(inspected.pageCount, result.pageCount);
  assert.equal(inspected.hasRasterImage, false, "interlinear page content must stay vector, not a raster snapshot");
  const searchableNfc = inspected.text.normalize("NFC");
  // fontkit 3+ canonically composes combining marks when the font provides the precomposed glyph,
  // so verify both the precomposed and decomposed macron rows extract cleanly in NFC form.
  assert.ok(
    searchableNfc.includes("ā ē ī ō ū ȳ\n\nă ĕ ĭ ŏ ŭ æ œ ë ï"),
    `expected decomposed macron token to remain searchable above its gloss in ${JSON.stringify(searchableNfc)}`,
  );
  for (const value of [
    "Ā Ē Ī Ō Ū Ȳ",
    "eō homō mīror",
    "mōns ingēns",
    "lātus amō amās",
    "amāmus",
    "ā ē ī ō ū ȳ",
    "ă ĕ ĭ ŏ ŭ æ œ ë ï",
  ]) {
    assert.ok(searchableNfc.includes(value), `expected selectable PDF text ${JSON.stringify(value)} in ${JSON.stringify(searchableNfc)}`);
  }
});

test("vector PDF consumes the exact Preview token-page plan and rejects stale plans", async () => {
  const settings = settingsFor("'Noto Serif STOA', serif");
  settings.showLemma = false;
  settings.showPos = false;
  settings.showTranslation = false;
  const tokens = [
    token({ id: "planned-1", surface: "prima", gloss: "first", morphology: "Nom. Sg. f." }),
    token({ id: "planned-2", surface: "secunda", gloss: "second", morphology: "Nom. Sg. f." }),
  ];
  const minimumPx = settings.lineGap * SMART_ROW_GAP_MINIMUM_RATIO;
  const plan: ResolvedInterlinearPaginationPlan = {
    unit: "css-px-96dpi",
    sourceKey: "preview-plan-key",
    rowGapBounds: {
      minimumPx,
      preferredPx: settings.lineGap,
      maximumPx: settings.lineGap * SMART_ROW_GAP_MAXIMUM_RATIO,
    },
    pages: tokens.map((item, pageIndex) => ({
      pageIndex,
      tokenRows: [{
        tokenIds: [item.id],
        yTopPx: 0,
        measuredHeightPx: tokenHeightPx(item, settings),
        gapBeforePx: 0,
        paragraphSpacingBeforePx: 0,
      }],
      translationLines: [],
      translationYTopPx: null,
      translationContinued: false,
      translationStartsAtPageTop: false,
      breakReason: pageIndex ? "end" : "explicit",
      remainingBottomPx: 0,
    })),
  };
  const input: VectorPdfInput = {
    title: "Shared Preview plan",
    naturalTranslation: "",
    tokens,
    settings,
    unicodeSerifFontBase64: await notoSerifFonts,
    paginationPlan: plan,
    layoutSourceKey: "preview-plan-key",
  };
  const result = await createVectorPdf(input);
  assert.equal(result.layoutPlanSource, "preview");
  assert.equal(result.pageCount, 2);
  assert.deepEqual(result.pageTokenIds, [["planned-1"], ["planned-2"]]);
  const inspected = await inspectPdf(result.bytes);
  assert.equal(inspected.pageCount, 2);
  assert.ok(inspected.pageTexts[0].includes("prima"));
  assert.equal(inspected.pageTexts[0].includes("secunda"), false);
  assert.ok(inspected.pageTexts[1].includes("secunda"));
  const loadingTask = getDocument({ data: result.bytes.slice() });
  const pdfDocument = await loadingTask.promise;
  const pngSignatures: number[][] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
      background: settings.background,
    }).promise;
    pngSignatures.push([...canvas.toBuffer("image/png").subarray(0, 8)]);
    page.cleanup();
  }
  await loadingTask.destroy();
  assert.equal(pngSignatures.length, plan.pages.length);
  pngSignatures.forEach((signature) => {
    assert.deepEqual(signature, [137, 80, 78, 71, 13, 10, 26, 10]);
  });

  await assert.rejects(
    () => createVectorPdf({
      ...input,
      paginationPlan: {
        ...plan,
        pages: plan.pages.map((page, pageIndex) => pageIndex
          ? page
          : { ...page, tokenRows: [{ ...page.tokenRows[0], tokenIds: ["missing"] }] }),
      },
    }),
    (error) => error instanceof VectorPdfLayoutMismatchError,
  );

  await assert.rejects(
    () => createVectorPdf({
      ...input,
      layoutSourceKey: "stale-layout-key",
    }),
    (error) => error instanceof VectorPdfLayoutMismatchError,
  );

  await assert.rejects(
    () => createVectorPdf({
      ...input,
      settings: { ...settings, showTranslation: true },
      naturalTranslation: "This translation was not present in the Preview plan.",
    }),
    (error) => error instanceof VectorPdfLayoutMismatchError,
  );

  await assert.rejects(
    () => createVectorPdf({
      ...input,
      settings: { ...settings, lineGap: settings.lineGap + 2 },
    }),
    (error) => error instanceof VectorPdfLayoutMismatchError,
  );
});

test("PNG rasterization consumes the final vector PDF page instead of a second layout path", async () => {
  const settings = settingsFor("'Noto Serif STOA', serif");
  settings.showLemma = false;
  settings.showPos = false;
  settings.showTranslation = false;
  const vectorPdf = await createVectorPdf({
    title: "PDF-derived PNG regression",
    naturalTranslation: "",
    tokens: [token({ surface: "amō", gloss: "I love", morphology: "1S Pres. Act. Ind." })],
    settings,
    unicodeSerifFontBase64: await notoSerifFonts,
  });
  const loadingTask = getDocument({ data: vectorPdf.bytes.slice() });
  const document = await loadingTask.promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
    background: settings.background,
  }).promise;
  const png = canvas.toBuffer("image/png");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.byteLength > 10_000);
  assert.equal(canvas.width, Math.ceil(viewport.width));
  assert.equal(canvas.height, Math.ceil(viewport.height));
  page.cleanup();
  await loadingTask.destroy();
});

test("a long idiomatic translation creates searchable continuation pages without clipping", async () => {
  const settings = settingsFor("'Noto Serif STOA', serif");
  settings.greekFont = "'Noto Serif STOA', serif";
  settings.lemmaFont = "'Noto Serif STOA', serif";
  settings.paperWidthMm = 110;
  settings.paperHeightMm = 95;
  settings.marginTopMm = 8;
  settings.marginRightMm = 8;
  settings.marginBottomMm = 8;
  settings.marginLeftMm = 8;
  settings.headerRight = "Translation pagination";
  settings.footerRight = "PAGE {page} OF {pages}";
  settings.translationSize = 11;
  const markers = Array.from({ length: 180 }, (_, index) => `marker${String(index + 1).padStart(3, "0")}`);
  const result = await createVectorPdf({
    title: "Long translation pagination",
    naturalTranslation: markers.join(" "),
    translationLabel: "IDIOMATIC ENGLISH TRANSLATION",
    tokens: [token({
      surface: "λόγος",
      punctuationAfter: ".",
      gloss: "word",
      lemma: "λόγος",
      pos: "NOUN",
      morphology: "Nom. Sg. m.",
    })],
    settings,
    unicodeSerifFontBase64: await notoSerifFonts,
  });
  const inspected = await inspectPdf(result.bytes);
  assert.equal(result.pageCount, inspected.pageCount);
  assert.ok(result.pageCount >= 3, `expected translation continuation pages, received ${result.pageCount}`);
  assert.equal(inspected.hasRasterImage, false);
  markers.forEach((marker) => {
    assert.ok(inspected.text.includes(marker), `missing ${marker} from selectable PDF text`);
  });
  assert.ok(inspected.pageTexts.slice(1).some((text) => text.replace(/\s/gu, "").includes("CONTINUED")));
  assert.ok(
    inspected.pageTexts.at(-1)?.replace(/\s/gu, "").includes(`PAGE${result.pageCount}OF${result.pageCount}`),
  );
});

test("literal and idiomatic translations remain ordered, selectable, and independently splittable", async () => {
  const settings = settingsFor("'Noto Serif STOA', serif");
  settings.greekFont = "'Noto Serif STOA', serif";
  settings.lemmaFont = "'Noto Serif STOA', serif";
  settings.paperWidthMm = 110;
  settings.paperHeightMm = 90;
  settings.marginTopMm = 8;
  settings.marginRightMm = 8;
  settings.marginBottomMm = 8;
  settings.marginLeftMm = 8;
  settings.translationSize = 11;
  const literalMarkers = Array.from({ length: 90 }, (_, index) => `literal${String(index + 1).padStart(3, "0")}`);
  const naturalMarkers = Array.from({ length: 90 }, (_, index) => `idiomatic${String(index + 1).padStart(3, "0")}`);
  const result = await createVectorPdf({
    title: "Two translation sections",
    literalTranslation: literalMarkers.join(" "),
    naturalTranslation: naturalMarkers.join(" "),
    literalTranslationLabel: "LITERAL ENGLISH TRANSLATION",
    translationLabel: "IDIOMATIC ENGLISH TRANSLATION",
    tokens: [token({
      surface: "λόγος",
      punctuationAfter: ".",
      gloss: "word",
      lemma: "λόγος",
      pos: "NOUN",
      morphology: "Nom. Sg. m.",
    })],
    settings,
    unicodeSerifFontBase64: await notoSerifFonts,
  });
  const inspected = await inspectPdf(result.bytes);
  assert.equal(result.pageCount, inspected.pageCount);
  assert.ok(result.pageCount >= 4);
  assert.equal(inspected.hasRasterImage, false);
  literalMarkers.forEach((marker) => assert.ok(inspected.text.includes(marker), `missing ${marker}`));
  naturalMarkers.forEach((marker) => assert.ok(inspected.text.includes(marker), `missing ${marker}`));
  const compact = inspected.text.replace(/\s/gu, "");
  assert.ok(compact.indexOf("LITERALENGLISHTRANSLATION") >= 0);
  assert.ok(compact.indexOf("IDIOMATICENGLISHTRANSLATION") > compact.indexOf("LITERALENGLISHTRANSLATION"));
  assert.ok(inspected.pageTexts.filter((text) => text.replace(/\s/gu, "").includes("CONTINUED")).length >= 2);
});
