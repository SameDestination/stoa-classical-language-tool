import { gunzipSync, strFromU8 } from "fflate";

export type DictionaryLanguage = "ancient-greek" | "latin" | "classical-chinese";

export type DictionaryId = string;

export type DictionaryMatchKind = "exact" | "normalized" | "folded" | "none";

export type DictionaryManifest = {
  id: DictionaryId;
  title: string;
  styleCss: string;
  indexBuckets: string[];
  entryChunkSize: number;
  entryCount: number;
};

export type DictionaryEntry = {
  id: number;
  key: string;
  html: string;
};

export type DictionaryLookupResult = {
  dictionaryId: DictionaryId;
  dictionaryTitle: string;
  language: DictionaryLanguage;
  query: string;
  normalizedQuery: string;
  foldedQuery: string;
  matchKind: DictionaryMatchKind;
  entries: DictionaryEntry[];
  totalMatches: number;
  styleCss: string;
};

export type DictionarySrcDocOptions = {
  entries: Array<Pick<DictionaryEntry, "key" | "html">>;
  styleCss: string;
  title?: string;
  documentLanguage?: "grc" | "la" | "zh-Hant";
};

type DictionaryIndexPayload = {
  e: Record<string, number[]>;
  f: Record<string, number[]>;
};

type LexicaRegistry = {
  manifests?: Record<string, unknown>;
  shards?: Record<string, unknown>;
};

type RuntimeGlobals = typeof globalThis & {
  __STOA_LEXICA__?: LexicaRegistry;
  Buffer?: {
    from(value: string, encoding: "base64"): Uint8Array;
  };
};

export type DictionaryRuntimeErrorCode =
  | "unsupported-environment"
  | "asset-load"
  | "missing-pack-data"
  | "invalid-pack-data";

export class DictionaryRuntimeError extends Error {
  readonly code: DictionaryRuntimeErrorCode;

  constructor(code: DictionaryRuntimeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DictionaryRuntimeError";
    this.code = code;
  }
}

const PACK_BASE_PATH = "dictionaries/stoa-lexica-v1";
const BINARY_PACK_MARKER = "portable-format.json";
const BINARY_PACK_FORMAT = "stoa-lexica-binary-gzip";
const BINARY_PACK_VERSION = 1;
const MAX_LOOKUP_ENTRIES = 24;
const MAX_DECODED_SHARDS_IN_MEMORY = 18;
const MAX_INDEX_IDS_PER_KEY = 1_024;
const MAX_COMPRESSED_BASE64_LENGTH = 32 * 1024 * 1024;
const MAX_COMPRESSED_SHARD_BYTES = 24 * 1024 * 1024;
const MAX_UNCOMPRESSED_SHARD_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_HTML_LENGTH = 2 * 1024 * 1024;

const languageDictionary: Partial<Record<DictionaryLanguage, DictionaryId>> = {
  "ancient-greek": "lsj",
  latin: "old",
};

const scriptPromiseCache = new Map<string, Promise<void>>();
const manifestPromiseCache = new Map<DictionaryId, Promise<DictionaryManifest>>();
const shardPromiseCache = new Map<string, Promise<unknown>>();
let binaryPackPromise: Promise<boolean> | null = null;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function runtimeGlobals(): RuntimeGlobals {
  return globalThis as RuntimeGlobals;
}

function getRegistry(): LexicaRegistry {
  const globals = runtimeGlobals();
  if (!globals.__STOA_LEXICA__ || typeof globals.__STOA_LEXICA__ !== "object") {
    globals.__STOA_LEXICA__ = { manifests: {}, shards: {} };
  }
  globals.__STOA_LEXICA__.manifests ??= {};
  globals.__STOA_LEXICA__.shards ??= {};
  return globals.__STOA_LEXICA__;
}

/**
 * Normalization shared by the generated index and browser lookup. It is
 * deliberately conservative: punctuation remains part of a dictionary key.
 */
