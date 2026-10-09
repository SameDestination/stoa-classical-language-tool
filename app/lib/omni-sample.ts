/**
 * Canonical bundled OMNI sample.
 *
 * The asset remains an ordinary `.stoa.json` project. Every caller receives a
 * fresh parse/migration result so edits can never mutate the bundled sample by
 * reference.
 */

import {
  STOA_DEVELOPER_DEFAULTS,
  createDeveloperDefaultProject,
} from "../developer-defaults";
import type { ParsedStoaProject } from "./stoa-project";

export const OMNI_SAMPLE_MANIFEST = Object.freeze({
  filename: STOA_DEVELOPER_DEFAULTS.omni.sampleFilename,
  sha256: STOA_DEVELOPER_DEFAULTS.omni.sampleSha256,
});

const assertOmniProject = (project: ParsedStoaProject) => {
  const documentLanguage = project.project.document.language;
  const analysisLanguage = project.project.document.analysis.language;
  if (documentLanguage !== "omni" || analysisLanguage !== "omni") {
    throw new Error(
      `The bundled OMNI sample is mapped to ${documentLanguage}/${analysisLanguage}.`,
    );
  }
};

/** A fresh, migrated OMNI project instance on every call. */
export const createOmniSampleProject = (): ParsedStoaProject => {
  const project = createDeveloperDefaultProject("omni");
  assertOmniProject(project);
  return project;
};
