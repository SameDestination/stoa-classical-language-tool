import MdictWorker from "./mdict-worker?worker&inline";
import type { MdictFileMetadata } from "./mdict-worker";
import type {
  DictionaryEntry,
  DictionaryLanguage,
  DictionaryLookupResult,
  DictionaryMatchKind,
} from "./dictionary-runtime";

export const USER_DICTIONARY_DB_NAME = "stoa-user-dictionary-library";
export const USER_DICTIONARY_DB_VERSION = 1;

const DICTIONARY_STORE = "dictionaries";
const ENTRY_STORE = "headwords";
const RESOURCE_STORE = "resources";
const MAX_LOOKUP_ENTRIES = 24;
const MAX_EMBEDDED_RESOURCE_BYTES = 24 * 1024 * 1024;

export type UserDictionaryRecord = {
  id: string;
  language: DictionaryLanguage;
  title: string;
  mdxName: string;
  mddNames: string[];
  mdxFile: Blob;
  mddFiles: Blob[];
  mdxMetadata: MdictFileMetadata;
  mddMetadata: MdictFileMetadata[];
  cssResourceKeys: string[];
  entryCount: number;
  byteLength: number;
  importedAt: string;
};

export type UserDictionarySummary = Omit<
  UserDictionaryRecord,
  "mdxFile" | "mddFiles" | "mdxMetadata" | "mddMetadata" | "cssResourceKeys"
>;

type StoredPointer = {
  id: string;
  dictionaryId: string;
  ordinal: number;
  keyText: string;
  normalizedKey: string;
  foldedKey: string;
  recordStartOffset: number;
  recordEndOffset: number;
  blockIndex: number;
};

type StoredResourcePointer = StoredPointer & {
  resourceKey: string;
  fileIndex: number;
};

export type DictionaryImportProgress = {
  stage: string;
  processed: number;
  total: number;
};

export class UserDictionaryError extends Error {
  readonly code:
    | "unsupported-language"
    | "invalid-selection"
    | "storage-unavailable"
    | "storage-quota"
    | "import-failed"
    | "missing-dictionary"
    | "decode-failed";

  constructor(code: UserDictionaryError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UserDictionaryError";
    this.code = code;
  }
}

const requestToPromise = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
});

const transactionToPromise = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
});

const openDictionaryDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new UserDictionaryError(
      "storage-unavailable",
      "This browser does not provide the local database required for imported dictionaries.",
    ));
    return;
  }
  const request = indexedDB.open(USER_DICTIONARY_DB_NAME, USER_DICTIONARY_DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(DICTIONARY_STORE)) {
      const store = database.createObjectStore(DICTIONARY_STORE, { keyPath: "id" });
      store.createIndex("language", "language", { unique: false });
    }
    if (!database.objectStoreNames.contains(ENTRY_STORE)) {
      const store = database.createObjectStore(ENTRY_STORE, { keyPath: "id" });
      store.createIndex("dictionaryId", "dictionaryId", { unique: false });
      store.createIndex("dictionaryExact", ["dictionaryId", "normalizedKey"], { unique: false });
      store.createIndex("dictionaryFolded", ["dictionaryId", "foldedKey"], { unique: false });
    }
    if (!database.objectStoreNames.contains(RESOURCE_STORE)) {
      const store = database.createObjectStore(RESOURCE_STORE, { keyPath: "id" });
      store.createIndex("dictionaryId", "dictionaryId", { unique: false });
      store.createIndex("dictionaryPath", ["dictionaryId", "resourceKey"], { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Unable to open the local dictionary library."));
});

const cleanKey = (value: string) => String(value ?? "")
  .normalize("NFC")
  .trim()
  .replace(/\s+/gu, " ")
  .toLocaleLowerCase("und");

const foldKey = (value: string) => cleanKey(value)
  .normalize("NFD")
  .replace(/\p{M}+/gu, "")
  .replace(/\u03c2/gu, "\u03c3")
  .normalize("NFC");

const stripLatinMacrons = (value: string) => {
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
};

const lookupCandidates = (language: DictionaryLanguage, value: string) => {
  const normalized = cleanKey(value);
  if (language !== "latin") return [normalized].filter(Boolean);
  return Array.from(new Set([
    normalized,
    cleanKey(stripLatinMacrons(normalized)),
  ].filter(Boolean)));
};

const normalizeResourceKey = (value: string) => {
  const withoutQuery = String(value ?? "").split(/[?#]/u, 1)[0]
    .replace(/^file:\/\//iu, "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  try {
    return decodeURIComponent(withoutQuery).toLocaleLowerCase("und");
  } catch {
    return withoutQuery.toLocaleLowerCase("und");
  }
};

const dictionaryId = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? `user-dict-${crypto.randomUUID()}`
  : `user-dict-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const summarize = (record: UserDictionaryRecord): UserDictionarySummary => ({
  id: record.id,
  language: record.language,
  title: record.title,
  mdxName: record.mdxName,
  mddNames: [...record.mddNames],
  entryCount: record.entryCount,
  byteLength: record.byteLength,
  importedAt: record.importedAt,
});

const validateSelection = (files: readonly File[]) => {
  const mdxFiles = files.filter((file) => file.name.toLowerCase().endsWith(".mdx"));
  const mddFiles = files.filter((file) => file.name.toLowerCase().endsWith(".mdd"));
  if (mdxFiles.length !== 1 || mdxFiles.length + mddFiles.length !== files.length) {
    throw new UserDictionaryError(
      "invalid-selection",
      "Choose exactly one .mdx file and any matching .mdd sidecar files in the same import.",
    );
  }
  const basename = mdxFiles[0].name.replace(/\.mdx$/iu, "").toLocaleLowerCase("und");
  const unrelated = mddFiles.find((file) => {
    const sidecar = file.name.replace(/\.mdd$/iu, "").toLocaleLowerCase("und");
    return sidecar !== basename && !sidecar.startsWith(`${basename}.`);
  });
  if (unrelated) {
    throw new UserDictionaryError(
      "invalid-selection",
      `${unrelated.name} does not match ${mdxFiles[0].name}. Select only same-basename MDD sidecars.`,
    );
  }
  return { mdx: mdxFiles[0], mdds: mddFiles.sort((left, right) => left.name.localeCompare(right.name)) };
};

const ensureStorageCapacity = async (byteLength: number) => {
  try {
    await navigator.storage?.persist?.();
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota !== undefined && estimate.usage !== undefined) {
      const available = estimate.quota - estimate.usage;
      if (available < byteLength * 1.12) {
        throw new UserDictionaryError(
          "storage-quota",
          `The selected dictionary needs about ${(byteLength / 1_048_576).toFixed(1)} MB, but this browser does not report enough local storage.`,
        );
      }
    }
  } catch (error) {
    if (error instanceof UserDictionaryError) throw error;
    // Quota estimates are advisory and are unavailable in some file:// modes.
  }
};

const putBatch = async (
  database: IDBDatabase,
  storeName: typeof ENTRY_STORE | typeof RESOURCE_STORE,
  records: readonly (StoredPointer | StoredResourcePointer)[],
) => {
  if (!records.length) return;
  const transaction = database.transaction(storeName, "readwrite");
  const completed = transactionToPromise(transaction);
  const store = transaction.objectStore(storeName);
  for (const record of records) store.put(record);
  await completed;
};

const deleteRecordsByDictionary = (
  store: IDBObjectStore,
  id: string,
) => new Promise<void>((resolve, reject) => {
  const request = store.index("dictionaryId").openKeyCursor(IDBKeyRange.only(id));
  request.onerror = () => reject(request.error ?? new Error("Unable to remove dictionary index records."));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      resolve();
      return;
    }
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
});

export const deleteUserDictionary = async (id: string) => {
  const database = await openDictionaryDb();
  try {
    const transaction = database.transaction(
      [DICTIONARY_STORE, ENTRY_STORE, RESOURCE_STORE],
      "readwrite",
    );
    const completed = transactionToPromise(transaction);
    transaction.objectStore(DICTIONARY_STORE).delete(id);
    await Promise.all([
      deleteRecordsByDictionary(transaction.objectStore(ENTRY_STORE), id),
      deleteRecordsByDictionary(transaction.objectStore(RESOURCE_STORE), id),
    ]);
    await completed;
  } finally {
    database.close();
  }
};

export const listUserDictionaries = async (
  language?: DictionaryLanguage,
): Promise<UserDictionarySummary[]> => {
  const database = await openDictionaryDb();
  try {
    const transaction = database.transaction(DICTIONARY_STORE, "readonly");
    const store = transaction.objectStore(DICTIONARY_STORE);
    const records = language
      ? await requestToPromise(store.index("language").getAll(IDBKeyRange.only(language)))
      : await requestToPromise(store.getAll());
    return (records as UserDictionaryRecord[])
      .map(summarize)
      .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  } finally {
    database.close();
  }
};

export const importUserDictionary = async (
  language: DictionaryLanguage,
  selectedFiles: readonly File[],
  onProgress?: (progress: DictionaryImportProgress) => void,
): Promise<UserDictionarySummary> => {
  if (!["ancient-greek", "latin", "classical-chinese"].includes(language)) {
    throw new UserDictionaryError("unsupported-language", "OMNI does not support dictionary import.");
  }
  const { mdx, mdds } = validateSelection(selectedFiles);
  const byteLength = [mdx, ...mdds].reduce((sum, file) => sum + file.size, 0);
  await ensureStorageCapacity(byteLength);
  const id = dictionaryId();
  const jobId = `${id}:index`;
  const database = await openDictionaryDb();
  const worker = new MdictWorker();
  let writeQueue = Promise.resolve();

  try {
    const indexed = await new Promise<{
      title: string;
      entryCount: number;
      mdx: MdictFileMetadata;
      mdds: MdictFileMetadata[];
      cssResourceKeys: string[];
    }>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
        const message = event.data;
        if (message.jobId !== jobId) return;
        if (message.type === "progress") {
          onProgress?.({
            stage: String(message.stage || "Indexing dictionary"),
            processed: Number(message.processed || 0),
            total: Math.max(1, Number(message.total || 1)),
          });
          return;
        }
        if (message.type === "batch") {
          const records = Array.isArray(message.records)
            ? message.records as Array<StoredPointer | StoredResourcePointer>
            : [];
          const storeName = message.kind === "resources" ? RESOURCE_STORE : ENTRY_STORE;
          writeQueue = writeQueue.then(() => putBatch(database, storeName, records));
          onProgress?.({
            stage: storeName === ENTRY_STORE ? "Building headword index" : "Building MDD resource index",
            processed: Number(message.processed || 0),
            total: Math.max(1, Number(message.total || 1)),
          });
          return;
        }
        if (message.type === "indexed") {
          const metadata = message.metadata;
          if (!metadata || typeof metadata !== "object") {
            reject(new Error("The dictionary worker returned invalid metadata."));
            return;
          }
          onProgress?.({
            stage: "Saving local search index",
            processed: 0,
            total: 1,
          });
          void writeQueue.then(() => resolve(metadata as {
            title: string;
            entryCount: number;
            mdx: MdictFileMetadata;
            mdds: MdictFileMetadata[];
            cssResourceKeys: string[];
          }), reject);
          return;
        }
        if (message.type === "error") {
          reject(new Error(String(message.message || "The MDict file could not be indexed.")));
        }
      };
      worker.onerror = (event) => reject(new Error(event.message || "The dictionary worker stopped unexpectedly."));
      worker.postMessage({ type: "index", jobId, dictionaryId: id, language, mdx, mdds });
    });

    const record: UserDictionaryRecord = {
      id,
      language,
      title: indexed.title,
      mdxName: mdx.name,
      mddNames: mdds.map((file) => file.name),
      mdxFile: mdx,
      mddFiles: [...mdds],
      mdxMetadata: indexed.mdx,
      mddMetadata: indexed.mdds,
      cssResourceKeys: indexed.cssResourceKeys,
      entryCount: indexed.entryCount,
      byteLength,
      importedAt: new Date().toISOString(),
    };
    const transaction = database.transaction(DICTIONARY_STORE, "readwrite");
    const completed = transactionToPromise(transaction);
    transaction.objectStore(DICTIONARY_STORE).put(record);
    await completed;
    onProgress?.({ stage: "Dictionary ready", processed: 1, total: 1 });
    return summarize(record);
  } catch (error) {
    try {
      // The worker can fail after emitting index batches. Let every queued
      // write settle before removing the partial index so late transactions
      // cannot recreate orphan records after cleanup.
      await writeQueue.catch(() => undefined);
      const transaction = database.transaction([ENTRY_STORE, RESOURCE_STORE], "readwrite");
      const completed = transactionToPromise(transaction);
      await Promise.all([
        deleteRecordsByDictionary(transaction.objectStore(ENTRY_STORE), id),
        deleteRecordsByDictionary(transaction.objectStore(RESOURCE_STORE), id),
      ]);
      await completed;
    } catch {
      // A later library cleanup can remove an orphaned partial index.
    }
    if (error instanceof UserDictionaryError) throw error;
    throw new UserDictionaryError(
      "import-failed",
      error instanceof Error ? error.message : "The MDict dictionary could not be imported.",
      { cause: error },
    );
  } finally {
    worker.terminate();
    database.close();
  }
};

const getDictionaryRecord = async (id: string): Promise<UserDictionaryRecord> => {
  const database = await openDictionaryDb();
  try {
    const transaction = database.transaction(DICTIONARY_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(DICTIONARY_STORE).get(id));
    if (!record) throw new UserDictionaryError("missing-dictionary", "The imported dictionary is no longer available.");
    return record as UserDictionaryRecord;
  } finally {
    database.close();
  }
};

const findPointers = async (
  dictionaryIdValue: string,
  indexName: "dictionaryExact" | "dictionaryFolded",
  key: string,
  storeName: typeof ENTRY_STORE | typeof RESOURCE_STORE = ENTRY_STORE,
) => {
  const database = await openDictionaryDb();
  try {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    return await requestToPromise(index.getAll(
      IDBKeyRange.only([dictionaryIdValue, key]),
      MAX_LOOKUP_ENTRIES,
    )) as StoredPointer[];
  } finally {
    database.close();
  }
};

const findResourcePointer = async (
  dictionaryIdValue: string,
  resourceKey: string,
): Promise<StoredResourcePointer | null> => {
  const database = await openDictionaryDb();
  try {
    const transaction = database.transaction(RESOURCE_STORE, "readonly");
    const store = transaction.objectStore(RESOURCE_STORE);
    const record = await requestToPromise(store.index("dictionaryPath").get(
      IDBKeyRange.only([dictionaryIdValue, resourceKey]),
    ));
    return (record as StoredResourcePointer | undefined) ?? null;
  } finally {
    database.close();
  }
};

const decodePointers = async (
  file: Blob,
  metadata: MdictFileMetadata,
  pointers: readonly StoredPointer[],
) => {
  if (!pointers.length) return [] as Array<{ keyText: string; definition: string }>;
  const worker = new MdictWorker();
  const jobId = `decode-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    return await new Promise<Array<{ keyText: string; definition: string }>>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
        const message = event.data;
        if (message.jobId !== jobId) return;
        if (message.type === "decoded") {
          resolve(Array.isArray(message.records)
            ? message.records as Array<{ keyText: string; definition: string }>
            : []);
        } else if (message.type === "error") {
          reject(new Error(String(message.message || "The MDict record could not be decoded.")));
        }
      };
      worker.onerror = (event) => reject(new Error(event.message || "The dictionary decoder stopped unexpectedly."));
      worker.postMessage({
        type: "decode",
        jobId,
        file,
        metadata,
        pointers: pointers.map((pointer) => ({
          keyText: pointer.keyText,
          recordStartOffset: pointer.recordStartOffset,
          recordEndOffset: pointer.recordEndOffset,
          blockIndex: pointer.blockIndex,
        })),
      });
    });
  } catch (error) {
    throw new UserDictionaryError(
      "decode-failed",
      error instanceof Error ? error.message : "The MDict record could not be decoded.",
      { cause: error },
    );
  } finally {
    worker.terminate();
  }
};