export function normalizeDictionaryKey(value: string): string {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

function normalizeDictionaryKeyWithoutComposition(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

/**
 * Removes only U+0304 COMBINING MACRON from a Latin vowel. Other combining
 * marks, ligatures, and language-specific orthography are deliberately kept.
 */
export function stripLatinMacrons(value: string): string {
  let result = "";
  let lastStarterIsLatinVowel = false;
  for (const character of String(value ?? "").normalize("NFD")) {
    if (/\p{M}/u.test(character)) {
      if (character === "\u0304" && lastStarterIsLatinVowel) continue;
      result += character;
      continue;
    }
    lastStarterIsLatinVowel = /[AEIOUYaeiouy]/u.test(character);
    result += character;
  }
  return result.normalize("NFC");
}

export function buildLatinDictionaryLookupCandidates(lemma: string): string[] {
  const original = normalizeDictionaryKeyWithoutComposition(lemma);
  const normalized = normalizeDictionaryKey(lemma);
  const macronless = normalizeDictionaryKey(stripLatinMacrons(normalized));
  return Array.from(new Set([original, normalized, macronless].filter(Boolean)));
}

export function buildDictionaryLookupCandidates(
  language: DictionaryLanguage,
  lemma: string,
): string[] {
  const exactCandidates = language === "latin"
    ? buildLatinDictionaryLookupCandidates(lemma)
    : Array.from(new Set([
        normalizeDictionaryKeyWithoutComposition(lemma),
        normalizeDictionaryKey(lemma),
      ].filter(Boolean)));
  const folded = foldDictionaryKey(lemma);
  return Array.from(new Set([...exactCandidates, folded].filter(Boolean)));
}

/**
 * A secondary accent-insensitive lookup form. Greek final sigma is folded to
 * medial sigma so that inflection/lemma data using either code point agrees.
 */
export function foldDictionaryKey(value: string): string {
  return normalizeDictionaryKey(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/\u03c2/gu, "\u03c3")
    .normalize("NFC");
}

export function dictionaryBucketForKey(value: string): string {
  const first = Array.from(foldDictionaryKey(value))[0];
  if (!first) return "misc";
  const codePoint = first.codePointAt(0);
  if (codePoint === undefined) return "misc";
  return `u${codePoint.toString(16).padStart(4, "0")}`;
}

function dictionaryAssetUrl(id: DictionaryId, filename: string): string {
  if (typeof document === "undefined") {
    throw new DictionaryRuntimeError(
      "unsupported-environment",
      "The offline dictionary can only be loaded in a browser document.",
    );
  }
  return new URL(`${PACK_BASE_PATH}/${id}/${filename}`, document.baseURI).href;
}

function dictionaryPackAssetUrl(filename: string): string {
  if (typeof document === "undefined") {
    throw new DictionaryRuntimeError(
      "unsupported-environment",
      "The offline dictionary can only be loaded in a browser document.",
    );
  }
  return new URL(`${PACK_BASE_PATH}/${filename}`, document.baseURI).href;
}

/**
 * The normal web build keeps CSP-friendly script shards. The slim portable
 * build writes this marker and stores the same gzip payloads as binary files,
 * avoiding Base64's 33% expansion without changing dictionary content.
 */
async function usesBinaryDictionaryPack(): Promise<boolean> {
  if (binaryPackPromise) return binaryPackPromise;
  binaryPackPromise = (async () => {
    if (typeof document === "undefined" || typeof fetch !== "function") return false;
    try {
      const response = await fetch(dictionaryPackAssetUrl(BINARY_PACK_MARKER), {
        cache: "no-store",
      });
      if (!response.ok) return false;
      const value: unknown = await response.json();
      return isPlainRecord(value)
        && value.format === BINARY_PACK_FORMAT
        && value.version === BINARY_PACK_VERSION;
    } catch {
      return false;
    }
  })();
  return binaryPackPromise;
}

async function fetchDictionaryBytes(url: string): Promise<Uint8Array> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 30_000) : null;
  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) {
      throw new DictionaryRuntimeError(
        "asset-load",
        `Could not load the local dictionary asset: ${url}`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_COMPRESSED_SHARD_BYTES) {
      throw new DictionaryRuntimeError(
        "invalid-pack-data",
        `Dictionary asset ${url} has an invalid size.`,
      );
    }
    return bytes;
  } catch (error) {
    if (error instanceof DictionaryRuntimeError) throw error;
    throw new DictionaryRuntimeError(
      "asset-load",
      `Could not load the local dictionary asset: ${url}`,
      { cause: error },
    );
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

function loadScript(url: string): Promise<void> {
  const cached = scriptPromiseCache.get(url);
  if (cached) return cached;

  if (typeof document === "undefined") {
    return Promise.reject(new DictionaryRuntimeError(
      "unsupported-environment",
      "The offline dictionary can only be loaded in a browser document.",
    ));
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timeoutRef: { current?: ReturnType<typeof setTimeout> } = {};

    const finish = (error?: Error) => {
      if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
      script.remove();
      if (error) reject(error);
      else resolve();
    };

    script.async = true;
    script.src = url;
    script.dataset.stoaDictionaryAsset = "true";
    script.addEventListener("load", () => finish(), { once: true });
    script.addEventListener("error", () => finish(new DictionaryRuntimeError(
      "asset-load",
      `Could not load the local dictionary asset: ${url}`,
    )), { once: true });
    timeoutRef.current = setTimeout(() => finish(new DictionaryRuntimeError(
      "asset-load",
      `Timed out while loading the local dictionary asset: ${url}`,
    )), 30_000);
    (document.head ?? document.documentElement).append(script);
  });

  scriptPromiseCache.set(url, promise);
  void promise.then(
    () => scriptPromiseCache.delete(url),
    () => scriptPromiseCache.delete(url),
  );
  return promise;
}

