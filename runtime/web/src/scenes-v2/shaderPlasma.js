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
  uniform float u_time, u_speed, u_scale;
  uniform int u_colors;

  vec3 palette(float t, int mode) {
    if (mode == 1) {
      return vec3(0.5 + 0.5 * cos(6.2832 * t),
                   0.5 + 0.5 * cos(6.2832 * (t + 0.33)),
                   0.5 + 0.5 * cos(6.2832 * (t + 0.67)));
    }
    if (mode == 2) {
      return vec3(0.5 + 0.5 * sin(6.2832 * t + 0.0),
                   0.5 + 0.5 * sin(6.2832 * t + 2.094),
                   0.5 + 0.5 * sin(6.2832 * t + 4.189));
    }
    // mode 3+: deeper tones
    return vec3(0.4 + 0.4 * cos(6.2832 * (t + 0.0)),
                 0.3 + 0.3 * cos(6.2832 * (t + 0.15)),
                 0.5 + 0.5 * cos(6.2832 * (t + 0.6)));
  }

  void main() {
    vec2 p = (v_uv - 0.5) * u_scale;
    float t = u_time * u_speed;
    float v = sin(p.x * 10.0 + t);
    v += sin(p.y * 10.0 + t * 0.7);
    v += sin((p.x + p.y) * 7.0 + t * 1.3);
    v += sin(length(p) * 12.0 - t * 0.9);
    v *= 0.25;
    v = v * 0.5 + 0.5;

    vec3 col = palette(v + t * 0.05, u_colors);
    col *= 0.75;
    col += vec3(0.03, 0.02, 0.05);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default {
  id: "shaderPlasma",
  type: "webgl",
  name: "Plasma Effect",
  category: "Shader",
  defaultParams: { speed: 1.0, scale: 4.0, colors: 3 },

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
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 1.0));
    gl.uniform1f(gl.getUniformLocation(program, "u_scale"), toNumber(params.scale, 4.0));
    gl.uniform1i(gl.getUniformLocation(program, "u_colors"), toNumber(params.colors, 3));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
