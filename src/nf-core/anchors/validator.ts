import type { AnchorDict, Issue } from "./types.js";

export function validateAnchors(dict: AnchorDict): { ok: boolean; issues: Issue[] } {
  const issues: Issue[] = [];
  for (const [anchorId, entry] of Object.entries(dict)) {
    if (!entry || typeof entry !== "object") {
      issues.push({
        code: "BAD_ANCHOR",
        message: `anchor "${anchorId}" must be an object`,
        field: anchorId,
        fix: "Set the anchor value to an object with at or begin/end numbers.",
      });
      continue;
    }

    const hasAt = Number.isFinite(entry.at);
    const hasBegin = Number.isFinite(entry.begin);
    const hasEnd = Number.isFinite(entry.end);

    if (!hasAt && !(hasBegin && hasEnd)) {
      issues.push({
        code: "BAD_ANCHOR",
        message: `anchor "${anchorId}" must define either at or both begin/end`,
        field: anchorId,
        fix: 'Use {"at": 1234} or {"begin": 1000, "end": 2000}.',
      });
    }

    if (hasBegin && hasEnd && Number(entry.begin) > Number(entry.end)) {
      issues.push({
        code: "BAD_ANCHOR_RANGE",
        message: `anchor "${anchorId}" has begin > end`,
        field: anchorId,
        fix: "Swap the values or correct the source timing before retrying.",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
