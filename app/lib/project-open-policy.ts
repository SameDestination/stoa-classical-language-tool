import type { OmniDocumentConfig } from "./omni-language";

/**
 * Project data can enter STOA through three deliberately different paths.
 *
 * - `exchange` is user-pasted/imported JSON and must not be allowed to assert
 *   that an OMNI language profile was already confirmed in this UI.
 * - `desktop` is a document the user explicitly opened through the native
 *   document lifecycle. It must round-trip every saved document setting.
 * - `bundled` is developer-controlled, validated application data.
 */
export type StoaProjectOpenOrigin = "exchange" | "desktop" | "bundled";

type OmniManualLanguageOverride = OmniDocumentConfig["manualLanguageOverride"];

export const omniManualOverrideForProjectOpen = (
  origin: StoaProjectOpenOrigin,
  stored: OmniManualLanguageOverride,
): OmniManualLanguageOverride => {
  if (origin === "exchange") return null;
  return stored ? { ...stored } : null;
};
