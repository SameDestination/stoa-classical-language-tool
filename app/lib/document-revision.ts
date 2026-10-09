/**
 * Stable document revisions for desktop dirty-state tracking.
 *
 * Project export timestamps and the current token selection are deliberately
 * excluded: neither represents an edit in a professional document editor.
 * Everything the user can meaningfully save in the STOA document remains in
 * the revision source, including tokens, notes, translations, typography,
 * paper/layout settings, and forward-compatible document extensions.
 */

import {
  serializeStoaProject,
  type ParsedStoaProject,
  type StoaJsonObject,
} from "./stoa-project";

const revisionSource = (project: ParsedStoaProject): string => {
  const serialized = serializeStoaProject(project);
  // serializeStoaProject emits the portable project root directly. Accept the
  // briefly prototyped nested shape as a defensive compatibility fallback so
  // desktop revision tracking never depends on a transport wrapper.
  const nestedRoot = serialized.project;
  const document = serialized.document ?? (
    nestedRoot && typeof nestedRoot === "object" && !Array.isArray(nestedRoot)
      ? nestedRoot.document
      : undefined
  );
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("The STOA project has no document payload.");
  }
  const normalized: StoaJsonObject = {
    ...document,
    selectedTokenId: null,
  };
  return JSON.stringify(normalized);
};

const hex32 = (value: number): string => (value >>> 0)
  .toString(16)
  .padStart(8, "0");

/** A deterministic compact fingerprint; two independently mixed 32-bit lanes. */
export const documentRevision = (project: ParsedStoaProject): string => {
  const source = revisionSource(project);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
    second ^= second >>> 13;
  }
  return `${source.length.toString(36)}-${hex32(first)}${hex32(second)}`;
};
