use std::borrow::Cow;
use std::env;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Instant;

use bytemuck::{Pod, Zeroable};
use png::{BitDepth, ColorType, Encoder};
use wgpu::util::DeviceExt;

const WIDTH: u32 = 1920;
const HEIGHT: u32 = 1080;
const BLOB_COUNT: usize = 4;
const WARMUP_FRAMES: usize = 8;
const TIMING_FRAMES: usize = 120;
const READBACK_TIMING_FRAMES: usize = 24;
const TIMESTAMP_BUFFER_SIZE: u64 = std::mem::size_of::<[u64; 2]>() as u64;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let t = env::args()
        .nth(1)
        .and_then(|value| value.parse::<f32>().ok())
        .unwrap_or(5.0);

    let params = Params::default();

    let init_start = Instant::now();
    let mut renderer = pollster::block_on(Renderer::new())?;
    let init_ms = init_start.elapsed().as_secs_f64() * 1000.0;

    for _ in 0..WARMUP_FRAMES {
        let _ = renderer.render(t, &params, false)?;
    }

    let avg_render_ms =
        average_gpu_render_ms(TIMING_FRAMES, || renderer.render(t, &params, false))?;
    let avg_render_wall_ms = average_duration_ms(TIMING_FRAMES, || {
        renderer.render(t, &params, false).map(|_| ())
    })?;
    let avg_readback_ms = average_duration_ms(READBACK_TIMING_FRAMES, || {
        renderer.render(t, &params, true).map(|_| ())
    })?;

    let frame = renderer.render(t, &params, true)?;
    let output_path = output_path(t);
    save_png(
        &output_path,
        WIDTH,
        HEIGHT,
        frame.pixels.as_deref().unwrap_or(&[]),
    )?;

    println!(
        "Rendered {} at t={t:.3}\nGPU init: {init_ms:.2} ms\nAverage GPU render pass: {avg_render_ms:.3} ms\nAverage render-only wall time: {avg_render_wall_ms:.3} ms\nAverage end-to-end frame (render + readback): {avg_readback_ms:.3} ms",
        output_path.display()
    );

    Ok(())
}

fn average_duration_ms<F, T, E>(iterations: usize, mut f: F) -> Result<f64, E>
where
    F: FnMut() -> Result<T, E>,
{
    let start = Instant::now();
    for _ in 0..iterations {
        let _ = f()?;
    }
    Ok(start.elapsed().as_secs_f64() * 1000.0 / iterations as f64)
}

fn average_gpu_render_ms<F, E>(iterations: usize, mut f: F) -> Result<f64, E>
where
    F: FnMut() -> Result<FrameResult, E>,
{
    let mut total = 0.0;
    for _ in 0..iterations {
        total += f()?.gpu_render_ms;
    }
    Ok(total / iterations as f64)
}

#[derive(Clone, Copy)]
struct Params {
    hue_a: f32,
    hue_b: f32,
    hue_c: f32,
    intensity: f32,
    grain: f32,
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

#[derive(Clone, Copy)]
struct Blob {
    hue: f32,
    phase: f32,
    speed_x: f32,
    speed_y: f32,
    amp: f32,
    size_base: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct BlobUniform {
    center_radius: [f32; 4],
    stop0: [f32; 4],
    stop1: [f32; 4],
    stop2: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct SceneUniform {
    resolution_t_grain: [f32; 4],
    blobs: [BlobUniform; BLOB_COUNT],
}

struct FrameResult {
    gpu_render_ms: f64,
    pixels: Option<Vec<u8>>,
}

struct TimestampResources {
    query_set: wgpu::QuerySet,
    resolve_buffer: wgpu::Buffer,
    readback_buffer: wgpu::Buffer,
    period_ns: f32,
}

struct Renderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    bind_group: wgpu::BindGroup,
    uniform_buffer: wgpu::Buffer,
    target_texture: wgpu::Texture,
    target_view: wgpu::TextureView,
    readback_buffer: wgpu::Buffer,
    padded_bytes_per_row: u32,
    timestamps: Option<TimestampResources>,
}

impl Renderer {
    async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let instance = wgpu::Instance::default();
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: None,
            })
            .await?;

