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

function hexToVec3(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

const FS = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time, u_count, u_glowSize, u_speed;
  uniform vec3 u_color;
  uniform vec2 u_res;

  // Hash functions for pseudo-random per-particle values
  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  vec2 hash2(float n) {
    return vec2(hash(n), hash(n + 57.0));
  }

  void main() {
    vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
    vec2 p = v_uv * aspect;
    float t = u_time * u_speed;

    vec3 col = vec3(0.02, 0.02, 0.04); // Dark background
    float maxN = u_count;

    for (float i = 0.0; i < 300.0; i++) {
      if (i >= maxN) break;

      // Per-particle random base position and motion
      vec2 base = hash2(i * 13.7);
      float phase = hash(i * 7.3) * 6.2832;
      float spd = 0.3 + hash(i * 3.1) * 0.7;

      vec2 pos = base * aspect;
      pos.x += sin(t * spd * 0.6 + phase) * 0.15;
      pos.y += cos(t * spd * 0.4 + phase * 1.3) * 0.12;
      pos.x = mod(pos.x, aspect.x);
      pos.y = mod(pos.y, 1.0);

      float dist = length(p - pos);
      // Glow falloff
      float glow = u_glowSize / (dist * dist + u_glowSize * 0.5);
      // Flicker
      float flicker = 0.5 + 0.5 * sin(t * 3.0 + phase * 2.0);
      glow *= flicker;
      glow = min(glow, 3.0);

      col += u_color * glow * 0.008;
    }

    col = min(col, vec3(1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default {
  id: "shaderFirefly",
  type: "webgl",
  name: "GPU Fireflies",
  category: "Shader",
  defaultParams: { count: 200, color: "#ffd93d", glowSize: 0.02, speed: 0.5 },

  create(container) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
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
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), localT);
    gl.uniform1f(gl.getUniformLocation(program, "u_count"), Math.min(toNumber(params.count, 200), 300));
    gl.uniform1f(gl.getUniformLocation(program, "u_glowSize"), toNumber(params.glowSize, 0.02));
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 0.5));
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), canvas.width, canvas.height);
    const c = hexToVec3(params.color || "#ffd93d");
    gl.uniform3f(gl.getUniformLocation(program, "u_color"), c[0], c[1], c[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
