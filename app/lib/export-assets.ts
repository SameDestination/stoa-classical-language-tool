export type ExportAssetErrorCode =
  | "launcher-required"
  | "network-unavailable"
  | "asset-missing"
  | "invalid-asset-url";

export class ExportAssetError extends Error {
  readonly code: ExportAssetErrorCode;
  readonly assetLabel?: string;
  readonly assetUrl?: string;

  constructor(
    code: ExportAssetErrorCode,
    message: string,
    options: { assetLabel?: string; assetUrl?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ExportAssetError";
    this.code = code;
    this.assetLabel = options.assetLabel;
    this.assetUrl = options.assetUrl;
  }
}

export const PORTABLE_LAUNCH_INSTRUCTIONS =
  "This slim portable edition was opened directly from index.html, so the browser blocked its local export resources. Close this tab and start STOA with Start-STOA-macOS.command or Start-STOA-Windows.bat, then keep the launcher window open while exporting.";

const LOCAL_RUNTIME_RECOVERY =
  "Restart STOA with its macOS or Windows launcher, use the new browser tab it opens, and keep the launcher window open while exporting.";

export type ExportAssetEnvironment = {
  protocol: string;
  baseUri: string;
  fetcher?: (url: string) => Promise<Response>;
  retryDelayMs?: number;
};

export function getExportRuntimeWarning(protocol: string): string | null {
  return protocol.toLowerCase() === "file:" ? PORTABLE_LAUNCH_INSTRUCTIONS : null;
}

export function assertExportRuntimeAvailable(protocol: string): void {
  const warning = getExportRuntimeWarning(protocol);
  if (warning) throw new ExportAssetError("launcher-required", warning);
}

export function resolveExportAssetUrl(assetPath: string, baseUri: string): string {
  try {
    return new URL(assetPath, baseUri).href;
  } catch (cause) {
    throw new ExportAssetError(
      "invalid-asset-url",
      `STOA could not resolve the local export resource ${assetPath}. ${LOCAL_RUNTIME_RECOVERY}`,
      { assetUrl: assetPath, cause },
    );
  }
}

export async function fetchExportAsset(
  assetPath: string,
  assetLabel: string,
  environment: ExportAssetEnvironment,
): Promise<Response> {
  assertExportRuntimeAvailable(environment.protocol);
  const assetUrl = resolveExportAssetUrl(assetPath, environment.baseUri);
  const fetcher = environment.fetcher ?? ((url: string) => fetch(url));

  let response: Response | undefined;
  let networkCause: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetcher(assetUrl);
      break;
    } catch (cause) {
      networkCause = cause;
      if (attempt === 0) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, environment.retryDelayMs ?? 120));
      }
    }
  }
  if (!response) {
    throw new ExportAssetError(
      "network-unavailable",
      `STOA could not reach its local ${assetLabel} resource. ${LOCAL_RUNTIME_RECOVERY}`,
      { assetLabel, assetUrl, cause: networkCause },
    );
  }

  if (!response.ok) {
    throw new ExportAssetError(
      "asset-missing",
      `STOA could not load its local ${assetLabel} resource (HTTP ${response.status}). The portable folder may be incomplete; reopen the complete STOA folder with its launcher and try again.`,
      { assetLabel, assetUrl },
    );
  }

  return response;
}

export async function fetchExportAssetBytes(
  assetPath: string,
  assetLabel: string,
  environment: ExportAssetEnvironment,
): Promise<ArrayBuffer> {
  return (await fetchExportAsset(assetPath, assetLabel, environment)).arrayBuffer();
}

export function formatExportFailure(error: unknown): string {
  if (error instanceof ExportAssetError) return error.message;
  const message = error instanceof Error ? error.message : "The export could not be completed.";
  if (/failed to fetch|networkerror|load failed|dynamically imported module|worker/i.test(message)) {
    return `STOA could not reach one of its local export resources. ${LOCAL_RUNTIME_RECOVERY}`;
  }
  return message;
}

export function isExportAssetFailure(error: unknown): boolean {
  if (error instanceof ExportAssetError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed|dynamically imported module|worker/i.test(message);
}
