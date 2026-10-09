/// <reference lib="webworker" />

import { Buffer } from "buffer";
import { MDICT_FILE_REGISTRY_KEY } from "./mdict-read-chunk-browser";

type DictionaryLanguage = "ancient-greek" | "latin" | "classical-chinese";

type RecordBlock = {
  compSize: number;
  compAccumulator: number;
  decompSize: number;
  decompAccumulator: number;
};

export type MdictFileMetadata = {
  filename: string;
  extension: "mdx" | "mdd";
  encoding: string;
  encrypt: number;
  recordInfoEndOffset: number;
  recordBlocks: RecordBlock[];
};

type Pointer = {
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

type ResourcePointer = Pointer & {
  resourceKey: string;
  fileIndex: number;
};

type ParsedDictionary = {
  fname: string;
  ext: "mdx" | "mdd";
  header: Record<string, unknown>;
  keyHeader: { entriesNum: number };
  keyList: Array<{ keyText: string; recordStartOffset: number }>;
  recordBlockInfoList: RecordBlock[];
  _recordInfoEndOffset: number;
  _encrypt: number;
  _decoder: TextDecoder;
  _encoding: string;
  _decodeKeyBlock: (keep?: boolean) => unknown;
  _decodeRecordBlockByRBID: (
    blockIndex: number,
    keyText: string,
    start: number,
    end: number,
  ) => { keyText: string; definition: string };
};

type MdictBaseConstructor = {
  new (filename: string): ParsedDictionary;
  prototype: ParsedDictionary;
};

type IndexMessage = {
  type: "index";
  jobId: string;
  dictionaryId: string;
  language: DictionaryLanguage;
  mdx: File;
  mdds: File[];
};

type DecodeMessage = {
  type: "decode";
  jobId: string;
  file: Blob;
  metadata: MdictFileMetadata;
  pointers: Array<{
    keyText: string;
    recordStartOffset: number;
    recordEndOffset: number;
    blockIndex: number;
  }>;
};

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const runtime = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  [MDICT_FILE_REGISTRY_KEY]?: Map<string, Blob>;
};
runtime.Buffer = Buffer;
if (!Reflect.has(globalThis, "process")) {
  // mdict-js pulls in old releases of bl/readable-stream. Their browser path is
  // selected through `process.browser`; without that flag they synchronously
  // inspect `process.version.slice(...)` while the module graph is evaluated.
  // Workers do not expose Node's process global, so install the smallest browser
  // process facade before dynamically importing mdict-js.
  Reflect.set(globalThis, "process", {
    browser: true,
    version: "",
    versions: {},
    env: {},
    argv: [],
    cwd: () => "/",
    memoryUsage: () => ({
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    }),
    nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
      queueMicrotask(() => callback(...args));
    },
  });
}
runtime[MDICT_FILE_REGISTRY_KEY] ??= new Map<string, Blob>();

let mdictBasePromise: Promise<MdictBaseConstructor> | null = null;
const loadMdictBase = () => {
  mdictBasePromise ??= import("mdict-js/lib/mdict-base.js").then((module) => {
    // mdict-js is CommonJS compiled through Babel. Depending on the Vite
    // target, its constructor is exposed either as `default` or as the
    // Babel-wrapped `default.default` value.
    const direct = module.default as unknown;
    const nested = direct && typeof direct === "object"
      ? (direct as { default?: unknown }).default
      : undefined;
    const constructor = typeof direct === "function" ? direct : nested;
    if (typeof constructor !== "function") {
      throw new Error("The browser MDict parser did not expose its constructor.");
    }
    return constructor as MdictBaseConstructor;
  });
  return mdictBasePromise;
};

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

