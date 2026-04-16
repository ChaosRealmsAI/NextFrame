# NextFrame

AI-native video engine. Rust + JS, macOS.

## Before You Write Code

1. Read the crate's CLAUDE.md: `cat src/nf-xxx/CLAUDE.md`
2. Check scene contracts: `node src/nf-cli/bin/nextframe.js scenes`
3. Read the design system: `cat src/nf-core/scenes/shared/design.js`

## Setup
```bash
cargo check --workspace
node src/nf-cli/bin/nextframe.js --help
```

## Testing
```bash
cargo test --workspace
cargo clippy --workspace -- -D warnings
bash scripts/lint-all.sh                 # 10-gate quality check
```

## TypeScript / JavaScript Boundary

Two execution contexts — write TS in the wrong one and the browser build breaks.

- **Node zone (TypeScript OK):** `engine/`, `animation/apply.ts`, CLI commands, filters — full TS syntax
- **Browser-inline zone (JS only):** `scenes/**/*.js`, `animation/effects/*.ts`, `animation/shared.ts`, `scenes/shared/design.js` — these get `stripESM()` and inlined raw into `<script>`. No type annotations (`: string`, `interface`, generics). Content must be valid JS even if file extension is `.ts`.

## Key Conventions
- All crate names start with `nf-`.
- IPC methods use `domain.camelCase`; register in `src/nf-bridge/src/lib.rs`.
- Errors include `Fix:` suggestion or `Internal:` prefix.
- No `unwrap`/`expect`/`panic` in production code.
- Scene components are pure functions: `(t, params, vp) => HTML string`.
- Use `getPreset()` from design.js — no hardcoded colors.
- Prod files ≤ 500 lines, test files ≤ 800 lines.
