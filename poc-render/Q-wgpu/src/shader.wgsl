struct Blob {
  center_radius: vec4<f32>,
  stop0: vec4<f32>,
  stop1: vec4<f32>,
  stop2: vec4<f32>,
};

struct Scene {
  resolution_t_grain: vec4<f32>,
  blobs: array<Blob, 4>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
};

@group(0) @binding(0) var<uniform> scene: Scene;

fn mix3(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
  return mix(a, b, clamp(t, 0.0, 1.0));
}

fn sample_base_gradient(t: f32) -> vec3<f32> {
  let top = vec3<f32>(5.0 / 255.0, 5.0 / 255.0, 12.0 / 255.0);
  let mid = vec3<f32>(10.0 / 255.0, 7.0 / 255.0, 20.0 / 255.0);
  let bottom = vec3<f32>(3.0 / 255.0, 2.0 / 255.0, 10.0 / 255.0);
  if (t <= 0.5) {
    return mix3(top, mid, t * 2.0);
  }
  return mix3(mid, bottom, (t - 0.5) * 2.0);
}

fn sample_band_alpha(t: f32) -> f32 {
  if (t <= 0.5) {
    return mix(0.55, 0.0, clamp(t * 2.0, 0.0, 1.0));
  }
  return mix(0.0, 0.65, clamp((t - 0.5) * 2.0, 0.0, 1.0));
}

fn screen_channel(dst: f32, src: f32) -> f32 {
  return 1.0 - (1.0 - dst) * (1.0 - src);
}

fn overlay_channel(dst: f32, src: f32) -> f32 {
  if (dst <= 0.5) {
    return 2.0 * dst * src;
  }
  return 1.0 - 2.0 * (1.0 - dst) * (1.0 - src);
}

fn screen_with_alpha(dst: vec3<f32>, src: vec3<f32>, alpha: f32) -> vec3<f32> {
  let a = clamp(alpha, 0.0, 1.0);
  return vec3<f32>(
    mix(dst.x, screen_channel(dst.x, src.x), a),
    mix(dst.y, screen_channel(dst.y, src.y), a),
    mix(dst.z, screen_channel(dst.z, src.z), a),
  );
}

fn source_over_black(color: vec3<f32>, alpha: f32) -> vec3<f32> {
  let keep = 1.0 - clamp(alpha, 0.0, 1.0);
  return color * keep;
}

fn sample_blob(blob: Blob, t: f32) -> vec4<f32> {
  let clamped = clamp(t, 0.0, 1.0);
  if (clamped <= 0.35) {
    let local = clamped / 0.35;
    return vec4<f32>(mix3(blob.stop0.xyz, blob.stop1.xyz, local), mix(blob.stop0.w, blob.stop1.w, local));
  }
  let local = (clamped - 0.35) / 0.65;
  return vec4<f32>(mix3(blob.stop1.xyz, blob.stop2.xyz, local), mix(blob.stop1.w, 0.0, local));
}

fn hash(i: i32, salt: i32) -> f32 {
  let iu = bitcast<u32>(i);
  let su = bitcast<u32>(salt);
  var x = iu * 374761393u + su * 668265263u;
  x = (x ^ (x >> 13u)) * 1274126177u;
  x = x ^ (x >> 16u);
  return f32(x % 100000u) / 100000.0;
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(3.0, 1.0),
    vec2<f32>(-1.0, 1.0),
  );

  var out: VertexOut;
  out.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let resolution = scene.resolution_t_grain.xy;
  let t = scene.resolution_t_grain.z;
  let grain = scene.resolution_t_grain.w;
  let vertical = position.y / resolution.y;

  var color = sample_base_gradient(vertical);
  let band_alpha = sample_band_alpha(vertical);

  for (var i: u32 = 0u; i < 4u; i = i + 1u) {
    let blob = scene.blobs[i];
    let center = blob.center_radius.xy;
    let radius = blob.center_radius.z;
    let delta = position.xy - center;
    let distance = length(delta);
    if (distance >= radius) {
      continue;
    }

    let sample = sample_blob(blob, distance / radius);
    color = screen_with_alpha(color, sample.xyz, sample.w);
  }

  color = source_over_black(color, band_alpha);

  if (grain > 0.0) {
    let pixel = floor(position.xy);
    let cell_x = i32(pixel.x / 3.0);
    let cell_y = i32(pixel.y / 3.0);
    let grain_seed = i32(floor(t * 24.0));
    let gray = hash(cell_x, cell_y + grain_seed * 31);
    let overlay = vec3<f32>(
      overlay_channel(color.x, gray),
      overlay_channel(color.y, gray),
      overlay_channel(color.z, gray),
    );
    color = mix3(color, overlay, grain);
  }

  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
