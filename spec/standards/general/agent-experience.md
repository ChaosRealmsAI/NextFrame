# G4 — Agent Experience

AI is the primary developer. The codebase must be optimized for AI agents to read, write, and verify code.

## 1. Self-Describing Features

Every feature is a closed loop — AI reads the interface, not documentation.

| Property | Requirement |
|----------|------------|
| Discoverable | `--help` lists all commands. Unlisted = nonexistent. |
| Understandable | Params have schema with type/default/desc/example. |
| Operable | CLI command or API endpoint for every action. |
| Verifiable | validate/lint/describe to check results. |
| Repairable | Every error includes `Fix:` suggestion. |

**5/5 satisfied = feature complete. Missing any = not done.**

## 2. Three-Layer Defense

```
Layer 1: Compile-time interception (wrong code won't compile)
Layer 2: Runtime observability (see everything at any time)
Layer 3: Verification assertions (auto-check after every change)
```

### Layer 1: Compile-Time
- Clippy deny rules catch crashes before runtime.
- `pub(crate)` default prevents accidental exposure.
- Cargo workspace lint inheritance — new crate can't skip rules.
- Module boundaries enforced by Cargo dependency graph.

### Layer 2: Runtime Observability
- Structured logs: `{"ts":"...","module":"export","event":"start","data":{...}}`
- IPC call chain: every bridgeCall logged with method/params/ok/ms.
- DOM semantic tags: `data-nf-role`, `data-nf-clip-id`, `data-nf-track`.
- State snapshot via eval: AI queries current page/project/timeline anytime.
- Crash dump: `~/.nf-crash/crash-{ts}.json` with backtrace + last 10 logs.

### Layer 3: Verification
- `cargo check -p nf-xxx` for single-module verify (≤5s).
- `validate` for data correctness.
- `lint-scenes` for component compliance.
- `screenshot` for visual verify.
- `lint-all.sh` for full sweep (≤30s).

## 3. Project Documentation

### CLAUDE.md / AGENTS.md

**Purpose: make AI development frictionless.** Not user docs — development aids.

**No hard line limit.** Progressive disclosure — concise but complete. If AI needs it, write it.

#### Must contain:
- Build/test/lint commands
- Module structure with one-line descriptions
- Core constraints AI would violate without knowing
- Where to find detailed info (pointers, not dumps)

#### Trigger conditions (most important section):

**When AI doesn't know how to use something that already exists → add it here.**

Example: recorder has a CLI but AI keeps trying to call it via bridge. Fix:
```markdown
## Tools AI should know about
- Recording: `cargo run -p nf-recorder -- slide timeline.json -o out.mp4`
- TTS: `cargo run -p nf-tts -- synth "text" -o out.mp3`
```

**Pattern: AI tried X but should have used Y → document Y in CLAUDE.md.**

These accumulate over time as you discover gaps. They are the real value of CLAUDE.md.

#### Per-crate CLAUDE.md:
Document what AI would miss about THIS crate:
- Internal tools/scripts AI doesn't know about
- Non-obvious conventions specific to this crate
- Common mistakes AI makes when editing this crate

### Gold Standard Files
- Mark one exemplar per file type: `//! Gold standard: new X should follow this pattern.`
- AI copies the pattern, doesn't invent from scratch.

### Rules for Both
- Every line must pass: "Would AI trip without this?" No → delete it.
- Update when AI repeatedly makes the same mistake.
- Delete rules AI no longer violates — less noise = better compliance.

## 4. Iterative Improvement

```
AI makes mistake → analyze why → fix CLAUDE.md → verify fix
```

**Don't teach AI how to use your product. Record where AI tripped and prevent it.**
