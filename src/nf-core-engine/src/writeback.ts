// WriteBack: apply a sparse edit (same shape as source) to the source text
// via surgical text-range replacement. Preserves whitespace, key order, and
// untouched byte ranges to satisfy L2 (stability), L3 (key order), and L4
// (≤1-line diff per leaf edit).

export interface WriteBackResult {
  output: string;
  diff: string;
  stable: boolean;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

// Span [start, end) of a value in the original text.
interface Span {
  start: number;
  end: number;
}

// -------- minimal JSON scanner with span capture ----------

class Scanner {
  constructor(public readonly src: string) {}
  public i = 0;

  skipWs(): void {
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") this.i += 1;
      else return;
    }
  }

  expect(c: string): void {
    if (this.src[this.i] !== c) {
      throw new Error(`writeback scan: expected "${c}" at ${this.i}`);
    }
    this.i += 1;
  }

  peek(): string {
    return this.src[this.i];
  }

  scanString(): string {
    this.expect('"');
    let out = "";
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === '"') {
        this.i += 1;
        return out;
      }
      if (c === "\\") {
        const n = this.src[this.i + 1];
        this.i += 2;
        if (n === '"' || n === "\\" || n === "/") out += n;
        else if (n === "n") out += "\n";
        else if (n === "t") out += "\t";
        else if (n === "r") out += "\r";
        else if (n === "b") out += "\b";
        else if (n === "f") out += "\f";
        else if (n === "u") {
          const hex = this.src.slice(this.i, this.i + 4);
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 4;
        } else out += n;
      } else {
        out += c;
        this.i += 1;
      }
    }
    throw new Error("writeback scan: unterminated string");
  }

  scanValueSpan(): Span {
    this.skipWs();
    const start = this.i;
    const c = this.src[this.i];
    if (c === '"') {
      this.scanString();
    } else if (c === "{") {
      this.scanObjectSkeleton();
    } else if (c === "[") {
      this.scanArraySkeleton();
    } else {
      while (this.i < this.src.length) {
        const ch = this.src[this.i];
        if (ch === "," || ch === "}" || ch === "]" || ch === " " || ch === "\n" || ch === "\r" || ch === "\t") break;
        this.i += 1;
      }
    }
    return { start, end: this.i };
  }

  scanObjectSkeleton(): void {
    this.expect("{");
    this.skipWs();
    if (this.peek() === "}") {
      this.i += 1;
      return;
    }
    while (true) {
      this.skipWs();
      this.scanString();
      this.skipWs();
      this.expect(":");
      this.scanValueSpan();
      this.skipWs();
      if (this.peek() === ",") {
        this.i += 1;
        continue;
      }
      if (this.peek() === "}") {
        this.i += 1;
        return;
      }
      throw new Error(`writeback scan: expected , or } at ${this.i}`);
    }
  }

  scanArraySkeleton(): void {
    this.expect("[");
    this.skipWs();
    if (this.peek() === "]") {
      this.i += 1;
      return;
    }
    while (true) {
      this.scanValueSpan();
      this.skipWs();
      if (this.peek() === ",") {
        this.i += 1;
        continue;
      }
      if (this.peek() === "]") {
        this.i += 1;
        return;
      }
      throw new Error(`writeback scan: expected , or ] at ${this.i}`);
    }
  }
}

// Locate the value span at the given path. Path elements: string keys for
// objects, number indices for arrays. Returns null when the path does not
// exist in the text (caller can decide to skip or throw).
function findSpan(src: string, path: (string | number)[]): Span | null {
  const s = new Scanner(src);
  s.skipWs();
  return descend(s, path, 0);
}