const normalizeResourceKey = (value: string) => {
  const raw = String(value ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  try {
    return decodeURIComponent(raw).toLocaleLowerCase("und");
  } catch {
    return raw.toLocaleLowerCase("und");
  }
};

const decoderEncoding = (value: unknown) => {
  const encoding = String(value || "utf-8").toLowerCase();
  if (encoding === "utf16" || encoding === "utf-16") return "utf-16le";
  if (encoding === "gbk" || encoding === "gb2312") return "gb18030";
  return encoding;
};

const metadataFor = (dictionary: ParsedDictionary, filename: string): MdictFileMetadata => ({
  filename,
  extension: dictionary.ext,
  encoding: decoderEncoding(dictionary.header.Encoding),
  encrypt: Number(dictionary._encrypt || 0),
  recordInfoEndOffset: Number(dictionary._recordInfoEndOffset),
  recordBlocks: dictionary.recordBlockInfoList.map((block) => ({
    compSize: Number(block.compSize),
    compAccumulator: Number(block.compAccumulator),
    decompSize: Number(block.decompSize),
    decompAccumulator: Number(block.decompAccumulator),
  })),
});

const registerFile = (syntheticName: string, file: Blob) => {
  runtime[MDICT_FILE_REGISTRY_KEY]?.set(syntheticName, file);
};

const parseDictionary = (
  file: File,
  syntheticName: string,
  MdictBase: MdictBaseConstructor,
): ParsedDictionary => {
  registerFile(syntheticName, file);
  const dictionary = new MdictBase(syntheticName);
  if (!Array.isArray(dictionary.keyList) || dictionary.keyList.length === 0) {
    dictionary._decodeKeyBlock(true);
  }
  if (!Array.isArray(dictionary.keyList)
    || dictionary.keyList.length !== dictionary.keyHeader.entriesNum) {
    throw new Error(`${file.name} has an incomplete MDict key index.`);
  }
  return dictionary;
};

const blockForPointer = (
  blocks: readonly RecordBlock[],
  start: number,
  end: number,
  filename: string,
) => {
  const index = blocks.findIndex((block) => (
    start >= block.decompAccumulator
    && start < block.decompAccumulator + block.decompSize
  ));
  if (index < 0) throw new Error(`${filename} contains a record outside its block index.`);
  const block = blocks[index];
  if (end > block.decompAccumulator + block.decompSize) {
    throw new Error(`${filename} contains a record that crosses block boundaries.`);
  }
  return index;
};

const emitIndex = (
  message: IndexMessage,
  dictionary: ParsedDictionary,
  kind: "entries" | "resources",
  fileIndex = -1,
) => {
  const totalEnd = dictionary.recordBlockInfoList.length
    ? dictionary.recordBlockInfoList.at(-1)!.decompAccumulator
      + dictionary.recordBlockInfoList.at(-1)!.decompSize
    : 0;
  const batch: Array<Pointer | ResourcePointer> = [];
  const cssResourceKeys: string[] = [];
  for (let index = 0; index < dictionary.keyList.length; index += 1) {
    const item = dictionary.keyList[index];
    const end = dictionary.keyList[index + 1]?.recordStartOffset ?? totalEnd;
    const normalizedKey = cleanKey(item.keyText);
    if (!normalizedKey || end < item.recordStartOffset) continue;
    const base: Pointer = {
      id: `${message.dictionaryId}:${kind}:${fileIndex}:${index}`,
      dictionaryId: message.dictionaryId,
      ordinal: index,
      keyText: item.keyText,
      normalizedKey,
      foldedKey: foldKey(item.keyText),
      recordStartOffset: item.recordStartOffset,
      recordEndOffset: end,
      blockIndex: blockForPointer(
        dictionary.recordBlockInfoList,
        item.recordStartOffset,
        end,
        dictionary.fname,
      ),
    };
    if (kind === "resources") {
      const resourceKey = normalizeResourceKey(item.keyText);
      if (!resourceKey) continue;
      if (resourceKey.endsWith(".css") && cssResourceKeys.length < 32) {
        cssResourceKeys.push(resourceKey);
      }
      batch.push({ ...base, resourceKey, fileIndex });
    } else {
      batch.push(base);
    }
    // Larger batches substantially reduce IndexedDB transaction overhead for
    // full-size lexica (LSJ is roughly 550k headwords) while keeping each
    // structured-clone payload comfortably bounded.
    if (batch.length >= 5_000) {
      workerScope.postMessage({
        type: "batch",
        jobId: message.jobId,
        kind,
        records: batch.splice(0),
        processed: index + 1,
        total: dictionary.keyList.length,
      });
    }
  }
  if (batch.length) {
    workerScope.postMessage({
      type: "batch",
      jobId: message.jobId,
      kind,
      records: batch,
      processed: dictionary.keyList.length,
      total: dictionary.keyList.length,
    });
  }
  return cssResourceKeys;
};

const indexDictionary = async (message: IndexMessage) => {
  const MdictBase = await loadMdictBase();
  const mdxName = `stoa-${message.dictionaryId}.mdx`;
  workerScope.postMessage({
    type: "progress",
    jobId: message.jobId,
    stage: "Reading MDX headwords",
    processed: 0,
    total: 1,
  });
  const mdx = parseDictionary(message.mdx, mdxName, MdictBase);
  const mdxMetadata = metadataFor(mdx, message.mdx.name);
  emitIndex(message, mdx, "entries");

  const mddMetadata: MdictFileMetadata[] = [];
  const cssResourceKeys: string[] = [];
  for (let index = 0; index < message.mdds.length; index += 1) {
    workerScope.postMessage({
      type: "progress",
      jobId: message.jobId,
      stage: `Indexing MDD resources ${index + 1}/${message.mdds.length}`,
      processed: index,
      total: message.mdds.length,
    });
    const syntheticName = `stoa-${message.dictionaryId}-${index}.mdd`;
    const mdd = parseDictionary(message.mdds[index], syntheticName, MdictBase);
    mddMetadata.push(metadataFor(mdd, message.mdds[index].name));
    cssResourceKeys.push(...emitIndex(message, mdd, "resources", index));
    runtime[MDICT_FILE_REGISTRY_KEY]?.delete(syntheticName);
  }
  runtime[MDICT_FILE_REGISTRY_KEY]?.delete(mdxName);

  const title = String(mdx.header.Title || message.mdx.name.replace(/\.mdx$/iu, ""))
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 240);
  workerScope.postMessage({
    type: "indexed",
    jobId: message.jobId,
    metadata: {
      title: title || message.mdx.name,
      entryCount: mdx.keyList.length,
      mdx: mdxMetadata,
      mdds: mddMetadata,
      cssResourceKeys: Array.from(new Set(cssResourceKeys)).slice(0, 32),
    },
  });
};

