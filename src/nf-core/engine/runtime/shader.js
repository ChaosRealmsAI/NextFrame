// ─────────────────────────────────────────────────────────────
// Shader Runtime — WebGL fragment shader glue (v0.9 walking skeleton)
//
// Contract (ADR-020 / architecture/v09-scene-engines.md):
//   scene.render(host, t, params, vp) → { frag: string, uniforms?: object }
//   framework mounts <canvas>, compiles program once, injects uT/uR + custom
//   uniforms each frame, calls drawArrays(TRIANGLE_STRIP, 0, 4).
//
// Frame-pure: GLSL has no time of its own. uT IS t. Same (t, uniforms) →
// same pixels forever.
// ─────────────────────────────────────────────────────────────

const VERT_SRC = `
attribute vec2 p;
void main() {
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const VERT_SRC_300 = `#version 300 es
in vec2 p;
void main() {
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// Initialize a WebGL context on `canvas`, compile `fragSrc` once, cache program.
// Returns { gl, program, uT, uR, customUniforms } or null if WebGL unsupported.
export function initShader(canvas, fragSrc) {
  if (!canvas || typeof canvas.getContext !== "function" || !fragSrc) return null;

  const wantsWebGL2 = /^\s*#version\s+300\s+es\b/m.test(String(fragSrc));
  const gl = getContext(canvas, wantsWebGL2);
  if (!gl) return null;

  const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  const vert = compileShader(gl, gl.VERTEX_SHADER, isWebGL2 ? VERT_SRC_300 : VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, String(fragSrc));
  if (!vert || !frag) {
    if (vert) gl.deleteShader(vert);
    if (frag) gl.deleteShader(frag);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return null;
  }

  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return null;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ]), gl.STATIC_DRAW);

  const p = gl.getAttribLocation(program, "p");
  if (p < 0) {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return null;
  }
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  gl.deleteShader(vert);
  gl.deleteShader(frag);

  const uniforms = discoverUniforms(gl, program);
  return {
    canvas,
    gl,
    program,
    buffer,
    p,
    uT: uniforms.uT,
    uR: uniforms.uR,
    customUniforms: uniforms.customUniforms,
    width: canvas.width || 0,
    height: canvas.height || 0,
  };
}

// Render one frame at time t with resolved uniform values.
export function renderShader(ctx, t, uniforms) {
  if (!ctx || !ctx.gl || !ctx.program) return;

  const gl = ctx.gl;
  const size = resizeCanvas(ctx.canvas);
  ctx.width = size.width;
  ctx.height = size.height;

  gl.useProgram(ctx.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.buffer);
  gl.enableVertexAttribArray(ctx.p);
  gl.vertexAttribPointer(ctx.p, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, size.width, size.height);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (ctx.uT) gl.uniform1f(ctx.uT, finiteNumber(t, 0));
  if (ctx.uR) gl.uniform2f(ctx.uR, size.width, size.height);

  const resolved = uniforms && typeof uniforms === "object" ? uniforms : {};
  const customUniforms = ctx.customUniforms || {};
  for (const name of Object.keys(customUniforms)) {
    if (!Object.prototype.hasOwnProperty.call(resolved, name)) continue;
    applyUniform(gl, customUniforms[name], resolved[name]);
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Read pixels for frame-pure verification (POC-S1 pattern).
export function readPixels(ctx) {
  if (!ctx || !ctx.gl) return new Uint8Array(0);
  const width = Math.max(0, ctx.width || (ctx.canvas && ctx.canvas.width) || 0);
  const height = Math.max(0, ctx.height || (ctx.canvas && ctx.canvas.height) || 0);
  if (!width || !height) return new Uint8Array(0);

  const out = new Uint8Array(width * height * 4);
  ctx.gl.readPixels(0, 0, width, height, ctx.gl.RGBA, ctx.gl.UNSIGNED_BYTE, out);
  return out;
}

// CSS fallback when WebGL unavailable (POC-S2).
export function cssFallback(host, scene) {
  if (!host || !host.style) return;

  const hint = scene && (
    scene.fallback_gradient ||
    scene.fallbackGradient ||
    scene.fallback
  );
  host.style.background = resolveFallbackGradient(hint);
}

function getContext(canvas, wantsWebGL2) {
  const attrs = { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true };
  if (wantsWebGL2) {
    return canvas.getContext("webgl2", attrs) || canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs);
  }
  return canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs) || canvas.getContext("webgl2", attrs);
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function discoverUniforms(gl, program) {
  const out = {
    uT: null,
    uR: null,
    customUniforms: {},
  };
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const baseName = String(info.name).replace(/\[0\]$/, "");
    const location = gl.getUniformLocation(program, info.name) || gl.getUniformLocation(program, baseName);
    if (!location) continue;

    if (baseName === "uT") {
      out.uT = location;
      continue;
    }
    if (baseName === "uR") {
      out.uR = location;
      continue;
    }

    out.customUniforms[baseName] = {
      location,
      type: info.type,
      size: info.size,
    };
  }
  return out;
}