        let timestamp_supported = adapter.features().contains(wgpu::Features::TIMESTAMP_QUERY);
        let required_features = if timestamp_supported {
            wgpu::Features::TIMESTAMP_QUERY
        } else {
            wgpu::Features::empty()
        };

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("q-wgpu-device"),
                required_features,
                required_limits: wgpu::Limits::default(),
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
                memory_hints: wgpu::MemoryHints::Performance,
                trace: wgpu::Trace::Off,
            })
            .await?;

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("aurora-shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!("shader.wgsl"))),
        });

        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("scene-uniforms"),
            contents: bytemuck::bytes_of(&SceneUniform::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("scene-bind-group-layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("scene-bind-group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("aurora-pipeline-layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("aurora-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });

        let target_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("aurora-target"),
            size: wgpu::Extent3d {
                width: WIDTH,
                height: HEIGHT,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let target_view = target_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let padded_bytes_per_row = align_to(WIDTH * 4, wgpu::COPY_BYTES_PER_ROW_ALIGNMENT);
        let readback_size = padded_bytes_per_row as u64 * HEIGHT as u64;
        let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback-buffer"),
            size: readback_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let timestamps = if timestamp_supported {
            let query_set = device.create_query_set(&wgpu::QuerySetDescriptor {
                label: Some("timestamp-query-set"),
                ty: wgpu::QueryType::Timestamp,
                count: 2,
            });
            let resolve_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("timestamp-resolve-buffer"),
                size: TIMESTAMP_BUFFER_SIZE,
                usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC,
                mapped_at_creation: false,
            });
            let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("timestamp-readback-buffer"),
                size: TIMESTAMP_BUFFER_SIZE,
                usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                mapped_at_creation: false,
            });

            Some(TimestampResources {
                query_set,
                resolve_buffer,
                readback_buffer,
                period_ns: queue.get_timestamp_period(),
            })
        } else {
            None
        };

        Ok(Self {
            device,
            queue,
            pipeline,
            bind_group,
            uniform_buffer,
            target_texture,
            target_view,
            readback_buffer,
            padded_bytes_per_row,
            timestamps,
        })
    }

    fn render(
        &mut self,
        t: f32,
        params: &Params,
        readback: bool,
    ) -> Result<FrameResult, Box<dyn std::error::Error>> {
        let scene = build_scene_uniform(t, params);
        self.queue
            .write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&scene));

        let wall_start = Instant::now();
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("aurora-encoder"),
            });

        {
            let timestamp_writes =
                self.timestamps
                    .as_ref()
                    .map(|timestamps| wgpu::RenderPassTimestampWrites {
                        query_set: &timestamps.query_set,
                        beginning_of_pass_write_index: Some(0),
                        end_of_pass_write_index: Some(1),
                    });
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("aurora-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.target_view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.draw(0..3, 0..1);
        }

        if readback {
            encoder.copy_texture_to_buffer(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.target_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyBufferInfo {
                    buffer: &self.readback_buffer,
                    layout: wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(self.padded_bytes_per_row),
                        rows_per_image: Some(HEIGHT),
                    },
                },
                wgpu::Extent3d {
                    width: WIDTH,
                    height: HEIGHT,
                    depth_or_array_layers: 1,
                },
            );
        }

        if let Some(timestamps) = &self.timestamps {
            encoder.resolve_query_set(&timestamps.query_set, 0..2, &timestamps.resolve_buffer, 0);
            encoder.copy_buffer_to_buffer(
                &timestamps.resolve_buffer,
                0,
                &timestamps.readback_buffer,
                0,
                TIMESTAMP_BUFFER_SIZE,
            );
        }

        self.queue.submit(Some(encoder.finish()));
        self.device.poll(wgpu::PollType::wait_indefinitely())?;

        let gpu_render_ms = if let Some(timestamps) = &self.timestamps {
            let raw = self.read_buffer(&timestamps.readback_buffer)?;
            let values: &[u64] = bytemuck::cast_slice(&raw);
            let delta = values[1].saturating_sub(values[0]) as f64;
            delta * f64::from(timestamps.period_ns) / 1_000_000.0
        } else {
            wall_start.elapsed().as_secs_f64() * 1000.0
        };

        let pixels = if readback {
            Some(self.read_pixels()?)
        } else {
            None
        };

        Ok(FrameResult {
            gpu_render_ms,
            pixels,
        })
    }

    fn read_pixels(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let mapped = self.read_buffer(&self.readback_buffer)?;
        let mut pixels = vec![0u8; (WIDTH * HEIGHT * 4) as usize];
        let unpadded_bytes_per_row = (WIDTH * 4) as usize;
        let padded_bytes_per_row = self.padded_bytes_per_row as usize;

        for y in 0..HEIGHT as usize {
            let src_offset = y * padded_bytes_per_row;
            let dst_offset = y * unpadded_bytes_per_row;
            pixels[dst_offset..dst_offset + unpadded_bytes_per_row]
                .copy_from_slice(&mapped[src_offset..src_offset + unpadded_bytes_per_row]);
        }

        Ok(pixels)
    }

    fn read_buffer(&self, buffer: &wgpu::Buffer) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let slice = buffer.slice(..);
        let (tx, rx) = mpsc::sync_channel(1);
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });
        self.device.poll(wgpu::PollType::wait_indefinitely())?;
        rx.recv()
            .map_err(|_| "failed to receive buffer map result")??;

        let mapped = slice.get_mapped_range();
        let bytes = mapped.to_vec();
        drop(mapped);
        buffer.unmap();
        Ok(bytes)
    }
}