const pointersForQuery = async (
  dictionary: UserDictionaryRecord,
  query: string,
) => {
  const candidates = lookupCandidates(dictionary.language, query);
  for (let index = 0; index < candidates.length; index += 1) {
    const pointers = await findPointers(dictionary.id, "dictionaryExact", candidates[index]);
    if (pointers.length) {
      return {
        pointers,
        matchKind: (index === 0 ? "exact" : "normalized") as DictionaryMatchKind,
      };
    }
  }
  const folded = foldKey(query);
  if (folded) {
    const pointers = await findPointers(dictionary.id, "dictionaryFolded", folded);
    if (pointers.length) return { pointers, matchKind: "folded" as const };
  }
  return { pointers: [] as StoredPointer[], matchKind: "none" as const };
};

const decodeEntriesResolvingLinks = async (
  dictionary: UserDictionaryRecord,
  pointers: readonly StoredPointer[],
  seen = new Set<string>(),
  depth = 0,
): Promise<DictionaryEntry[]> => {
  if (depth > 12) return [];
  const decoded = await decodePointers(dictionary.mdxFile, dictionary.mdxMetadata, pointers);
  const entries: DictionaryEntry[] = [];
  for (let index = 0; index < decoded.length; index += 1) {
    const raw = decoded[index].definition.replace(/\0+$/gu, "").trim();
    const redirect = raw.match(/^@@@LINK=([^\r\n\0]+)/u)?.[1]?.trim();
    if (redirect) {
      const linkKey = cleanKey(redirect);
      if (!linkKey || seen.has(linkKey)) continue;
      const nextSeen = new Set(seen);
      nextSeen.add(linkKey);
      const linked = await pointersForQuery(dictionary, redirect);
      entries.push(...await decodeEntriesResolvingLinks(
        dictionary,
        linked.pointers,
        nextSeen,
        depth + 1,
      ));
      continue;
    }
    entries.push({
      id: pointers[index]?.ordinal ?? index,
      key: decoded[index].keyText,
      html: raw,
    });
  }
  return entries;
};

