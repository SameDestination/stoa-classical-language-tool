export {};

declare global {
  type StoaAiProvider = "openai" | "anthropic";

  interface StoaAiCapabilities {
    runtime: "desktop";
    providers: StoaAiProvider[];
    securePersistence: boolean;
    maxConcurrentRequests: 2;
  }

  interface StoaAiResponse {
    ok: boolean;
    status: number;
    requestId: string | null;
    data: unknown;
  }

  interface StoaDesktopAiBridge {
    getCapabilities(): Promise<StoaAiCapabilities>;
    saveApiKey(
      provider: StoaAiProvider,
      apiKey: string,
    ): Promise<{ storage: "encrypted" | "session" }>;
    hasApiKey(provider: StoaAiProvider): Promise<boolean>;
    deleteApiKey(
      provider: StoaAiProvider,
    ): Promise<{ deleted: boolean }>;
    request(
      provider: StoaAiProvider,
      body: Record<string, unknown>,
      options?: { timeoutMs?: number },
    ): Promise<StoaAiResponse>;
    cancelRequests(): Promise<{ cancelled: number }>;
  }

  interface Window {
    stoaDesktopAI?: StoaDesktopAiBridge;
  }
}
