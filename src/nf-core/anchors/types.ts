export interface Issue {
  code: string;
  message: string;
  field?: string;
  fix?: string;
  severity?: "error" | "warning" | "info";
}

export type AnchorPoint = "at" | "begin" | "end";
export type AnchorValue = number | string;

export interface AnchorEntry {
  at?: AnchorValue;
  begin?: AnchorValue;
  end?: AnchorValue;
  label?: string;
  filler?: string;
  expr?: string;
  source?: string;
  words?: Array<Record<string, unknown>>;
}

export type AnchorDict = Record<string, AnchorEntry>;
export type AnchorRef = string;

export type ExprAst =
  | { kind: "ref"; id: AnchorRef; point: AnchorPoint }
  | { kind: "offset"; base: ExprAst; deltaMs: number };

export type RefExprAst = Extract<ExprAst, { kind: "ref" }>;
