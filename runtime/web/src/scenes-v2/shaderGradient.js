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
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FS = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec3 u_c1, u_c2, u_c3;
  uniform float u_speed;

  void main() {
    float t = u_time * u_speed;
    vec2 p1 = vec2(0.3 + 0.2 * sin(t * 0.7), 0.4 + 0.15 * cos(t * 0.5));
    vec2 p2 = vec2(0.7 + 0.15 * cos(t * 0.6), 0.3 + 0.2 * sin(t * 0.8));
    vec2 p3 = vec2(0.5 + 0.25 * sin(t * 0.4), 0.7 + 0.1 * cos(t * 0.9));
    vec2 p4 = vec2(0.4 + 0.1 * cos(t * 1.1), 0.55 + 0.15 * sin(t * 0.3));

    float d1 = 1.0 - smoothstep(0.0, 0.5, length(v_uv - p1));
    float d2 = 1.0 - smoothstep(0.0, 0.55, length(v_uv - p2));
    float d3 = 1.0 - smoothstep(0.0, 0.45, length(v_uv - p3));
    float d4 = 1.0 - smoothstep(0.0, 0.4, length(v_uv - p4));

    vec3 col = vec3(0.04, 0.03, 0.06);
    col += u_c1 * d1 * 0.6;
    col += u_c2 * d2 * 0.6;
    col += u_c3 * d3 * 0.5;
    col += mix(u_c1, u_c2, 0.5) * d4 * 0.4;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToVec3(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export default {
  id: "shaderGradient",
  type: "webgl",
  name: "GPU Gradient",
  category: "Shader",
  defaultParams: { color1: "#1a0a3e", color2: "#0a2a4e", color3: "#2a0a2e", speed: 0.3 },

  create(container, params) {
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
    return { canvas, gl, program, buf, loc };
  },

  update(state, localT, params) {
    const { canvas, gl, program } = state;
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), localT);
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 0.3));
    const c1 = hexToVec3(params.color1 || "#1a0a3e");
    const c2 = hexToVec3(params.color2 || "#0a2a4e");
    const c3 = hexToVec3(params.color3 || "#2a0a2e");
    gl.uniform3f(gl.getUniformLocation(program, "u_c1"), c1[0], c1[1], c1[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c2"), c2[0], c2[1], c2[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c3"), c3[0], c3[1], c3[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
