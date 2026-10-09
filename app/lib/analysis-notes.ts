export type AnalysisNote = {
  /** Stable project-local identity used by Preview and PDF destinations. */
  id: string;
  /** Stable token identity. Legacy unanchored notes use null. */
  tokenId: string | null;
  /** Scholarly note prose. Notes are plain text, never HTML. */
  text: string;
};

export type NumberedAnalysisNote = AnalysisNote & {
  /** One-based publication number derived from the filtered document order. */
  number: number;
};

export type AnalysisNoteInput = string | Partial<AnalysisNote> & {
  content?: unknown;
  note?: unknown;
  /** Accepted only as an import-order hint; display numbers are never stored. */
  number?: unknown;
};

const safeIdentifier = (value: string) => value
  .trim()
  .replace(/[^A-Za-z0-9._:-]+/gu, "-")
  .replace(/^-+|-+$/gu, "")
  .slice(0, 96);

/**
 * Encodes every JavaScript UTF-16 code unit as four lowercase hex digits.
 * Unlike slugification, this is a one-to-one mapping for arbitrary string IDs:
 * spaces, punctuation, composed/decomposed Unicode, and lone surrogates cannot
 * collapse onto the same HTML/PDF/LaTeX destination name. The result uses only
 * ASCII letters and digits so it is safe in all three export surfaces.
 */
const destinationIdentifier = (value: string) => `u${Array.from(
  { length: value.length },
  (_, index) => value.charCodeAt(index).toString(16).padStart(4, "0"),
).join("")}`;

const noteText = (value: AnalysisNoteInput) => {
  if (typeof value === "string") return value.trim();
  if (typeof value.text === "string") return value.text.trim();
  if (typeof value.content === "string") return value.content.trim();
  if (typeof value.note === "string") return value.note.trim();
  return "";
};

const requestedNumber = (value: AnalysisNoteInput, fallback: number) => {
  if (typeof value === "string") return fallback;
  const candidate = Number(value.number);
  return Number.isFinite(candidate) && candidate >= 1
    ? Math.round(candidate)
    : fallback;
};

const uniqueNoteId = (requested: string, used: Set<string>, fallbackNumber: number) => {
  const base = safeIdentifier(requested) || `note-${String(fallbackNumber).padStart(4, "0")}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
};

/**
 * Accepts STOA 5.7 string notes and STOA 5.8 anchored note objects. Invalid
 * anchors are retained as unanchored notes so an import never loses prose.
 */
export const normalizeAnalysisNotes = (
  value: unknown,
  validTokenIds: Iterable<string> = [],
): AnalysisNote[] => {
  if (!Array.isArray(value)) return [];
  const tokenIds = new Set(validTokenIds);
  const validateAnchors = tokenIds.size > 0;
  const usedIds = new Set<string>();
  const normalized = value
    .map((item, originalIndex) => {
      if (typeof item !== "string" && (!item || typeof item !== "object" || Array.isArray(item))) {
        return null;
      }
      const input = item as AnalysisNoteInput;
      const text = noteText(input);
      if (!text) return null;
      return { input, text, originalIndex };
    })
    .filter((note): note is NonNullable<typeof note> => Boolean(note))
    .map(({ input, text, originalIndex }, retainedIndex) => {
      const rawTokenId = typeof input === "string" || typeof input.tokenId !== "string"
        ? ""
        : input.tokenId.trim();
      const tokenId = rawTokenId && (!validateAnchors || tokenIds.has(rawTokenId))
        ? rawTokenId
        : null;
      const rawId = typeof input === "string" || typeof input.id !== "string" ? "" : input.id;
      return {
        originalIndex,
        requestedNumber: requestedNumber(input, retainedIndex + 1),
        id: uniqueNoteId(rawId, usedIds, retainedIndex + 1),
        tokenId,
        text,
      };
    })
    .sort((left, right) => left.requestedNumber - right.requestedNumber || left.originalIndex - right.originalIndex);

  return normalized.map((note) => ({
    id: note.id,
    tokenId: note.tokenId,
    text: note.text,
  }));
};

export const cloneAnalysisNotes = (notes: readonly AnalysisNote[]) => notes.map((note) => ({ ...note }));

/**
 * Blank records are never publication notes and therefore never consume a
 * visible number. The schema rejects them for v5 projects, while this helper
 * also protects transient/import state and every renderer from number gaps.
 */
export const numberAnalysisNotes = (
  notes: readonly AnalysisNote[],
): NumberedAnalysisNote[] => notes
  .filter((note) => Boolean(note.text.trim()))
  .map((note, index) => ({ ...note, text: note.text.trim(), number: index + 1 }));

/**
 * Keep imported Notes in the editable project while exposing them only to the
 * classical publication surfaces that support STOA 5.8 scholarly Notes.
 * OMNI still owns its legacy, non-publication Notes surface and must not feed
 * those records into Preview/PDF pagination.
 */
export const analysisNotesForPublication = (
  notes: readonly AnalysisNote[],
  supported: boolean,
) => supported ? cloneAnalysisNotes(notes) : [];

export const nextAnalysisNoteId = (notes: readonly AnalysisNote[]) => {
  const used = new Set(notes.map((note) => note.id));
  return uniqueNoteId("", used, notes.length + 1);
};

export const renumberAnalysisNotes = (notes: readonly AnalysisNote[]) =>
  numberAnalysisNotes(notes).map(({ id, tokenId, text }) => ({ id, tokenId, text }));

export const insertAnalysisNote = (
  notes: readonly AnalysisNote[],
  note: AnalysisNote,
  requestedPosition = notes.length + 1,
) => {
  const next = cloneAnalysisNotes(notes);
  const position = Math.min(next.length + 1, Math.max(1, Math.round(requestedPosition))) - 1;
  next.splice(position, 0, { ...note });
  return renumberAnalysisNotes(next);
};

export const moveAnalysisNote = (
  notes: readonly AnalysisNote[],
  noteId: string,
  requestedPosition: number,
) => {
  const next = cloneAnalysisNotes(notes);
  const currentIndex = next.findIndex((note) => note.id === noteId);
  if (currentIndex < 0) return renumberAnalysisNotes(next);
  const [note] = next.splice(currentIndex, 1);
  const position = Math.min(next.length + 1, Math.max(1, Math.round(requestedPosition))) - 1;
  next.splice(position, 0, note);
  return renumberAnalysisNotes(next);
};

export const deleteAnalysisNote = (notes: readonly AnalysisNote[], noteId: string) =>
  renumberAnalysisNotes(notes.filter((note) => note.id !== noteId));

export const mergeAnalysisNotes = (...groups: ReadonlyArray<readonly AnalysisNote[]>) => {
  const seen = new Set<string>();
  const merged: AnalysisNote[] = [];
  groups.flat().forEach((note) => {
    const signature = `${note.tokenId ?? ""}\u0000${note.text.trim()}`;
    if (!note.text.trim() || seen.has(signature)) return;
    seen.add(signature);
    merged.push({ ...note });
  });
  return normalizeAnalysisNotes(merged);
};

export const notesForToken = (notes: readonly AnalysisNote[], tokenId: string) =>
  renumberAnalysisNotes(notes).filter((note) => note.tokenId === tokenId);

export const tokenNoteDestination = (tokenId: string) =>
  `stoa-token-note-${destinationIdentifier(tokenId)}`;
export const analysisNoteDestination = (noteId: string) =>
  `stoa-analysis-note-${destinationIdentifier(noteId)}`;
