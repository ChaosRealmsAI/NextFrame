// PEG-style recursive-descent parser for anchor expressions.
// Grammar (interfaces.json §3):
//   Expr     = _ Term _ (AddOp _ Term _)*
//   Term     = Duration / AnchorRef
//   AnchorRef= Ident ('.' Ident)?
//   Duration = Number Unit
//   Number   = [0-9]+ ('.' [0-9]+)?
//   Unit     = 'ms' / 's'
//   Ident    = [a-zA-Z_][a-zA-Z0-9_]*
//   AddOp    = '+' / '-'
//   _        = [ \t]*
// Left-associative; no library deps.

import type { ExprAST } from './types.js';

export class ExprParseError extends Error {
  col: number;
  expr: string;
  constructor(message: string, expr: string, col: number) {
    super(`${message} (at col ${col} in '${expr}')`);
    this.name = 'ExprParseError';
    this.col = col;
    this.expr = expr;
  }
}

class Cursor {
  src: string;
  pos: number;
  constructor(src: string) {
    this.src = src;
    this.pos = 0;
  }
  peek(n = 0): string {
    return this.src[this.pos + n] ?? '';
  }
  eof(): boolean {
    return this.pos >= this.src.length;
  }
  skipWs(): void {
    while (!this.eof()) {
      const c = this.peek();
      if (c === ' ' || c === '\t') this.pos++;
      else break;
    }
  }
  match(s: string): boolean {
    if (this.src.startsWith(s, this.pos)) {
      this.pos += s.length;
      return true;
    }
    return false;
  }
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}
function isIdentStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}
function isIdentCont(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

function parseIdent(c: Cursor): string | null {
  if (!isIdentStart(c.peek())) return null;
  const start = c.pos;
  c.pos++;
  while (!c.eof() && isIdentCont(c.peek())) c.pos++;
  return c.src.slice(start, c.pos);
}

function parseNumber(c: Cursor): number | null {
  if (!isDigit(c.peek())) return null;
  const start = c.pos;
  while (!c.eof() && isDigit(c.peek())) c.pos++;
  if (c.peek() === '.' && isDigit(c.peek(1))) {
    c.pos++;
    while (!c.eof() && isDigit(c.peek())) c.pos++;
  }
  const n = Number(c.src.slice(start, c.pos));
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseTerm(c: Cursor): ExprAST {
  c.skipWs();
  // Try Duration first (starts with digit).
  if (isDigit(c.peek())) {
    const n = parseNumber(c);
    if (n === null) throw new ExprParseError('expected number', c.src, c.pos);
    // Unit: 'ms' or 's'. Bare '0' (sentinel for zero time) allowed without unit.
    let unit: string | null = null;
    if (c.match('ms')) unit = 'ms';
    else if (c.match('s')) unit = 's';
    else if (n === 0) unit = 'ms'; // zero sentinel
    else throw new ExprParseError("duration requires unit 'ms' or 's'", c.src, c.pos);
    const ms = unit === 's' ? n * 1000 : n;
    return { type: 'dur', ms };
  }
  // AnchorRef.
  const name = parseIdent(c);
  if (name === null) {
    throw new ExprParseError('expected duration or identifier', c.src, c.pos);
  }
  const path = [name];
  if (c.peek() === '.') {
    c.pos++;
    const field = parseIdent(c);
    if (field === null) throw new ExprParseError("expected field name after '.'", c.src, c.pos);
    path.push(field);
  }
  return { type: 'ref', path };
}

function parseExprInner(c: Cursor): ExprAST {
  let left = parseTerm(c);
  while (true) {
    c.skipWs();
    if (c.eof()) break;
    const op = c.peek();
    if (op !== '+' && op !== '-') break;
    c.pos++;
    const right = parseTerm(c);
    left = { type: 'binop', op, left, right };
  }
  return left;
}

export function parseExpr(src: string): ExprAST {
  if (typeof src !== 'string') {
    throw new ExprParseError('expression must be a string', String(src), 0);
  }
  if (src.length === 0) throw new ExprParseError('empty expression', src, 0);
  const c = new Cursor(src);
  const ast = parseExprInner(c);
  c.skipWs();
  if (!c.eof()) {
    throw new ExprParseError(`unexpected token '${c.peek()}'`, src, c.pos);
  }
  return ast;
}

// Collect every anchor name referenced by an AST. Each 'ref' contributes path[0].
export function collectRefs(ast: ExprAST): string[] {
  const out = new Set<string>();
  const walk = (n: ExprAST): void => {
    if (n.type === 'ref') {
      const head = n.path[0];
      if (head !== undefined) out.add(head);
    } else if (n.type === 'binop') {
      walk(n.left);
      walk(n.right);
    }
  };
  walk(ast);
  return [...out];
}
