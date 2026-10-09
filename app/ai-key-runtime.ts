export type AiProvider = "openai" | "anthropic";

export interface AiRequestResult {
  ok: boolean;
  status: number;
  requestId: string | null;
  data: unknown;
}

export interface ApiKeyStorageStatus {
  available: boolean;
  runtime: "desktop" | "web";
  storage: "encrypted" | "session" | "unavailable";
  maxConcurrentRequests: 2;
}

const SUPPORTED_PROVIDERS = new Set<AiProvider>(["openai", "anthropic"]);
const MIN_KEY_LENGTH = 12;
const MAX_KEY_LENGTH = 2_048;

function assertProvider(provider: AiProvider): AiProvider {
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error("Unsupported AI provider.");
  }
  return provider;
}

function normalizeKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (
    normalized.length < MIN_KEY_LENGTH ||
    normalized.length > MAX_KEY_LENGTH ||
    /\s/u.test(normalized) ||
    [...normalized].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error("The API key format is invalid.");
  }
  return normalized;
}

function getDesktopBridge(): StoaDesktopAiBridge | undefined {
  return typeof window === "undefined" ? undefined : window.stoaDesktopAI;
}

function unavailableOnWeb(): never {
  throw new Error(
    "Automatic API access is available only in the STOA desktop app. Use the manual prompt and JSON import workflow on the web.",
  );
}

export async function getApiKeyStorageStatus(): Promise<ApiKeyStorageStatus> {
  const desktopBridge = getDesktopBridge();
  if (!desktopBridge) {
    return {
      available: false,
      runtime: "web",
      storage: "unavailable",
      maxConcurrentRequests: 2,
    };
  }

  const capabilities = await desktopBridge.getCapabilities();
  return {
    available: true,
    runtime: "desktop",
    storage: capabilities.securePersistence ? "encrypted" : "session",
    maxConcurrentRequests: 2,
  };
}

export async function saveApiKey(
  providerValue: AiProvider,
  apiKeyValue: string,
): Promise<{ storage: "encrypted" | "session" }> {
  const provider = assertProvider(providerValue);
  const apiKey = normalizeKey(apiKeyValue);
  const desktopBridge = getDesktopBridge();

  if (!desktopBridge) unavailableOnWeb();
  return desktopBridge.saveApiKey(provider, apiKey);
}

export async function hasApiKey(providerValue: AiProvider): Promise<boolean> {
  const provider = assertProvider(providerValue);
  const desktopBridge = getDesktopBridge();
  if (!desktopBridge) unavailableOnWeb();
  return desktopBridge.hasApiKey(provider);
}

export async function deleteApiKey(
  providerValue: AiProvider,
): Promise<void> {
  const provider = assertProvider(providerValue);
  const desktopBridge = getDesktopBridge();

  if (!desktopBridge) unavailableOnWeb();
  await desktopBridge.deleteApiKey(provider);
}

export async function requestAi(
  providerValue: AiProvider,
  body: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
): Promise<AiRequestResult> {
  const provider = assertProvider(providerValue);
  const desktopBridge = getDesktopBridge();

  if (!desktopBridge) unavailableOnWeb();
  return desktopBridge.request(provider, body, options);
}

export async function cancelAiRequests(): Promise<number> {
  const desktopBridge = getDesktopBridge();
  if (!desktopBridge) unavailableOnWeb();
  return (await desktopBridge.cancelRequests()).cancelled;
}
