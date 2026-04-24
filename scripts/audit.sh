#!/usr/bin/env bash
# audit.sh — NextFrame 7-dim quality audit (bash 3.2+ compatible)
# Usage: ./scripts/audit.sh [--gate-only | --report-only]
# Writes a markdown report to spec/quality-reports/{YYYY-MM-DD-HHMM}.md
# and prints a summary to stdout.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ─── args ────────────────────────────────────────────────────────────────────
MODE="all"
case "${1:-}" in
  --gate-only)   MODE="gate" ;;
  --report-only) MODE="report" ;;
  ""|--all)      MODE="all" ;;
  -h|--help)     echo "Usage: $0 [--gate-only | --report-only]"; exit 0 ;;
  *)             echo "unknown arg: $1" >&2; exit 2 ;;
esac

# ─── setup ───────────────────────────────────────────────────────────────────
TS="$(date +%Y-%m-%d-%H%M)"
DATE="$(date +%Y-%m-%d)"
HM="$(date +%H:%M)"
OUT_DIR="$ROOT/spec/quality-reports"
OUT="$OUT_DIR/${TS}.md"
mkdir -p "$OUT_DIR"

if [ "$MODE" != "report" ]; then
  ./scripts/check-structure.sh >/dev/null || {
    echo "structure gate failed · run ./scripts/check-structure.sh" >&2
    exit 1
  }
fi

VERSION=$(jq -r '.current // "unknown"' spec/roadmap.json 2>/dev/null || echo "unknown")

# Per-dim grade + note (bash 3.2 compatible · no assoc arrays)
GRADE_G1=""; NOTE_G1=""
GRADE_G2=""; NOTE_G2=""
GRADE_P1=""; NOTE_P1=""
GRADE_P2=""; NOTE_P2=""
GRADE_G3=""; NOTE_G3=""
GRADE_P3=""; NOTE_P3=""
GRADE_P4=""; NOTE_P4=""

DIMS="G1 G2 P1 P2 G3 P3 P4"
GATE_DIMS="G1 G2 P1 P2"

dim_name() {
  case "$1" in
    G1) echo "编译 + lint" ;;
    G2) echo "架构边界" ;;
    P1) echo "frame pure" ;;
    P2) echo "3 模式像素" ;;
    G3) echo "AI 可操作" ;;
    P3) echo "视觉 token" ;;
    P4) echo "零框架" ;;
  esac
}
dim_hardness() {
  case "$1" in
    G1|G2|P1|P2) echo "门禁" ;;
    G3|P3|P4)    echo "报告" ;;
  esac
}

# ─── G1 · 编译 + lint ────────────────────────────────────────────────────────
check_g1() {
  local rust_ok clippy_ok fmt_ok ts_ok

  cargo check --workspace --all-targets >/dev/null 2>&1 && rust_ok=1 || rust_ok=0
  cargo clippy --workspace --all-targets -- -D warnings >/dev/null 2>&1 && clippy_ok=1 || clippy_ok=0
  cargo fmt --all -- --check >/dev/null 2>&1 && fmt_ok=1 || fmt_ok=0

  if [ -d frontend/nf-components/node_modules ]; then
    (cd frontend/nf-components && npx --no-install tsc --noEmit) >/dev/null 2>&1 && ts_ok=1 || ts_ok=0
  else
    ts_ok="skip"
  fi

  local sum="rust=$rust_ok clippy=$clippy_ok fmt=$fmt_ok ts=$ts_ok"
  if [ "$rust_ok" = 1 ] && [ "$clippy_ok" = 1 ] && [ "$fmt_ok" = 1 ] && { [ "$ts_ok" = 1 ] || [ "$ts_ok" = "skip" ]; }; then
    GRADE_G1="A"; NOTE_G1="make check 三绿($sum)"
  elif [ "$rust_ok" = 1 ] && [ "$clippy_ok" = 1 ]; then
    GRADE_G1="C"; NOTE_G1="rust 过 · 其他瑕疵($sum)"
  else
    GRADE_G1="F"; NOTE_G1="编译/lint 红($sum)"
  fi
}

