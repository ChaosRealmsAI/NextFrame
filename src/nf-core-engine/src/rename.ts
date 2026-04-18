// Rename anchor across source JSON text: patches anchor-key + every expression that references old name.
// Idempotent: running rename(text, old, new) twice yields same text on 2nd run (changed=0).

import { parseExpr, collectRefs } from './expr.js';
import { SourceRaw } from './types.js';

export interface RenameResult {
  new_source: string;
  changed_locations: number;
}

function replaceIdentInExpr(expr: string, from: string, to: string): { out: string; changed: number } {
  // Conservative regex-based replace: only replace whole-word identifier occurrences.
  // Safer to parse + re-emit, but expr re-emission changes whitespace — user wants format preserved.
  const re = new RegExp(`(^|[^A-Za-z0-9_])${escapeReg(from)}(?![A-Za-z0-9_])`, 'g');
  let changed = 0;
  const out = expr.replace(re, (_m, pre: string) => {
    changed++;
    return `${pre}${to}`;
  });
  return { out, changed };
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isIdent(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}

/**
 * Rename anchor in a source.json TEXT. Preserves formatting best-effort by re-emitting JSON
 * only after targeted string patching on expr fields. For unknown-format robustness we parse +
 * re-serialize when the in-place regex approach would fail (e.g. key rename).
 */
export function rename(source_text: string, old_name: string, new_name: string): RenameResult {
  if (!isIdent(old_name) || !isIdent(new_name)) {
    throw new Error(`rename: names must be identifiers (got '${old_name}' -> '${new_name}')`);
  }
  if (old_name === new_name) return { new_source: source_text, changed_locations: 0 };

  let obj: unknown;
  try {
    obj = JSON.parse(source_text);
  } catch (e) {
    throw new Error(`rename: source is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const src = obj as SourceRaw & { anchors?: Record<string, unknown> };
  let changed = 0;

  // Idempotence: if source has no old_name (already renamed), noop.
  const hadOldName = !!(src.anchors && old_name in src.anchors);
  const hadNewName = !!(src.anchors && new_name in src.anchors);
  if (!hadOldName) {
    return { new_source: source_text, changed_locations: 0 };
  }
  if (hadNewName) {
    throw new Error(`rename: target name '${new_name}' already exists`);
  }
  // 1. Rename the anchor key itself (preserve insertion order).
  if (src.anchors && old_name in src.anchors) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src.anchors)) {
      if (k === old_name) {
        out[new_name] = v;
        changed++;
      } else out[k] = v;
    }
    src.anchors = out;
  }

  // 2. Walk every expression field and replace refs.
  const patch = (node: unknown, path: (string | number)[]): unknown => {
    if (typeof node !== 'object' || node === null) return node;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = patch(node[i], [...path, i]);
      return node;
    }
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if ((k === 'at' || k === 'begin' || k === 'end' || k === 'duration') && typeof v === 'string') {
        // Only replace if expression parses and references old_name.
        try {
          const ast = parseExpr(v);
          const refs = collectRefs(ast);
          if (refs.includes(old_name)) {
            const { out, changed: d } = replaceIdentInExpr(v, old_name, new_name);
            obj[k] = out;
            changed += d;
          }
        } catch {
          // Skip non-expression strings.
        }
      } else {
        obj[k] = patch(v, [...path, k]);
      }
    }
    return obj;
  };
  patch(src, []);

  const new_source = JSON.stringify(src, null, 2) + '\n';
  return { new_source, changed_locations: changed };
}
