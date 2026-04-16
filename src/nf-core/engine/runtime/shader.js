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

// Initialize a WebGL context on `canvas`, compile `fragSrc` once, cache program.
// Returns { gl, program, uT, uR, customUniforms } or null if WebGL unsupported.
// TODO(v0.9 implement): compile fragment shader, link program, bind buffer.
export function initShader(canvas, fragSrc) {
  // TODO: gl = canvas.getContext('webgl') || canvas.getContext('webgl2')
  // TODO: compile VERT_SRC (full-screen quad: `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`) + fragSrc, link program, useProgram
  // TODO: allocate full-screen quad buffer
  // TODO: getUniformLocation for uT/uR + scene-declared custom uniforms
  // TODO: on failure, return null so fallback (CSS gradient) kicks in
  void canvas; void fragSrc;
  return null;
}

// Render one frame at time t with resolved uniform values.
// TODO(v0.9 implement): set viewport, upload uT/uR/custom, drawArrays.
export function renderShader(ctx, t, uniforms) {
  // TODO: resize canvas to client size × dpr if changed
  // TODO: gl.viewport(0, 0, W, H)
  // TODO: gl.uniform1f(ctx.uT, t)
  // TODO: gl.uniform2f(ctx.uR, W, H)
  // TODO: apply scene-declared custom uniforms from `uniforms`
  // TODO: gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  void ctx; void t; void uniforms;
}

// Read pixels for frame-pure verification (POC-S1 pattern).
// TODO(v0.9 implement): gl.readPixels into Uint8Array; used by scene-smoke --verify-frame-pure.
export function readPixels(ctx) {
  // TODO: return new Uint8Array(W * H * 4) of current framebuffer contents
  void ctx;
  return null;
}

// CSS fallback when WebGL unavailable (POC-S2).
// TODO(v0.9 implement): set host.style.background = linear-gradient(...) derived from scene hint.
export function cssFallback(host, scene) {
  // TODO: read scene.fallback_gradient or default; set background
  void host; void scene;
}