function validateManifest(value: unknown, expectedId: DictionaryId): DictionaryManifest {
  if (!isPlainRecord(value)) {
    throw new DictionaryRuntimeError("invalid-pack-data", `Dictionary manifest ${expectedId} is not an object.`);
  }
  const { id, title, styleCss, indexBuckets, entryChunkSize, entryCount } = value;
  if (
    id !== expectedId
    || typeof title !== "string"
    || title.length === 0
    || typeof styleCss !== "string"
    || styleCss.length > 8 * 1024 * 1024
    || !Array.isArray(indexBuckets)
    || !indexBuckets.every((bucket) => typeof bucket === "string" && /^(?:u[0-9a-f]{4,6}|misc)$/u.test(bucket))
    || !Number.isSafeInteger(entryChunkSize)
    || (entryChunkSize as number) <= 0
    || (entryChunkSize as number) > 100_000
    || !Number.isSafeInteger(entryCount)
    || (entryCount as number) < 0
  ) {
    throw new DictionaryRuntimeError("invalid-pack-data", `Dictionary manifest ${expectedId} has an invalid schema.`);
  }
  return {
    id: id as DictionaryId,
    title,
    styleCss,
    indexBuckets: Array.from(new Set(indexBuckets as string[])),
    entryChunkSize: entryChunkSize as number,
    entryCount: entryCount as number,
  };
}

async function loadManifest(id: DictionaryId): Promise<DictionaryManifest> {
  const cached = manifestPromiseCache.get(id);
  if (cached) return cached;

  const promise = (async () => {
    if (await usesBinaryDictionaryPack()) {
      const compressed = await fetchDictionaryBytes(dictionaryAssetUrl(id, "manifest.json.gz"));
      if (declaredGzipSize(compressed) > MAX_UNCOMPRESSED_SHARD_BYTES) {
        throw new DictionaryRuntimeError("invalid-pack-data", `Dictionary manifest ${id} is unexpectedly large.`);
      }
      try {
        return validateManifest(JSON.parse(strFromU8(gunzipSync(compressed))) as unknown, id);
      } catch (error) {
        if (error instanceof DictionaryRuntimeError) throw error;
        throw new DictionaryRuntimeError(
          "invalid-pack-data",
          `Dictionary manifest ${id} could not be decoded.`,
          { cause: error },
        );
      }
    }
    const before = getRegistry().manifests;
    if (!before || own(before, id) === undefined) {
      await loadScript(dictionaryAssetUrl(id, "manifest.js"));
    }
    const manifest = own(getRegistry().manifests ?? {}, id);
    if (manifest === undefined) {
      throw new DictionaryRuntimeError(
        "missing-pack-data",
        `The ${id.toUpperCase()} dictionary manifest did not register itself.`,
      );
    }
    return validateManifest(manifest, id);
  })();

  manifestPromiseCache.set(id, promise);
  void promise.catch(() => manifestPromiseCache.delete(id));
  return promise;
}

