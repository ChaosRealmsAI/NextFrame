use crate::dom_snapshot::DomSnapshot;

pub trait WgpuReplay {
    fn render_frame(&mut self, dom_snapshot: &DomSnapshot, t: f64) -> Vec<u8>;
}

#[derive(Debug, Default)]
pub struct WgpuReplayNull;

impl WgpuReplay for WgpuReplayNull {
    fn render_frame(&mut self, dom_snapshot: &DomSnapshot, t: f64) -> Vec<u8> {
        let _ = (dom_snapshot, t);
        Vec::new()
    }
}
