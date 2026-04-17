//! Metal tile shader compositor — zero-copy IOSurface → encoder input surface.

use crate::worker::FrameRef;

pub trait Compositor {
    fn composite(&mut self, src: FrameRef) -> anyhow::Result<FrameRef>;
}

pub struct StubCompositor;

impl Compositor for StubCompositor {
    fn composite(&mut self, src: FrameRef) -> anyhow::Result<FrameRef> {
        Ok(src)
    }
}
