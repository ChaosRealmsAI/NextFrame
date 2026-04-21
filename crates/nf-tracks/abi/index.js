// nf-tracks ABI — contract document + runtime loader helper.
//
// This file is NOT the ABI itself. The ABI is the convention each Track .js
// file follows (see `describeContract` below). This module only exposes:
//   - describeContract(): JSON describing the convention, so engine/runtime
//                         can dynamically validate a Track source.
//   - loadTrack(source, sandbox): evaluate a Track .js source in an isolated
//                                 scope and return { describe, sample, render }.
//
// Per ADR-033 (Track ABI v1.1) + ADR-024 (底契约):
//   - each Track is ONE .js file
//   - zero imports (no static `import`, no `require`, no dynamic import)
//   - exports exactly three pure functions: describe / sample / render
//   - render(t, params, viewport) must be pure
//   - render at t=0 must have main-element opacity >= 0.9 (FM-T0 gate)

export const ABI_VERSION = "1.1";

export function describeContract() {
  return {
    version: ABI_VERSION,
    file_shape: {
      module_system: "ES modules (export statements)",
      imports_allowed: "NONE",
      single_file: true,
      pure_functions_only: true,
    },
    required_exports: {
      describe: {
        signature: "() => TrackDescriptor",
        TrackDescriptor: {
          id: "string (kebab-case track identifier)",
          name: "string (human-readable display name)",
          viewport: "'16:9' | '9:16' | '1:1' | 'any'",
          t0_visibility: "number — target min opacity at t=0 (>= 0.9)",
          params: "JSON Schema draft-07 object describing Clip.params",
        },
      },
      sample: {
        signature: "() => ClipParams",
        purpose:
          "Self-documenting demo Clip.params used by lint-track and `nf schema`. Must conform to describe().params.",
      },
      render: {
        signature: "(t: number, params: any, viewport: { w:number, h:number }) => string",
        contract: [
          "t: absolute ms since clip.begin (0 = clip start)",
          "params: validated against describe().params at compile time",
          "viewport: pixel dims matching timeline.viewport",
          "returns: HTML string (innerHTML semantics, no <html>/<body>)",
        ],
        purity: "same (t, params, viewport) => same HTML string",
        fm_t0_gate:
          "render(0, sample(), viewport) must contain an element with computed opacity >= 0.9",
      },
    },
    forbidden: [
      "static `import` statements",
      "`require(...)` calls",
      "dynamic `import(...)` / `await import(...)`",
      "reading or writing globals (window, document, fetch, localStorage)",
      "Date.now — use the t parameter instead",
      "Math.random without params-provided seed",
      "any side effects in render()",
    ],
    gates: {
      "zero-import": "source regex scan must find no import/require/await import",
      "three-exports": "source must define describe, sample, render",
      "describe-schema-valid": "describe().params must be a valid JSON Schema draft-07",
      "sample-passes-describe": "sample() must conform to describe().params",
      "t0-gate": "render(0, sample(), {w,h}) max opacity >= 0.9",
    },
  };
}

// loadTrack(source, sandbox = {})
//   Evaluate a Track source string in an isolated scope and return its
//   three exports. We DO NOT use eval(). Instead we rewrite `export function`
//   into `function ... ; __nfExports.X = X` inside a new Function body so the
//   source can declare exports idiomatically while we still recover them.
//
//   sandbox: optional object of bindings to expose as locals (e.g. custom
//            Math). By default the Function sees only globalThis.
//
//   Returns: { describe, sample, render }
//
//   Throws: on syntax error, or if any of the 3 exports is missing.
export function loadTrack(source, sandbox = {}) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("loadTrack: source must be a non-empty string");
  }

  // Rewrite `export function X(` → `function X(` while recording names for
  // later binding. Only touches top-level `export function` declarations.
  const exportNames = [];
  const rewritten = source.replace(
    /^(\s*)export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    (_m, indent, name) => {
      exportNames.push(name);
      return `${indent}function ${name}(`;
    },
  );

  const sandboxKeys = Object.keys(sandbox);
  const sandboxVals = sandboxKeys.map((k) => sandbox[k]);

  const body =
    '"use strict";\n' +
    rewritten +
    "\n;const __nfExports = {};\n" +
    exportNames
      .map((n) => `if (typeof ${n} === 'function') __nfExports.${n} = ${n};`)
      .join("\n") +
    "\nreturn __nfExports;\n";

  // eslint-disable-next-line no-new-func
  const fn = new Function(...sandboxKeys, body);
  const exp = fn(...sandboxVals);

  const missing = ["describe", "sample", "render"].filter(
    (n) => typeof exp[n] !== "function",
  );
  if (missing.length > 0) {
    throw new Error(
      `loadTrack: missing required exports: ${missing.join(", ")}`,
    );
  }

  return {
    describe: exp.describe,
    sample: exp.sample,
    render: exp.render,
  };
}
