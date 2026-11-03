import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} from "electron";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const applicationAssetsDirectory = path.join(desktopDirectory, "dist");
const APPLICATION_SCHEME = "stoa";
const APPLICATION_HOST = "app";
const applicationPageUrl = `${APPLICATION_SCHEME}://${APPLICATION_HOST}/index.html`;
const desktopRuntimeSmokeTest = process.env.STOA_DESKTOP_SMOKE_TEST === "1"
  || process.argv.includes("--stoa-runtime-smoke")
  || app.commandLine.hasSwitch("stoa-runtime-smoke");

if (desktopRuntimeSmokeTest) {
  console.log("STOA_DESKTOP_SMOKE_ENABLED");
}

const AI_KEY_FILE_NAME = "stoa-secure-api-keys.json";
const AI_KEY_FILE_VERSION = 1;
const MAX_API_KEY_LENGTH = 2_048;
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MIN_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_TIMEOUT_MS = 180_000;
const MAX_CONCURRENT_AI_REQUESTS = 2;

const AI_IPC_CHANNELS = Object.freeze({
  capabilities: "stoa:ai:capabilities",
  saveApiKey: "stoa:ai:key:save",
  hasApiKey: "stoa:ai:key:has",
  deleteApiKey: "stoa:ai:key:delete",
  request: "stoa:ai:request",
  cancelRequests: "stoa:ai:cancel",
});

const AI_PROVIDERS = Object.freeze({
  openai: Object.freeze({
    endpoint: "https://api.openai.com/v1/responses",
    headers(apiKey) {
      return { Authorization: `Bearer ${apiKey}` };
    },
  }),
  anthropic: Object.freeze({
    endpoint: "https://api.anthropic.com/v1/messages",
    headers(apiKey) {
      return {
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      };
    },
  }),
});

const STOA_VERSION = app.getVersion();
const STOA_WORKSPACES = Object.freeze([
  "ancient-greek",
  "latin",
  "classical-chinese",
  "omni",
]);
const WORKSPACE_LABELS = Object.freeze({
  "ancient-greek": "Ancient Greek",
  latin: "Latin",
  "classical-chinese": "Classical Chinese",
  omni: "OMNI",
});
const DOCUMENT_STATE_FILE_NAME = "stoa-desktop-state.json";
const DOCUMENT_STATE_FILE_VERSION = 1;
const MAX_RECENT_DOCUMENTS = 12;
const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const RENDERER_REQUEST_TIMEOUT_MS = 30_000;
const PROJECT_OPEN_FILE_FILTERS = Object.freeze([
  { name: "STOA Project", extensions: ["stoa", "json"] },
]);
const PROJECT_SAVE_FILE_FILTERS = Object.freeze([
  { name: "STOA Project", extensions: ["stoa"] },
]);

const DOCUMENT_IPC_CHANNELS = Object.freeze({
  getState: "stoa:documents:state:get",
  rendererReady: "stoa:documents:renderer-ready",
  setActiveWorkspace: "stoa:documents:active-workspace:set",
  updateWorkspaceState: "stoa:documents:workspace-state:update",
  newDocument: "stoa:documents:new",
  openDocument: "stoa:documents:open",
  openRecent: "stoa:documents:open-recent",
  saveDocument: "stoa:documents:save",
  closeDocument: "stoa:documents:close",
  getRecentFiles: "stoa:documents:recent:get",
  clearRecentFiles: "stoa:documents:recent:clear",
  command: "stoa:documents:command",
  commandResult: "stoa:documents:command-result",
  serializeRequest: "stoa:documents:serialize-request",
  serializeResult: "stoa:documents:serialize-result",
  stateChanged: "stoa:documents:state-changed",
});

const sessionApiKeys = new Map();
const aiRequestsByWebContents = new Map();
const trustedWebContents = new Set();
let keyMutationQueue = Promise.resolve();
let activeAiRequests = 0;

const workspaceDocuments = new Map(
  STOA_WORKSPACES.map((workspace) => [
    workspace,
    {
      workspace,
      filePath: null,
      displayName: `${WORKSPACE_LABELS[workspace]} — Untitled`,
      revision: null,
      savedRevision: null,
      dirty: false,
    },
  ]),
);
const pendingRendererCommands = new Map();
const pendingSerializationRequests = new Map();
const rendererReadyWebContents = new Set();
const queuedFinderDocuments = [];
let activeWorkspace = "ancient-greek";
let recentFiles = [];
let firstLaunch = true;
let desktopStateLoaded = false;
let applicationWindow = null;
let applicationQuitRequested = false;
let forceApplicationQuit = false;
let lifecycleOperation = Promise.resolve();

app.setName("STOA");
protocol.registerSchemesAsPrivileged([
  {
    scheme: APPLICATION_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      codeCache: true,
    },
  },
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function isApplicationPageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === `${APPLICATION_SCHEME}:`
      && url.hostname === APPLICATION_HOST
      && url.port === ""
      && url.username === ""
      && url.password === ""
      && url.pathname === "/index.html";
  } catch {
    return false;
  }
}

function assertTrustedIpcSender(event) {
  const senderFrame = event.senderFrame;
  const senderUrl = senderFrame?.url || "";

  if (
    trustedWebContents.has(event.sender.id)
    && senderFrame === event.sender.mainFrame
    && isApplicationPageUrl(senderUrl)
  ) {
    return;
  }

  throw new Error("This request did not originate from the STOA application.");
}