fn build_scene_uniform(t: f32, params: &Params) -> SceneUniform {
    let fade_in = smoothstep(0.0, 0.6, t);
    let min_dim = WIDTH.min(HEIGHT) as f32;
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

    let mut blob_uniforms = [BlobUniform::zeroed(); BLOB_COUNT];
    for (index, blob) in blobs.into_iter().enumerate() {
        blob_uniforms[index] = blob_uniform(blob, index, t, min_dim, fade_in, params.intensity);
    }

    SceneUniform {
        resolution_t_grain: [WIDTH as f32, HEIGHT as f32, t, params.grain],
        blobs: blob_uniforms,
    }
}

fn blob_uniform(
    blob: Blob,
    index: usize,
    t: f32,
    min_dim: f32,
    fade_in: f32,
    intensity: f32,
) -> BlobUniform {
    let cx = WIDTH as f32 * (0.5 + (t * blob.speed_x + blob.phase).sin() * blob.amp);
    let cy = HEIGHT as f32 * (0.5 + (t * blob.speed_y + blob.phase * 1.3).cos() * blob.amp * 0.7);
    let breath = 0.88 + 0.12 * (t * 0.35 + index as f32).sin();
    let radius = min_dim * blob.size_base * breath;
    let alpha = 0.55 * intensity * fade_in;

    BlobUniform {
        center_radius: [cx, cy, radius, 0.0],
        stop0: rgba(hsl_to_rgb(blob.hue, 0.90, 0.65), alpha),
        stop1: rgba(hsl_to_rgb(blob.hue, 0.85, 0.55), alpha * 0.55),
        stop2: rgba(hsl_to_rgb(blob.hue, 0.80, 0.40), 0.0),
    }
}

fn rgba(rgb: [f32; 3], alpha: f32) -> [f32; 4] {
    [rgb[0], rgb[1], rgb[2], alpha]
}

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = clamp01((x - edge0) / (edge1 - edge0));
    t * t * (3.0 - 2.0 * t)
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

fn clamp01(value: f32) -> f32 {
    value.clamp(0.0, 1.0)
}

fn align_to(value: u32, alignment: u32) -> u32 {
    value.div_ceil(alignment) * alignment
}

fn output_path(t: f32) -> PathBuf {
    let rounded = t.round();
    if (t - rounded).abs() < 0.000_1 {
        return PathBuf::from(format!("frame_t{}.png", rounded as i32));
    }

    let sanitized = format!("{t:.3}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .replace('-', "neg")
        .replace('.', "_");
    PathBuf::from(format!("frame_t{sanitized}.png"))
}

fn save_png(
    path: &Path,
    width: u32,
    height: u32,
    pixels: &[u8],
) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    let writer = BufWriter::new(file);
    let mut encoder = Encoder::new(writer, width, height);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut png_writer = encoder.write_header()?;
    png_writer.write_image_data(pixels)?;
    Ok(())
}
