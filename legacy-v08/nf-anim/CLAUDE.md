# nf-anim

1. All leaf JS files must expose a `meta` const, keep a `TODO` comment, and return a sensible stub value.
2. Index files in each subdir must collect siblings through static imports only.
3. Keep `package.json` dependencies empty: no npm dependencies in this crate.
4. Do not add production logic in the walking skeleton; placeholder returns only.
5. The CLI must run without crashing, even when commands return empty output.
6. Keep every file in this crate at or under 50 lines.
7. Frame-pure rule: no `Date.now`, `Math.random`, timers, or rAF in runtime-facing modules.
