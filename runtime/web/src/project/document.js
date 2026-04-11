import { createDefaultProject, normalizeProjectState } from "./presets.js";

export function createProjectDocument({ timeline, project } = {}) {
  const sourceTimeline = timeline && typeof timeline === "object" ? timeline : {};

  return {
    ...sourceTimeline,
    project: normalizeProjectState(project),
  };
}

export function readProjectDocument(document) {
  if (!document || typeof document !== "object") {
    return {
      timeline: {},
      project: createDefaultProject(),
    };
  }

  const { project, ...timeline } = document;
  return {
    timeline,
    project: normalizeProjectState(project),
  };
}