function descend(s: Scanner, path: (string | number)[], depth: number): Span | null {
  if (depth === path.length) {
    return s.scanValueSpan();
  }
  s.skipWs();
  const c = s.peek();
  const want = path[depth];
  if (c === "{") {
    s.i += 1;
    s.skipWs();
    if (s.peek() === "}") {
      s.i += 1;
      return null;
    }
    while (true) {
      s.skipWs();
      const key = s.scanString();
      s.skipWs();
      s.expect(":");
      if (typeof want === "string" && key === want) {
        return descend(s, path, depth + 1);
      }
      s.scanValueSpan();
      s.skipWs();
      if (s.peek() === ",") {
        s.i += 1;
        continue;
      }
      if (s.peek() === "}") {
        s.i += 1;
        return null;
      }
      throw new Error(`writeback scan: expected , or } at ${s.i}`);
    }
  }
  if (c === "[") {
    s.i += 1;
    s.skipWs();
    let idx = 0;
    if (s.peek() === "]") {
      s.i += 1;
      return null;
    }
    while (true) {
      if (typeof want === "number" && idx === want) {
        return descend(s, path, depth + 1);
      }
      s.scanValueSpan();
      s.skipWs();
      idx += 1;
      if (s.peek() === ",") {
        s.i += 1;
        continue;
      }
      if (s.peek() === "]") {
        s.i += 1;
        return null;
      }
      throw new Error(`writeback scan: expected , or ] at ${s.i}`);
    }
  }
  return null;
}

// -------- sparse-edit diffing ----------

function isObject(v: unknown): v is Record<string, JsonValue> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface LeafEdit {
  path: (string | number)[];
  value: JsonValue;
}

function collectLeafEdits(edit: JsonValue, base: (string | number)[] = []): LeafEdit[] {
  const out: LeafEdit[] = [];
  if (isObject(edit)) {
    for (const [k, v] of Object.entries(edit)) {
      out.push(...collectLeafEdits(v as JsonValue, [...base, k]));
    }
  } else if (Array.isArray(edit)) {
    // Array edits are whole-array replacements (path points at the array).
    out.push({ path: base, value: edit });
  } else {
    out.push({ path: base, value: edit });
  }
  return out;
}

// -------- diff summary ----------

function unifiedDiff(before: string, after: string): string {
  if (before === after) return "";
  const a = before.split("\n");
  const b = after.split("\n");
  const out: string[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(`-${i + 1}: ${a[i]}`);
    if (b[i] !== undefined) out.push(`+${i + 1}: ${b[i]}`);
  }
  return out.join("\n");
}

// -------- public API ----------

export function writeBack(sourceText: string, edit: JsonValue): WriteBackResult {
  const edits = collectLeafEdits(edit);
  const patches: { span: Span; replacement: string }[] = [];

  for (const e of edits) {
    const span = findSpan(sourceText, e.path);
    if (!span) continue;
    const currentText = sourceText.slice(span.start, span.end);
    const replacement = JSON.stringify(e.value);
    if (currentText === replacement) continue;
    patches.push({ span, replacement });
  }

  // Apply right-to-left so earlier offsets stay valid.
  patches.sort((a, b) => b.span.start - a.span.start);
  let output = sourceText;
  for (const p of patches) {
    output = output.slice(0, p.span.start) + p.replacement + output.slice(p.span.end);
  }

  const diff = unifiedDiff(sourceText, output);
  // Re-applying the same edit to the patched output must yield the same text.
  const second = reApply(output, edits);
  const stable = second === output;
  return { output, diff, stable };
}

function reApply(src: string, edits: LeafEdit[]): string {
  const patches: { span: Span; replacement: string }[] = [];
  for (const e of edits) {
    const span = findSpan(src, e.path);
    if (!span) continue;
    const currentText = src.slice(span.start, span.end);
    const replacement = JSON.stringify(e.value);
    if (currentText === replacement) continue;
    patches.push({ span, replacement });
  }
  patches.sort((a, b) => b.span.start - a.span.start);
  let out = src;
  for (const p of patches) {
    out = out.slice(0, p.span.start) + p.replacement + out.slice(p.span.end);
  }
  return out;
}
