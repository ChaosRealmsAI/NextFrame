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
  uniform float u_density;
  uniform vec3 u_c1, u_c2, u_c3;
  uniform float u_stars;
  uniform vec2 u_res;

  // 3D hash
  float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  // 3D value noise
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash(i);
    float n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0));
    float n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1));
    float n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1));
    float n111 = hash(i + vec3(1,1,1));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
  }

  // 4-octave FBM
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  // 2D hash for stars
  float hash2(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  void main() {
    float t = u_time * u_speed;
    vec2 uv = v_uv;
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;

    // slow rotation
    float angle = t * 0.05;
    float ca = cos(angle), sa = sin(angle);
    vec2 center = vec2(aspect * 0.5, 0.5);
    uv -= center;
    uv = mat2(ca, -sa, sa, ca) * uv;
    uv += center;

    // 3D sample point
    vec3 p = vec3(uv * 3.0 * u_density, t * 0.15);

    // domain warping for richer structure
    float warp = fbm(p);
    p += vec3(warp * 0.8);
    float density = fbm(p);

    // second warp pass
    p += vec3(density * 0.6 - 0.3, density * 0.4, -density * 0.5);
    density = fbm(p);

    // color mapping: density → 3-color gradient
    float cMix = smoothstep(0.2, 0.8, density);
    vec3 col;
    if (cMix < 0.5) {
      col = mix(u_c1, u_c2, cMix * 2.0);
    } else {
      col = mix(u_c2, u_c3, (cMix - 0.5) * 2.0);
    }

    // brightness modulation
    float brightness = smoothstep(0.15, 0.65, density) * 1.2;
    col *= brightness;

    // faint glow core
    float core = smoothstep(0.55, 0.9, density);
    col += vec3(0.15, 0.08, 0.2) * core;

    // stars layer
    if (u_stars > 0.5) {
      vec2 starUV = v_uv * vec2(aspect, 1.0) * 80.0;
      vec2 starCell = floor(starUV);
      vec2 starF = fract(starUV) - 0.5;
      float starHash = hash2(starCell);
      // only ~5% of cells have a star
      if (starHash > 0.95) {
        vec2 starPos = vec2(hash2(starCell + 0.1), hash2(starCell + 0.2)) - 0.5;
        float d = length(starF - starPos * 0.4);
        float starBright = smoothstep(0.08, 0.0, d);
        // twinkle
        starBright *= 0.7 + 0.3 * sin(t * 3.0 + starHash * 50.0);
        col += vec3(starBright);
      }
    }

    // dark background base
    col = max(col, vec3(0.01, 0.005, 0.02));

    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToVec3(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export default {
  id: "shaderNebula",
  type: "webgl",
  name: "Nebula Galaxy",
  category: "Shader",
  tags: ["nebula", "galaxy", "stars", "space", "shader", "background"],
  description: "BBC-grade cosmic nebula with multi-layer FBM gas clouds, 3-color mapping, and twinkling stars",
  params: {
    speed:   { type: "number",  default: 0.2,       desc: "Animation speed",           min: 0, max: 2 },
    density: { type: "number",  default: 0.6,       desc: "Gas cloud density",         min: 0.1, max: 2 },
    color1:  { type: "string",  default: "#4a0080", desc: "Primary nebula color (purple)" },
    color2:  { type: "string",  default: "#0040ff", desc: "Secondary nebula color (blue)" },
    color3:  { type: "string",  default: "#ff0080", desc: "Tertiary nebula color (pink)" },
    stars:   { type: "boolean", default: true,       desc: "Show twinkling stars" },
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
    gl.uniform1f(gl.getUniformLocation(program, "u_speed"), toNumber(params.speed, 0.2));
    gl.uniform1f(gl.getUniformLocation(program, "u_density"), toNumber(params.density, 0.6));
    gl.uniform1f(gl.getUniformLocation(program, "u_stars"), params.stars !== false ? 1.0 : 0.0);
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), canvas.width, canvas.height);
    const c1 = hexToVec3(params.color1 || "#4a0080");
    const c2 = hexToVec3(params.color2 || "#0040ff");
    const c3 = hexToVec3(params.color3 || "#ff0080");
    gl.uniform3f(gl.getUniformLocation(program, "u_c1"), c1[0], c1[1], c1[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c2"), c2[0], c2[1], c2[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c3"), c3[0], c3[1], c3[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
