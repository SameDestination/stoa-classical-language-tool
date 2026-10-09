import type { StoaWorkspaceLanguageId } from "./omni-language";

export const getDesktopDocumentsBridge = (): StoaDesktopDocumentsBridge | null => {
  if (typeof window === "undefined") return null;
  return window.stoaDesktopDocuments ?? null;
};

export const isDesktopDocumentRuntime = (): boolean =>
  getDesktopDocumentsBridge() !== null;

export const desktopWorkspace = (
  language: StoaWorkspaceLanguageId,
): StoaDesktopWorkspace => language;