function protocolError(status, message) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function installApplicationProtocol() {
  const realAssetsDirectory = await fs.realpath(applicationAssetsDirectory);
  const assetsPrefix = `${realAssetsDirectory}${path.sep}`;

  protocol.handle(APPLICATION_SCHEME, async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return protocolError(405, "Method Not Allowed");
    }

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return protocolError(400, "Bad Request");
    }
    if (
      url.hostname !== APPLICATION_HOST
      || url.port !== ""
      || url.username !== ""
      || url.password !== ""
    ) {
      return protocolError(404, "Not Found");
    }

    let relativePath;
    try {
      relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    } catch {
      return protocolError(400, "Bad Request");
    }
    if (!relativePath) relativePath = "index.html";
    if (relativePath.includes("\0") || relativePath.includes("\\")) {
      return protocolError(400, "Bad Request");
    }

    const candidatePath = path.resolve(realAssetsDirectory, relativePath);
    if (
      candidatePath !== realAssetsDirectory
      && !candidatePath.startsWith(assetsPrefix)
    ) {
      return protocolError(403, "Forbidden");
    }

    try {
      const [stats, realPath] = await Promise.all([
        fs.stat(candidatePath),
        fs.realpath(candidatePath),
      ]);
      if (
        !stats.isFile()
        || (realPath !== realAssetsDirectory && !realPath.startsWith(assetsPrefix))
      ) {
        return protocolError(404, "Not Found");
      }
      return net.fetch(pathToFileURL(realPath).href, { method: request.method });
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        return protocolError(404, "Not Found");
      }
      console.error("Unable to serve a packaged STOA asset:", error);
      return protocolError(500, "Internal Server Error");
    }
  });
}

async function runDesktopRuntimeSmokeTest() {
  const fetchAsset = async (assetPath) => {
    const assetUrl = new URL(assetPath, applicationPageUrl).href;
    const response = await net.fetch(assetUrl, {
      bypassCustomProtocolHandlers: false,
    });
    const bytes = await response.arrayBuffer();
    if (!response.ok || bytes.byteLength === 0) {
      throw new Error(`${assetPath} returned HTTP ${response.status} with ${bytes.byteLength} bytes.`);
    }
    return {
      url: assetUrl,
      status: response.status,
      bytes: bytes.byteLength,
      contentType: response.headers.get("content-type"),
    };
  };

  const [font, pdfWorker] = await Promise.all([
    fetchAsset("fonts/NotoSerif-Regular.ttf"),
    fetchAsset("vendor/pdf.worker.min.mjs"),
  ]);
  return {
    protocol: `${APPLICATION_SCHEME}:`,
    baseUri: applicationPageUrl,
    font,
    pdfWorker,
  };
}

function normalizeProvider(provider) {
  if (
    typeof provider !== "string" ||
    !Object.hasOwn(AI_PROVIDERS, provider)
  ) {
    throw new Error("Unsupported AI provider.");
  }
  return provider;
}

function normalizeApiKey(apiKey) {
  if (typeof apiKey !== "string") throw new Error("API key must be text.");

  const normalized = apiKey.trim();
  if (
    normalized.length < 12 ||
    normalized.length > MAX_API_KEY_LENGTH ||
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

function secureStorageIsUsable() {
  if (!safeStorage.isEncryptionAvailable()) return false;

  if (
    process.platform === "linux" &&
    typeof safeStorage.getSelectedStorageBackend === "function" &&
    safeStorage.getSelectedStorageBackend() === "basic_text"
  ) {
    return false;
  }

  return true;
}

function getApiKeyFilePath() {
  return path.join(app.getPath("userData"), AI_KEY_FILE_NAME);
}

async function readEncryptedKeyFile() {
  try {
    const contents = await fs.readFile(getApiKeyFilePath(), "utf8");
    const parsed = JSON.parse(contents);

    if (
      parsed?.version !== AI_KEY_FILE_VERSION ||
      !parsed.keys ||
      typeof parsed.keys !== "object" ||
      Array.isArray(parsed.keys)
    ) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed.keys).filter(
        ([provider, encrypted]) =>
          Object.hasOwn(AI_PROVIDERS, provider) &&
          typeof encrypted === "string",
      ),
    );
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return {};
    throw error;
  }
}

async function writeEncryptedKeyFile(keys) {
  const keyFilePath = getApiKeyFilePath();
  const temporaryKeyFilePath = `${keyFilePath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(keyFilePath), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(
      temporaryKeyFilePath,
      `${JSON.stringify({ version: AI_KEY_FILE_VERSION, keys })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    if (process.platform !== "win32") {
      await fs.chmod(temporaryKeyFilePath, 0o600);
    }
    await fs.rename(temporaryKeyFilePath, keyFilePath);
  } finally {
    await fs.rm(temporaryKeyFilePath, { force: true });
  }
}

function serializeKeyMutation(operation) {
  const nextMutation = keyMutationQueue.then(operation, operation);
  keyMutationQueue = nextMutation.catch(() => undefined);
  return nextMutation;
}

async function saveApiKey(providerValue, apiKeyValue) {
  const provider = normalizeProvider(providerValue);
  const apiKey = normalizeApiKey(apiKeyValue);

  if (!secureStorageIsUsable()) {
    await serializeKeyMutation(async () => {
      const keys = await readEncryptedKeyFile();
      if (!Object.hasOwn(keys, provider)) return;
      delete keys[provider];
      await writeEncryptedKeyFile(keys);
    });
    sessionApiKeys.set(provider, apiKey);
    return { storage: "session" };
  }

  await serializeKeyMutation(async () => {
    const keys = await readEncryptedKeyFile();
    keys[provider] = safeStorage.encryptString(apiKey).toString("base64");
    await writeEncryptedKeyFile(keys);
  });

  sessionApiKeys.delete(provider);
  return { storage: "encrypted" };
}

async function readApiKey(providerValue) {
  const provider = normalizeProvider(providerValue);
  if (sessionApiKeys.has(provider)) return sessionApiKeys.get(provider);
  if (!secureStorageIsUsable()) return null;

  await keyMutationQueue;
  const encrypted = (await readEncryptedKeyFile())[provider];
  if (!encrypted) return null;

  try {
    return normalizeApiKey(
      safeStorage.decryptString(Buffer.from(encrypted, "base64")),
    );
  } catch {
    return null;
  }
}

async function hasApiKey(providerValue) {
  return Boolean(await readApiKey(providerValue));
}

async function deleteApiKey(providerValue) {
  const provider = normalizeProvider(providerValue);
  sessionApiKeys.delete(provider);

  await serializeKeyMutation(async () => {
    const keys = await readEncryptedKeyFile();
    if (!Object.hasOwn(keys, provider)) return;
    delete keys[provider];
    await writeEncryptedKeyFile(keys);
  });

  return { deleted: true };
}

