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

// Realistic fire — FBM + domain warping, ported from ShaderToy MdX3zr style
const FS = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time, u_speed, u_intensity, u_scale;
  uniform vec2 u_resolution;
  uniform vec3 u_baseColor, u_tipColor;

  // Hash-based 3D noise
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  // FBM with 4 octaves
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; i++) {
      v += a * noise3d(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = (uv - vec2(0.5, 0.0)) * u_scale;
    p.x *= aspect;

    float t = u_time * u_speed;

    // Domain warping for organic look
    vec3 q = vec3(p, t * 0.5);
    float f1 = fbm(q);
    float f2 = fbm(q + vec3(f1 * 1.2, f1 * 0.8, 0.0));

    // Fire shape: strong at bottom, fading upward
    float fireShape = 1.0 - uv.y;
    fireShape = pow(fireShape, 1.5);

    // Turbulence
    float turb = fbm(vec3(p * 3.0, t * 0.7)) * 0.5;
    turb += fbm(vec3(p * 6.0 + vec2(t * 0.3, -t * 2.0), t)) * 0.25;

    // Rising motion
    float rising = fbm(vec3(p.x * 2.0, p.y * 1.5 - t * 1.5, t * 0.3));

    float fire = fireShape * (0.6 + turb + rising * 0.4 + f2 * 0.3) * u_intensity;
    fire = clamp(fire, 0.0, 1.0);

    // Color mapping: black -> base -> tip -> white
    vec3 col = vec3(0.0);
    if (fire > 0.0) {
      // 4-stop gradient
      float f = fire;
      vec3 c1 = vec3(0.05, 0.0, 0.0);           // dark core
      vec3 c2 = u_baseColor;                       // base color (red-orange)
      vec3 c3 = u_tipColor;                        // tip color (yellow)
      vec3 c4 = vec3(1.0, 1.0, 0.95);             // white hot

      if (f < 0.33) {
        col = mix(c1, c2, f / 0.33);
      } else if (f < 0.66) {
        col = mix(c2, c3, (f - 0.33) / 0.33);
      } else {
        col = mix(c3, c4, (f - 0.66) / 0.34);
      }

      // Intensity glow
      col *= (0.8 + 0.4 * fire);
    }

    // Slight vignette
    float vig = 1.0 - 0.3 * length(uv - 0.5);
    col *= vig;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToVec3(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

export default {
  id: "shaderFire",
  type: "webgl",
  name: "Realistic Fire",
  category: "Shader",
  tags: ["fire", "flame", "shader", "background", "fbm", "noise"],
  description: "Realistic fire effect using FBM noise and domain warping, with configurable flame colors and intensity",
  params: {
    intensity: { type: "number", default: 1.0, desc: "Fire brightness/strength", min: 0.1, max: 3.0 },
    speed:     { type: "number", default: 1.0, desc: "Animation speed", min: 0.1, max: 5.0 },
    baseColor: { type: "string", default: "#ff4400", desc: "Base flame color (hex)" },
    tipColor:  { type: "string", default: "#ffee00", desc: "Tip flame color (hex)" },
    scale:     { type: "number", default: 2.0, desc: "Flame scale", min: 0.5, max: 5.0 },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container) {
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
    return { canvas, gl, program };
  },

  update(state, localT, params) {
    if (!state.gl) return;
    const { canvas, gl, program } = state;
    const cw = canvas.parentElement?.clientWidth || canvas.width;
    const ch = canvas.parentElement?.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), localT);
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 1.0));
    gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), toNumber(params.intensity, 1.0));
    gl.uniform1f(gl.getUniformLocation(program, "u_scale"), toNumber(params.scale, 2.0));
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height);
    const base = hexToVec3(params.baseColor || "#ff4400");
    const tip = hexToVec3(params.tipColor || "#ffee00");
    gl.uniform3f(gl.getUniformLocation(program, "u_baseColor"), base[0], base[1], base[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_tipColor"), tip[0], tip[1], tip[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
