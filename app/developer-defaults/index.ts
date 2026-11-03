/**
 * Developer-controlled STOA workspace defaults.
 *
 * This module and the adjacent `samples/` directory are the single source of
 * truth for built-in documents.  The JSON assets stay ordinary `.stoa.json`
 * projects and are always loaded through STOA's public codec/migration path.
 * No canonical object is ever handed to the UI: each call parses a private
 * serialized copy and returns a new, independently editable project.
 */

import ancientGreekSampleJson from "./samples/stoa-ancient-greek.stoa.json";
import classicalChineseSampleJson from "./samples/stoa-classical-chinese.stoa.json";
import latinSampleJson from "./samples/stoa-latin.stoa.json";
import omniSampleJson from "./samples/stoa-omni.stoa.json";
import type { StoaLanguageId } from "../language-config";
import { createOmniDocumentConfig } from "../lib/omni-language";
import {
  migrateStoaProjectToLatest,
  parseStoaProject,
  parseStoaProjectText,
  serializeStoaProject,
  type ParsedStoaProject,
  type StoaProjectSettings,
} from "../lib/stoa-project";

export const STOA_DEVELOPER_WORKSPACE_IDS = [
  "ancient-greek",
  "latin",
  "classical-chinese",
  "omni",
] as const;

export type StoaDeveloperWorkspaceId =
  | StoaLanguageId
  | "omni";

export type DeveloperWorkspaceDefinition = Readonly<{
  id: StoaDeveloperWorkspaceId;
  sampleFilename: string;
  sampleSha256: string;
  /**
   * Small policy overrides applied after the bundled project is migrated.
   * Put document-specific typography, paper, and text in the `.stoa.json`
   * asset; reserve this patch for an intentional product-wide startup rule.
   */
  settings: Readonly<Partial<StoaProjectSettings>>;
}>;

const translationVisible = Object.freeze({
  showTranslation: true,
}) satisfies Readonly<Partial<StoaProjectSettings>>;

/**
 * Edit these entries when changing a packaged filename, integrity hash, or
 * product-wide setting.  Edit the adjacent JSON document for sample content,
 * annotations, typography, paper, headers/footers, or other project data.
 */
export const STOA_DEVELOPER_DEFAULTS: Readonly<
  Record<StoaDeveloperWorkspaceId, DeveloperWorkspaceDefinition>
> = Object.freeze({
  "ancient-greek": Object.freeze({
    id: "ancient-greek",
    sampleFilename: "stoa-ancient-greek.stoa.json",
    sampleSha256: "fdd85dc51760f93fe6c30e9f27d774764ac46688dba37fed3f1a72648ad3e3b6",
    settings: translationVisible,
  }),
  latin: Object.freeze({
    id: "latin",
    sampleFilename: "stoa-latin.stoa.json",
    sampleSha256: "c556d2ac65770688faa02ce4d5a18a7e84541be30f9536f80c7660c966076f93",
    settings: translationVisible,
  }),
  "classical-chinese": Object.freeze({
    id: "classical-chinese",
    sampleFilename: "stoa-classical-chinese.stoa.json",
    sampleSha256: "8fd01853484a5fd5fb8e01446f06aee47aefd29425f75dbf578901f5b7ab4a84",
    settings: translationVisible,
  }),
  omni: Object.freeze({
    id: "omni",
    sampleFilename: "stoa-omni.stoa.json",
    sampleSha256: "ac5a70a3c687252f8849dc699aad75247490dea07b32e67af83c2ac2351594dc",
    settings: translationVisible,
  }),
});

const canonicalProjectTextByWorkspace: Readonly<
  Record<StoaDeveloperWorkspaceId, string>
> = Object.freeze({
  "ancient-greek": JSON.stringify(ancientGreekSampleJson),
  latin: JSON.stringify(latinSampleJson),
  "classical-chinese": JSON.stringify(classicalChineseSampleJson),
  omni: JSON.stringify(omniSampleJson),
});

export const isStoaDeveloperWorkspaceId = (
  value: unknown,
): value is StoaDeveloperWorkspaceId =>
  typeof value === "string"
  && (STOA_DEVELOPER_WORKSPACE_IDS as readonly string[]).includes(value);

const assertWorkspaceMapping = (
  workspace: StoaDeveloperWorkspaceId,
  project: ParsedStoaProject,
) => {
  const documentLanguage = project.project.document.language;
  const analysisLanguage = project.project.document.analysis.language;
  if (documentLanguage !== workspace || analysisLanguage !== workspace) {
    throw new Error(
      `The bundled ${workspace} sample is mapped to ${documentLanguage}/${analysisLanguage}.`,
    );
  }
};

/**
 * Returns the current developer-defined sample/default project as a fresh
 * mutable working copy.  Startup, New/Blank-from-template, and Restore Sample
 * should all call this factory instead of caching its return value.
 */
export const createDeveloperDefaultProject = (
  workspace: StoaDeveloperWorkspaceId,
): ParsedStoaProject => {
  const definition = STOA_DEVELOPER_DEFAULTS[workspace];
  const migrated = migrateStoaProjectToLatest(
    parseStoaProjectText(canonicalProjectTextByWorkspace[workspace]),
  );
  assertWorkspaceMapping(workspace, migrated);
  migrated.project.document.settings = {
    ...migrated.project.document.settings,
    ...definition.settings,
  };

  // Re-enter the public codec after applying the small developer policy patch.
  // This both validates the result and gives every caller a detached sidecar.
  const workingCopy = parseStoaProject(serializeStoaProject(migrated));
  assertWorkspaceMapping(workspace, workingCopy);
  return workingCopy;
};

/** A detached copy of the packaged settings for New-document workflows. */
export const createDeveloperDefaultSettings = (
  workspace: StoaDeveloperWorkspaceId,
): StoaProjectSettings =>
  createDeveloperDefaultProject(workspace).project.document.settings;

/**
 * Creates an untitled, empty document with the developer-defined settings for
 * its workspace.  This is intentionally derived from the same project as the
 * bundled sample so New and Restore Sample cannot drift into separate style
 * systems.
 */
export const createDeveloperBlankProject = (
  workspace: StoaDeveloperWorkspaceId,
): ParsedStoaProject => {
  const blank = createDeveloperDefaultProject(workspace);
  blank.project.document.sourceText = "";
  blank.project.document.selectedTokenId = null;
  blank.project.document.analysis.sourceText = "";
  blank.project.document.analysis.literalTranslation = "";
  blank.project.document.analysis.naturalTranslation = "";
  blank.project.document.analysis.tokens = [];
  blank.project.document.analysis.notes = [];
  return parseStoaProject(serializeStoaProject(blank));
};

/** Web New keeps only the developer's right-hand header, never sample running text. */
export const createDeveloperWebBlankProject = (workspace: StoaDeveloperWorkspaceId): ParsedStoaProject => {
  const blank = createDeveloperBlankProject(workspace);
  blank.project.document.settings.headerLeft = "";
  blank.project.document.settings.footerLeft = "";
  blank.project.document.settings.footerRight = "";
  if (workspace === "omni") {
    // Typography comes from the developer defaults; detected language and
    // manual overrides belong to the removed sample, not to a new document.
    const omni = createOmniDocumentConfig(undefined, "");
    blank.project.document.settings.omni = omni;
    blank.project.document.settings.hideIndeclinableDetails = false;
    blank.project.document.analysis.languageDetection = omni.languageDetection;
    blank.project.document.analysis.analysisProfile = omni.analysisProfile;
    blank.project.document.analysis.morphologyStandard = omni.morphologyStandard;
  }
  return blank;
};
