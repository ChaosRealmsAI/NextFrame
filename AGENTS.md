# NextFrame

AI-native video editor. Rust + JS, macOS.

## Before You Write Code (mandatory)

1. Read the relevant standard: `cat spec/standards/00-index.md` → find and read the standard for your task
2. Read ADR if changing architecture: `cat spec/cockpit-app/data/dev/adrs.json`
3. Read BDD if working on a feature: `cat spec/cockpit-app/bdd/{module}/bdd.json`
4. Read crate CLAUDE.md: `cat src/nf-xxx/CLAUDE.md`

**No standard found? Say so. Don't guess.**

## Setup
```bash
cargo check --workspace
node src/nf-cli/bin/nextframe.js --help
```

## Standards
```bash
cat spec/standards/00-index.md           # index of all standards
cat spec/standards/general/              # universal rules
cat spec/standards/project/              # NextFrame-specific rules
cat spec/standards/scorecard.md          # quality audit framework
```

## Testing
```bash
cargo test --workspace
bash scripts/lint-all.sh                 # 10-gate quality check
```

## Key Conventions
- All crate names start with `nf-`.
- IPC methods use `domain.camelCase`; register in `src/nf-bridge/src/lib.rs`.
- Errors include `Fix:` suggestion or `Internal:` prefix.
- No `unwrap`/`expect`/`panic` in production code.
- Check scene contracts: `node src/nf-cli/bin/nextframe.js scenes`.
- Prod files ≤ 500 lines, test files ≤ 800 lines.
