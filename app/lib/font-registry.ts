import {
  CLASSICAL_CHINESE_BUILTIN_FONTS,
} from "./classical-chinese-fonts";

export type StoaFontSource = "bundled" | "system" | "user";
export type StoaFontWorkspace = "ancient-greek" | "latin" | "classical-chinese" | "omni";

export type StoaFontOption = {
  /** Stable selector identity. User-font IDs will be digest-based in Step 7. */
  id: string;
  label: string;
  cssFamily: string;
  source: StoaFontSource;
  scripts: readonly ("greek" | "latin" | "cjk")[];
  /** Omitted means generally available; scoped fonts stay inside their intended workspace. */
  workspaces?: readonly StoaFontWorkspace[];
};

const classicalChineseOnly = ["classical-chinese"] as const;

export const STOA_BUILTIN_FONTS: readonly StoaFontOption[] = [
  {
    id: "bundled:liberation-serif-stoa",
    label: "Liberation Serif — Times-compatible, bundled",
    cssFamily: "'Liberation Serif STOA', serif",
    source: "bundled",
    scripts: ["greek", "latin"],
  },
  {
    id: "bundled:noto-serif-stoa",
    label: "Noto Serif STOA — Unicode PDF",
    cssFamily: "'Noto Serif STOA', 'Times New Roman', Times, serif",
    source: "bundled",
    scripts: ["greek", "latin"],
  },
  {
    id: "bundled:liberation-sans-stoa",
    label: "Liberation Sans STOA — Unicode PDF",
    cssFamily: "'Liberation Sans STOA', Arial, sans-serif",
    source: "bundled",
    scripts: ["greek", "latin"],
  },
  {
    id: "bundled:vusillus",
    label: "Vusillus — Classical Greek",
    cssFamily: "'Vusillus', 'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    source: "bundled",
    scripts: ["greek"],
  },
  {
    id: "system:palatino",
    label: "Palatino",
    cssFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
    source: "system",
    scripts: ["greek", "latin"],
  },
  {
    id: "system:times-new-roman",
    label: "Times New Roman",
    cssFamily: "'Times New Roman', Times, serif",
    source: "system",
    scripts: ["greek", "latin"],
  },
  {
    id: "system:georgia",
    label: "Georgia",
    cssFamily: "Georgia, 'Times New Roman', serif",
    source: "system",
    scripts: ["greek", "latin"],
  },
  {
    id: "system:arial-unicode",
    label: "Arial Unicode",
    cssFamily: "'Arial Unicode MS', Arial, sans-serif",
    source: "system",
    scripts: ["greek", "latin", "cjk"],
  },
  {
    id: "system:inter",
    label: "Inter / System Sans",
    cssFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    source: "system",
    scripts: ["greek", "latin"],
  },
  {
    id: "system:arial",
    label: "Arial",
    cssFamily: "Arial, Helvetica, sans-serif",
    source: "system",
    scripts: ["greek", "latin"],
  },
  {
    id: "bundled:noto-sans-sc",
    label: "Noto Sans SC",
    cssFamily: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    source: "bundled",
    scripts: ["cjk"],
  },
  {
    id: "bundled:noto-sans-jp",
    label: "Noto Sans JP",
    cssFamily: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif",
    source: "bundled",
    scripts: ["cjk"],
  },
  ...CLASSICAL_CHINESE_BUILTIN_FONTS.map((font) => ({
    id: font.id,
    label: font.label,
    cssFamily: font.cssFamily,
    source: "bundled" as const,
    scripts: ["cjk"] as const,
    workspaces: classicalChineseOnly,
  })),
] as const;

export const mergeFontOptions = (
  userFonts: readonly StoaFontOption[] = [],
): StoaFontOption[] => {
  const byId = new Map<string, StoaFontOption>();
  [...STOA_BUILTIN_FONTS, ...userFonts].forEach((font) => {
    if (!font.id.trim() || !font.cssFamily.trim()) return;
    byId.set(font.id, { ...font, scripts: [...font.scripts] });
  });
  return [...byId.values()];
};

export const findFontByCssFamily = (
  family: string,
  options: readonly StoaFontOption[] = STOA_BUILTIN_FONTS,
) => options.find((option) => option.cssFamily === family);

export const fontAvailableInWorkspace = (
  font: StoaFontOption,
  workspace: StoaFontWorkspace,
) => !font.workspaces || font.workspaces.includes(workspace);
