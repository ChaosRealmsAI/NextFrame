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
  uniform float u_time, u_intensity, u_angle;
  uniform bool u_pulse;

  void main() {
    float inten = u_intensity;
    if (u_pulse) {
      inten *= 0.5 + 0.5 * sin(u_time * 2.0);
    }
    float a = u_angle;
    vec2 dir = vec2(cos(a), sin(a)) * inten;

    // Chromatic offset — shift R forward, B backward, G stays
    vec2 uvR = v_uv + dir;
    vec2 uvB = v_uv - dir;

    // Radial vignette intensity — stronger at edges
    float dist = length(v_uv - 0.5) * 2.0;
    float edge = smoothstep(0.2, 1.4, dist);
    float strength = edge * 0.6;

    // Color fringes visible as semi-transparent overlay
    float r = strength * smoothstep(0.0, 0.5, fract(uvR.x * 20.0 + uvR.y * 10.0 + u_time));
    float b = strength * smoothstep(0.0, 0.5, fract(uvB.x * 20.0 + uvB.y * 10.0 - u_time));

    float alpha = max(r, b) * 0.4;
    gl_FragColor = vec4(r * 0.8, 0.0, b * 0.8, alpha);
  }
`;

export default {
  id: "shaderChromatic",
  type: "webgl",
  name: "Chromatic Aberration",
  category: "Shader",
  defaultParams: { intensity: 0.01, angle: 0, pulse: true },

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
    gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), toNumber(params.intensity, 0.01));
    gl.uniform1f(gl.getUniformLocation(program, "u_angle"), toNumber(params.angle, 0));
    gl.uniform1i(gl.getUniformLocation(program, "u_pulse"), params.pulse !== false ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
