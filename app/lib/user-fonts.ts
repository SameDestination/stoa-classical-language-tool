import type { StoaFontOption } from "./font-registry";

export const USER_FONT_DB_NAME = "stoa-user-font-library";
export const USER_FONT_DB_VERSION = 1;
export const USER_FONT_STORE = "fonts";
export const USER_FONT_MAX_BYTES = 25 * 1024 * 1024;

export type UserFontFormat = "ttf" | "otf";
export type UserFontFaceStyle = "normal" | "italic" | "bold" | "bolditalic";

export type UserFontReference = {
  id: string;
  familyId: string;
  familyName: string;
  subfamilyName: string;
  postscriptName: string;
  cssFamily: string;
  filename: string;
  sha256: string;
  format: UserFontFormat;
  faceStyle: UserFontFaceStyle;
  byteLength: number;
};

export type UserFontRecord = UserFontReference & { bytes: ArrayBuffer };

export class UserFontError extends Error {
  readonly code:
    | "unsupported-format"
    | "invalid-font"
    | "font-too-large"
    | "storage-unavailable"
    | "storage-failed"
    | "missing-font";

  constructor(code: UserFontError["code"], message: string) {
    super(message);
    this.name = "UserFontError";
    this.code = code;
  }
}

const tagAt = (view: DataView, offset: number) => String.fromCharCode(
  view.getUint8(offset),
  view.getUint8(offset + 1),
  view.getUint8(offset + 2),
  view.getUint8(offset + 3),
);

const assertRange = (offset: number, length: number, total: number) => {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > total) {
    throw new UserFontError("invalid-font", "The font contains an invalid or truncated table.");
  }
};

const decodeUtf16Be = (bytes: Uint8Array) => {
  let value = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return value;
};

const cleanName = (value: string) => value
  .replace(/\p{Cc}/gu, "")
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, 160);

type NameCandidate = { nameId: number; value: string; score: number };

const readSfntNames = (bytes: ArrayBuffer) => {
  const view = new DataView(bytes);
  assertRange(0, 12, view.byteLength);
  const signature = view.getUint32(0, false);
  const signatureTag = tagAt(view, 0);
  if (signatureTag === "wOFF" || signatureTag === "wOF2") {
    throw new UserFontError(
      "unsupported-format",
      "WOFF and WOFF2 are not imported in STOA 5.9.2. Convert the font to a licensed TTF or OTF file first.",
    );
  }
  const format: UserFontFormat = signature === 0x00010000 || signatureTag === "true"
    ? "ttf"
    : signatureTag === "OTTO"
      ? "otf"
      : (() => {
          throw new UserFontError("invalid-font", "This file is not a readable TrueType or OpenType font.");
        })();
  const tableCount = view.getUint16(4, false);
  if (!tableCount || tableCount > 4096) {
    throw new UserFontError("invalid-font", "The font table directory is invalid.");
  }
  assertRange(12, tableCount * 16, view.byteLength);
  let nameOffset = -1;
  let nameLength = 0;
  for (let index = 0; index < tableCount; index += 1) {
    const entry = 12 + index * 16;
    const offset = view.getUint32(entry + 8, false);
    const length = view.getUint32(entry + 12, false);
    assertRange(offset, length, view.byteLength);
    if (tagAt(view, entry) === "name") {
      nameOffset = offset;
      nameLength = length;
    }
  }
  if (nameOffset < 0) throw new UserFontError("invalid-font", "The font has no readable name table.");
  assertRange(nameOffset, Math.min(6, nameLength), view.byteLength);
  const recordCount = view.getUint16(nameOffset + 2, false);
  const stringsOffset = view.getUint16(nameOffset + 4, false);
  assertRange(nameOffset + 6, recordCount * 12, nameOffset + nameLength);
  const candidates: NameCandidate[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const recordOffset = nameOffset + 6 + index * 12;
    const platformId = view.getUint16(recordOffset, false);
    const languageId = view.getUint16(recordOffset + 4, false);
    const nameId = view.getUint16(recordOffset + 6, false);
    if (![1, 2, 6, 16, 17].includes(nameId)) continue;
    const length = view.getUint16(recordOffset + 8, false);
    const relativeOffset = view.getUint16(recordOffset + 10, false);
    const absoluteOffset = nameOffset + stringsOffset + relativeOffset;
    assertRange(absoluteOffset, length, nameOffset + nameLength);
    const raw = new Uint8Array(bytes, absoluteOffset, length);
    const value = cleanName(platformId === 0 || platformId === 3
      ? decodeUtf16Be(raw)
      : new TextDecoder("latin1").decode(raw));
    if (!value) continue;
    const score = (platformId === 3 ? 30 : platformId === 0 ? 20 : 10)
      + (languageId === 0x0409 || languageId === 0 ? 5 : 0);
    candidates.push({ nameId, value, score });
  }
  const best = (...ids: number[]) => candidates
    .filter((item) => ids.includes(item.nameId))
    .sort((left, right) => ids.indexOf(left.nameId) - ids.indexOf(right.nameId) || right.score - left.score)[0]?.value;
  const familyName = best(16, 1);
  if (!familyName) throw new UserFontError("invalid-font", "The font family name could not be read safely.");
  const subfamilyName = best(17, 2) || "Regular";
  const postscriptName = best(6) || `${familyName.replace(/[^\p{L}\p{N}]+/gu, "-")}-${subfamilyName}`;
  return { format, familyName, subfamilyName, postscriptName };
};

