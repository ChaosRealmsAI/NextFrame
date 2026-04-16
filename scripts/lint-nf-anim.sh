#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "[nf-anim] exported behavior count"
node -e "import('./src/nf-anim/behaviors/index.js').then(({BEHAVIORS})=>{const n=Object.keys(BEHAVIORS).length;if(n!==50)throw new Error('expected 50 behaviors, got '+n);})"
echo "[nf-anim] behavior files within 50 lines"
while IFS= read -r file; do
  lines=$(wc -l < "$file" | tr -d ' ')
  [[ "$lines" -le 50 ]] || { echo "FAIL: $file has $lines lines"; exit 1; }
done < <(find src/nf-anim/behaviors -name '*.js' | sort)
echo "[nf-anim] no TODOs in behavior/cli scope"
! rg -n '\b(TODO|FIXME|HACK|XXX)\b' src/nf-anim/behaviors src/nf-anim/cli/bin.js src/nf-anim/cli/commands/{list,describe,sample}.js
echo "[nf-anim] cli list/sample"
node --input-type=module -e "import { execSync } from 'node:child_process'; const list = JSON.parse(execSync('node src/nf-anim/cli/bin.js list behaviors --json',{encoding:'utf8'})); if (list.length !== 50) throw new Error('cli returned '+list.length); execSync('node src/nf-anim/cli/bin.js sample behavior fadeIn',{stdio:'ignore'});"
echo "[nf-anim] pass"
