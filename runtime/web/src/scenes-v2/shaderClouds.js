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

// Volumetric clouds — multi-layer FBM with lighting, looking up at the sky
const FS = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time, u_speed, u_density;
  uniform vec2 u_resolution;
  uniform vec3 u_cloudColor, u_skyColor, u_lightDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

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

  // FBM with 6 octaves for detailed clouds
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8); // rotation between octaves
    for (int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = rot * p * 2.0 + vec2(100.0);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / u_resolution.y;
    float t = u_time * u_speed;

    // Sky coordinates — looking up
    vec2 sky = (uv - 0.5) * vec2(aspect, 1.0) * 4.0;

    // Two cloud layers drifting at different speeds
    vec2 drift1 = vec2(t * 0.15, t * 0.05);
    vec2 drift2 = vec2(-t * 0.08, t * 0.12);

    float cloud1 = fbm(sky * 1.0 + drift1);
    float cloud2 = fbm(sky * 2.0 + drift2 + vec2(50.0, 80.0));

    // Domain warping for organic shapes
    float warp = fbm(sky * 0.5 + vec2(cloud1 * 0.5, cloud2 * 0.3) + drift1 * 0.5);

    // Combined cloud density
    float density = cloud1 * 0.5 + cloud2 * 0.3 + warp * 0.3;

    // Threshold and shape
    float threshold = 1.0 - u_density;
    float cloud = smoothstep(threshold, threshold + 0.3, density);
    cloud = clamp(cloud, 0.0, 1.0);

    // Lighting: brighter on sun-facing side
    vec3 lightDir = normalize(u_lightDir);
    float eps = 0.05;
    float dL = fbm((sky + lightDir.xz * eps) * 1.0 + drift1);
    float lightAmount = clamp((density - dL) / eps * 2.0, -1.0, 1.0);
    lightAmount = 0.5 + 0.5 * lightAmount;

    // Cloud color: lit side bright, shadow side darker
    vec3 litColor = u_cloudColor;
    vec3 shadowColor = u_cloudColor * 0.4 + u_skyColor * 0.1;
    vec3 cloudCol = mix(shadowColor, litColor, lightAmount);

    // Sun glow near light direction
    vec2 sunPos = vec2(0.5 + lightDir.x * 0.3, 0.5 + lightDir.y * 0.3);
    float sunGlow = exp(-3.0 * length(uv - sunPos));

    // Sky gradient: darker at top, lighter at horizon
    vec3 skyTop = u_skyColor;
    vec3 skyBottom = u_skyColor * 1.3 + vec3(0.1, 0.05, 0.0);
    vec3 sky3 = mix(skyBottom, skyTop, uv.y);
    sky3 += vec3(1.0, 0.8, 0.5) * sunGlow * 0.2;

    // Composite
    vec3 col = mix(sky3, cloudCol, cloud);

    // Subtle silver lining on cloud edges
    float edge = smoothstep(threshold - 0.02, threshold + 0.05, density)
               - smoothstep(threshold + 0.05, threshold + 0.2, density);
    col += vec3(1.0, 0.95, 0.85) * edge * 0.3;

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
  id: "shaderClouds",
  type: "webgl",
  name: "Volumetric Clouds",
  category: "Shader",
  tags: ["clouds", "sky", "volumetric", "shader", "background", "atmosphere"],
  description: "Volumetric cloud layer with FBM noise, directional lighting, and silver linings over a gradient sky",
  params: {
    speed:    { type: "number", default: 0.3, desc: "Cloud drift speed", min: 0.05, max: 2.0 },
    density:  { type: "number", default: 0.5, desc: "Cloud coverage density", min: 0.1, max: 0.9 },
    color:    { type: "string", default: "#ffffff", desc: "Cloud color (hex)" },
    skyColor: { type: "string", default: "#1a1a3e", desc: "Sky background color (hex)" },
    lightDir: { type: "array",  default: [0.5, 0.8, 0.3], desc: "Light direction [x,y,z]" },
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
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 0.3));
    gl.uniform1f(gl.getUniformLocation(program, "u_density"), toNumber(params.density, 0.5));
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height);
    const cc = hexToVec3(params.color || "#ffffff");
    const sc = hexToVec3(params.skyColor || "#1a1a3e");
    gl.uniform3f(gl.getUniformLocation(program, "u_cloudColor"), cc[0], cc[1], cc[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_skyColor"), sc[0], sc[1], sc[2]);
    const ld = parseVec3(params.lightDir, [0.5, 0.8, 0.3]);
    gl.uniform3f(gl.getUniformLocation(program, "u_lightDir"), ld[0], ld[1], ld[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