const sha256Hex = async (bytes: ArrayBuffer) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
).map((value) => value.toString(16).padStart(2, "0")).join("");

const faceStyleFrom = (subfamily: string): UserFontFaceStyle => {
  const bold = /\b(?:bold|black|heavy|semibold|demibold)\b/iu.test(subfamily);
  const italic = /\b(?:italic|oblique|slanted)\b/iu.test(subfamily);
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
};

export const parseUserFont = async (
  filename: string,
  input: ArrayBuffer,
): Promise<UserFontRecord> => {
  if (input.byteLength > USER_FONT_MAX_BYTES) {
    throw new UserFontError("font-too-large", "The font is larger than STOA's 25 MB safety limit.");
  }
  if (input.byteLength < 32) throw new UserFontError("invalid-font", "The font file is empty or truncated.");
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1];
  if (extension && extension !== "ttf" && extension !== "otf") {
    throw new UserFontError("unsupported-format", "Choose a .ttf or .otf font file.");
  }
  const names = readSfntNames(input);
  const sha256 = await sha256Hex(input);
  const familyDigest = await sha256Hex(new TextEncoder().encode(names.familyName.normalize("NFC").toLocaleLowerCase("en")).buffer);
  const familyId = `user-family-${familyDigest.slice(0, 20)}`;
  const internalFamily = `STOAUser-${familyDigest.slice(0, 16)}`;
  return {
    id: `user-font-${sha256.slice(0, 24)}`,
    familyId,
    familyName: names.familyName,
    subfamilyName: names.subfamilyName,
    postscriptName: names.postscriptName,
    cssFamily: /^Times New Roman$/i.test(names.familyName) ? "'Times New Roman', Times, serif" : `'${internalFamily}'`,
    filename: filename.slice(0, 255) || `${names.postscriptName}.${names.format}`,
    sha256,
    format: names.format,
    faceStyle: faceStyleFrom(names.subfamilyName),
    byteLength: input.byteLength,
    bytes: input.slice(0),
  };
};

export const userFontReference = (record: UserFontRecord | UserFontReference): UserFontReference => ({
  id: record.id,
  familyId: record.familyId,
  familyName: record.familyName,
  subfamilyName: record.subfamilyName,
  postscriptName: record.postscriptName,
  cssFamily: record.cssFamily,
  filename: record.filename,
  sha256: record.sha256,
  format: record.format,
  faceStyle: record.faceStyle,
  byteLength: record.byteLength,
});