function decodeBase64(value: string): Uint8Array {
  if (value.length === 0 || value.length > MAX_COMPRESSED_BASE64_LENGTH || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw new DictionaryRuntimeError("invalid-pack-data", "A dictionary shard has an invalid base64 payload.");
  }
  if (typeof atob === "function") {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    return bytes;
  }
  const NodeBuffer = runtimeGlobals().Buffer;
  if (NodeBuffer) return new Uint8Array(NodeBuffer.from(value, "base64"));
  throw new DictionaryRuntimeError("unsupported-environment", "This browser cannot decode dictionary data.");
}

function declaredGzipSize(bytes: Uint8Array): number {
  if (bytes.length < 18) {
    throw new DictionaryRuntimeError("invalid-pack-data", "A dictionary shard is not a complete gzip stream.");
  }
  const offset = bytes.length - 4;
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function decodeShardPayload(encoded: unknown, shardKey: string): unknown {
  if (typeof encoded !== "string") {
    throw new DictionaryRuntimeError("missing-pack-data", `Dictionary shard ${shardKey} did not register itself.`);
  }
  return decodeCompressedShardPayload(decodeBase64(encoded), shardKey);
}

function decodeCompressedShardPayload(compressed: Uint8Array, shardKey: string): unknown {
  if (declaredGzipSize(compressed) > MAX_UNCOMPRESSED_SHARD_BYTES) {
    throw new DictionaryRuntimeError("invalid-pack-data", `Dictionary shard ${shardKey} is unexpectedly large.`);
  }
  try {
    const json = strFromU8(gunzipSync(compressed));
    if (json.length > MAX_UNCOMPRESSED_SHARD_BYTES) {
      throw new DictionaryRuntimeError("invalid-pack-data", `Dictionary shard ${shardKey} is unexpectedly large.`);
    }
    return JSON.parse(json) as unknown;
  } catch (error) {
    if (error instanceof DictionaryRuntimeError) throw error;
    throw new DictionaryRuntimeError(
      "invalid-pack-data",
      `Dictionary shard ${shardKey} could not be decoded.`,
      { cause: error },
    );
  }
}

async function loadShard(id: DictionaryId, filename: string, shardKey: string): Promise<unknown> {
  const cached = shardPromiseCache.get(shardKey);
  if (cached) return cached;

  const promise = (async () => {
    if (await usesBinaryDictionaryPack()) {
      const compressedFilename = filename.replace(/\.js$/u, ".gz");
      const compressed = await fetchDictionaryBytes(dictionaryAssetUrl(id, compressedFilename));
      return decodeCompressedShardPayload(compressed, shardKey);
    }
    const registry = getRegistry();
    if (!registry.shards || own(registry.shards, shardKey) === undefined) {
      await loadScript(dictionaryAssetUrl(id, filename));
    }
    const activeRegistry = getRegistry();
    const encoded = own(activeRegistry.shards ?? {}, shardKey);
    const payload = decodeShardPayload(encoded, shardKey);
    if (activeRegistry.shards) delete activeRegistry.shards[shardKey];
    return payload;
  })();

  shardPromiseCache.set(shardKey, promise);
  void promise.then(
    () => {
      // Refresh insertion order, then retain only a small working set. The
      // compressed script can be loaded again if an evicted shard is needed.
      shardPromiseCache.delete(shardKey);
      shardPromiseCache.set(shardKey, promise);
      while (shardPromiseCache.size > MAX_DECODED_SHARDS_IN_MEMORY) {
        const oldestKey = shardPromiseCache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        shardPromiseCache.delete(oldestKey);
      }
    },
    () => shardPromiseCache.delete(shardKey),
  );
  return promise;
}

function validateIndexMap(value: unknown, label: string, entryCount: number): Record<string, number[]> {
  if (!isPlainRecord(value)) {
    throw new DictionaryRuntimeError("invalid-pack-data", `Dictionary ${label} index is not an object.`);
  }
  for (const [key, ids] of Object.entries(value)) {
    if (
      key.length === 0
      || !Array.isArray(ids)
      || ids.length > MAX_INDEX_IDS_PER_KEY
      || !ids.every((id) => Number.isSafeInteger(id) && id >= 0 && id < entryCount)
    ) {
      throw new DictionaryRuntimeError("invalid-pack-data", `Dictionary ${label} index contains an invalid entry.`);
    }
  }
  return value as Record<string, number[]>;
}

function validateIndexPayload(value: unknown, manifest: DictionaryManifest): DictionaryIndexPayload {
  if (!isPlainRecord(value)) {
    throw new DictionaryRuntimeError("invalid-pack-data", "A dictionary index shard is not an object.");
  }
  return {
    e: validateIndexMap(value.e, "exact", manifest.entryCount),
    f: validateIndexMap(value.f, "folded", manifest.entryCount),
  };
}

function validateEntryPayload(value: unknown, manifest: DictionaryManifest): DictionaryEntry[] {
  if (!Array.isArray(value) || value.length > manifest.entryChunkSize) {
    throw new DictionaryRuntimeError("invalid-pack-data", "A dictionary entry shard is not an array.");
  }
  return value.map((record) => {
    if (
      !isPlainRecord(record)
      || !Number.isSafeInteger(record.i)
      || (record.i as number) < 0
      || (record.i as number) >= manifest.entryCount
      || typeof record.k !== "string"
      || typeof record.h !== "string"
      || record.h.length > MAX_ENTRY_HTML_LENGTH
    ) {
      throw new DictionaryRuntimeError("invalid-pack-data", "A dictionary entry record has an invalid schema.");
    }
    return { id: record.i as number, key: record.k, html: record.h };
  });
}

async function loadEntries(
  id: DictionaryId,
  entryIds: number[],
  manifest: DictionaryManifest,
): Promise<DictionaryEntry[]> {
  const chunkNumbers = Array.from(new Set(entryIds.map((entryId) => Math.floor(entryId / manifest.entryChunkSize))));
  const chunks = await Promise.all(chunkNumbers.map(async (chunkNumber) => {
    const shardKey = `${id}:entries:${chunkNumber}`;
    const payload = await loadShard(
      id,
      `entries-${String(chunkNumber).padStart(3, "0")}.js`,
      shardKey,
    );
    return validateEntryPayload(payload, manifest);
  }));
  const byId = new Map(chunks.flat().map((entry) => [entry.id, entry]));
  const results = entryIds.map((entryId) => byId.get(entryId)).filter((entry): entry is DictionaryEntry => Boolean(entry));
  if (results.length !== entryIds.length) {
    throw new DictionaryRuntimeError("invalid-pack-data", "The dictionary index refers to a missing entry record.");
  }
  return results;
}

export async function lookupDictionaryLemma(
  language: DictionaryLanguage,
  lemma: string,
): Promise<DictionaryLookupResult> {
  const dictionaryId = languageDictionary[language];
  if (!dictionaryId) {
    throw new DictionaryRuntimeError("invalid-pack-data", `Unsupported dictionary language: ${String(language)}`);
  }
  const manifest = await loadManifest(dictionaryId);
  const normalizedQuery = normalizeDictionaryKey(lemma);
  const foldedQuery = foldDictionaryKey(lemma);
  const emptyResult = (matchKind: DictionaryMatchKind = "none"): DictionaryLookupResult => ({
    dictionaryId,
    dictionaryTitle: manifest.title,
    language,
    query: lemma,
    normalizedQuery,
    foldedQuery,
    matchKind,
    entries: [],
    totalMatches: 0,
    styleCss: manifest.styleCss,
  });

  if (!normalizedQuery || !foldedQuery) return emptyResult();
  const exactCandidates = language === "latin"
    ? buildLatinDictionaryLookupCandidates(lemma)
    : Array.from(new Set([
        normalizeDictionaryKeyWithoutComposition(lemma),
        normalizedQuery,
      ].filter(Boolean)));
  const steps: Array<{
    key: string;
    index: keyof DictionaryIndexPayload;
    matchKind: DictionaryMatchKind;
  }> = exactCandidates.map((key, index) => ({
    key,
    index: "e",
    matchKind: index === 0 ? "exact" : "normalized",
  }));
  if (!steps.some((step) => step.key === foldedQuery && step.index === "f")) {
    steps.push({ key: foldedQuery, index: "f", matchKind: "folded" });
  }

  const loadedIndexes = new Map<string, DictionaryIndexPayload>();
  let allIds: number[] = [];
  let matchKind: DictionaryMatchKind = "none";
  for (const step of steps) {
    const bucket = dictionaryBucketForKey(step.key);
    if (!manifest.indexBuckets.includes(bucket)) continue;
    let index = loadedIndexes.get(bucket);
    if (!index) {
      const shardKey = `${dictionaryId}:index:${bucket}`;
      const rawIndex = await loadShard(dictionaryId, `index-${bucket}.js`, shardKey);
      index = validateIndexPayload(rawIndex, manifest);
      loadedIndexes.set(bucket, index);
    }
    const ids = own(index[step.index], step.key) ?? [];
    if (!ids.length) continue;
    allIds = Array.from(new Set(ids));
    matchKind = step.matchKind;
    break;
  }
  if (allIds.length === 0) return emptyResult();

  const selectedIds = allIds.slice(0, MAX_LOOKUP_ENTRIES);
  const entries = await loadEntries(dictionaryId, selectedIds, manifest);
  return {
    ...emptyResult(matchKind),
    entries,
    totalMatches: allIds.length,
  };
}

const blockedElementSelector = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "meta",
  "base",
  "link",
  "style",
  "svg",
  "math",
  "noscript",
  "plaintext",
  "xmp",
].join(",");

