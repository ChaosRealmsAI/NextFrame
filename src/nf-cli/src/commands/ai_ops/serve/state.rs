use std::sync::{Arc, Mutex};
use std::time::Instant;

use anyhow::Context;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
pub struct Viewport {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone)]
pub struct AppState {
    started_at: Instant,
    screenshot_png: Arc<Vec<u8>>,
    inner: Arc<Mutex<InnerState>>,
}

#[derive(Debug)]
struct InnerState {
    mode: String,
    t_ms: u64,
    viewport: Viewport,
    current_source_path: Option<String>,
    current_source: Value,
    source_version: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatusResponse {
    pub mode: String,
    pub t_ms: u64,
    pub viewport: Viewport,
    pub current_source_path: Option<String>,
    pub uptime_s: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SourceCurrentResponse {
    pub path: Option<String>,
    pub version: u64,
    pub source: Value,
}

impl AppState {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            started_at: Instant::now(),
            screenshot_png: Arc::new(build_stub_screenshot()?),
            inner: Arc::new(Mutex::new(InnerState {
                mode: String::from("stub"),
                t_ms: 0,
                viewport: Viewport {
                    width: 1280,
                    height: 720,
                },
                current_source_path: Some(String::from("memory://current-source.json")),
                current_source: serde_json::json!({
                    "kind": "nextframe/source",
                    "status": "stub",
                    "scenes": [],
                }),
                source_version: 1,
            })),
        })
    }

    pub fn screenshot_png(&self) -> Arc<Vec<u8>> {
        Arc::clone(&self.screenshot_png)
    }

    pub fn status(&self) -> StatusResponse {
        let guard = self.lock_inner();
        StatusResponse {
            mode: guard.mode.clone(),
            t_ms: guard.t_ms,
            viewport: guard.viewport.clone(),
            current_source_path: guard.current_source_path.clone(),
            uptime_s: self.started_at.elapsed().as_secs(),
        }
    }

    pub fn current_source(&self) -> SourceCurrentResponse {
        let guard = self.lock_inner();
        SourceCurrentResponse {
            path: guard.current_source_path.clone(),
            version: guard.source_version,
            source: guard.current_source.clone(),
        }
    }

    pub fn writeback_source(&self, source: Value) -> u64 {
        let mut guard = self.lock_inner();
        guard.source_version += 1;
        guard.current_source_path = source
            .get("path")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .or_else(|| guard.current_source_path.clone());
        guard.current_source = source;
        guard.source_version
    }

    pub fn state_change_payload(&self) -> String {
        serde_json::json!({
            "type": "state_change",
            "status": self.status(),
            "source": self.current_source(),
        })
        .to_string()
    }

    fn lock_inner(&self) -> std::sync::MutexGuard<'_, InnerState> {
        match self.inner.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }
}

fn build_stub_screenshot() -> anyhow::Result<Vec<u8>> {
    let width = 64;
    let height = 64;
    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().context("write png header")?;
    let pixel_count = usize::try_from(width)
        .ok()
        .and_then(|w| usize::try_from(height).ok().map(|h| w * h))
        .context("convert png dimensions")?;
    let rgba = [255_u8, 0, 255, 255];
    let image = rgba.repeat(pixel_count);
    writer
        .write_image_data(&image)
        .context("write png image data")?;
    drop(writer);
    Ok(bytes)
}
