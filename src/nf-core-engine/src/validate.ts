// Validator: aggregates parse + viewport + anchor resolution diagnostics
// into a single JSON-friendly report with stable `code` fields so AI / IDE
// tooling can branch on outcomes.

import { parseSource, ParseError, type SourceAst } from "./parser.js";
import { resolveAnchors } from "./anchor.js";
import { CyclicAnchors, UnknownRef } from "./topo.js";
import { ExprError } from "./expr.js";

export interface ValidateError {
  code: string;
  message: string;
  name?: string;
  cycle_path?: string[];
  source_line?: number | null;
  details?: Record<string, unknown>;
}

export interface ValidateReport {
  ok: boolean;
  anchors_resolved: number;
  tracks_count: number;
  errors: ValidateError[];
  warnings: string[];
}

const RATIO_WHITELIST = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;

function parseRatio(ratio: string): [number, number] | null {
  const m = /^(\d+):(\d+)$/.exec(ratio);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return [a, b];
}

function checkViewport(ast: SourceAst, errors: ValidateError[]): void {
  const vp = ast.viewport;
  if (!RATIO_WHITELIST.includes(vp.ratio as (typeof RATIO_WHITELIST)[number])) {
    errors.push({
      code: "viewport-ratio-invalid",
      message: `viewport.ratio "${vp.ratio}" not in whitelist`,
      details: { whitelist: [...RATIO_WHITELIST], got: vp.ratio },
    });
    return;
  }
  const parsed = parseRatio(vp.ratio);
  if (!parsed) return;
  const [ra, rb] = parsed;
  const ratioExpected = ra / rb;
  const ratioActual = vp.w / vp.h;
  if (Math.abs(ratioExpected - ratioActual) > 1e-6) {
    errors.push({
      code: "viewport-mismatch",
      message: `viewport ratio ${vp.ratio} but w/h = ${ratioActual.toFixed(2)}`,
      details: {
        ratio: vp.ratio,
        expected: Number(ratioExpected.toFixed(6)),
        actual: Number(ratioActual.toFixed(2)),
      },
    });
  }
}

function parseErrorToEntry(err: ParseError): ValidateError {
  return { code: err.code, message: err.message };
}

function resolveErrorToEntry(err: Error, ast: SourceAst | null): ValidateError {
  if (err instanceof CyclicAnchors) {
    const firstLine =
      ast && err.cycle.length > 0 ? (ast.anchorLines[err.cycle[0]] ?? null) : null;
    return {
      code: "anchor-cycle",
      message: err.message,
      cycle_path: err.cycle,
      source_line: firstLine,
    };
  }
  if (err instanceof UnknownRef) {
    const line = ast && err.from ? (ast.anchorLines[err.from] ?? null) : null;
    return {
      code: "anchor-undefined",
      message: err.message,
      name: err.refName,
      source_line: line,
    };
  }
  if (err instanceof ExprError) {
    return {
      code: "anchor-expr-error",
      message: err.message,
      details: { pos: err.pos },
    };
  }
  return { code: "unknown", message: err.message };
}

export function validateSource(text: string): ValidateReport {
  const errors: ValidateError[] = [];
  const warnings: string[] = [];
  let ast: SourceAst | null = null;
  try {
    ast = parseSource(text);
  } catch (e) {
    if (e instanceof ParseError) errors.push(parseErrorToEntry(e));
    else errors.push({ code: "unknown", message: (e as Error).message });
    return { ok: false, anchors_resolved: 0, tracks_count: 0, errors, warnings };
  }
  checkViewport(ast, errors);
  let anchors_resolved = 0;
  let tracks_count = ast.tracks.length;
  try {
    const resolved = resolveAnchors(ast);
    anchors_resolved = Object.keys(resolved.anchors).length;
    tracks_count = resolved.tracks.length;
  } catch (e) {
    errors.push(resolveErrorToEntry(e as Error, ast));
  }
  return {
    ok: errors.length === 0,
    anchors_resolved,
    tracks_count,
    errors,
    warnings,
  };
}
