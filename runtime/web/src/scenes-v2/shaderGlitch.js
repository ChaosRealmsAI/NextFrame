import { toNumber } from "../scenes-v2-shared.js";

function compileShader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  return s;
}

function createProgram(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return p;
}

const VS = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FS = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time, u_intensity, u_blockSize, u_colorSplit;
  uniform vec2 u_res;
  uniform bool u_scanlines;

  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 uv = v_uv;
    float t = floor(u_time * 8.0);

    // Block displacement — random rows shift horizontally
    float blockY = floor(uv.y * u_res.y / u_blockSize);
    float shift = (hash(blockY + t * 37.0) - 0.5) * u_intensity * 0.15;
    float trigger = step(0.7 - u_intensity * 0.3, hash(blockY * 3.0 + t));
    uv.x += shift * trigger;

    // RGB channel separation
    float r = hash2(vec2(t, 1.0)) * u_colorSplit * u_intensity;
    float g = hash2(vec2(t, 2.0)) * u_colorSplit * u_intensity;

    // Sample as transparent overlay — use luminance stripes
    float lum = 0.0;
    float stripe = mod(uv.x * u_res.x * 0.5 + uv.y * u_res.y * 0.3, 80.0) / 80.0;
    lum = smoothstep(0.3, 0.7, stripe) * 0.15 * u_intensity;

    float cr = lum + hash2(vec2(floor((uv + vec2(r, 0.0)) * u_res / 4.0))) * 0.05 * u_intensity;
    float cg = lum * 0.6;
    float cb = lum + hash2(vec2(floor((uv - vec2(g, 0.0)) * u_res / 4.0))) * 0.05 * u_intensity;

    // Scanlines
    float scan = 1.0;
    if (u_scanlines) {
      scan = 0.85 + 0.15 * sin(uv.y * u_res.y * 3.14159);
    }

    float alpha = clamp((cr + cg + cb) * 3.0 * scan, 0.0, 0.6);
    gl_FragColor = vec4(cr * scan, cg * scan, cb * scan, alpha);
  }
`;

export default {
  id: "shaderGlitch",
  type: "webgl",
  name: "Glitch Effect",
  category: "Shader",
  defaultParams: { intensity: 0.5, blockSize: 16, colorSplit: 0.02, scanlines: true },

  create(container) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false }) || canvas.getContext("experimental-webgl", { premultipliedAlpha: false });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const program = createProgram(gl, VS, FS);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return { canvas, gl, program };
  },

  update(state, localT, params) {
    const { canvas, gl, program } = state;
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), localT);
    gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), toNumber(params.intensity, 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "u_blockSize"), toNumber(params.blockSize, 16));
    gl.uniform1f(gl.getUniformLocation(program, "u_colorSplit"), toNumber(params.colorSplit, 0.02));
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), canvas.width, canvas.height);
    gl.uniform1i(gl.getUniformLocation(program, "u_scanlines"), params.scanlines !== false ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
