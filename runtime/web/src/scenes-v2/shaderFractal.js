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

// Mandelbrot set with smooth coloring and auto-zoom, using iq's cosine palette
const FS = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time, u_speed, u_maxIter;
  uniform int u_colorScheme;
  uniform vec2 u_resolution, u_center;

  // iq's cosine palette: a + b * cos(2pi * (c*t + d))
  vec3 palette(float t, int scheme) {
    vec3 a, b, c, d;
    if (scheme == 0) {
      // Rainbow
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(1.0, 1.0, 1.0);
      d = vec3(0.0, 0.33, 0.67);
    } else if (scheme == 1) {
      // Sunset
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(1.0, 0.7, 0.4);
      d = vec3(0.0, 0.15, 0.20);
    } else if (scheme == 2) {
      // Electric blue
      a = vec3(0.0, 0.5, 0.5);
      b = vec3(0.0, 0.5, 0.5);
      c = vec3(0.0, 0.5, 0.33);
      d = vec3(0.0, 0.5, 0.67);
    } else {
      // Deep magenta
      a = vec3(0.8, 0.5, 0.4);
      b = vec3(0.2, 0.4, 0.2);
      c = vec3(2.0, 1.0, 1.0);
      d = vec3(0.0, 0.25, 0.25);
    }
    return a + b * cos(6.2832 * (c * t + d));
  }

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / u_resolution.y;

    // Zoom level increases exponentially with time
    float zoom = exp(u_time * u_speed);

    // Map pixel to complex plane, centered on interesting point
    vec2 c = u_center + (uv - 0.5) * vec2(aspect, 1.0) * (3.0 / zoom);

    // Mandelbrot iteration: z = z^2 + c
    vec2 z = vec2(0.0);
    float iter = 0.0;
    int maxI = int(u_maxIter);

    for (int i = 0; i < 256; i++) {
      if (i >= maxI) break;
      float x2 = z.x * z.x;
      float y2 = z.y * z.y;
      if (x2 + y2 > 256.0) break; // escape radius squared = 256 for smooth coloring
      z = vec2(x2 - y2 + c.x, 2.0 * z.x * z.y + c.y);
      iter += 1.0;
    }

    vec3 col;
    if (iter >= u_maxIter) {
      // Inside the set — black
      col = vec3(0.0);
    } else {
      // Smooth iteration count (avoids color banding)
      float sl = iter - log2(log2(dot(z, z))) + 4.0;

      // Normalize and apply color
      float t = sl / u_maxIter;

      // Slowly rotate through the palette over time
      t = t + u_time * 0.01;

      col = palette(t, u_colorScheme);

      // Darken near the set boundary for dramatic contrast
      float edgeFade = smoothstep(0.0, 5.0, iter);
      col *= edgeFade;
    }

    // Subtle glow at center
    float glow = exp(-2.0 * length(uv - 0.5));
    col += col * glow * 0.15;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default {
  id: "shaderFractal",
  type: "webgl",
  name: "Mandelbrot Zoom",
  category: "Shader",
  tags: ["fractal", "mandelbrot", "zoom", "shader", "math", "psychedelic"],
  description: "Infinite Mandelbrot set zoom with smooth coloring using iq's cosine palette method",
  params: {
    speed:       { type: "number", default: 0.5,    desc: "Zoom speed", min: 0.1, max: 3.0 },
    colorScheme: { type: "number", default: 0,      desc: "Color palette (0=rainbow, 1=sunset, 2=electric, 3=magenta)", min: 0, max: 3 },
    maxIter:     { type: "number", default: 128,    desc: "Max iterations (quality vs perf)", min: 32, max: 256 },
    centerX:     { type: "number", default: -0.745, desc: "Zoom center X coordinate" },
    centerY:     { type: "number", default: 0.186,  desc: "Zoom center Y coordinate" },
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
    gl.uniform1f(gl.getUniformLocation(program, "u_maxIter"), toNumber(params.maxIter, 128));
    gl.uniform1i(gl.getUniformLocation(program, "u_colorScheme"), toNumber(params.colorScheme, 0));
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(program, "u_center"),
      toNumber(params.centerX, -0.745),
      toNumber(params.centerY, 0.186));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  destroy(state) { state.canvas.remove(); }
};
