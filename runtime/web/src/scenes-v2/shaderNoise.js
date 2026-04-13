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
  uniform float u_time, u_scale, u_speed;
  uniform int u_octaves;
  uniform vec3 u_c1, u_c2;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec2 mod289v2(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865, 0.366025404, -0.577350269, 0.024390244);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 p = v_uv * u_scale;
    float t = u_time * u_speed;
    float val = 0.0; float amp = 0.5; float freq = 1.0;
    for (int i = 0; i < 8; i++) {
      if (i >= u_octaves) break;
      val += amp * snoise(p * freq + t * 0.3 * float(i + 1));
      freq *= 2.0; amp *= 0.5;
    }
    val = val * 0.5 + 0.5;
    vec3 col = mix(u_c1 * 0.15, u_c2 * 0.8, val);
    col += vec3(0.03, 0.02, 0.05);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToVec3(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export default {
  id: "shaderNoise",
  type: "webgl",
  name: "Simplex Noise",
  category: "Shader",
  defaultParams: { scale: 3.0, speed: 0.5, color1: "#6ee7ff", color2: "#a78bfa", octaves: 4 },

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
    gl.uniform1f(gl.getUniformLocation(program, "u_scale"), toNumber(params.scale, 3.0));
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 0.5));
    gl.uniform1i(gl.getUniformLocation(program, "u_octaves"), toNumber(params.octaves, 4));
    const c1 = hexToVec3(params.color1 || "#6ee7ff");
    const c2 = hexToVec3(params.color2 || "#a78bfa");
    gl.uniform3f(gl.getUniformLocation(program, "u_c1"), c1[0], c1[1], c1[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c2"), c2[0], c2[1], c2[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
