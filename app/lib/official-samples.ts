/**
 * Compatibility adapter for the three named classical sample projects.
 *
 * The source assets remain ordinary `.stoa.json` documents. Every consumer
 * receives a fresh parse/migration result, so the UI can never mutate the
 * canonical bundled value by reference.
 */

import {
  STOA_DEVELOPER_DEFAULTS,
  createDeveloperDefaultProject,
} from "../developer-defaults";
import type { StoaLanguageId } from "../language-config";
import type { ParsedStoaProject } from "./stoa-project";

export type OfficialSampleManifestEntry = {
  language: StoaLanguageId;
  filename: string;
  sha256: string;
};

export const OFFICIAL_SAMPLE_MANIFEST: Readonly<Record<StoaLanguageId, OfficialSampleManifestEntry>> = {
  "ancient-greek": {
    language: "ancient-greek",
    filename: STOA_DEVELOPER_DEFAULTS["ancient-greek"].sampleFilename,
    sha256: STOA_DEVELOPER_DEFAULTS["ancient-greek"].sampleSha256,
  },
  latin: {
    language: "latin",
    filename: STOA_DEVELOPER_DEFAULTS.latin.sampleFilename,
    sha256: STOA_DEVELOPER_DEFAULTS.latin.sampleSha256,
  },
  "classical-chinese": {
    language: "classical-chinese",
    filename: STOA_DEVELOPER_DEFAULTS["classical-chinese"].sampleFilename,
    sha256: STOA_DEVELOPER_DEFAULTS["classical-chinese"].sampleSha256,
  },
};

const assertMappedLanguage = (language: StoaLanguageId, project: ParsedStoaProject) => {
  const documentLanguage = project.project.document.language;
  const analysisLanguage = project.project.document.analysis.language;
  if (documentLanguage !== language || analysisLanguage !== language) {
    throw new Error(
      `The bundled ${language} sample is mapped to ${documentLanguage}/${analysisLanguage}.`,
    );
  }
};

/** A fresh, migrated project instance on every call. */
export const createOfficialSampleProject = (language: StoaLanguageId): ParsedStoaProject => {
  const project = createDeveloperDefaultProject(language);
  assertMappedLanguage(language, project);
  return project;
};
