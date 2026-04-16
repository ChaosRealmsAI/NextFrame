//! Frame state injection methods for `WebViewHost`.

use std::time::Duration;

use super::WebViewHost;
use crate::error_with_fix;

/// Data passed to the page's `window.__onFrame` callback each frame.
pub struct FrameState<'a> {
    pub cue_index: i32,
    pub subtitle_text: &'a str,
    pub progress_pct: f64,
    pub segment_index: usize,
    pub total_segments: usize,
    pub segment_titles: &'a [String],
    pub segment_durations: &'a [f64],
    pub video_time_sec: f64,
}

impl WebViewHost {
    /// Sends frame data to the page via `window.__onFrame(data)`.
    ///
    /// The recorder only passes data — all rendering (subtitles, cue animations,
    /// progress bars) is the HTML template's responsibility via its `__onFrame`
    /// implementation.
    pub fn inject_state(&self, state: &FrameState<'_>) -> Result<(), String> {
        let subtitle_json = serde_json::to_string(state.subtitle_text).map_err(|err| {
            error_with_fix(
                "encode subtitle text for page injection",
                err,
                "Retry after removing unsupported subtitle data or control characters from the page input.",
            )
        })?;
        let titles_json = match serde_json::to_string(state.segment_titles) {
            Ok(value) => value,
            Err(_) => "[]".to_owned(),
        };
        let durations_json = match serde_json::to_string(state.segment_durations) {
            Ok(value) => value,
            Err(_) => "[]".to_owned(),
        };
        let video_time_sec = state.video_time_sec;
        let progress_pct = state.progress_pct;
        let cue_index = state.cue_index;
        let segment_index = state.segment_index;
        let total_segments = state.total_segments;
        let script = format!(
            r#"
            if (typeof window.__onFrame !== 'function') {{
              return 'no __onFrame';
            }}
            const result = window.__onFrame({{
              time: {video_time_sec:.6},
              progress: {progress_pct:.6},
              cue: {cue_index},
              subtitle: {subtitle_json},
              segment: {segment_index},
              totalSegments: {total_segments},
              segmentTitles: {titles_json},
              segmentDurations: {durations_json}
            }});
            if (result && typeof result.then === 'function') {{
              await result;
            }}
            return 'ok';
            "#
        );
        let result = self.eval_string_async(&script)?;
        if result.as_deref() == Some("no __onFrame") {
            return Err(
                /* Fix: user-facing error formatted below */
                error_with_fix(
                    "inject frame state into the page",
                    "the page does not implement `window.__onFrame`",
                    "Implement the recorder template protocol in `window.__onFrame` and retry.",
                ),
            );
        }
        self.flush_render(Duration::from_millis(50))
    }
}