function normalizeRequestBody(provider, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("AI request body must be an object.");
  }
  if (typeof body.model !== "string" || !body.model.trim()) {
    throw new Error("AI request body must include a model.");
  }
  if (body.stream === true) {
    throw new Error("Streaming responses are not supported by this bridge.");
  }
  if (provider === "openai" && body.input === undefined) {
    throw new Error("OpenAI requests must include input.");
  }
  if (provider === "anthropic" && !Array.isArray(body.messages)) {
    throw new Error("Anthropic requests must include messages.");
  }

  let serialized;
  try {
    serialized = JSON.stringify(body);
  } catch {
    throw new Error("AI request body is not valid JSON.");
  }

  if (Buffer.byteLength(serialized, "utf8") > MAX_REQUEST_BYTES) {
    throw new Error("AI request body is too large.");
  }

  return serialized;
}

function normalizeTimeout(timeoutMs) {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.min(
    MAX_REQUEST_TIMEOUT_MS,
    Math.max(MIN_REQUEST_TIMEOUT_MS, Math.round(timeoutMs)),
  );
}

async function readLimitedResponseText(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("AI response is too large.");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("AI response is too large.");
    }
    output += decoder.decode(value, { stream: true });
  }

  return output + decoder.decode();
}

function parseResponseBody(responseText) {
  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

async function performAiRequest(
  providerValue,
  body,
  timeoutMs,
  webContentsId,
) {
  const provider = normalizeProvider(providerValue);
  if (activeAiRequests >= MAX_CONCURRENT_AI_REQUESTS) {
    throw new Error("STOA allows at most two simultaneous AI requests.");
  }

  const requestState = {
    controller: new AbortController(),
    abortReason: null,
  };
  let ownedRequests = aiRequestsByWebContents.get(webContentsId);
  if (!ownedRequests) {
    ownedRequests = new Set();
    aiRequestsByWebContents.set(webContentsId, ownedRequests);
  }
  ownedRequests.add(requestState);
  const timeout = setTimeout(
    () => {
      requestState.abortReason = "timeout";
      requestState.controller.abort();
    },
    normalizeTimeout(timeoutMs),
  );
  activeAiRequests += 1;
  let providerRequestStarted = false;

  try {
    const apiKey = await readApiKey(provider);
    if (requestState.controller.signal.aborted) {
      throw new DOMException("The AI request was cancelled.", "AbortError");
    }
    if (!apiKey) throw new Error(`No ${provider} API key is saved.`);

    const requestBody = normalizeRequestBody(provider, body);
    const requestConfig = AI_PROVIDERS[provider];
    providerRequestStarted = true;
    const response = await fetch(requestConfig.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...requestConfig.headers(apiKey),
      },
      body: requestBody,
      redirect: "error",
      signal: requestState.controller.signal,
    });
    const rawResponse = (await readLimitedResponseText(response)).replaceAll(
      apiKey,
      "[REDACTED]",
    );

    return {
      ok: response.ok,
      status: response.status,
      requestId:
        response.headers.get("x-request-id") ||
        response.headers.get("request-id"),
      data: parseResponseBody(rawResponse),
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        requestId: null,
        data: {
          error:
            requestState.abortReason === "cancelled"
              ? { type: "cancelled", message: "AI request was cancelled." }
              : { type: "timeout", message: "AI request timed out." },
        },
      };
    }

    if (!providerRequestStarted) throw error;

    return {
      ok: false,
      status: 0,
      requestId: null,
      data: {
        error: {
          type: "network_error",
          message: "The AI provider could not be reached.",
        },
      },
    };
  } finally {
    clearTimeout(timeout);
    ownedRequests.delete(requestState);
    if (ownedRequests.size === 0) {
      aiRequestsByWebContents.delete(webContentsId);
    }
    activeAiRequests -= 1;
  }
}

function cancelAiRequests(webContentsId) {
  const ownedRequests = aiRequestsByWebContents.get(webContentsId);
  if (!ownedRequests) return 0;

  let cancelled = 0;
  for (const requestState of ownedRequests) {
    if (requestState.controller.signal.aborted) continue;
    requestState.abortReason = "cancelled";
    requestState.controller.abort();
    cancelled += 1;
  }
  return cancelled;
}

function installAiBridge() {
  ipcMain.handle(AI_IPC_CHANNELS.capabilities, (event) => {
    assertTrustedIpcSender(event);
    return {
      runtime: "desktop",
      providers: Object.keys(AI_PROVIDERS),
      securePersistence: secureStorageIsUsable(),
      maxConcurrentRequests: MAX_CONCURRENT_AI_REQUESTS,
    };
  });

  ipcMain.handle(AI_IPC_CHANNELS.saveApiKey, (event, provider, apiKey) => {
    assertTrustedIpcSender(event);
    return saveApiKey(provider, apiKey);
  });

  ipcMain.handle(AI_IPC_CHANNELS.hasApiKey, (event, provider) => {
    assertTrustedIpcSender(event);
    return hasApiKey(provider);
  });

  ipcMain.handle(AI_IPC_CHANNELS.deleteApiKey, (event, provider) => {
    assertTrustedIpcSender(event);
    return deleteApiKey(provider);
  });

  ipcMain.handle(
    AI_IPC_CHANNELS.request,
    (event, provider, body, timeoutMs) => {
      assertTrustedIpcSender(event);
      return performAiRequest(provider, body, timeoutMs, event.sender.id);
    },
  );

  ipcMain.handle(AI_IPC_CHANNELS.cancelRequests, (event) => {
    assertTrustedIpcSender(event);
    return { cancelled: cancelAiRequests(event.sender.id) };
  });
}

function isWorkspace(value) {
  return typeof value === "string" && STOA_WORKSPACES.includes(value);
}

function normalizeWorkspace(value, fallback = activeWorkspace) {
  if (!isWorkspace(value)) {
    if (fallback === null) throw new Error("Unsupported STOA workspace.");
    return fallback;
  }
  return value;
}

