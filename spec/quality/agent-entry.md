# nextframe AI Entry

This project uses dev-tools quality gates. Start from `quality`; use the specialist CLIs only when `quality help feature-flow` tells you to.

## First Commands

```bash
quality help agent
quality state
quality help feature-flow
```

## Feature Flow

1. Claim one feature scope with `quality claim --scope feature:<id> --owner <agent-id>`.
2. Prove the risky path with `poc`; use `--kind walking-skeleton` for the minimal real vertical slice.
3. Define acceptance through `bdd`.
4. Index verification commands through `harness`.
5. Define touched module boundaries through `contract`.
6. Record decisions through `devlog`.
7. Run `quality audit --stage spec`, then build, then release.

Do not hand-edit managed JSON under `spec/bdd`, `spec/contracts`, `spec/harness`, `spec/poc`, or `spec/quality`. Use the owning CLI.
