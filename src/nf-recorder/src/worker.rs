//! Hidden off-screen WKWebView that drives frame-by-frame eval of `__nfTick(t)`.

pub trait FrameSource {
    fn load_bundle(&mut self, html_path: &std::path::Path) -> anyhow::Result<()>;
    fn tick(&mut self, t_seconds: f64) -> anyhow::Result<()>;
    fn snapshot(&mut self) -> anyhow::Result<FrameRef>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct FrameRef {
    pub io_surface_id: u64,
}

pub struct StubWorker;

impl FrameSource for StubWorker {
    fn load_bundle(&mut self, _html_path: &std::path::Path) -> anyhow::Result<()> {
        Ok(())
    }

    fn tick(&mut self, _t_seconds: f64) -> anyhow::Result<()> {
        Ok(())
    }

    fn snapshot(&mut self) -> anyhow::Result<FrameRef> {
        Ok(FrameRef::default())
    }
}
