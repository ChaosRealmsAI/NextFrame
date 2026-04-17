#!/bin/bash

set -u

cd "$(dirname "$0")/.."

files_tmp="$(mktemp)"
violations_tmp="$(mktemp)"
trap 'rm -f "$files_tmp" "$violations_tmp"' EXIT

if [ -d src ]; then
  find src \
    -type d \( -name target -o -name node_modules -o -name legacy-v08 \) -prune -o \
    -type f \( -name '*.rs' -o -name '*.js' -o -name '*.ts' -o -name '*.mjs' \) -print \
    >> "$files_tmp"
fi

if [ -d tests ]; then
  find tests \
    -type d \( -name target -o -name node_modules -o -name legacy-v08 \) -prune -o \
    -type f \( -name '*.rs' -o -name '*.js' -o -name '*.ts' -o -name '*.mjs' \) -print \
    >> "$files_tmp"
fi

scanned=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  scanned=$((scanned + 1))
  lines="$(wc -l < "$file" | tr -d ' ')"
  limit=500

  case "$file" in
    *.rs)
      case "$file" in
        */tests/*.rs|tests/*.rs)
          limit=800
          ;;
      esac
      ;;
    *.js|*.ts|*.mjs)
      limit=500
      ;;
  esac

  if [ "$lines" -gt "$limit" ]; then
    printf '%s\t%s\t%s\n' "$file" "$lines" "$limit" >> "$violations_tmp"
  fi
done < "$files_tmp"

node - "$violations_tmp" "$scanned" <<'NODE'
const fs = require("fs");

const violationsPath = process.argv[2];
const scanned = Number(process.argv[3]);
const violations = fs.readFileSync(violationsPath, "utf8")
  .split(/\n/)
  .filter(Boolean)
  .map((line) => {
    const [file, lines, limit] = line.split("\t");
    return { file, lines: Number(lines), limit: Number(limit) };
  });

process.stdout.write(JSON.stringify({
  ok: violations.length === 0,
  files_scanned: scanned,
  violations,
}) + "\n");

process.exit(violations.length === 0 ? 0 : 1);
NODE