const unsafeAttributeNames = new Set([
  "action",
  "formaction",
  "srcdoc",
  "nonce",
  "integrity",
  "crossorigin",
  "contenteditable",
  "tabindex",
]);

const allowedStyleProperties = /^(?:background-color|border(?:-(?:top|right|bottom|left))?(?:-(?:color|style|width|radius))?|color|display|font(?:-(?:family|size|style|variant|weight))?|height|letter-spacing|line-height|margin(?:-(?:top|right|bottom|left))?|max-(?:height|width)|min-(?:height|width)|padding(?:-(?:top|right|bottom|left))?|text-(?:align|decoration|indent|transform)|vertical-align|white-space|width|word-spacing)$/u;

function sanitizeStyleValue(value: string): string {
  if (/(?:url\s*\(|expression\s*\(|@import|javascript\s*:|behavior\s*:|-moz-binding)/iu.test(value)) return "";
  return value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return "";
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim();
      if (!allowedStyleProperties.test(property) || /[{}<>]/u.test(propertyValue)) return "";
      return `${property}: ${propertyValue}`;
    })
    .filter(Boolean)
    .join("; ");
}

function sanitizeUrlAttribute(element: Element, name: string, value: string): void {
  const lowerName = name.toLowerCase();
  if (lowerName === "href" || lowerName === "xlink:href") {
    if (!value.startsWith("#")) element.removeAttribute(name);
    return;
  }
  if (lowerName === "src") {
    if (!/^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/]+=*$/iu.test(value)) {
      element.removeAttribute(name);
    }
  }
}