function normalizeRevision(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0 && value.length <= 512) return value;
  throw new Error("A valid STOA document revision is required.");
}

function documentStatePath() {
  return path.join(app.getPath("userData"), DOCUMENT_STATE_FILE_NAME);
}

function publicWorkspaceState(document) {
  return {
    workspace: document.workspace,
    filePath: document.filePath,
    displayName: document.displayName,
    revision: document.revision,
    savedRevision: document.savedRevision,
    dirty: document.dirty,
  };
}

function publicRecentFiles() {
  return recentFiles.map((filePath) => ({
    filePath,
    displayName: path.basename(filePath),
  }));
}

function publicDocumentState(firstLaunchOverride = firstLaunch) {
  return {
    runtime: "desktop",
    platform: process.platform,
    firstLaunch: firstLaunchOverride,
    activeWorkspace,
    workspaces: Object.fromEntries(
      STOA_WORKSPACES.map((workspace) => [
        workspace,
        publicWorkspaceState(workspaceDocuments.get(workspace)),
      ]),
    ),
    recentFiles: publicRecentFiles(),
  };
}

async function atomicWriteText(targetPath, contents, mode = 0o600) {
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await fs.mkdir(directory, { recursive: true });
  let handle;
  try {
    handle = await fs.open(temporaryPath, "wx", mode);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function loadDesktopState() {
  if (desktopStateLoaded) return;
  desktopStateLoaded = true;
  try {
    const parsed = JSON.parse(await fs.readFile(documentStatePath(), "utf8"));
    if (parsed?.version !== DOCUMENT_STATE_FILE_VERSION) return;
    firstLaunch = parsed.hasLaunched !== true;
    if (Array.isArray(parsed.recentFiles)) {
      recentFiles = [...new Set(parsed.recentFiles.filter(
        (value) => typeof value === "string" && path.isAbsolute(value),
      ))].slice(0, MAX_RECENT_DOCUMENTS);
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) {
      console.error("Unable to read STOA desktop state:", error);
    }
  }
}

async function persistDesktopState() {
  await atomicWriteText(
    documentStatePath(),
    `${JSON.stringify({
      version: DOCUMENT_STATE_FILE_VERSION,
      hasLaunched: !firstLaunch,
      recentFiles,
    }, null, 2)}\n`,
  );
}

function updateApplicationWindowState(window = applicationWindow) {
  if (!window || window.isDestroyed()) return;
  const activeDocument = workspaceDocuments.get(activeWorkspace);
  const anyDirty = [...workspaceDocuments.values()].some((document) => document.dirty);
  window.setDocumentEdited(anyDirty);
  if (process.platform === "darwin") {
    window.setRepresentedFilename(activeDocument.filePath ?? "");
  }
  const dirtyMarker = activeDocument.dirty ? " — Edited" : "";
  window.setTitle(`${activeDocument.displayName}${dirtyMarker} — STOA ${STOA_VERSION}`);
}

function notifyDocumentStateChanged(window = applicationWindow) {
  updateApplicationWindowState(window);
  if (
    !window
    || window.isDestroyed()
    || !rendererReadyWebContents.has(window.webContents.id)
  ) return;
  window.webContents.send(DOCUMENT_IPC_CHANNELS.stateChanged, publicDocumentState(false));
}

function runLifecycleOperation(operation) {
  const result = lifecycleOperation.then(operation, operation);
  lifecycleOperation = result.catch(() => undefined);
  return result;
}

function activeWindow() {
  return BrowserWindow.getFocusedWindow() ?? applicationWindow;
}

function rejectPendingRendererRequests(webContentsId, reason) {
  for (const [requestId, request] of pendingRendererCommands) {
    if (request.webContentsId !== webContentsId) continue;
    clearTimeout(request.timeout);
    request.reject(reason);
    pendingRendererCommands.delete(requestId);
  }
  for (const [requestId, request] of pendingSerializationRequests) {
    if (request.webContentsId !== webContentsId) continue;
    clearTimeout(request.timeout);
    request.reject(reason);
    pendingSerializationRequests.delete(requestId);
  }
}

function requestRendererCommand(window, command) {
  if (!window || window.isDestroyed()) {
    return Promise.reject(new Error("The STOA window is unavailable."));
  }
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRendererCommands.delete(requestId);
      reject(new Error(`STOA did not finish the ${command.type} command in time.`));
    }, RENDERER_REQUEST_TIMEOUT_MS);
    pendingRendererCommands.set(requestId, {
      resolve,
      reject,
      timeout,
      webContentsId: window.webContents.id,
    });
    window.webContents.send(DOCUMENT_IPC_CHANNELS.command, {
      ...command,
      id: requestId,
    });
  });
}

function requestWorkspaceSerialization(window, workspace) {
  if (!window || window.isDestroyed()) {
    return Promise.reject(new Error("The STOA window is unavailable."));
  }
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingSerializationRequests.delete(requestId);
      reject(new Error(`STOA could not prepare the ${WORKSPACE_LABELS[workspace]} document for saving.`));
    }, RENDERER_REQUEST_TIMEOUT_MS);
    pendingSerializationRequests.set(requestId, {
      resolve,
      reject,
      timeout,
      webContentsId: window.webContents.id,
      workspace,
    });
    window.webContents.send(DOCUMENT_IPC_CHANNELS.serializeRequest, {
      id: requestId,
      workspace,
    });
  });
}

function normalizeSuggestedProjectName(value, workspace) {
  const fallback = `stoa-${workspace}.stoa`;
  if (typeof value !== "string") return fallback;
  const filename = [...path.basename(value)]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("")
    .trim();
  if (!filename || filename.length > 180) return fallback;
  if (/\.stoa$/iu.test(filename)) return filename;
  if (/\.stoa\.json$/iu.test(filename)) return filename.replace(/\.json$/iu, "");
  if (/\.json$/iu.test(filename)) return filename.replace(/\.json$/iu, ".stoa");
  return `${filename}.stoa`;
}

