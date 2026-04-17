#!/bin/bash

set -u

cd "$(dirname "$0")/.."

if [ ! -d src/nf-tracks/node_modules/acorn ] || [ ! -d src/nf-tracks/node_modules/acorn-walk ]; then
  npm --prefix src/nf-tracks ci --silent 1>&2
fi

files_tmp="$(mktemp)"
violations_tmp="$(mktemp)"
trap 'rm -f "$files_tmp" "$violations_tmp"' EXIT

find src/nf-tracks/official src/nf-tracks/user \
  -type f -name '*.js' \
  -not -name 'loader.js' | sort > "$files_tmp"

scanned=0
status=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  scanned=$((scanned + 1))
  output="$(node src/nf-tracks/scripts/check-abi.mjs "$file")"
  code=$?
  if [ $code -ne 0 ]; then
    status=1
    printf '%s\n' "$output" >> "$violations_tmp"
  fi
done < "$files_tmp"

node - "$violations_tmp" "$scanned" <<'NODE'
const fs = require("fs");

const violationsPath = process.argv[2];
const scanned = Number(process.argv[3]);
const raw = fs.readFileSync(violationsPath, "utf8").trim();
const violations = raw === ""
  ? []
  : raw.split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));

process.stdout.write(JSON.stringify({
  ok: violations.length === 0,
  files_scanned: scanned,
  violations,
}) + "\n");

process.exit(violations.length === 0 ? 0 : 1);
NODE

exit "$status"
