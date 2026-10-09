import { Buffer } from "buffer";

export const MDICT_FILE_REGISTRY_KEY = "__STOA_MDICT_FILE_REGISTRY__" as const;

type RegistryGlobal = typeof globalThis & {
  [MDICT_FILE_REGISTRY_KEY]?: Map<string, Blob>;
};

const registry = () => {
  const target = globalThis as RegistryGlobal;
  target[MDICT_FILE_REGISTRY_KEY] ??= new Map<string, Blob>();
  return target[MDICT_FILE_REGISTRY_KEY];
};

const sync = (filename: string, position: number, length: number) => {
  const source = registry().get(filename);
  if (!source) throw new Error(`MDict worker source is unavailable: ${filename}`);
  if (!Number.isSafeInteger(position) || !Number.isSafeInteger(length)
    || position < 0 || length < 0 || position + length > source.size) {
    throw new Error(`MDict attempted an invalid read at ${position} + ${length}.`);
  }
  const Reader = (globalThis as unknown as {
    FileReaderSync?: new () => { readAsArrayBuffer(blob: Blob): ArrayBuffer };
  }).FileReaderSync;
  if (!Reader) throw new Error("Synchronous Blob reads require the STOA dictionary worker.");
  return Buffer.from(new Reader().readAsArrayBuffer(source.slice(position, position + length)));
};

const readChunk = Object.assign(
  async (filename: string, position: number, length: number) => sync(filename, position, length),
  { sync },
);

export default readChunk;
