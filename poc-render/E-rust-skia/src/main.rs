use std::env;
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;
use std::time::Instant;

use png::{BitDepth, ColorType, Encoder};
use tiny_skia::Pixmap;

const WIDTH: u32 = 1920;
const HEIGHT: u32 = 1080;
const OUTPUT_PATH: &str = "frame_t5.png";

#[derive(Clone, Copy)]
struct Params {
    hue_a: f32,
    hue_b: f32,
    hue_c: f32,
    intensity: f32,
    grain: f32,
}

#[derive(Clone, Copy)]
struct Blob {
    hue: f32,
    phase: f32,
    speed_x: f32,
    speed_y: f32,
    amp: f32,
    size_base: f32,
}

#[derive(Clone, Copy)]
struct BlobState {
    cx: f32,
    cy: f32,
    radius: f32,
    stop0_rgb: [f32; 3],
    stop1_rgb: [f32; 3],
    stop2_rgb: [f32; 3],
    stop0_alpha: f32,
    stop1_alpha: f32,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let t = env::args()
        .nth(1)
        .and_then(|value| value.parse::<f32>().ok())
        .unwrap_or(5.0);

    let mut pixmap = Pixmap::new(WIDTH, HEIGHT).expect("failed to allocate pixmap");
    let start = Instant::now();
    render_frame(t, &Params::default(), &mut pixmap);
    let render_ms = start.elapsed().as_secs_f64() * 1000.0;

    save_png(Path::new(OUTPUT_PATH), &pixmap)?;
    println!(
        "Rendered {OUTPUT_PATH} at t={t:.3} in {render_ms:.2} ms ({}x{})",
        WIDTH, HEIGHT
    );
    Ok(())
}

impl Default for Params {
    fn default() -> Self {
        Self {
            hue_a: 270.0,
            hue_b: 200.0,
            hue_c: 320.0,
            intensity: 1.0,
            grain: 0.04,
        }
    }
}

fn render_frame(t: f32, params: &Params, pixmap: &mut Pixmap) {
    let width = pixmap.width() as usize;
    let height = pixmap.height() as usize;
    let min_dim = width.min(height) as f32;
    let fade_in = smoothstep(0.0, 0.6, t);
    let blobs = [
        Blob {
            hue: params.hue_a,
            phase: 0.0,
            speed_x: 0.11,
            speed_y: 0.07,
            amp: 0.28,
            size_base: 0.55,
        },
        Blob {
            hue: params.hue_b,
            phase: 1.7,
            speed_x: 0.09,
            speed_y: 0.13,
            amp: 0.34,
            size_base: 0.68,
        },
        Blob {
            hue: params.hue_c,
            phase: 3.2,
            speed_x: 0.13,
            speed_y: 0.05,
            amp: 0.22,
            size_base: 0.42,
        },
        Blob {
            hue: (params.hue_a + params.hue_b) * 0.5,
            phase: 4.9,
            speed_x: 0.07,
            speed_y: 0.11,
            amp: 0.30,
            size_base: 0.60,
        },
    ];

    let blob_states = blobs
        .iter()
        .enumerate()
        .map(|(i, blob)| {
            blob_state(
                *blob,
                i,
                t,
                width as f32,
                height as f32,
                min_dim,
                fade_in,
                params.intensity,
            )
        })
        .collect::<Vec<_>>();

    let data = pixmap.data_mut();

    for y in 0..height {
        let vertical = if height > 1 {
            y as f32 / (height - 1) as f32
        } else {
            0.0
        };
        let base = sample_base_gradient(vertical);
        let band_alpha = sample_band_alpha(vertical);

        for x in 0..width {
            let mut color = base;
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;

            for blob in &blob_states {
                let dx = px - blob.cx;
                let dy = py - blob.cy;
                let distance = (dx * dx + dy * dy).sqrt();
                if distance >= blob.radius {
                    continue;
                }

                let source = sample_blob_gradient(blob, distance / blob.radius);
                color = screen_with_alpha(color, source.rgb, source.alpha);
            }

            color = source_over_black(color, band_alpha);

            let pixel_index = (y * width + x) * 4;
            data[pixel_index] = to_u8(color[0]);
            data[pixel_index + 1] = to_u8(color[1]);
            data[pixel_index + 2] = to_u8(color[2]);
            data[pixel_index + 3] = 255;
        }
    }

    apply_grain(t, params.grain, width, height, data);
}

fn blob_state(
    blob: Blob,
    index: usize,
    t: f32,
    width: f32,
    height: f32,
    min_dim: f32,
    fade_in: f32,
    intensity: f32,
) -> BlobState {
    let cx = width * (0.5 + (t * blob.speed_x + blob.phase).sin() * blob.amp);
    let cy = height * (0.5 + (t * blob.speed_y + blob.phase * 1.3).cos() * blob.amp * 0.7);
    let breath = 0.88 + 0.12 * (t * 0.35 + index as f32).sin();
    let radius = min_dim * blob.size_base * breath;
    let alpha = 0.55 * intensity * fade_in;

    BlobState {
        cx,
        cy,
        radius,
        stop0_rgb: hsl_to_rgb(blob.hue, 0.90, 0.65),
        stop1_rgb: hsl_to_rgb(blob.hue, 0.85, 0.55),
        stop2_rgb: hsl_to_rgb(blob.hue, 0.80, 0.40),
        stop0_alpha: alpha,
        stop1_alpha: alpha * 0.55,
    }
}