# ─── G2 · 架构边界 ────────────────────────────────────────────────────────────
check_g2() {
  local v=0 detail=""
  if grep -E '^(nf-shell|nf-runtime|nf-cli)\s*=' crates/nf-engine/Cargo.toml 2>/dev/null | grep -qv '^#'; then
    v=$((v+1)); detail="$detail engine→其他;"
  fi
  if grep -E '^(nf-cli|nf-shell)\s*=' crates/nf-runtime/Cargo.toml 2>/dev/null | grep -qv '^#'; then
    v=$((v+1)); detail="$detail runtime→cli/shell;"
  fi
  if grep -E '^(nf-cli|nf-runtime)\s*=' crates/nf-shell/Cargo.toml 2>/dev/null | grep -qv '^#'; then
    v=$((v+1)); detail="$detail shell→cli/runtime;"
  fi

  if [ "$v" = 0 ]; then
    GRADE_G2="A"; NOTE_G2="0 违约 · 依赖方向单向"
  elif [ "$v" = 1 ]; then
    GRADE_G2="C"; NOTE_G2="1 违约:$detail"
  elif [ "$v" -le 3 ]; then
    GRADE_G2="D"; NOTE_G2="$v 违约:$detail"
  else
    GRADE_G2="F"; NOTE_G2="$v+ 违约:$detail"
  fi
}

# ─── P1 · frame pure ─────────────────────────────────────────────────────────
check_p1() {
  local loc=0
  if [ -d crates/nf-engine/src ]; then
    loc=$(find crates/nf-engine/src -name '*.rs' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
  fi

  if [ "$loc" -lt 20 ]; then
    GRADE_P1="NA"; NOTE_P1="nf-engine 未实现($loc 行) · v0.3+ 上 property test"
    return
  fi

  local forbidden
  forbidden=$(grep -rEn 'Date::now|Instant::now|SystemTime::now|Math\.random|thread_rng\(\)' \
              crates/nf-engine crates/nf-runtime frontend 2>/dev/null | \
              grep -v '#\[allow' | wc -l | tr -d ' ')

  local test_ok=1
  cargo test -p nf-engine frame_is_pure --no-fail-fast >/dev/null 2>&1 || test_ok=0

  if [ "$test_ok" = 1 ] && [ "$forbidden" = 0 ]; then
    GRADE_P1="A"; NOTE_P1="property test 绿 · 0 禁用"
  elif [ "$test_ok" = 1 ] && [ "$forbidden" -le 3 ]; then
    GRADE_P1="B"; NOTE_P1="property test 绿 · $forbidden 处 allow"
  elif [ "$test_ok" = 1 ]; then
    GRADE_P1="C"; NOTE_P1="property test 绿 · $forbidden 处禁用"
  else
    GRADE_P1="F"; NOTE_P1="property test 红 / 不存在"
  fi
}

# ─── P2 · 3 模式像素 ──────────────────────────────────────────────────────────
check_p2() {
  local loc=0
  if [ -d crates/nf-runtime/src ]; then
    loc=$(find crates/nf-runtime/src -name '*.rs' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
  fi

  if [ "$loc" -lt 20 ]; then
    GRADE_P2="NA"; NOTE_P2="nf-runtime 未实现($loc 行) · v0.3+ 上 diff harness"
    return
  fi

  local test_ok=1
  cargo test -p nf-runtime three_modes_pixel_equal --no-fail-fast >/dev/null 2>&1 || test_ok=0

  if [ "$test_ok" = 1 ]; then
    GRADE_P2="A"; NOTE_P2="three_modes_pixel_equal 绿"
  else
    GRADE_P2="F"; NOTE_P2="three_modes_pixel_equal 红 / 不存在"
  fi
}

# ─── G3 · AI 可操作 ──────────────────────────────────────────────────────────
check_g3() {
  local cli_main="crates/nf-cli/src/main.rs"
  local loc=0 has_clap=0 has_help=0 schema_count=0 bdd_ai=0

  [ -f "$cli_main" ] && loc=$(wc -l <"$cli_main" | tr -d ' ')
  grep -q '^clap' crates/nf-cli/Cargo.toml 2>/dev/null && has_clap=1
  [ -f "$cli_main" ] && grep -qE '\-\-help|\.about\(' "$cli_main" 2>/dev/null && has_help=1

  if [ -d spec/contracts/schemas ]; then
    schema_count=$(find spec/contracts/schemas -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [ -d spec/bdd ]; then
    bdd_ai=$(grep -rl 'ai_tools' spec/bdd/ 2>/dev/null | wc -l | tr -d ' ')
  fi

  local score=0
  [ "$has_clap" = 1 ] && score=$((score+3))
  [ "$has_help" = 1 ] && score=$((score+3))
  [ "$schema_count" -gt 0 ] && score=$((score+2))
  [ "$bdd_ai" -gt 0 ] && score=$((score+2))

  case "$score" in
    10)     GRADE_G3="A" ;;
    9|8)    GRADE_G3="B" ;;
    7|6)    GRADE_G3="C" ;;
    5|4|3)  GRADE_G3="D" ;;
    *)      GRADE_G3="F" ;;
  esac
  NOTE_G3="clap=$has_clap help=$has_help schemas=$schema_count bdd_ai_tools=$bdd_ai · score=$score/10"
}

