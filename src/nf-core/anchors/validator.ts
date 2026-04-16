import type { AnchorDict, Issue } from "./types.js";

function notImplemented(message: string, issues: Issue[]): never {
  const error = new Error(message) as Error & { issues?: Issue[] };
  error.issues = issues;
  throw error;
}

export function validateAnchors(dict: AnchorDict): { ok: boolean; issues: Issue[] } {
  if (Object.keys(dict).length === 0) {
    return { ok: true, issues: [] };
  }

  notImplemented("NOT_IMPLEMENTED: validateAnchors non-empty anchor dictionaries", [
    {
      code: "NOT_IMPLEMENTED",
      message: "validateAnchors only supports empty anchor dictionaries in the walking skeleton",
      fix: "Use an empty anchors object until Phase 5 fills the anchor validator.",
    },
  ]);
}
