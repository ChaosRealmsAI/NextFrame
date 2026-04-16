export interface Issue {
  code: string;
  message: string;
  field?: string;
  fix?: string;
}

export interface AnchorEntry {
  at?: number;
  begin?: number;
  end?: number;
  label?: string;
  filler?: string;
}

export type AnchorDict = Record<string, AnchorEntry>;
export type AnchorRef = string;

export type ExprAst =
  | { type: "anchor_ref"; ref: AnchorRef }
  | {
      type: "offset";
      expr: { type: "anchor_ref"; ref: AnchorRef };
      op: "+" | "-";
      value: number;
      unit: "s" | "ms";
    };