# ─── P3 · 视觉 token ──────────────────────────────────────────────────────────
check_p3() {
  local ui_files=0 hits=0

  for d in frontend/nf-components/src spec/design/prototypes spec/design/examples; do
    [ -d "$d" ] && ui_files=$((ui_files + $(find "$d" -type f \( -name '*.css' -o -name '*.ts' -o -name '*.html' \) 2>/dev/null | wc -l | tr -d ' ')))
  done

  if [ "$ui_files" = 0 ]; then
    GRADE_P3="NA"; NOTE_P3="无产品 UI 文件"
    return
  fi

  local scan_dirs=""
  for d in frontend/nf-components/src spec/design/prototypes spec/design/examples; do
    [ -d "$d" ] && scan_dirs="$scan_dirs $d"
  done

  if [ -n "$scan_dirs" ]; then
    hits=$(grep -rEn '#[0-9a-fA-F]{3,6}\b|rgb\(|hsl\(' $scan_dirs 2>/dev/null | \
           grep -v 'tokens\.css' | grep -v '\.md:' | wc -l | tr -d ' ')
  fi

  if [ "$hits" = 0 ]; then
    GRADE_P3="A"; NOTE_P3="0 硬编码($ui_files UI 文件)"
  elif [ "$hits" -le 5 ]; then
    GRADE_P3="B"; NOTE_P3="$hits 硬编码($ui_files UI 文件)"
  elif [ "$hits" -le 20 ]; then
    GRADE_P3="C"; NOTE_P3="$hits 硬编码"
  elif [ "$hits" -le 50 ]; then
    GRADE_P3="D"; NOTE_P3="$hits 硬编码"
  else
    GRADE_P3="F"; NOTE_P3="$hits 硬编码 · 严重 drift"
  fi
}

