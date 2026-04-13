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
  uniform float u_intensity;
  uniform float u_curtainCount;
  uniform vec3 u_c1, u_c2, u_c3;
  uniform vec2 u_res;

  // smooth noise
  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash(i), hash(i + 1.0), f);
  }

  // multi-octave noise for smooth curtain displacement
  float fbmNoise(float x) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(x);
      x *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float t = u_time * u_speed;
    vec2 uv = v_uv;
    float aspect = u_res.x / u_res.y;

    vec3 col = vec3(0.005, 0.008, 0.02); // dark sky base

    int curtains = int(u_curtainCount);

    // accumulate multiple aurora curtains
    for (int i = 0; i < 8; i++) {
      if (i >= curtains) break;

      float fi = float(i);
      float phase = fi * 1.7 + fi * fi * 0.3;
      float curtainSpeed = 0.3 + fi * 0.12;

      // curtain center X position sways
      float centerX = 0.15 + fi * 0.12 + 0.08 * sin(t * curtainSpeed + phase);

      // curtain shape: vertical band with noise-warped edges
      float dx = uv.x - centerX;
      float warp = fbmNoise(uv.y * 3.0 + t * 0.4 + phase) * 0.15;
      dx += warp;

      // curtain width varies along height
      float width = 0.06 + 0.03 * sin(uv.y * 4.0 + t * 0.2 + fi);

      // soft curtain shape
      float curtain = exp(-dx * dx / (width * width));

      // vertical intensity: bright at bottom, fades at top (real aurora)
      float vertFade = smoothstep(1.0, 0.2, uv.y);
      vertFade *= smoothstep(0.0, 0.15, uv.y); // slight fade at very bottom

      // additional wave detail along the curtain
      float detail = 0.7 + 0.3 * sin(uv.y * 12.0 + t * 1.5 + fi * 2.0);
      detail *= 0.8 + 0.2 * sin(uv.y * 25.0 - t * 0.8 + fi * 5.0);

      float intensity = curtain * vertFade * detail * u_intensity;

      // color gradient along Y: green(bottom) → blue(middle) → purple(top)
      vec3 curtainColor;
      float cy = uv.y;
      if (cy < 0.4) {
        curtainColor = mix(u_c1, u_c2, cy / 0.4);
      } else {
        curtainColor = mix(u_c2, u_c3, (cy - 0.4) / 0.6);
      }

      // slight per-curtain color variation
      curtainColor *= 0.85 + 0.15 * sin(fi * 2.5 + 1.0);

      col += curtainColor * intensity * 0.45;
    }

    // subtle atmospheric glow near horizon
    float horizon = smoothstep(0.3, 0.0, uv.y);
    col += vec3(0.0, 0.03, 0.01) * horizon * u_intensity;

    // faint stars in dark areas
    vec2 starUV = uv * vec2(aspect, 1.0) * 60.0;
    vec2 starCell = floor(starUV);
    float starHash = fract(sin(dot(starCell, vec2(127.1, 311.7))) * 43758.5453);
    if (starHash > 0.97) {
      vec2 starF = fract(starUV) - 0.5;
      vec2 starOff = vec2(fract(sin(dot(starCell + 0.1, vec2(269.5, 183.3))) * 43758.5),
                          fract(sin(dot(starCell + 0.2, vec2(269.5, 183.3))) * 43758.5)) - 0.5;
      float sd = length(starF - starOff * 0.4);
      float sb = smoothstep(0.06, 0.0, sd) * 0.4;
      // dim stars where aurora is bright
      float auroraHere = length(col);
      sb *= smoothstep(0.3, 0.05, auroraHere);
      col += vec3(sb);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

function hexToVec3(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export default {
  id: "shaderAurora2",
  type: "webgl",
  name: "Advanced Aurora",
  category: "Shader",
  tags: ["aurora", "northern-lights", "shader", "background", "atmospheric", "glow"],
  description: "Realistic aurora borealis with multiple vertical curtains, bottom-bright falloff, and green-blue-purple gradient",
  params: {
    speed:        { type: "number", default: 0.5,       desc: "Curtain sway speed",     min: 0, max: 3 },
    intensity:    { type: "number", default: 0.8,       desc: "Aurora brightness",       min: 0.1, max: 2 },
    color1:       { type: "string", default: "#00ff80", desc: "Bottom color (green)" },
    color2:       { type: "string", default: "#0080ff", desc: "Middle color (blue)" },
    color3:       { type: "string", default: "#8000ff", desc: "Top color (purple)" },
    curtainCount: { type: "number", default: 5,         desc: "Number of light curtains", min: 1, max: 8 },
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
    gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), toNumber(params.intensity, 0.8));
    gl.uniform1f(gl.getUniformLocation(program, "u_curtainCount"), toNumber(params.curtainCount, 5));
    gl.uniform2f(gl.getUniformLocation(program, "u_res"), canvas.width, canvas.height);
    const c1 = hexToVec3(params.color1 || "#00ff80");
    const c2 = hexToVec3(params.color2 || "#0080ff");
    const c3 = hexToVec3(params.color3 || "#8000ff");
    gl.uniform3f(gl.getUniformLocation(program, "u_c1"), c1[0], c1[1], c1[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c2"), c2[0], c2[1], c2[2]);
    gl.uniform3f(gl.getUniformLocation(program, "u_c3"), c3[0], c3[1], c3[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
