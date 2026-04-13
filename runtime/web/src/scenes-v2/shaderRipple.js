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
  uniform float u_time, u_freq, u_amp, u_speed;
  uniform vec2 u_center, u_res;

  void main() {
    vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
    vec2 p = (v_uv - u_center) * aspect;
    float dist = length(p);
    float t = u_time * u_speed;

    // Expanding ripple rings
    float wave = sin(dist * u_freq * 6.2832 - t * 6.2832) * u_amp;
    wave *= smoothstep(0.8, 0.0, dist); // Fade at edges

    // Distort UV
    vec2 offset = normalize(p + 0.001) * wave;
    vec2 uv = v_uv + offset;

    // Dark water-like background with ripple highlights
    float ring = abs(sin(dist * u_freq * 6.2832 - t * 6.2832));
    ring = pow(ring, 4.0) * smoothstep(0.8, 0.0, dist);

    vec3 deepColor = vec3(0.03, 0.05, 0.1);
    vec3 rippleColor = vec3(0.15, 0.35, 0.55);
    vec3 highlight = vec3(0.3, 0.6, 0.9);

    vec3 col = deepColor;
    col += rippleColor * ring * 0.6;
    col += highlight * pow(ring, 8.0) * 0.4;

    // Secondary ripple layer
    float wave2 = sin(dist * u_freq * 3.14 - t * 4.0 + 1.5);
    col += vec3(0.08, 0.15, 0.25) * max(wave2, 0.0) * 0.3 * smoothstep(0.6, 0.0, dist);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default {
  id: "shaderRipple",
  type: "webgl",
  name: "Water Ripple",
  category: "Shader",
  defaultParams: { frequency: 10, amplitude: 0.02, speed: 2.0, center: [0.5, 0.5] },

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
    gl.uniform1f(gl.getUniformLocation(program, "u_freq"), toNumber(params.frequency, 10));
    gl.uniform1f(gl.getUniformLocation(program, "u_amp"), toNumber(params.amplitude, 0.02));
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 2.0));
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), canvas.width, canvas.height);
    const c = Array.isArray(params.center) ? params.center : [0.5, 0.5];
    gl.uniform2f(gl.getUniformLocation(program, "u_center"), toNumber(c[0], 0.5), toNumber(c[1], 0.5));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