function ensureNativeProjectFileExtension(filePath) {
  if (/\.stoa$/iu.test(filePath)) return filePath;
  if (/\.stoa\.json$/iu.test(filePath)) return filePath.replace(/\.json$/iu, "");
  if (/\.json$/iu.test(filePath)) return filePath.replace(/\.json$/iu, ".stoa");
  return `${filePath}.stoa`;
}

async function addRecentFile(filePath) {
  const absolutePath = path.resolve(filePath);
  recentFiles = [
    absolutePath,
    ...recentFiles.filter((candidate) => candidate !== absolutePath),
  ].slice(0, MAX_RECENT_DOCUMENTS);
  app.addRecentDocument(absolutePath);
  await persistDesktopState();
  createApplicationMenu();
  notifyDocumentStateChanged();
}

async function removeRecentFile(filePath) {
  recentFiles = recentFiles.filter((candidate) => candidate !== filePath);
  await persistDesktopState();
  createApplicationMenu();
  notifyDocumentStateChanged();
}

function markDocumentOpened(workspace, filePath, revision, displayName) {
  const document = workspaceDocuments.get(workspace);
  document.filePath = filePath;
  document.displayName = filePath
    ? path.basename(filePath)
    : displayName || `${WORKSPACE_LABELS[workspace]} — Untitled`;
  document.revision = revision;
  document.savedRevision = revision;
  document.dirty = false;
  activeWorkspace = workspace;
  notifyDocumentStateChanged();
}

function resetWorkspaceRegistry() {
  for (const workspace of STOA_WORKSPACES) {
    const document = workspaceDocuments.get(workspace);
    document.filePath = null;
    document.displayName = `${WORKSPACE_LABELS[workspace]} — Untitled`;
    document.revision = null;
    document.savedRevision = null;
    document.dirty = false;
  }
  activeWorkspace = "ancient-greek";
}

async function showLifecycleError(window, message, error) {
  const detail = error instanceof Error ? error.message : String(error ?? "Unknown error");
  await dialog.showMessageBox(window, {
    type: "error",
    buttons: ["OK"],
    defaultId: 0,
    message,
    detail,
    noLink: true,
  });
}

async function saveWorkspace(window, workspaceValue, saveAs = false) {
  const workspace = normalizeWorkspace(workspaceValue);
  const document = workspaceDocuments.get(workspace);
  let serialization;
  try {
    serialization = await requestWorkspaceSerialization(window, workspace);
    if (!serialization || serialization.ok !== true) {
      throw new Error(serialization?.error || "The renderer did not return a saveable project.");
    }
    if (serialization.workspace !== workspace) {
      throw new Error("The renderer returned the wrong workspace document.");
    }
    if (typeof serialization.contents !== "string") {
      throw new Error("The STOA project serializer did not return text.");
    }
    if (Buffer.byteLength(serialization.contents, "utf8") > MAX_PROJECT_BYTES) {
      throw new Error("This STOA project is too large to save safely.");
    }
    serialization.revision = normalizeRevision(serialization.revision);
  } catch (error) {
    await showLifecycleError(window, "STOA could not prepare this document for saving.", error);
    return { status: "error" };
  }

  let targetPath = !saveAs ? document.filePath : null;
  if (!targetPath) {
    const result = await dialog.showSaveDialog(window, {
      title: `Save ${WORKSPACE_LABELS[workspace]} STOA Project`,
      defaultPath: path.join(
        app.getPath("documents"),
        normalizeSuggestedProjectName(serialization.suggestedName, workspace),
      ),
      filters: PROJECT_SAVE_FILE_FILTERS,
      properties: ["showOverwriteConfirmation", "createDirectory"],
    });
    if (result.canceled || !result.filePath) return { status: "cancelled" };
    targetPath = ensureNativeProjectFileExtension(result.filePath);
  }

  try {
    await atomicWriteText(targetPath, serialization.contents);
  } catch (error) {
    await showLifecycleError(window, "STOA could not save this project.", error);
    return { status: "error" };
  }

  document.filePath = targetPath;
  document.displayName = path.basename(targetPath);
  document.savedRevision = serialization.revision;
  document.dirty = document.revision !== serialization.revision;
  await addRecentFile(targetPath);
  notifyDocumentStateChanged(window);
  return {
    status: "saved",
    workspace,
    filePath: targetPath,
    displayName: document.displayName,
    savedRevision: serialization.revision,
    dirty: document.dirty,
  };
}

async function confirmWorkspaceCanBeDiscarded(window, workspace) {
  const document = workspaceDocuments.get(workspace);
  if (!document.dirty) return true;
  const result = await dialog.showMessageBox(window, {
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: `Do you want to save the changes made to “${document.displayName}”?`,
    detail: "Your changes will be lost if you don't save them.",
  });
  if (result.response === 2) return false;
  if (result.response === 1) return true;
  const saved = await saveWorkspace(window, workspace, false);
  if (saved.status !== "saved") return false;
  if (workspaceDocuments.get(workspace).dirty) {
    await dialog.showMessageBox(window, {
      type: "warning",
      buttons: ["Return to Document"],
      message: "The document changed while it was being saved.",
      detail: "STOA kept the newer edits open. Save again before closing.",
      noLink: true,
    });
    return false;
  }
  return true;
}

async function confirmAllWorkspacesCanBeDiscarded(window) {
  const ordered = [
    activeWorkspace,
    ...STOA_WORKSPACES.filter((workspace) => workspace !== activeWorkspace),
  ];
  for (const workspace of ordered) {
    if (!await confirmWorkspaceCanBeDiscarded(window, workspace)) return false;
  }
  return true;
}

function projectWorkspaceFromText(contents) {
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  // Portable STOA files place `document` at the root. Accept the short-lived
  // nested transport shape as a backwards-compatible fallback only.
  const workspace = parsed?.document?.language ?? parsed?.project?.document?.language;
  if (!isWorkspace(workspace)) {
    throw new Error("This is not a STOA project for a supported workspace.");
  }
  return workspace;
}

