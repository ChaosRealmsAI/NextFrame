use crate::dom_snapshot::DomSnapshot;
use image::codecs::png::PngEncoder;
use image::{ColorType, ImageEncoder};

pub trait WgpuReplay {
    fn render_frame(&mut self, dom_snapshot: &DomSnapshot, t: f64) -> Vec<u8>;
}

#[derive(Debug, Default)]
pub struct WgpuReplayNull;

impl WgpuReplay for WgpuReplayNull {
    fn render_frame(&mut self, dom_snapshot: &DomSnapshot, t: f64) -> Vec<u8> {
        let _ = (dom_snapshot, t);
        // real wgpu replay is deferred to next phase
        let pixels = [
            0x24, 0x44, 0x66, 0xff, 0x24, 0x44, 0x66, 0xff, 0x24, 0x44, 0x66, 0xff, 0x24, 0x44,
            0x66, 0xff,
        ];
        let mut png = Vec::new();
        let encoder = PngEncoder::new(&mut png);
        match encoder.write_image(&pixels, 2, 2, ColorType::Rgba8.into()) {
            Ok(()) => png,
            Err(_error) => Vec::new(),
        }
    }
}
