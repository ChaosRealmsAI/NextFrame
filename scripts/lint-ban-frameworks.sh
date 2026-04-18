#!/usr/bin/env bash
# Scan Cargo.lock + package.json + package-lock.json for banned dependencies
# listed in ban_frameworks.toml. Any hit → FAIL with JSON violation line.
set -euo pipefail

cd "$(dirname "$0")/.."

ban_file="ban_frameworks.toml"
if [ ! -f "$ban_file" ]; then
  printf '{"event":"lint-ban-frameworks.error","reason":"missing ban_frameworks.toml"}\n' >&2
  exit 2
fi

# Extract crates + npm lists via node (avoids a TOML parser dep).
node - "$ban_file" <<'NODE' > /tmp/nf-ban-lists.json
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");

// Very small TOML slice: we only need the two arrays under [deny].
function extractArray(key) {
  // Match `key = [ ... ]` across newlines.
  const re = new RegExp(`${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m");
  const m = src.match(re);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const out = {
  crates: extractArray("crates"),
  npm: extractArray("npm"),
};
process.stdout.write(JSON.stringify(out));
NODE

banned_crates="$(node -e 'const j=require("/tmp/nf-ban-lists.json");console.log(j.crates.join("\n"))')"
banned_npm="$(node -e 'const j=require("/tmp/nf-ban-lists.json");console.log(j.npm.join("\n"))')"

violations=0

# --- Cargo.lock scan ---------------------------------------------------------
if [ -f Cargo.lock ]; then
  while IFS= read -r pkg; do
    [ -n "$pkg" ] || continue
    # Match lines: name = "pkg"
    if grep -Eq "^name = \"${pkg}\"$" Cargo.lock; then
      printf '{"event":"lint-ban-frameworks.violation","scope":"cargo","package":"%s","source":"Cargo.lock"}\n' "$pkg"
      violations=$((violations + 1))
    fi
  done <<< "$banned_crates"
fi

# --- package.json scan (dependencies + devDependencies) ----------------------
scan_pkg_json() {
  local file="$1"
  [ -f "$file" ] || return 0
  while IFS= read -r pkg; do
    [ -n "$pkg" ] || continue
    # JSON key lookup via node — handles quoting / scoping correctly.
    # We use `|| true` + grep for the violation event in stdout instead of
    # relying on node exit codes, because `set -e` inside a while-loop makes
    # non-zero exits bubble up and terminate the whole script.
    out="$(node - "$file" "$pkg" <<'NODE' || true
const fs = require("fs");
const [, , file, pkg] = process.argv;
try {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const hit = (j.dependencies && pkg in j.dependencies) ||
              (j.devDependencies && pkg in j.devDependencies) ||
              (j.peerDependencies && pkg in j.peerDependencies);
  if (hit) {
    process.stdout.write(JSON.stringify({
      event: "lint-ban-frameworks.violation",
      scope: "npm",
      package: pkg,
      source: file,
    }) + "\n");
  }
} catch (e) {
  // Ignore parse errors — let other gates catch them.
}
NODE
)"
    if [ -n "$out" ]; then
      printf '%s\n' "$out"
      violations=$((violations + 1))
    fi
  done <<< "$banned_npm"
}

scan_pkg_json "package.json"
# Scan workspace member manifests too (they live under src/*).
if [ -d src ]; then
  while IFS= read -r pj; do
    scan_pkg_json "$pj"
  done < <(find src -maxdepth 3 -name 'package.json' -not -path '*/node_modules/*')
fi

# --- package-lock.json scan (just grep the top-level packages object names) --
if [ -f package-lock.json ]; then
  while IFS= read -r pkg; do
    [ -n "$pkg" ] || continue
    # Lockfiles list packages under "node_modules/<name>" keys.
    if grep -Eq "\"node_modules/${pkg}\":" package-lock.json 2>/dev/null; then
      printf '{"event":"lint-ban-frameworks.violation","scope":"npm-lock","package":"%s","source":"package-lock.json"}\n' "$pkg"
      violations=$((violations + 1))
    fi
  done <<< "$banned_npm"
fi

rm -f /tmp/nf-ban-lists.json

if [ "$violations" -eq 0 ]; then
  printf '{"event":"lint-ban-frameworks.done","violations":0}\n'
  exit 0
else
  printf '{"event":"lint-ban-frameworks.done","violations":%s}\n' "$violations"
  exit 1
fi
