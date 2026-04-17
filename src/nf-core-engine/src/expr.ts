// Safe AST expression evaluator. Hand-rolled recursive-descent parser over
// numbers, identifiers, parentheses and the operators + - * / with standard
// precedence. No eval(). Extracts identifier dependencies for topo sort.
//
// NextFrame anchor sugar (kept on top of a generic math grammar):
//   • identifiers may be prefixed with '@' (treated as the bare name)
//   • number literals may carry a unit suffix 'ms' (×1) or 's' (×1000)

export class ExprError extends Error {
  constructor(message: string, public readonly pos: number) {
    super(`${message} at position ${pos}`);
    this.name = "ExprError";
  }
}

type Token =
  | { kind: "num"; value: number; pos: number }
  | { kind: "id"; value: string; pos: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/"; pos: number }
  | { kind: "lp"; pos: number }
  | { kind: "rp"; pos: number }
  | { kind: "eof"; pos: number };

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isIdStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isIdCont(c: string): boolean {
  return isIdStart(c) || isDigit(c);
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lp", pos: i });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rp", pos: i });
      i += 1;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ kind: "op", value: c, pos: i });
      i += 1;
      continue;
    }
    if (isDigit(c) || c === ".") {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i += 1;
      const text = src.slice(start, i);
      const n = Number(text);
      if (!Number.isFinite(n)) throw new ExprError(`invalid number "${text}"`, start);
      // Optional unit suffix: ms (×1) or s (×1000).
      let value = n;
      if (src.startsWith("ms", i)) {
        i += 2;
      } else if (src[i] === "s" && !isIdCont(src[i + 1] ?? "")) {
        value = n * 1000;
        i += 1;
      }
      tokens.push({ kind: "num", value, pos: start });
      continue;
    }
    // '@name' is sugar for the bare identifier `name`.
    if (c === "@") {
      const start = i;
      i += 1;
      if (i >= src.length || !isIdStart(src[i])) {
        throw new ExprError('expected identifier after "@"', start);
      }
      const idStart = i;
      while (i < src.length && isIdCont(src[i])) i += 1;
      tokens.push({ kind: "id", value: src.slice(idStart, i), pos: start });
      continue;
    }
    if (isIdStart(c)) {
      const start = i;
      while (i < src.length && isIdCont(src[i])) i += 1;
      tokens.push({ kind: "id", value: src.slice(start, i), pos: start });
      continue;
    }
    throw new ExprError(`unexpected character "${c}"`, i);
  }
  tokens.push({ kind: "eof", pos: src.length });
  return tokens;
}

type AstNode =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; lhs: AstNode; rhs: AstNode; pos: number }
  | { kind: "neg"; operand: AstNode };

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}
  private peek(): Token {
    return this.tokens[this.i];
  }
  private eat(): Token {
    return this.tokens[this.i++];
  }
  parseExpr(): AstNode {
    const node = this.parseAdd();
    if (this.peek().kind !== "eof") {
      throw new ExprError(`unexpected token near "${describe(this.peek())}"`, this.peek().pos);
    }
    return node;
  }
  private parseAdd(): AstNode {
    let lhs = this.parseMul();
    while (true) {
      const t = this.peek();
      if (t.kind === "op" && (t.value === "+" || t.value === "-")) {
        this.eat();
        const rhs = this.parseMul();
        lhs = { kind: "bin", op: t.value, lhs, rhs, pos: t.pos };
      } else {
        return lhs;
      }
    }
  }
  private parseMul(): AstNode {
    let lhs = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.kind === "op" && (t.value === "*" || t.value === "/")) {
        this.eat();
        const rhs = this.parseUnary();
        lhs = { kind: "bin", op: t.value, lhs, rhs, pos: t.pos };
      } else {
        return lhs;
      }
    }
  }
  private parseUnary(): AstNode {
    const t = this.peek();
    if (t.kind === "op" && (t.value === "+" || t.value === "-")) {
      this.eat();
      const operand = this.parseUnary();
      return t.value === "-" ? { kind: "neg", operand } : operand;
    }
    return this.parsePrimary();
  }
  private parsePrimary(): AstNode {
    const t = this.eat();
    if (t.kind === "num") return { kind: "num", value: t.value };
    if (t.kind === "id") return { kind: "id", value: t.value };
    if (t.kind === "lp") {
      const inner = this.parseAdd();
      const close = this.eat();
      if (close.kind !== "rp") throw new ExprError('expected ")"', close.pos);
      return inner;
    }
    throw new ExprError(`expected value, got "${describe(t)}"`, t.pos);
  }
}

function describe(t: Token): string {
  if (t.kind === "num") return String(t.value);
  if (t.kind === "id") return t.value;
  if (t.kind === "op") return t.value;
  if (t.kind === "lp") return "(";
  if (t.kind === "rp") return ")";
  return "<eof>";
}

export function parseExpr(src: string): AstNode {
  return new Parser(tokenize(src)).parseExpr();
}

export function collectDeps(src: string): string[] {
  const ast = parseExpr(src);
  const out = new Set<string>();
  const walk = (n: AstNode): void => {
    if (n.kind === "id") out.add(n.value);
    else if (n.kind === "bin") {
      walk(n.lhs);
      walk(n.rhs);
    } else if (n.kind === "neg") {
      walk(n.operand);
    }
  };
  walk(ast);
  return [...out];
}

export function evalExpr(src: string, ctx: Record<string, number> = {}): number {
  const ast = parseExpr(src);
  return evalAst(ast, ctx, 0);
}

function evalAst(n: AstNode, ctx: Record<string, number>, pos: number): number {
  if (n.kind === "num") return n.value;
  if (n.kind === "id") {
    if (!(n.value in ctx)) throw new ExprError(`undefined identifier "${n.value}"`, pos);
    return ctx[n.value];
  }
  if (n.kind === "neg") return -evalAst(n.operand, ctx, pos);
  const l = evalAst(n.lhs, ctx, n.pos);
  const r = evalAst(n.rhs, ctx, n.pos);
  switch (n.op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      if (r === 0) throw new ExprError("division by zero", n.pos);
      return l / r;
  }
}
