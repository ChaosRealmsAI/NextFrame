# NextFrame CLI v0.1 Code Review

## Overall Score: 6.4/10

## Dimension Scores
| Dimension | Score | Key Finding |
|-----------|-------|-------------|
| Correctness | C | Core render/export paths work, but `imageHero` is effectively nonfunctional in Node and `new` does not do what help text says by default. |
| Error handling | B | Most CLI surfaces return structured `{ok,error}` results cleanly, but preview routes and a few helpers still rely on unchecked assumptions. |
| Consistency | C | Public surface, docs, tests, and AI guidance disagree on scene counts, tool counts, and even default command behavior. |
| File organization | B | Layering is disciplined and architecture checks pass, but `src/cli/ops.js` and `src/engine/time.js` are already straining the size cap. |
| Dead code | C | There is legacy behavior (`makeLegacySeedTimeline`) and duplicate/unused helper logic (`ensureTrack`) that no longer matches the intended surface. |
| Duplication | C | Small helper duplication is spreading across scenes (`normalizeBoolean`) and track helpers. |
| Security | D | The preview server exposes arbitrary local file read/write paths and an unrestricted file-serving route. |
| Performance | B | Render/export paths are straightforward and acceptable for v0.1, though there is obvious headroom in per-frame canvas allocation. |
| Test coverage | C | 74 tests pass, but they miss the preview server, default `new`, clean-install bake dependencies, and `imageHero`. |
| Documentation | D | README, AI guide, and preview prompt are materially stale and no longer describe the shipped surface accurately. |
| API surface | C | `new` and `scenes` do not match the advertised contract; the CLI reports 32 public scenes while the project still claims 33. |
| Dependencies | D | `puppeteer-core` is required at runtime by bake commands but is not declared in `package.json`. |
| Scene contract | C | `arch-2` passes, but one registered scene is hidden from `listScenes()` and still cannot fulfill its advertised purpose. |
| AI readiness | C | The tooling exists, but guidance is stale enough to mislead an agent about available scenes and counts. |

## Checks Run
- `find src -name '*.js' | wc -l` → `72`
- `node --test test/architecture.test.js` → `6/6` pass, with size warnings for `src/cli/ops.js` and `src/engine/time.js`
- `node --test test/` → `74/74` pass in `55399ms`
- `node bin/nextframe.js scenes --json` → `32 scenes`
- `grep -rn "throw " src/ | grep -v "_contract.js"` → internal throws exist, but public CLI paths generally catch them
- `grep -rn "eval(\\|exec(\\|execSync(" src/ bin/` → no matches

## Critical Issues (must fix before v0.2)
1. `[preview/server.mjs:79]`, `[preview/server.mjs:108]`, `[preview/server.mjs:117]`, `[preview/server.mjs:184]` preview path handling is unsandboxed. `resolveTimelinePath()` accepts absolute paths and `..` traversal, and `/api/mp4` serves any path verbatim. I verified `/api/mp4?path=/etc/hosts` returns host-file contents. Why it matters: the preview server can read and overwrite arbitrary local files. Suggested fix: restrict all preview file access to an allowlisted workspace root, reject absolute/traversing input, and treat `/api/mp4` the same way.
2. `[package.json:15]`, `[src/cli/bakeHtml.js:13]`, `[src/cli/bakeBrowser.js:61]` the documented browser bake flow depends on `puppeteer-core`, but the package does not declare it. Why it matters: a clean `npm install` of `nextframe-cli` will not reliably support `bake-html` or `bake-browser`; it only works when the wider environment happens to provide the module. Suggested fix: declare `puppeteer-core` explicitly (or make it an explicit optional dependency with a preflight error), then add a clean-install smoke test.
3. `[src/scenes/_image-cache.js:18]`, `[src/scenes/index.js:105]` `imageHero` is half-shipped. In Node, `loadImage()` returns `null` because it checks for a browser-global `Image`, and the scene is then hidden from `listScenes()` by the public-scene filter. Why it matters: the project claims 33 scenes, but one of them is not actually usable through the normal CLI/AI surface. Suggested fix: load images through `@napi-rs/canvas`, add an end-to-end test, and either publish the scene properly or remove it from the registry until it works.

## Warnings (should fix)
1. `[src/cli/new.js:11]`, `[src/cli/new.js:51]`, `[bin/nextframe.js:40]`, `[README.md:30]` `nextframe new <out.json>` is documented as “create empty timeline”, but the default path still writes a seeded `auroraGradient` clip unless width/height/fps/duration flags are present.
2. `[src/cli/validate.js:17]`, `[src/cli/render.js:76]`, `[src/engine/validate.js:24]` CLI validation uses `process.cwd()` instead of the timeline file’s directory for relative assets. I reproduced a false `MISSING_ASSET` warning by validating `/tmp/nextframe-review-rel/timeline.json` from the repo root. Every command that loads a timeline should pass `projectDir: dirname(resolve(path))`.
3. `[preview/server.mjs:154]`, `[src/views/gantt.js:43]` the preview gantt endpoint imports a non-existent `gantt` export, so `/api/gantt` falls back to literal text `(gantt view missing)` instead of the actual chart.
4. `[README.md:3]`, `[README.md:97]`, `[README.md:111]`, `[README.md:114]`, `[src/cli/guide.js:66]`, `[preview/server.mjs:263]` documentation and AI guidance are stale. The repo now has 74 tests, 12 AI tools, and 32 public scenes; the guide omits `imageHero`; the preview prompt still says “21 scenes”.
5. `[test/architecture.test.js:104]`, `[test/architecture.test.js:122]`, `[test/cli-timeline-ops.test.js:38]` the tests are too loose in exactly the places that regressed. Architecture only checks `>= 21` scenes and `>= 7` tools, and timeline-op coverage only tests `new` with flags, not the documented default path.

## Nits (nice to have)
1. `[src/cli/ops.js:1]`, `[src/engine/time.js:1]` both files are still under the hard failure threshold, but they are already large enough that the current “one more feature” trajectory will make them painful to maintain.
2. `[src/timeline/ops.js:17]`, `[src/cli/ops.js:380]` there are two `ensureTrack()` implementations, and the one in `src/timeline/ops.js` appears unused. That is small but unnecessary surface area.
3. `[src/scenes/orbitRings.js:7]`, `[src/scenes/shapeBurst.js:40]`, `[src/scenes/imageHero.js:28]` the same `normalizeBoolean()` helper has already been copy-pasted across scenes. This is minor now, but it is the sort of duplication that quietly spreads.

## Positive Highlights
- The core CLI is materially better than the stale docs suggest: `node --test test/` passed `74/74`, and the main render/export/bake flows do work in the current environment.
- The architecture discipline is real. Layer checks passed, no `eval`/`exec` usage was found, and scene metadata coverage is strong.
- Browser/video scenes degrade gracefully when caches are missing instead of crashing outright, which is a practical v0.1 choice.
- Error payloads are generally structured and useful, especially in the timeline ops and validation paths.

## Recommendation
Summary: fix-then-ship

The core renderer is viable, but I would not call this a clean v0.1 close yet. The two release-shaping problems are the undeclared browser-bake dependency and the preview server’s arbitrary file access. After that, fix the `imageHero`/scene-count inconsistency and align the docs/tests with the real public surface so humans and AI agents can trust what the tool says about itself.
