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
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform float u_speed;
  uniform float u_zoom;
  uniform float u_segments;
  uniform float u_colorShift;
  uniform vec2 u_res;

  #define PI 3.14159265359

  // 2D hash
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // 2D noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // FBM 4 octaves
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8); // rotation per octave
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = r * p * 2.0 + vec2(100.0);
      a *= 0.5;
    }
    return v;
  }

  // cosine palette
  vec3 palette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.00, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    float t = u_time * u_speed;
    vec2 uv = v_uv - 0.5;
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;

    // slow global rotation
    float rotAngle = t * 0.1;
    float ca = cos(rotAngle), sa = sin(rotAngle);
    uv = mat2(ca, -sa, sa, ca) * uv;

    // cartesian → polar
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // kaleidoscope symmetry
    float segAngle = PI / u_segments;
    angle = mod(angle, segAngle * 2.0);
    if (angle > segAngle) {
      angle = segAngle * 2.0 - angle; // mirror reflection
    }

    // polar → cartesian for FBM sampling
    vec2 kUV = vec2(cos(angle), sin(angle)) * r * u_zoom;

    // time-varying FBM content
    float n1 = fbm(kUV * 3.0 + vec2(t * 0.15, -t * 0.1));
    float n2 = fbm(kUV * 5.0 + vec2(-t * 0.12, t * 0.08) + vec2(n1 * 0.5));
    float n3 = fbm(kUV * 2.0 + vec2(t * 0.05) + vec2(n2 * 0.3));

    // combined pattern
    float pattern = n1 * 0.4 + n2 * 0.35 + n3 * 0.25;

    // color from cosine palette + time shift
    float colorInput = pattern * 2.0 + r * 0.5 + t * u_colorShift * 0.2;
    vec3 col = palette(colorInput);

    // modulate brightness by pattern detail
    float brightness = smoothstep(0.2, 0.7, pattern);
    col *= 0.4 + brightness * 0.8;

    // radial vignette — center brighter
    float vignette = 1.0 - smoothstep(0.2, 0.8, r);
    col *= 0.5 + vignette * 0.6;

    // dark edges
    col *= smoothstep(1.0, 0.6, r);

    // subtle glow at pattern peaks
    float glow = smoothstep(0.6, 0.85, pattern);
    col += col * glow * 0.3;

    // dark background base
    col = max(col, vec3(0.01, 0.008, 0.015));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default {
  id: "shaderKaleidoscope",
  type: "webgl",
  name: "Kaleidoscope",
  category: "Shader",
  tags: ["kaleidoscope", "symmetry", "pattern", "shader", "psychedelic", "background"],
  description: "Infinite-symmetry kaleidoscope with FBM noise content, cosine color palette, and slow rotation",
  params: {
    segments:   { type: "number", default: 6,   desc: "Number of mirror segments", min: 2, max: 16 },
    speed:      { type: "number", default: 0.5, desc: "Animation speed",           min: 0, max: 3 },
    zoom:       { type: "number", default: 2.0, desc: "Pattern zoom level",        min: 0.5, max: 8 },
    colorShift: { type: "number", default: 0.5, desc: "Color cycling speed",       min: 0, max: 2 },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    canvas.width = container.clientWidth || 1920;
    canvas.height = container.clientHeight || 1080;
    container.appendChild(canvas);
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return { canvas, gl: null };
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
    if (!gl) return;
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), localT);
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "u_zoom"), toNumber(params.zoom, 2.0));
    gl.uniform1f(gl.getUniformLocation(program, "u_segments"), toNumber(params.segments, 6));
    gl.uniform1f(gl.getUniformLocation(program, "u_colorShift"), toNumber(params.colorShift, 0.5));
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