export const userFontOptions = (fonts: readonly UserFontReference[]): StoaFontOption[] => {
  const families = new Map<string, UserFontReference>();
  for (const font of fonts) if (!families.has(font.familyId)) families.set(font.familyId, font);
  return [...families.values()].map((font) => ({
    id: font.familyId,
    label: `${font.familyName} — Imported`,
    cssFamily: font.cssFamily,
    source: "user" as const,
    scripts: ["greek", "latin", "cjk"] as const,
  }));
};

const requestToPromise = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
});

const openUserFontDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new UserFontError("storage-unavailable", "This browser does not provide a local font library."));
    return;
  }
  const request = indexedDB.open(USER_FONT_DB_NAME, USER_FONT_DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(USER_FONT_STORE)) {
      database.createObjectStore(USER_FONT_STORE, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Unable to open the local font library."));
});

const withStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  try {
    const database = await openUserFontDb();
    const transaction = database.transaction(USER_FONT_STORE, mode);
    const result = await requestToPromise(action(transaction.objectStore(USER_FONT_STORE)));
    database.close();
    return result;
  } catch (error) {
    if (error instanceof UserFontError) throw error;
    throw new UserFontError("storage-failed", error instanceof Error ? error.message : "The local font library failed.");
  }
};

export const saveUserFont = async (record: UserFontRecord) => {
  await withStore("readwrite", (store) => store.put(record));
  return userFontReference(record);
};

export const listUserFonts = async (): Promise<UserFontRecord[]> =>
  withStore("readonly", (store) => store.getAll()) as Promise<UserFontRecord[]>;

export const getUserFont = async (id: string): Promise<UserFontRecord | null> =>
  (await withStore("readonly", (store) => store.get(id)) as UserFontRecord | undefined) ?? null;

export const deleteUserFont = async (id: string) => {
  await withStore("readwrite", (store) => store.delete(id));
};

const fontFaceFamily = (cssFamily: string) => cssFamily.split(",")[0].trim().replace(/^['"]|['"]$/gu, "");

/** Browser permission is requested only by the explicit Load Times New Roman action. */
export const loadLocalTimesNewRoman = async (): Promise<UserFontRecord[]> => {
  const localWindow = window as Window & {
    queryLocalFonts?: () => Promise<Array<{ family: string; postscriptName: string; blob: () => Promise<Blob> }>>;
  };
  if (!localWindow.queryLocalFonts) throw new UserFontError("unsupported-format", "This browser cannot read installed fonts. Use Import font to select your Times New Roman TTF/OTF files (Regular, Bold, Italic and Bold Italic).");
  const faces = (await localWindow.queryLocalFonts()).filter((font) => /^Times New Roman$/i.test(font.family));
  if (!faces.length) throw new UserFontError("missing-font", "Times New Roman is not installed. Import its licensed TTF/OTF files, or choose a bundled font.");
  const records: UserFontRecord[] = [];
  for (const face of faces) {
    const record = await parseUserFont(`${face.postscriptName}.ttf`, await (await face.blob()).arrayBuffer());
    await registerUserFont(record);
    await saveUserFont(record);
    records.push(record);
  }
  return records;
};

export const registerUserFont = async (record: UserFontRecord) => {
  if (typeof FontFace === "undefined" || typeof document === "undefined") {
    throw new UserFontError("storage-unavailable", "This runtime cannot register preview fonts.");
  }
  const style = record.faceStyle === "italic" || record.faceStyle === "bolditalic" ? "italic" : "normal";
  const weight = record.faceStyle === "bold" || record.faceStyle === "bolditalic" ? "700" : "400";
  const face = new FontFace(fontFaceFamily(record.cssFamily), record.bytes.slice(0), { style, weight });
  await face.load();
  document.fonts.add(face);
  if (/^Times New Roman$/i.test(record.familyName) && fontFaceFamily(record.cssFamily) !== "Times New Roman") {
    const alias = new FontFace("Times New Roman", record.bytes.slice(0), { style, weight });
    await alias.load();
    document.fonts.add(alias);
  }
  return face;
};

export const missingUserFontReferences = (
  references: readonly UserFontReference[],
  available: readonly UserFontReference[],
) => {
  const ids = new Set(available.map((item) => item.id));
  return references.filter((item) => !ids.has(item.id));
};