const decodeRecords = async (message: DecodeMessage) => {
  const MdictBase = await loadMdictBase();
  const syntheticName = `stoa-decode-${message.jobId}.${message.metadata.extension}`;
  registerFile(syntheticName, message.file);
  const dictionary = Object.create(MdictBase.prototype) as ParsedDictionary;
  dictionary.fname = syntheticName;
  dictionary.ext = message.metadata.extension;
  dictionary._recordInfoEndOffset = message.metadata.recordInfoEndOffset;
  dictionary.recordBlockInfoList = message.metadata.recordBlocks;
  dictionary._encrypt = message.metadata.encrypt;
  dictionary._encoding = message.metadata.encoding;
  dictionary._decoder = new TextDecoder(message.metadata.encoding);
  try {
    const records = message.pointers.map((pointer) => dictionary._decodeRecordBlockByRBID(
      pointer.blockIndex,
      pointer.keyText,
      pointer.recordStartOffset,
      pointer.recordEndOffset,
    ));
    workerScope.postMessage({ type: "decoded", jobId: message.jobId, records });
  } finally {
    runtime[MDICT_FILE_REGISTRY_KEY]?.delete(syntheticName);
  }
};

workerScope.onmessage = (event: MessageEvent<IndexMessage | DecodeMessage>) => {
  const message = event.data;
  void (async () => {
    try {
      if (message.type === "index") await indexDictionary(message);
      else if (message.type === "decode") await decodeRecords(message);
    } catch (error) {
      workerScope.postMessage({
        type: "error",
        jobId: message.jobId,
        message: error instanceof Error ? error.message : "The MDict file could not be read.",
      });
    }
  })();
};

export {};
