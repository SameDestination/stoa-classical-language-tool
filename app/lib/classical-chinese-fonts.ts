import type { UserFontFaceStyle } from "./user-fonts";

export const SOURCE_HAN_SERIF_SC_STOA = "'Source Han Serif SC STOA', 'Source Han Serif SC', 'Songti SC', 'STSong', serif";
export const SOURCE_HAN_SERIF_TC_STOA = "'Source Han Serif TC STOA', 'Source Han Serif TC', 'Songti TC', 'STSong', serif";
export const FANDOL_SONG_STOA = "'FandolSong STOA', 'FandolSong', 'Songti SC', 'STSong', serif";
export const FANDOL_HEI_STOA = "'FandolHei STOA', 'FandolHei', 'PingFang SC', 'Microsoft YaHei', sans-serif";
export const FANDOL_FANG_STOA = "'FandolFang STOA', 'FandolFang', 'FangSong', 'STFangsong', serif";
export const FANDOL_KAI_STOA = "'FandolKai STOA', 'FandolKai', 'Kaiti SC', 'STKaiti', serif";

export type ClassicalChineseBuiltinFontDefinition = {
  id: string;
  label: string;
  cssFamily: string;
  familyName: string;
  latexFamilyName: string;
  faces: Partial<Record<UserFontFaceStyle, string>> & { normal: string };
};

const FONT_ROOT = "/fonts/classical-chinese";

export const CLASSICAL_CHINESE_BUILTIN_FONTS: readonly ClassicalChineseBuiltinFontDefinition[] = [
  {
    id: "bundled:source-han-serif-sc",
    label: "Source Han Serif SC · 思源宋体（简）",
    cssFamily: SOURCE_HAN_SERIF_SC_STOA,
    familyName: "Source Han Serif SC",
    latexFamilyName: "Source Han Serif SC",
    faces: { normal: `${FONT_ROOT}/SourceHanSerifSC-Regular.otf` },
  },
  {
    id: "bundled:source-han-serif-tc",
    label: "Source Han Serif TC · 思源宋體（繁）",
    cssFamily: SOURCE_HAN_SERIF_TC_STOA,
    familyName: "Source Han Serif TC",
    latexFamilyName: "Source Han Serif TC",
    faces: { normal: `${FONT_ROOT}/SourceHanSerifTC-Regular.otf` },
  },
  {
    id: "bundled:fandol-song",
    label: "Fandol Song · 宋体",
    cssFamily: FANDOL_SONG_STOA,
    familyName: "FandolSong",
    latexFamilyName: "FandolSong",
    faces: {
      normal: `${FONT_ROOT}/FandolSong-Regular.otf`,
      bold: `${FONT_ROOT}/FandolSong-Bold.otf`,
    },
  },
  {
    id: "bundled:fandol-hei",
    label: "Fandol Hei · 黑体",
    cssFamily: FANDOL_HEI_STOA,
    familyName: "FandolHei",
    latexFamilyName: "FandolHei",
    faces: {
      normal: `${FONT_ROOT}/FandolHei-Regular.otf`,
      bold: `${FONT_ROOT}/FandolHei-Bold.otf`,
    },
  },
  {
    id: "bundled:fandol-fang",
    label: "Fandol Fang · 仿宋",
    cssFamily: FANDOL_FANG_STOA,
    familyName: "FandolFang",
    latexFamilyName: "FandolFang",
    faces: { normal: `${FONT_ROOT}/FandolFang-Regular.otf` },
  },
  {
    id: "bundled:fandol-kai",
    label: "Fandol Kai · 楷体",
    cssFamily: FANDOL_KAI_STOA,
    familyName: "FandolKai",
    latexFamilyName: "FandolKai",
    faces: { normal: `${FONT_ROOT}/FandolKai-Regular.otf` },
  },
] as const;

export const CLASSICAL_CHINESE_BUILTIN_FONT_IDS = CLASSICAL_CHINESE_BUILTIN_FONTS.map((font) => font.id);

export const findClassicalChineseBuiltinFont = (cssFamily: string) =>
  CLASSICAL_CHINESE_BUILTIN_FONTS.find((font) => font.cssFamily === cssFamily);

export const classicalChineseBuiltinFontFamilies = () =>
  new Set(CLASSICAL_CHINESE_BUILTIN_FONTS.map((font) => font.cssFamily));
