#!/bin/bash

set -u

cd "$(dirname "$0")/.."

violations_tmp="$(mktemp)"
trap 'rm -f "$violations_tmp"' EXIT

occurrences=0

while IFS=: read -r file line_no line; do
  [ -n "$file" ] || continue
  occurrences=$((occurrences + 1))

  if printf '%s\n' "$line" | grep -Eq 'println![[:space:]]*\([[:space:]]*"[[:space:]]*\{' ; then
    continue
  fi

  if printf '%s\n' "$line" | grep -Eq 'serde_json::to_string[a-zA-Z_]*[[:space:]]*\(' ; then
    continue
  fi

  var_name="$(printf '%s\n' "$line" | sed -nE 's/.*println![[:space:]]*\([[:space:]]*"\{\}"[[:space:]]*,[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*\).*/\1/p')"
  if [ -n "$var_name" ]; then
    start_line=$((line_no - 3))
    if [ "$start_line" -lt 1 ]; then
      start_line=1
    fi
    context="$(sed -n "${start_line},${line_no}p" "$file")"
    if printf '%s\n' "$context" | grep -Eq "${var_name}.*serde_json::to_string|serde_json::to_string[a-zA-Z_]*.*${var_name}"; then
      continue
    fi
  fi

  printf '%s\t%s\t%s\n' "$file" "$line_no" "$line" >> "$violations_tmp"
done < <(grep -R -n -H 'println!(' src/nf-cli/src --include '*.rs')

node - "$violations_tmp" "$occurrences" <<'NODE'
const fs = require("fs");

const violationsPath = process.argv[2];
const occurrences = Number(process.argv[3]);
const violations = fs.readFileSync(violationsPath, "utf8")
  .split(/\n/)
  .filter(Boolean)
  .map((line) => {
    const [file, lineNumber, snippet] = line.split("\t");
    return { file, line: Number(lineNumber), snippet };
  });

process.stdout.write(JSON.stringify({
  ok: violations.length === 0,
  println_calls_scanned: occurrences,
  violations,
}) + "\n");

process.exit(violations.length === 0 ? 0 : 1);
NODE