function sanitizeWithDomParser(html: string): string {
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(html, "text/html");
  documentFragment.querySelectorAll(blockedElementSelector).forEach((element) => element.remove());
  documentFragment.body.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || unsafeAttributeNames.has(name)) {
        element.removeAttribute(attribute.name);
      } else if (name === "href" || name === "xlink:href" || name === "src") {
        sanitizeUrlAttribute(element, attribute.name, attribute.value.trim());
      } else if (name === "style") {
        const safeStyle = sanitizeStyleValue(attribute.value);
        if (safeStyle) element.setAttribute("style", safeStyle);
        else element.removeAttribute("style");
      }
    });
  });
  return documentFragment.body.innerHTML;
}

const blockedPairedTags = [
  "script", "iframe", "frameset", "object", "embed", "applet", "form", "style", "svg", "math", "noscript", "xmp",
];
const blockedVoidTags = ["frame", "input", "button", "textarea", "select", "option", "meta", "base", "link", "plaintext"];
const quotedOrBareAttributeValue = String.raw`(?:"[^"]*"|'[^']*'|[^\s>]+)`;

/** A dependency-free fallback used by non-DOM test environments. */
function sanitizeWithoutDomParser(html: string): string {
  let output = html.replace(/<!--[\s\S]*?-->/gu, "");
  for (const tag of blockedPairedTags) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "giu");
    let previous = "";
    while (output !== previous) {
      previous = output;
      output = output.replace(paired, "");
    }
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?\\s*>`, "giu"), "");
  }
  for (const tag of blockedVoidTags) {
    output = output.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "giu"), "");
  }
  output = output.replace(/<\/?(?:html|head|body)\b[^>]*>/giu, "");
  output = output.replace(
    new RegExp(String.raw`\s(?:on[a-z0-9:_-]+|action|formaction|srcdoc|nonce|integrity|crossorigin|contenteditable|tabindex)\s*=\s*${quotedOrBareAttributeValue}`, "giu"),
    "",
  );
  output = output.replace(
    new RegExp(String.raw`\s(?:href|xlink:href|src)\s*=\s*${quotedOrBareAttributeValue}`, "giu"),
    "",
  );
  output = output.replace(
    new RegExp(String.raw`\sstyle\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))`, "giu"),
    (_match, _wholeValue: string, doubleValue: string | undefined, singleValue: string | undefined, bareValue: string | undefined) => {
      const safeStyle = sanitizeStyleValue(doubleValue ?? singleValue ?? bareValue ?? "");
      return safeStyle ? ` style="${escapeHtmlAttribute(safeStyle)}"` : "";
    },
  );
  return output;
}

/**
 * Keeps the dictionaries' semantic/custom markup while removing active HTML.
 * Original stylesheets are supplied separately by buildDictionarySrcDoc.
 */
export function sanitizeDictionaryHtml(html: string): string {
  const input = typeof html === "string" ? html : String(html ?? "");
  return typeof DOMParser === "undefined" ? sanitizeWithoutDomParser(input) : sanitizeWithDomParser(input);
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

function escapeStyleText(value: string): string {
  return value.replace(/<\/style/giu, "<\\/style");
}

/**
 * Produces an isolated document suitable for an iframe with `sandbox=""`.
 * Selection and native copy remain available; scripts, navigation and network
 * access do not.
 */
export function buildDictionarySrcDoc(options: DictionarySrcDocOptions): string {
  const language = options.documentLanguage === "la"
    ? "la"
    : options.documentLanguage === "zh-Hant"
      ? "zh-Hant"
      : "grc";
  const title = escapeHtmlText(options.title?.trim() || "Dictionary entry");
  const dictionaryCss = escapeStyleText(options.styleCss ?? "");
  const sections = options.entries.map((entry) => (
    `<section class="stoa-dictionary-record" data-entry-key="${escapeHtmlAttribute(entry.key)}">${sanitizeDictionaryHtml(entry.html)}</section>`
  )).join("");
  const hostCss = `