const base64Bytes = (value: string) => {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
};

const resourceMime = (key: string, bytes: Uint8Array) => {
  const extension = key.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();
  const byExtension: Record<string, string> = {
    png: "image/png",
    gif: "image/gif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    css: "text/css;charset=utf-8",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
  };
  if (extension && byExtension[extension]) return byExtension[extension];
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return "application/octet-stream";
};

const decodeResource = async (
  dictionary: UserDictionaryRecord,
  key: string,
) => {
  const normalized = normalizeResourceKey(key);
  if (!normalized) return null;
  const pointer = await findResourcePointer(dictionary.id, normalized);
  if (!pointer) return null;
  const file = dictionary.mddFiles[pointer.fileIndex];
  const metadata = dictionary.mddMetadata[pointer.fileIndex];
  if (!file || !metadata) return null;
  const [decoded] = await decodePointers(file, metadata, [pointer]);
  if (!decoded?.definition) return null;
  const bytes = base64Bytes(decoded.definition);
  return {
    key: normalized,
    bytes,
    mime: resourceMime(normalized, bytes),
    dataUrl: `data:${resourceMime(normalized, bytes)};base64,${decoded.definition}`,
  };
};

const collectHtmlResourceReferences = (html: string) => Array.from(new Set(
  [...html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/giu)]
    .map((match) => match[1] || match[2] || match[3] || "")
    .filter((value) => value && !/^(?:data:|https?:|#|entry:|sound:|javascript:)/iu.test(value)),
));

const collectCssResourceReferences = (css: string) => Array.from(new Set(
  [...css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/giu)]
    .map((match) => match[1] || match[2] || match[3] || "")
    .filter((value) => value && !/^(?:data:|https?:|#|javascript:)/iu.test(value)),
));

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const replaceResourceReference = (source: string, reference: string, dataUrl: string) =>
  source.replace(new RegExp(escapeRegex(reference), "gu"), dataUrl);

const safeDictionaryCss = (value: string) => value
  .replace(/^\s*@charset[^;]+;\s*/giu, "")
  .replace(/@import\s+[^;]+;/giu, "")
  .replace(/url\(\s*(?:"|')?(?:https?:|javascript:)[^)]+\)/giu, "url(\"\")")
  .replace(/expression\s*\([^)]*\)/giu, "")
  .replace(/<\/style/giu, "<\\/style");

const resolveEntryResources = async (
  dictionary: UserDictionaryRecord,
  entries: DictionaryEntry[],
) => {
  if (!dictionary.mddFiles.length) return { entries, styleCss: "" };
  let embeddedBytes = 0;
  const cache = new Map<string, Awaited<ReturnType<typeof decodeResource>>>();
  const load = async (reference: string) => {
    const key = normalizeResourceKey(reference);
    if (cache.has(key)) return cache.get(key) ?? null;
    const result = await decodeResource(dictionary, key);
    if (result) {
      embeddedBytes += result.bytes.byteLength;
      if (embeddedBytes > MAX_EMBEDDED_RESOURCE_BYTES) {
        throw new UserDictionaryError(
          "decode-failed",
          "This entry references more than 24 MB of embedded MDD resources.",
        );
      }
    }
    cache.set(key, result);
    return result;
  };

  let styleCss = "";
  for (const key of dictionary.cssResourceKeys.slice(0, 4)) {
    const resource = await load(key);
    if (!resource || !resource.mime.startsWith("text/css")) continue;
    let css = new TextDecoder("utf-8").decode(resource.bytes).replace(/\0+$/gu, "");
    for (const reference of collectCssResourceReferences(css).slice(0, 48)) {
      const nested = await load(reference);
      css = replaceResourceReference(css, reference, nested?.dataUrl ?? "");
    }
    styleCss += `${safeDictionaryCss(css)}\n`;
  }

  const resolvedEntries: DictionaryEntry[] = [];
  for (const entry of entries) {
    let html = entry.html;
    for (const reference of collectHtmlResourceReferences(html).slice(0, 48)) {
      const resource = await load(reference);
      if (resource?.mime.startsWith("image/")) {
        html = replaceResourceReference(html, reference, resource.dataUrl);
      }
    }
    resolvedEntries.push({ ...entry, html });
  }
  return { entries: resolvedEntries, styleCss };
};

export const lookupUserDictionaryLemma = async (
  language: DictionaryLanguage,
  lemma: string,
): Promise<DictionaryLookupResult> => {
  const summaries = await listUserDictionaries(language);
  if (!summaries.length) {
    throw new UserDictionaryError(
      "missing-dictionary",
      "No dictionary is installed for this language. Import one MDX file and its matching MDD sidecars first.",
    );
  }
  const normalizedQuery = cleanKey(lemma);
  const foldedQuery = foldKey(lemma);
  for (const summary of summaries) {
    const dictionary = await getDictionaryRecord(summary.id);
    const match = await pointersForQuery(dictionary, lemma);
    if (!match.pointers.length) continue;
    const decodedEntries = await decodeEntriesResolvingLinks(
      dictionary,
      match.pointers.slice(0, MAX_LOOKUP_ENTRIES),
      new Set([normalizedQuery]),
    );
    const resolved = await resolveEntryResources(dictionary, decodedEntries);
    return {
      dictionaryId: dictionary.id,
      dictionaryTitle: dictionary.title,
      language,
      query: lemma,
      normalizedQuery,
      foldedQuery,
      matchKind: match.matchKind,
      entries: resolved.entries,
      totalMatches: match.pointers.length,
      styleCss: resolved.styleCss,
    };
  }
  const first = summaries[0];
  return {
    dictionaryId: first.id,
    dictionaryTitle: first.title,
    language,
    query: lemma,
    normalizedQuery,
    foldedQuery,
    matchKind: "none",
    entries: [],
    totalMatches: 0,
    styleCss: "",
  };
};