#[derive(Clone, Copy)]
struct ColorStopSample {
    rgb: [f32; 3],
    alpha: f32,
}

fn sample_blob_gradient(blob: &BlobState, t: f32) -> ColorStopSample {
    let clamped = clamp01(t);
    if clamped <= 0.35 {
        let local = clamped / 0.35;
        ColorStopSample {
            rgb: mix_rgb(blob.stop0_rgb, blob.stop1_rgb, local),
            alpha: mix(blob.stop0_alpha, blob.stop1_alpha, local),
        }
    } else {
        let local = (clamped - 0.35) / 0.65;
        ColorStopSample {
            rgb: mix_rgb(blob.stop1_rgb, blob.stop2_rgb, local),
            alpha: mix(blob.stop1_alpha, 0.0, local),
        }
    }
}

fn sample_base_gradient(t: f32) -> [f32; 3] {
    let top = hex_rgb(0x05, 0x05, 0x0c);
    let mid = hex_rgb(0x0a, 0x07, 0x14);
    let bottom = hex_rgb(0x03, 0x02, 0x0a);

    if t <= 0.5 {
        mix_rgb(top, mid, t * 2.0)
    } else {
        mix_rgb(mid, bottom, (t - 0.5) * 2.0)
    }
}

fn sample_band_alpha(t: f32) -> f32 {
    if t <= 0.5 {
        mix(0.55, 0.0, t * 2.0)
    } else {
        mix(0.0, 0.65, (t - 0.5) * 2.0)
    }
}

fn apply_grain(t: f32, grain: f32, width: usize, height: usize, data: &mut [u8]) {
    if grain <= 0.0 {
        return;
    }

    let grain_seed = (t * 24.0).floor() as i32;
    let step = 3usize;

    for y in (0..height).step_by(step) {
        for x in (0..width).step_by(step) {
            let noise = hash((x / step) as i32, (y / step) as i32 + grain_seed * 31);
            let gray = noise;

            for sy in y..(y + step).min(height) {
                for sx in x..(x + step).min(width) {
                    let index = (sy * width + sx) * 4;
                    let current = [
                        data[index] as f32 / 255.0,
                        data[index + 1] as f32 / 255.0,
                        data[index + 2] as f32 / 255.0,
                    ];

                    let blended = [
                        mix(current[0], overlay_channel(current[0], gray), grain),
                        mix(current[1], overlay_channel(current[1], gray), grain),
                        mix(current[2], overlay_channel(current[2], gray), grain),
                    ];

                    data[index] = to_u8(blended[0]);
                    data[index + 1] = to_u8(blended[1]);
                    data[index + 2] = to_u8(blended[2]);
                }
            }
        }
    }
}

fn save_png(path: &Path, pixmap: &Pixmap) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    let writer = BufWriter::new(file);
    let mut encoder = Encoder::new(writer, pixmap.width(), pixmap.height());
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut png_writer = encoder.write_header()?;
    png_writer.write_image_data(pixmap.data())?;
    Ok(())
}

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = clamp01((x - edge0) / (edge1 - edge0));
    t * t * (3.0 - 2.0 * t)
}

fn hash(i: i32, salt: i32) -> f32 {
    let mut x = i
        .wrapping_mul(374_761_393)
        .wrapping_add(salt.wrapping_mul(668_265_263));
    x = (x ^ ((x as u32 >> 13) as i32)).wrapping_mul(1_274_126_177);
    x ^= (x as u32 >> 16) as i32;
    ((x as u32) % 100_000) as f32 / 100_000.0
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> [f32; 3] {
    let hue = h.rem_euclid(360.0) / 360.0;
    if s <= 0.0 {
        return [l, l, l];
    }

    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;

    [
        hue_to_rgb(p, q, hue + 1.0 / 3.0),
        hue_to_rgb(p, q, hue),
        hue_to_rgb(p, q, hue - 1.0 / 3.0),
    ]
}

fn hue_to_rgb(p: f32, q: f32, mut t: f32) -> f32 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        p + (q - p) * 6.0 * t
    } else if t < 1.0 / 2.0 {
        q
    } else if t < 2.0 / 3.0 {
        p + (q - p) * (2.0 / 3.0 - t) * 6.0
    } else {
        p
    }
}

fn screen_with_alpha(dst: [f32; 3], src: [f32; 3], alpha: f32) -> [f32; 3] {
    [
        mix(dst[0], screen_channel(dst[0], src[0]), alpha),
        mix(dst[1], screen_channel(dst[1], src[1]), alpha),
        mix(dst[2], screen_channel(dst[2], src[2]), alpha),
    ]
}

fn source_over_black(dst: [f32; 3], alpha: f32) -> [f32; 3] {
    let keep = 1.0 - clamp01(alpha);
    [dst[0] * keep, dst[1] * keep, dst[2] * keep]
}

fn screen_channel(dst: f32, src: f32) -> f32 {
    1.0 - (1.0 - dst) * (1.0 - src)
}

fn overlay_channel(dst: f32, src: f32) -> f32 {
    if dst <= 0.5 {
        2.0 * dst * src
    } else {
        1.0 - 2.0 * (1.0 - dst) * (1.0 - src)
    }
}

fn mix_rgb(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
}

fn mix(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * clamp01(t)
}

fn clamp01(value: f32) -> f32 {
    value.clamp(0.0, 1.0)
}

fn to_u8(value: f32) -> u8 {
    (clamp01(value) * 255.0).round() as u8
}

fn hex_rgb(r: u8, g: u8, b: u8) -> [f32; 3] {
    [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0]
}