html { color-scheme: light; background: transparent; }
body { box-sizing: border-box; margin: 0; min-height: 100%; padding: 16px 18px 22px; overflow-wrap: break-word; background: transparent; }
body, body * { -webkit-user-select: text !important; user-select: text !important; }
.stoa-dictionary-record + .stoa-dictionary-record { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid rgba(61, 57, 49, .22); }
::selection { color: inherit; background: rgba(177, 145, 77, .3); }
`;
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; frame-src 'none'; font-src data:; img-src data:; media-src 'none'; object-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${dictionaryCss}\n${hostCss}</style>
</head>
<body>${sections}</body>
</html>`;
}

/** Convenience adapter used directly by the dictionary popover. */
export function buildDictionaryEntrySrcDoc(result: DictionaryLookupResult): string {
  return buildDictionarySrcDoc({
    entries: result.entries,
    styleCss: result.styleCss,
    title: `${result.dictionaryTitle}: ${result.query}`,
    documentLanguage: result.language === "latin"
      ? "la"
      : result.language === "classical-chinese"
        ? "zh-Hant"
        : "grc",
  });
}

/** Test/dev helper: forget loaded assets without mutating registered pack data. */
export function resetDictionaryRuntimeCaches(): void {
  scriptPromiseCache.clear();
  manifestPromiseCache.clear();
  shardPromiseCache.clear();
  binaryPackPromise = null;
}