# ─── P4 · 零框架 ──────────────────────────────────────────────────────────────
check_p4() {
  local rust_bad=0 npm_bad=0 bad_names=""

  while IFS= read -r line; do
    [ -n "$line" ] && rust_bad=$((rust_bad+1)) && bad_names="$bad_names $(echo "$line" | awk -F= '{print $1}' | tr -d ' ')"
  done < <(grep -hE '^(tauri|bevy|iced|slint|egui|druid|actix-web|rocket|diesel)\s*=' crates/*/Cargo.toml Cargo.toml 2>/dev/null || true)

  if [ -f frontend/nf-components/package.json ]; then
    while IFS= read -r name; do
      [ -n "$name" ] && npm_bad=$((npm_bad+1)) && bad_names="$bad_names $name"
    done < <(jq -r '(.dependencies // {}) + (.devDependencies // {}) | keys[]' \
             frontend/nf-components/package.json 2>/dev/null | \
             grep -E '^(react|vue|svelte|next|nuxt|electron|@tauri-apps|@electron)' || true)
  fi

  local total=$((rust_bad + npm_bad))
  if [ "$total" = 0 ]; then
    GRADE_P4="A"; NOTE_P4="0 禁框架"
  elif [ "$total" = 1 ]; then
    GRADE_P4="C"; NOTE_P4="1 禁框架:$bad_names"
  elif [ "$total" -le 2 ]; then
    GRADE_P4="D"; NOTE_P4="$total 禁框架:$bad_names"
  else
    GRADE_P4="F"; NOTE_P4="$total 禁框架:$bad_names"
  fi
}

# ─── helpers: indirect read ──────────────────────────────────────────────────
grade_of() { eval "printf '%s' \"\${GRADE_$1}\""; }
note_of()  { eval "printf '%s' \"\${NOTE_$1}\""; }

grade_to_score() {
  case "$1" in
    A) echo 10 ;; B) echo 8 ;; C) echo 6 ;; D) echo 4 ;; F) echo 0 ;;
    *) echo "" ;;
  esac
}

compute_total() {
  local sum=0 count=0 g s
  for dim in $DIMS; do
    g=$(grade_of "$dim")
    s=$(grade_to_score "$g")
    if [ -n "$s" ]; then
      sum=$((sum + s))
      count=$((count + 1))
    fi
  done
  if [ "$count" = 0 ]; then
    echo "N/A"
  else
    awk "BEGIN {printf \"%.1f\", $sum / $count}"
  fi
}

count_gate() {
  local green=0 red=0 na=0 g
  for dim in $GATE_DIMS; do
    g=$(grade_of "$dim")
    case "$g" in
      A|B|C) green=$((green+1)) ;;
      D|F)   red=$((red+1)) ;;
      *)     na=$((na+1)) ;;
    esac
  done
  echo "$green $red $na"
}

# ─── run ─────────────────────────────────────────────────────────────────────
echo "==> NextFrame audit @ $TS · version=$VERSION · mode=$MODE"

if [ "$MODE" = "all" ] || [ "$MODE" = "gate" ]; then
  echo "  [G1] 编译 + lint..."; check_g1
  echo "  [G2] 架构边界..."; check_g2
  echo "  [P1] frame pure..."; check_p1
  echo "  [P2] 3 模式像素..."; check_p2
fi

if [ "$MODE" = "all" ] || [ "$MODE" = "report" ]; then
  echo "  [G3] AI 可操作..."; check_g3
  echo "  [P3] 视觉 token..."; check_p3
  echo "  [P4] 零框架..."; check_p4
fi

TOTAL=$(compute_total)
set -- $(count_gate)
GATE_GREEN=$1; GATE_RED=$2; GATE_NA=$3

# ─── 写报告 ──────────────────────────────────────────────────────────────────
{
  echo "# NextFrame 质量审计 · $DATE $HM"
  echo ""
  echo "**版本**: \`$VERSION\`"
  echo "**模式**: $MODE"
  echo "**总分**: $TOTAL / 10"
  echo "**门禁**: $GATE_GREEN 绿 / $GATE_RED 红 / $GATE_NA N/A (4 硬门禁中)"
  echo ""
  echo "## 维度打分"
  echo ""
  echo "| # | 维度 | 硬度 | 分 | 说明 |"
  echo "|---|---|---|---|---|"
  for dim in $DIMS; do
    g=$(grade_of "$dim"); [ -z "$g" ] && g="—"
    n=$(note_of "$dim");  [ -z "$n" ] && n="(未跑)"
    echo "| $dim | $(dim_name $dim) | $(dim_hardness $dim) | **$g** | $n |"
  done
  echo ""
  echo "## 关注项"
  echo ""
  for dim in $DIMS; do
    g=$(grade_of "$dim")
    n=$(note_of "$dim")
    case "$g" in
      D|F) echo "- 🔴 **$dim** $g: $n" ;;
      C)   echo "- 🟡 **$dim** C: $n" ;;
      NA)  echo "- ⚪ **$dim** N/A: $n" ;;
    esac
  done
  echo ""
  echo "---"
  echo ""
  echo "_自动产出 · \`./scripts/audit.sh\` · 标准见 \`spec/standards/\`_"
} > "$OUT"

# ─── stdout ─────────────────────────────────────────────────────────────────
echo ""
echo "==> 总分: $TOTAL / 10 · 门禁: $GATE_GREEN 绿 / $GATE_RED 红 / $GATE_NA N/A"
for dim in $DIMS; do
  printf "    %-4s  %-3s  %s\n" "$dim" "$(grade_of $dim)" "$(note_of $dim)"
done
echo ""
echo "==> 报告: $OUT"

# ─── 退出码 ──────────────────────────────────────────────────────────────────
for dim in $GATE_DIMS; do
  g=$(grade_of "$dim")
  case "$g" in
    D|F) echo "==> ❌ 门禁 $dim=$g · 阻合并"; exit 1 ;;
  esac
done
echo "==> ✅ 门禁全过(或 N/A)"
exit 0
