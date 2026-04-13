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
  uniform float u_viscosity;
  uniform float u_turbulence;
  uniform vec3 u_c1, u_c2, u_c3;
  uniform vec2 u_res;

  // 2D rotation matrix
  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  // smooth hash
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

  // FBM with rotation per octave for swirl
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = rot(0.5);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = r * p * 2.0 + vec2(100.0);
      a *= 0.5;
    }
    return v;
  }

  // curl-like flow field displacement
  vec2 curl(vec2 p, float t) {
    float eps = 0.01;
    float n = fbm(p + vec2(t * 0.1, 0.0));
    float nx = fbm(p + vec2(eps + t * 0.1, 0.0));
    float ny = fbm(p + vec2(t * 0.1, eps));
    return vec2(ny - n, -(nx - n)) / eps * 0.3;
  }

  void main() {
    float t = u_time * u_speed;
    vec2 uv = v_uv;
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;

    // flow field advection — viscosity controls smoothness
    float visc = mix(1.0, 4.0, u_viscosity);
    vec2 flow = curl(uv * visc, t);
    vec2 advected = uv + flow * u_turbulence * 0.5;

    // domain warping for rich fluid structure
    float warp1 = fbm(advected * 3.0 + vec2(t * 0.08, -t * 0.05));
    vec2 q = advected + vec2(warp1 * 0.4, warp1 * 0.3);
    float warp2 = fbm(q * 3.0 + vec2(-t * 0.06, t * 0.09));

    // 3 ink source points that orbit
    vec2 s1 = vec2(aspect * 0.3 + 0.15 * sin(t * 0.3), 0.35 + 0.2 * cos(t * 0.25));
    vec2 s2 = vec2(aspect * 0.65 + 0.12 * cos(t * 0.35), 0.6 + 0.15 * sin(t * 0.4));
    vec2 s3 = vec2(aspect * 0.5 + 0.18 * sin(t * 0.2 + 2.0), 0.5 + 0.2 * cos(t * 0.3 + 1.0));

    // warped distances to sources
    vec2 wp = advected + vec2(warp2 * 0.3);
    float d1 = length(wp - s1);
    float d2 = length(wp - s2);
    float d3 = length(wp - s3);

    // ink concentration with smooth spread
    float spread = 0.3 + u_turbulence * 0.2;
    float ink1 = smoothstep(spread, 0.0, d1);
    float ink2 = smoothstep(spread, 0.0, d2);
    float ink3 = smoothstep(spread, 0.0, d3);

    // color mixing
    vec3 col = vec3(0.01, 0.01, 0.015); // dark water base
    col = mix(col, u_c1, ink1 * 0.8);
    col = mix(col, u_c2, ink2 * 0.8);
    col = mix(col, u_c3, ink3 * 0.7);

    // fine vortex detail overlay
    float vortex = fbm(advected * 8.0 + vec2(t * 0.15, -t * 0.12));
    float vortexDetail = smoothstep(0.35, 0.65, vortex);
    col *= 0.85 + 0.3 * vortexDetail;

    // subtle color bleeding between inks
    float totalInk = ink1 + ink2 + ink3;
    if (totalInk > 0.5) {
      vec3 blendColor = (u_c1 * ink1 + u_c2 * ink2 + u_c3 * ink3) / max(totalInk, 0.001);
      col = mix(col, blendColor * 0.7, smoothstep(0.5, 1.5, totalInk) * 0.3);
    }

    // thin wisps in empty areas
    float wisp = fbm(uv * 12.0 + vec2(t * 0.05));
    float wispMask = smoothstep(0.2, 0.0, totalInk);
    col += vec3(0.02, 0.015, 0.025) * wisp * wispMask;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToVec3(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export default {
  id: "shaderFluid",
  type: "webgl",
  name: "Fluid Ink",
  category: "Shader",
  tags: ["fluid", "ink", "water", "shader", "background", "organic"],
  description: "Colored ink diffusing in water with curl-noise flow field, domain warping, and fine vortex detail",
  params: {
    speed:      { type: "number", default: 1.0,       desc: "Flow animation speed",        min: 0, max: 3 },
    viscosity:  { type: "number", default: 0.5,       desc: "Fluid viscosity (smoothness)", min: 0, max: 1 },
    colors:     { type: "array",  default: ["#ff0040", "#0080ff", "#00ff80"], desc: "Three ink colors" },
    turbulence: { type: "number", default: 0.8,       desc: "Turbulence intensity",        min: 0, max: 2 },
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
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 1.0));
    gl.uniform1f(gl.getUniformLocation(program, "u_viscosity"), toNumber(params.viscosity, 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "u_turbulence"), toNumber(params.turbulence, 0.8));
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), canvas.width, canvas.height);
    const colors = params.colors || ["#ff0040", "#0080ff", "#00ff80"];
    const c1 = hexToVec3(colors[0] || "#ff0040");
    const c2 = hexToVec3(colors[1] || "#0080ff");
    const c3 = hexToVec3(colors[2] || "#00ff80");
    gl.uniform3f(gl.getUniformLocation(program, "u_c1"), c1[0], c1[1], c1[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c2"), c2[0], c2[1], c2[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c3"), c3[0], c3[1], c3[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