async function readProjectFile(filePath) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) throw new Error("The selected STOA project is not a file.");
  if (stats.size > MAX_PROJECT_BYTES) {
    throw new Error("STOA project files must be 64 MB or smaller.");
  }
  const contents = await fs.readFile(filePath, "utf8");
  if (Buffer.byteLength(contents, "utf8") > MAX_PROJECT_BYTES) {
    throw new Error("STOA project files must be 64 MB or smaller.");
  }
  return { contents, workspace: projectWorkspaceFromText(contents) };
}

async function openProjectFromPath(window, filePath) {
  let project;
  try {
    project = await readProjectFile(filePath);
  } catch (error) {
    await removeRecentFile(filePath).catch(() => undefined);
    await showLifecycleError(window, "STOA could not open this project.", error);
    return { status: "error" };
  }
  if (!await confirmWorkspaceCanBeDiscarded(window, project.workspace)) {
    return { status: "cancelled" };
  }
  try {
    const result = await requestRendererCommand(window, {
      type: "open-project",
      workspace: project.workspace,
      filePath,
      displayName: path.basename(filePath),
      contents: project.contents,
    });
    if (!result || result.ok !== true) {
      throw new Error(result?.error || "The renderer rejected this STOA project.");
    }
    const workspace = normalizeWorkspace(result.workspace, null);
    if (workspace !== project.workspace) {
      throw new Error("The opened project did not match its declared workspace.");
    }
    const revision = normalizeRevision(result.revision);
    markDocumentOpened(workspace, filePath, revision);
    await addRecentFile(filePath);
    return {
      status: "opened",
      workspace,
      filePath,
      displayName: path.basename(filePath),
      revision,
    };
  } catch (error) {
    await showLifecycleError(window, "STOA could not restore this project.", error);
    return { status: "error" };
  }
}

