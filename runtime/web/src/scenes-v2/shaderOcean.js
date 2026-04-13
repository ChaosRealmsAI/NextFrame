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

// Ocean waves — multi-layer Gerstner-style waves with lighting, ported from ShaderToy MdXyzX style
const FS = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time, u_speed, u_waveHeight;
  uniform vec2 u_resolution;
  uniform vec3 u_color1, u_color2, u_sunDir;

  // Hash for foam noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Multi-octave wave height function
  float waveHeight(vec2 pos, float t) {
    float h = 0.0;
    // 6 wave layers with different directions/frequencies
    h += sin(pos.x * 1.2 + t * 1.0) * 0.30;
    h += sin(pos.y * 0.9 + t * 0.8) * 0.25;
    h += sin((pos.x * 0.8 + pos.y * 0.6) * 1.5 + t * 1.3) * 0.20;
    h += sin((pos.x * 0.6 - pos.y * 1.1) * 2.0 + t * 0.9) * 0.15;
    h += sin((pos.x * 1.8 + pos.y * 0.4) * 2.5 + t * 1.6) * 0.08;
    h += sin((-pos.x * 0.3 + pos.y * 2.2) * 3.0 + t * 2.1) * 0.05;
    return h;
  }

  // Compute normal from height field
  vec3 waveNormal(vec2 pos, float t, float wh) {
    float eps = 0.02;
    float hL = waveHeight(pos - vec2(eps, 0.0), t) * wh;
    float hR = waveHeight(pos + vec2(eps, 0.0), t) * wh;
    float hD = waveHeight(pos - vec2(0.0, eps), t) * wh;
    float hU = waveHeight(pos + vec2(0.0, eps), t) * wh;
    vec3 n = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
    return n;
  }

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / u_resolution.y;
    float t = u_time * u_speed;

    // World-space position (top-down view of ocean)
    vec2 worldPos = (uv - 0.5) * vec2(aspect, 1.0) * 12.0;

    float wh = u_waveHeight;
    float h = waveHeight(worldPos, t) * wh;
    vec3 normal = waveNormal(worldPos, t, wh);

    // Sun direction (normalized)
    vec3 sunDir = normalize(u_sunDir);
    vec3 viewDir = vec3(0.0, 1.0, 0.0); // looking down

    // Diffuse lighting
    float diff = max(dot(normal, sunDir), 0.0);
    diff = 0.3 + 0.7 * diff;

    // Specular (Blinn-Phong)
    vec3 halfVec = normalize(sunDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 64.0);

    // Depth-based color mixing
    float depth = 0.5 + h * 0.5;
    vec3 waterColor = mix(u_color1, u_color2, depth);

    // Foam at wave crests
    float foam = smoothstep(0.35, 0.55, h) * noise2d(worldPos * 8.0 + t * 0.5);
    foam += smoothstep(0.45, 0.65, h) * 0.3;
    foam = clamp(foam, 0.0, 1.0);

    // Fresnel-like rim
    float fresnel = pow(1.0 - abs(normal.y), 3.0) * 0.3;

    vec3 col = waterColor * diff;
    col += vec3(1.0, 0.95, 0.8) * spec * 0.6;      // sun specular
    col += vec3(0.9, 0.95, 1.0) * foam * 0.7;       // white foam
    col += vec3(0.4, 0.6, 0.8) * fresnel;            // sky reflection

    // Subtle caustic pattern
    float caustic = noise2d(worldPos * 4.0 + vec2(t * 0.2, t * 0.15));
    caustic = pow(caustic, 3.0) * 0.15;
    col += vec3(0.3, 0.7, 0.9) * caustic;

    // Darken edges slightly
    float vig = 1.0 - 0.2 * length(uv - 0.5);
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

function parseVec3(v, fallback) {
  if (Array.isArray(v) && v.length >= 3) return v;
  return fallback;
}

export default {
  id: "shaderOcean",
  type: "webgl",
  name: "Ocean Waves",
  category: "Shader",
  tags: ["ocean", "water", "waves", "shader", "background", "sea"],
  description: "Realistic ocean surface with Gerstner-style waves, specular highlights, foam, and caustics",
  params: {
    speed:        { type: "number", default: 0.5, desc: "Wave animation speed", min: 0.1, max: 3.0 },
    waveHeight:   { type: "number", default: 0.6, desc: "Wave amplitude", min: 0.1, max: 2.0 },
    color1:       { type: "string", default: "#006994", desc: "Deep water color (hex)" },
    color2:       { type: "string", default: "#00b4d8", desc: "Shallow water color (hex)" },
    sunDirection: { type: "array",  default: [0.5, 0.8, 0.3], desc: "Sun direction [x,y,z]" },
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
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 0.5));
    gl.uniform1f(gl.getUniformLocation(program, "u_waveHeight"), toNumber(params.waveHeight, 0.6));
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height);
    const c1 = hexToVec3(params.color1 || "#006994");
    const c2 = hexToVec3(params.color2 || "#00b4d8");
    gl.uniform3f(gl.getUniformLocation(program, "u_color1"), c1[0], c1[1], c1[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_color2"), c2[0], c2[1], c2[2]);
    const sun = parseVec3(params.sunDirection, [0.5, 0.8, 0.3]);
    gl.uniform3f(gl.getUniformLocation(program, "u_sunDir"), sun[0], sun[1], sun[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
