# 11 — Comment Standards

## Language

**All comments in English.** No exceptions.

## What to comment

| Must Comment | Example |
|-------------|---------|
| **Why**, not what | `// Skip first frame — it's always black during WebView init` |
| Business logic | `// Pipeline stage order: script → audio → atoms → clips → output` |
| Non-obvious constraints | `// Max 8 parallel workers — macOS IOSurface limit per process` |
| Safety invariants | `// SAFETY: NSWindow is valid for app lifetime, selector exists` |
| API contracts | `// Returns JSON: { ok, result, error }. error includes Fix suggestion.` |
| Workarounds | `// Workaround: WKWebView drops first frame on file:// URLs (WebKit bug)` |
| Edge cases | `// Empty timeline is valid — renders 1 black frame` |

## What NOT to comment

| Don't Comment | Why |
|--------------|-----|
| What the code does | `// increment counter` — code says this |
| Obvious types | `// this is a string` |
| Function names restated | `// handles export start` on `fn handle_export_start` |
| Changelog in code | Use git log |
| TODO/FIXME | Fix it or delete it. Zero TODO in codebase. |
| Commented-out code | Delete it. Git has history. |

## Format

### Rust
```rust
// Single line — lowercase, no period unless multi-sentence.
// Two sentences need periods. Like this.

/// Public API doc comment — imperative mood, first line is summary.
/// Returns the export status for the given process ID.

// SAFETY: <invariant explanation>
unsafe { ... }
```

### JS
```js
// Same rules as Rust — English, why not what.

/** 
 * JSDoc for exported functions only.
 * @param {Object} data - Timeline data
 * @returns {string} HTML string
 */
```

## Density

- **Rust**: ~1 comment per 15-20 lines of code (5-7% of lines)
- **JS**: ~1 comment per 20-25 lines (4-5% of lines)
- **Shell scripts**: ~1 comment per 10 lines (header + section markers)

Too many comments = noise. Too few = tribal knowledge.

## Module headers

Each file starts with a one-line `//!` (Rust) or `//` (JS) describing what this file does:

```rust
//! FFmpeg command builder — constructs encoding CLI args from export settings.
```

```js
// Pipeline clips stage — video source list, clip management, detail panel.
```

## Review checklist

- [ ] All comments in English
- [ ] No TODO/FIXME
- [ ] No commented-out code
- [ ] SAFETY comments on all unsafe blocks
- [ ] Module header on every file
- [ ] Why-comments on non-obvious logic
