import { parse } from "./parser.ts";
import { collectCodeRefs, getCodeExpression } from "./fillers/code.ts";
import type { AnchorDict, AnchorEntry, Issue, RefExprAst } from "./types.js";

function issue(code: string, message: string, field?: string, fix?: string): Issue {
  return { code, message, field, fix, severity: "error" };
}

function pointKey(ref: RefExprAst) {
  return ref.point === "at" ? ref.id : `${ref.id}.${ref.point}`;
}

function hasImplicitAt(entry: AnchorEntry, ref: RefExprAst) {
  return ref.point === "at" && Boolean(getCodeExpression(entry));
}

function lookupAnchorRef(dict: AnchorDict, ref: RefExprAst) {
  const exactKey = pointKey(ref);
  const exact = dict[exactKey];
  if (exact?.at !== undefined) {
    return;
  }
  if (exact && hasImplicitAt(exact, ref)) {
    return;
  }
  if (exact) {
    throw new Error(`MISSING_POINT: anchor "${exactKey}" is missing point "at"`);
  }

  const entry = dict[ref.id];
  if (!entry) {
    throw new Error(`MISSING_ANCHOR: anchor "${ref.id}" not found`);
  }
  if (hasImplicitAt(entry, ref)) {
    return;
  }
  if (entry[ref.point] === undefined) {
    throw new Error(`MISSING_POINT: anchor "${ref.id}" is missing point "${ref.point}"`);
  }
}

function pushLookupIssue(issues: Issue[], error: unknown, path: string, fix: string) {
  const message = (error as Error).message;
  const code = message.split(":")[0] || "BAD_ANCHOR_EXPR";
  issues.push(issue(code, message, path, fix));
}

function dependencyKey(dict: AnchorDict, ref: RefExprAst): string {
  const exactKey = ref.point === "at" ? ref.id : `${ref.id}.${ref.point}`;
  if (dict[exactKey]) {
    return exactKey;
  }
  return ref.id;
}

function validateParsedRef(
  dict: AnchorDict,
  expr: string,
  path: string,
  issues: Issue[],
) {
  try {
    const ast = parse(expr);
    const ref = ast.kind === "ref" ? ast : ast.base;
    lookupAnchorRef(dict, ref);
  } catch (error) {
    pushLookupIssue(issues, error, path, "Use ADR-018 syntax: id.begin|end|at +/- n s|ms.");
  }
}

function validateDictExpressions(dict: AnchorDict, issues: Issue[]) {
  for (const [id, entry] of Object.entries(dict)) {
    for (const point of ["at", "begin", "end"] as const) {
      const value = entry[point];
      if (typeof value === "string") {
        validateParsedRef(dict, value, `anchors.${id}.${point}`, issues);
      }
    }
  }
}

function detectCodeCycles(dict: AnchorDict, issues: Issue[]) {
  const graph = new Map<string, string[]>();

  for (const [id, entry] of Object.entries(dict)) {
    const expr = getCodeExpression(entry);
    if (!expr) {
      continue;
    }

    try {
      const refs = collectCodeRefs(expr);
      let hasLookupIssue = false;
      for (const ref of refs) {
        try {
          lookupAnchorRef(dict, ref);
        } catch (error) {
          hasLookupIssue = true;
          pushLookupIssue(
            issues,
            error,
            `anchors.${id}.filler`,
            "Define the missing anchor point or correct the code filler reference.",
          );
        }
      }
      if (hasLookupIssue) {
        continue;
      }
      graph.set(
        id,
        refs.map((ref) => dependencyKey(dict, ref)),
      );
    } catch (error) {
      issues.push(issue(
        "BAD_CODE_EXPR",
        (error as Error).message,
        `anchors.${id}.filler`,
        "Use arithmetic over anchor refs and numeric literals only.",
      ));
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();

  function visit(node: string, trail: string[]) {
    if (visiting.has(node)) {
      const start = trail.indexOf(node);
      const cycle = [...trail.slice(start), node];
      const key = cycle.join(" -> ");
      if (!reported.has(key)) {
        reported.add(key);
        issues.push(issue(
          "ANCHOR_CIRCULAR_DEP",
          `anchor cycle detected: ${key}`,
          `anchors.${node}.filler`,
          "Break the cycle so every code anchor depends on earlier anchors only.",
        ));
      }
      return;
    }
    if (visited.has(node)) {
      return;
    }

    visiting.add(node);
    for (const dep of graph.get(node) ?? []) {
      if (graph.has(dep)) {
        visit(dep, [...trail, node]);
      }
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    visit(node, []);
  }
}

export function validateAnchors(
  dict: AnchorDict,
  refs: Array<{ expr: string; path: string }> = [],
): { ok: boolean; issues: Issue[] } {
  if (Object.keys(dict).length === 0 && refs.length === 0) {
    return { ok: true, issues: [] };
  }

  const issues: Issue[] = [];
  for (const ref of refs) {
    validateParsedRef(dict, ref.expr, ref.path, issues);
  }
  validateDictExpressions(dict, issues);
  detectCodeCycles(dict, issues);

  return {
    ok: issues.length === 0,
    issues,
  };
}
