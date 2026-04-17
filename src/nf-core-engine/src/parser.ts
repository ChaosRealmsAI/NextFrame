// JSON parser for NextFrame Source. JSON.parse preserves key insertion order
// in modern V8 for string keys, so the raw object round-trips predictably.
// In addition to shape validation, we capture a lightweight `source_line`
// map per top-level anchor so downstream errors can point back to the user's
// original text without dragging in a full JSON tokenizer.

export interface Viewport {
  ratio: string;
  w: number;
  h: number;
}

export type AnchorExprNode = { ref: string } | { expr: string } | number;

export interface SourceAst {
  raw: Record<string, unknown>;
  viewport: Viewport;
  tracks: unknown[];
  anchors: Record<string, AnchorExprNode>;
  anchorLines: Record<string, number>;
  rawText: string;
}

export class ParseError extends Error {
  constructor(message: string, public readonly code: string = "parse-error") {
    super(message);
    this.name = "ParseError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseSource(text: string): SourceAst {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ParseError(`invalid JSON: ${(e as Error).message}`, "json-syntax");
  }
  if (!isRecord(raw)) {
    throw new ParseError("source must be a JSON object", "source-shape");
  }
  if (!isRecord(raw.viewport)) {
    throw new ParseError("source.viewport is required", "viewport-missing");
  }
  const vp = raw.viewport;
  if (typeof vp.ratio !== "string" || typeof vp.w !== "number" || typeof vp.h !== "number") {
    throw new ParseError("viewport must have {ratio, w, h}", "viewport-shape");
  }
  const tracks = Array.isArray(raw.tracks) ? (raw.tracks as unknown[]) : [];
  const anchors: Record<string, AnchorExprNode> = {};
  if (raw.anchors !== undefined) {
    if (!isRecord(raw.anchors)) {
      throw new ParseError("anchors must be an object", "anchors-shape");
    }
    for (const [key, value] of Object.entries(raw.anchors)) {
      anchors[key] = normalizeAnchor(key, value);
    }
  }
  const anchorLines = scanAnchorLines(text, Object.keys(anchors));
  return {
    raw,
    viewport: { ratio: vp.ratio, w: vp.w, h: vp.h },
    tracks,
    anchors,
    anchorLines,
    rawText: text,
  };
}

function normalizeAnchor(key: string, value: unknown): AnchorExprNode {
  if (typeof value === "number") return value;
  if (typeof value === "string") return { expr: value };
  if (isRecord(value)) {
    if (typeof value.ref === "string") return { ref: value.ref };
    if (typeof value.expr === "string") return { expr: value.expr };
  }
  throw new ParseError(
    `anchor "${key}" must be number | string | {ref} | {expr}`,
    "anchor-shape",
  );
}

// Locate the first occurrence of "key" (quoted, followed by optional whitespace
// then a colon) inside the anchors block. Returns 1-based line number.
function scanAnchorLines(text: string, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (keys.length === 0) return out;
  const block = locateAnchorsBlock(text);
  if (!block) return out;
  for (const key of keys) {
    const re = new RegExp(`"${escapeRegExp(key)}"\\s*:`, "g");
    re.lastIndex = block.start;
    const m = re.exec(text);
    if (m && m.index < block.end) {
      out[key] = countLines(text, m.index);
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countLines(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

interface Block {
  start: number;
  end: number;
}

function locateAnchorsBlock(text: string): Block | null {
  const re = /"anchors"\s*:\s*\{/g;
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  let inStr = false;
  let escape = false;
  while (i < text.length) {
    const c = text[i];
    if (escape) {
      escape = false;
    } else if (inStr) {
      if (c === "\\") escape = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) return { start, end: i };
      }
    }
    i += 1;
  }
  return null;
}