function resizeCanvas(canvas) {
  const dpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const width = Math.max(1, Math.round(((canvas && canvas.clientWidth) || canvas.width || 1) * dpr));
  const height = Math.max(1, Math.round(((canvas && canvas.clientHeight) || canvas.height || 1) * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function applyUniform(gl, info, value) {
  if (!info || !info.location || value == null) return;

  switch (info.type) {
    case gl.FLOAT:
      if (info.size > 1 && isArrayLike(value)) gl.uniform1fv(info.location, toFloat32(value));
      else gl.uniform1f(info.location, finiteNumber(value, 0));
      return;
    case gl.FLOAT_VEC2:
      gl.uniform2fv(info.location, toFloat32(value, 2));
      return;
    case gl.FLOAT_VEC3:
      gl.uniform3fv(info.location, toFloat32(value, 3));
      return;
    case gl.FLOAT_VEC4:
      gl.uniform4fv(info.location, toFloat32(value, 4));
      return;
    case gl.FLOAT_MAT2:
      gl.uniformMatrix2fv(info.location, false, toFloat32(value, 4));
      return;
    case gl.FLOAT_MAT3:
      gl.uniformMatrix3fv(info.location, false, toFloat32(value, 9));
      return;
    case gl.FLOAT_MAT4:
      gl.uniformMatrix4fv(info.location, false, toFloat32(value, 16));
      return;
    case gl.INT:
    case gl.BOOL:
    case gl.SAMPLER_2D:
    case gl.SAMPLER_CUBE:
      if (info.size > 1 && isArrayLike(value)) gl.uniform1iv(info.location, toInt32(value));
      else gl.uniform1i(info.location, finiteInt(value, 0));
      return;
    case gl.INT_VEC2:
    case gl.BOOL_VEC2:
      gl.uniform2iv(info.location, toInt32(value, 2));
      return;
    case gl.INT_VEC3:
    case gl.BOOL_VEC3:
      gl.uniform3iv(info.location, toInt32(value, 3));
      return;
    case gl.INT_VEC4:
    case gl.BOOL_VEC4:
      gl.uniform4iv(info.location, toInt32(value, 4));
      return;
    default:
      if (typeof value === "number") {
        gl.uniform1f(info.location, finiteNumber(value, 0));
        return;
      }
      if (isArrayLike(value)) {
        const arr = toFloat32(value);
        if (arr.length === 2) gl.uniform2fv(info.location, arr);
        else if (arr.length === 3) gl.uniform3fv(info.location, arr);
        else if (arr.length === 4) gl.uniform4fv(info.location, arr);
        else gl.uniform1fv(info.location, arr);
      }
  }
}

function toFloat32(value, minLength) {
  if (ArrayBuffer.isView(value)) {
    const view = value;
    if (view instanceof Float32Array) return view;
    return new Float32Array(view);
  }
  if (Array.isArray(value)) return new Float32Array(value.map((v) => finiteNumber(v, 0)));
  if (typeof value === "number") return new Float32Array(fillArray(minLength || 1, value));
  return new Float32Array(fillArray(minLength || 1, 0));
}

function toInt32(value, minLength) {
  if (ArrayBuffer.isView(value)) {
    const view = value;
    if (view instanceof Int32Array) return view;
    return new Int32Array(view);
  }
  if (Array.isArray(value)) return new Int32Array(value.map((v) => finiteInt(v, 0)));
  if (typeof value === "number" || typeof value === "boolean") return new Int32Array(fillArray(minLength || 1, finiteInt(value, 0)));
  return new Int32Array(fillArray(minLength || 1, 0));
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function finiteInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function fillArray(length, value) {
  const out = [];
  for (let i = 0; i < length; i++) out.push(value);
  return out;
}

function isArrayLike(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function resolveFallbackGradient(hint) {
  if (typeof hint === "string" && hint.trim()) return hint.trim();
  if (Array.isArray(hint) && hint.length >= 2) {
    return `linear-gradient(135deg, ${hint.join(", ")})`;
  }
  if (hint && typeof hint === "object") {
    const colors = Array.isArray(hint.colors) ? hint.colors : null;
    if (colors && colors.length >= 2) {
      const angle = hint.angle != null ? hint.angle : 135;
      return `linear-gradient(${angle}deg, ${colors.join(", ")})`;
    }
  }
  return "radial-gradient(circle at 18% 18%, rgba(212,180,131,0.16), transparent 36%), radial-gradient(circle at 82% 76%, rgba(218,119,86,0.12), transparent 42%), linear-gradient(135deg, #15110c 0%, #1a1510 48%, #241b14 100%)";
}
