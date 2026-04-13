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
  uniform float u_time, u_speed, u_rings, u_twist;
  uniform vec3 u_color;
  uniform vec2 u_res;

  void main() {
    vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x);

    float t = u_time * u_speed;
    // Tunnel: map radius to depth, angle to horizontal
    float depth = 0.3 / (r + 0.001);
    float tex_u = a / 3.14159 + t * u_twist * 0.1;
    float tex_v = depth + t * 2.0;

    // Ring pattern
    float rings = sin(tex_v * u_rings) * 0.5 + 0.5;
    float spiral = sin(tex_u * 6.0 + tex_v * 2.0) * 0.5 + 0.5;
    float pattern = rings * 0.7 + spiral * 0.3;

    // Fade to center (bright) and edges (dark)
    float fade = smoothstep(0.0, 0.15, r) * (1.0 - smoothstep(0.5, 1.2, r));

    vec3 col = u_color * pattern * fade;
    // Add glow near center
    col += u_color * 0.3 * smoothstep(0.15, 0.0, r);
    col += vec3(0.02);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default {
  id: "shaderTunnel",
  type: "webgl",
  name: "Tunnel / Wormhole",
  category: "Shader",
  defaultParams: { speed: 0.5, rings: 8, color: "#6ee7ff", twist: 2.0 },

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
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "u_rings"), toNumber(params.rings, 8));
    gl.uniform1f(gl.getUniformLocation(program, "u_twist"), toNumber(params.twist, 2.0));
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), canvas.width, canvas.height);
    const c = hexToVec3(params.color || "#6ee7ff");
    gl.uniform3f(gl.getUniformLocation(program, "u_color"), c[0], c[1], c[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