async function openDocumentWithDialog(window) {
  const result = await dialog.showOpenDialog(window, {
    title: "Open STOA Project",
    defaultPath: app.getPath("documents"),
    filters: PROJECT_OPEN_FILE_FILTERS,
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return { status: "cancelled" };
  return openProjectFromPath(window, result.filePaths[0]);
}

async function newWorkspaceDocument(window, workspaceValue, kindValue = "blank") {
  const workspace = normalizeWorkspace(workspaceValue);
  const kind = kindValue === "sample" ? "sample" : "blank";
  if (!await confirmWorkspaceCanBeDiscarded(window, workspace)) {
    return { status: "cancelled" };
  }
  try {
    const result = await requestRendererCommand(window, {
      type: "new-document",
      workspace,
      kind,
    });
    if (!result || result.ok !== true) {
      throw new Error(result?.error || "The renderer could not create this document.");
    }
    const revision = normalizeRevision(result.revision);
    markDocumentOpened(
      workspace,
      null,
      revision,
      `${WORKSPACE_LABELS[workspace]} — Untitled`,
    );
    return { status: "created", workspace, kind, revision };
  } catch (error) {
    await showLifecycleError(window, "STOA could not create a new document.", error);
    return { status: "error" };
  }
}

async function closeWorkspaceDocument(window, workspaceValue) {
  const workspace = normalizeWorkspace(workspaceValue);
  if (!await confirmWorkspaceCanBeDiscarded(window, workspace)) {
    return { status: "cancelled" };
  }
  try {
    const result = await requestRendererCommand(window, {
      type: "close-document",
      workspace,
    });
    if (!result || result.ok !== true) {
      throw new Error(result?.error || "The renderer could not close this document.");
    }
    const revision = normalizeRevision(result.revision);
    markDocumentOpened(
      workspace,
      null,
      revision,
      `${WORKSPACE_LABELS[workspace]} — Untitled`,
    );
    return { status: "closed", workspace, revision };
  } catch (error) {
    await showLifecycleError(window, "STOA could not close this document.", error);
    return { status: "error" };
  }
}

function sendSimpleRendererCommand(type) {
  const window = activeWindow();
  if (!window || window.isDestroyed()) return;
  void requestRendererCommand(window, { type, workspace: activeWorkspace })
    .catch((error) => showLifecycleError(window, `STOA could not perform ${type}.`, error));
}

function openRecentMenuItems(documentsReady) {
  const items = recentFiles.length
    ? recentFiles.map((filePath) => ({
        label: path.basename(filePath),
        sublabel: path.dirname(filePath),
        enabled: documentsReady,
        click() {
          const window = activeWindow();
          if (window) void runLifecycleOperation(() => openProjectFromPath(window, filePath));
        },
      }))
    : [{ label: "No Recent Documents", enabled: false }];
  return [
    ...items,
    { type: "separator" },
    {
      label: "Clear Menu",
      enabled: recentFiles.length > 0,
      click() {
        recentFiles = [];
        app.clearRecentDocuments();
        void persistDesktopState().finally(() => {
          createApplicationMenu();
          notifyDocumentStateChanged();
        });
      },
    },
  ];
}

function createApplicationMenu() {
  const documentsReady = Boolean(
    applicationWindow
    && !applicationWindow.isDestroyed()
    && rendererReadyWebContents.has(applicationWindow.webContents.id),
  );
  const fileSubmenu = [
    {
      label: "New STOA Document",
      accelerator: "CmdOrCtrl+N",
      enabled: documentsReady,
      click() {
        const window = activeWindow();
        if (window) void runLifecycleOperation(() => newWorkspaceDocument(window, activeWorkspace, "blank"));
      },
    },
    {
      label: "New from Bundled Sample",
      enabled: documentsReady,
      click() {
        const window = activeWindow();
        if (window) void runLifecycleOperation(() => newWorkspaceDocument(window, activeWorkspace, "sample"));
      },
    },
    {
      label: "Open…",
      accelerator: "CmdOrCtrl+O",
      enabled: documentsReady,
      click() {
        const window = activeWindow();
        if (window) void runLifecycleOperation(() => openDocumentWithDialog(window));
      },
    },
    { label: "Open Recent", submenu: openRecentMenuItems(documentsReady) },
    { type: "separator" },
    {
      label: "Close STOA Document",
      accelerator: "CmdOrCtrl+W",
      enabled: documentsReady,
      click() {
        const window = activeWindow();
        if (window) void runLifecycleOperation(() => closeWorkspaceDocument(window, activeWorkspace));
      },
    },
    {
      label: "Save",
      accelerator: "CmdOrCtrl+S",
      enabled: documentsReady,
      click() {
        const window = activeWindow();
        if (window) void runLifecycleOperation(() => saveWorkspace(window, activeWorkspace, false));
      },
    },
    {
      label: "Save As…",
      accelerator: "CmdOrCtrl+Shift+S",
      enabled: documentsReady,
      click() {
        const window = activeWindow();
        if (window) void runLifecycleOperation(() => saveWorkspace(window, activeWorkspace, true));
      },
    },
  ];

  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    { label: "File", submenu: fileSubmenu },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          enabled: documentsReady,
          click: () => sendSimpleRendererCommand("undo"),
        },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Shift+Z",
          enabled: documentsReady,
          click: () => sendSimpleRendererCommand("redo"),
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(process.platform === "darwin"
          ? [{ type: "separator" }, { role: "front" }]
          : [{ role: "close" }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "STOA Help",
          accelerator: "CmdOrCtrl+?",
          enabled: documentsReady,
          click: () => sendSimpleRendererCommand("show-help"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function runStartupFlow(window, wasFirstLaunch) {
  if (!window || window.isDestroyed()) return;
  if (queuedFinderDocuments.length > 0) {
    const queued = queuedFinderDocuments.splice(0);
    for (const filePath of queued) {
      const result = await openProjectFromPath(window, filePath);
      if (result.status === "opened") break;
    }
    return;
  }

  if (wasFirstLaunch) {
    await requestRendererCommand(window, {
      type: "startup-first-launch",
      workspace: activeWorkspace,
    }).catch((error) => showLifecycleError(
      window,
      "STOA could not finish first-launch setup.",
      error,
    ));
    return;
  }

  const mostRecent = recentFiles[0];
  const buttons = mostRecent
    ? ["New Blank Document", "Open…", `Reopen ${path.basename(mostRecent)}`, "Continue with Samples"]
    : ["New Blank Document", "Open…", "Continue with Samples"];
  const continueIndex = buttons.length - 1;
  const result = await dialog.showMessageBox(window, {
    type: "question",
    buttons,
    defaultId: mostRecent ? 2 : 0,
    cancelId: continueIndex,
    noLink: true,
    message: "Welcome to STOA",
    detail: mostRecent
      ? "Create a new document, open a project, reopen your most recent project, or continue with the bundled samples."
      : "Create a new document, open an existing STOA project, or continue with the bundled samples.",
  });
  if (result.response === 0) {
    await newWorkspaceDocument(window, activeWorkspace, "blank");
  } else if (result.response === 1) {
    await openDocumentWithDialog(window);
  } else if (mostRecent && result.response === 2) {
    await openProjectFromPath(window, mostRecent);
  }
}

function installDocumentBridge() {
  ipcMain.handle(DOCUMENT_IPC_CHANNELS.getState, (event) => {
    assertTrustedIpcSender(event);
    return publicDocumentState();
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.rendererReady, async (event) => {
    assertTrustedIpcSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("The STOA window is unavailable.");
    const alreadyReady = rendererReadyWebContents.has(event.sender.id);
    rendererReadyWebContents.add(event.sender.id);
    createApplicationMenu();
    const wasFirstLaunch = firstLaunch;
    const state = publicDocumentState(wasFirstLaunch);
    if (!alreadyReady) {
      firstLaunch = false;
      await persistDesktopState();
      queueMicrotask(() => {
        void runLifecycleOperation(() => runStartupFlow(window, wasFirstLaunch));
      });
    }
    notifyDocumentStateChanged(window);
    return state;
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.setActiveWorkspace, (event, workspaceValue) => {
    assertTrustedIpcSender(event);
    activeWorkspace = normalizeWorkspace(workspaceValue);
    notifyDocumentStateChanged(BrowserWindow.fromWebContents(event.sender));
    return publicDocumentState(false);
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.updateWorkspaceState, (event, value) => {
    assertTrustedIpcSender(event);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid STOA workspace state.");
    }
    const workspace = normalizeWorkspace(value.workspace, null);
    const revision = normalizeRevision(value.revision);
    if (typeof value.dirty !== "boolean") {
      throw new Error("STOA workspace state must include its dirty status.");
    }
    const document = workspaceDocuments.get(workspace);
    if (document.savedRevision === null && value.dirty === false) {
      document.savedRevision = revision;
    }
    document.revision = revision;
    document.dirty = value.dirty === true || document.savedRevision !== revision;
    if (
      !document.filePath
      && typeof value.displayName === "string"
      && value.displayName.trim()
      && value.displayName.length <= 180
    ) {
      document.displayName = value.displayName.trim();
    }
    notifyDocumentStateChanged(BrowserWindow.fromWebContents(event.sender));
    return publicWorkspaceState(document);
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.newDocument, (event, workspace, kind) => {
    assertTrustedIpcSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    return runLifecycleOperation(() => newWorkspaceDocument(window, workspace, kind));
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.openDocument, (event) => {
    assertTrustedIpcSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    return runLifecycleOperation(() => openDocumentWithDialog(window));
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.openRecent, (event, filePath) => {
    assertTrustedIpcSender(event);
    if (typeof filePath !== "string" || !recentFiles.includes(filePath)) {
      throw new Error("That file is not in STOA's Open Recent list.");
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    return runLifecycleOperation(() => openProjectFromPath(window, filePath));
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.saveDocument, (event, workspace, saveAs) => {
    assertTrustedIpcSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    return runLifecycleOperation(() => saveWorkspace(window, workspace, saveAs === true));
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.closeDocument, (event, workspace) => {
    assertTrustedIpcSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    return runLifecycleOperation(() => closeWorkspaceDocument(window, workspace));
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.getRecentFiles, (event) => {
    assertTrustedIpcSender(event);
    return publicRecentFiles();
  });

  ipcMain.handle(DOCUMENT_IPC_CHANNELS.clearRecentFiles, async (event) => {
    assertTrustedIpcSender(event);
    recentFiles = [];
    app.clearRecentDocuments();
    await persistDesktopState();
    createApplicationMenu();
    notifyDocumentStateChanged(BrowserWindow.fromWebContents(event.sender));
    return [];
  });

  ipcMain.on(DOCUMENT_IPC_CHANNELS.commandResult, (event, requestId, result) => {
    try {
      assertTrustedIpcSender(event);
      if (typeof requestId !== "string") return;
      const pending = pendingRendererCommands.get(requestId);
      if (!pending || pending.webContentsId !== event.sender.id) return;
      clearTimeout(pending.timeout);
      pendingRendererCommands.delete(requestId);
      pending.resolve(result);
    } catch (error) {
      console.error("Rejected STOA command response:", error);
    }
  });

  ipcMain.on(DOCUMENT_IPC_CHANNELS.serializeResult, (event, requestId, result) => {
    try {
      assertTrustedIpcSender(event);
      if (typeof requestId !== "string") return;
      const pending = pendingSerializationRequests.get(requestId);
      if (!pending || pending.webContentsId !== event.sender.id) return;
      clearTimeout(pending.timeout);
      pendingSerializationRequests.delete(requestId);
      pending.resolve(result);
    } catch (error) {
      console.error("Rejected STOA serialization response:", error);
    }
  });
}

function installDownloadPrompt() {
  session.defaultSession.on("will-download", async (_event, item) => {
    item.pause();

    const result = await dialog.showSaveDialog({
      title: "Export from STOA",
      defaultPath: path.join(app.getPath("documents"), item.getFilename()),
    });

    if (result.canceled || !result.filePath) {
      item.cancel();
      return;
    }

    item.setSavePath(result.filePath);
    item.resume();
  });
}

function installPermissionPolicy() {
  const permittedRendererPermissions = new Set(["clipboard-sanitized-write"]);
  const senderIsTrusted = (webContents) =>
    Boolean(webContents && trustedWebContents.has(webContents.id));

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(
        senderIsTrusted(webContents)
        && permittedRendererPermissions.has(permission),
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) =>
      senderIsTrusted(webContents)
      && permittedRendererPermissions.has(permission),
  );
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1540,
    height: 1000,
    minWidth: 1120,
    minHeight: 760,
    title: `STOA ${STOA_VERSION} — Classical Interlinear Studio`,
    backgroundColor: "#e8e7e1",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(desktopDirectory, "preload.cjs"),
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });
  applicationWindow = window;
  const webContentsId = window.webContents.id;
  trustedWebContents.add(webContentsId);

  if (!desktopRuntimeSmokeTest) {
    window.once("ready-to-show", () => window.show());
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isApplicationPageUrl(url)) {
      event.preventDefault();
      if (url.startsWith("https://") || url.startsWith("http://")) {
        void shell.openExternal(url);
      }
    }
  });

  window.webContents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) cancelAiRequests(webContentsId);
  });

  window.webContents.on("render-process-gone", () => {
    cancelAiRequests(webContentsId);
  });

  window.webContents.once("destroyed", () => {
    cancelAiRequests(webContentsId);
    rejectPendingRendererRequests(
      webContentsId,
      new Error("The STOA window closed before the operation completed."),
    );
    rendererReadyWebContents.delete(webContentsId);
    trustedWebContents.delete(webContentsId);
    if (applicationWindow === window) applicationWindow = null;
    createApplicationMenu();
  });

  window.on("close", (event) => {
    if (forceApplicationQuit) return;
    event.preventDefault();
    const quitting = applicationQuitRequested;
    void runLifecycleOperation(async () => {
      if (!await confirmAllWorkspacesCanBeDiscarded(window)) {
        applicationQuitRequested = false;
        return;
      }
      if (quitting) {
        forceApplicationQuit = true;
        app.quit();
      } else {
        resetWorkspaceRegistry();
        window.destroy();
      }
    });
  });

  void window.loadURL(applicationPageUrl);
  updateApplicationWindowState(window);
}

function queueOrOpenFinderDocument(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) return;
  const window = applicationWindow;
  if (
    !window
    || window.isDestroyed()
    || !rendererReadyWebContents.has(window.webContents.id)
  ) {
    if (!queuedFinderDocuments.includes(filePath)) queuedFinderDocuments.push(filePath);
    return;
  }
  void runLifecycleOperation(() => openProjectFromPath(window, filePath));
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  queueOrOpenFinderDocument(filePath);
});

app.on("before-quit", () => {
  if (!forceApplicationQuit) applicationQuitRequested = true;
});

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  await loadDesktopState();
  await installApplicationProtocol();
  if (desktopRuntimeSmokeTest) {
    try {
      const result = await runDesktopRuntimeSmokeTest();
      console.log(`STOA_DESKTOP_SMOKE_RESULT ${JSON.stringify(result)}`);
      app.exit(0);
    } catch (error) {
      console.error(
        "STOA_DESKTOP_SMOKE_ERROR",
        error instanceof Error ? error.stack || error.message : error,
      );
      app.exit(1);
    }
    return;
  }
  const launchDocument = process.argv.find((argument) =>
    path.isAbsolute(argument) && /\.(?:stoa|json)$/iu.test(argument));
  if (launchDocument && !queuedFinderDocuments.includes(launchDocument)) {
    queuedFinderDocuments.push(launchDocument);
  }
  createApplicationMenu();
  installDownloadPrompt();
  installPermissionPolicy();
  installAiBridge();
  installDocumentBridge();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", (_event, commandLine) => {
  let window = BrowserWindow.getAllWindows()[0];
  if (!window) {
    createWindow();
    window = applicationWindow;
  }
  const documentPath = commandLine.find((argument) =>
    path.isAbsolute(argument) && /\.(?:stoa|json)$/iu.test(argument));
  if (documentPath) queueOrOpenFinderDocument(documentPath);
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
