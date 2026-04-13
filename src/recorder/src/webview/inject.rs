//! Frame state injection methods for `WebViewHost`.

use std::time::Duration;

use super::WebViewHost;

impl WebViewHost {
    /// Sends frame data to the page via `window.__onFrame(data)`.
    ///
    /// The recorder only passes data — all rendering (subtitles, cue animations,
    /// progress bars) is the HTML template's responsibility via its `__onFrame`
    /// implementation.
    #[allow(clippy::too_many_arguments)]
    pub fn inject_state(
        &self,
        cue_index: i32,
        subtitle_text: &str,
        progress_pct: f64,
        segment_index: usize,
        total_segments: usize,
        segment_titles: &[String],
        segment_durations: &[f64],
        video_time_sec: f64,
    ) -> Result<(), String> {
        let subtitle_json = serde_json::to_string(subtitle_text)
            .map_err(|err| format!("failed to encode subtitle text for JS: {err}"))?;
        let titles_json = serde_json::to_string(segment_titles).unwrap_or_else(|_| "[]".to_owned());
        let durations_json =
            serde_json::to_string(segment_durations).unwrap_or_else(|_| "[]".to_owned());
        let script = format!(
            r#"
            (() => {{
              if (typeof window.__onFrame === 'function') {{
                window.__onFrame({{
                  time: {video_time_sec:.6},
                  progress: {progress_pct:.6},
                  cue: {cue_index},
                  subtitle: {subtitle_json},
                  segment: {segment_index},
                  totalSegments: {total_segments},
                  segmentTitles: {titles_json},
                  segmentDurations: {durations_json}
                }});
                return 'ok';
              }}
              return 'no __onFrame';
            }})()
            "#
        );
        let result = self.eval_string(&script)?;
        if result.as_deref() == Some("no __onFrame") {
            return Err(
                "page does not implement window.__onFrame — see recorder README for the template protocol"
                    .into(),
            );
        }
        // 8ms flush: enough for video.currentTime seek to decode a frame.
        // For pages without video, this is a ~7ms overhead vs the old 1ms flush,
        // but it ensures embedded video frames are visible in the capture.
        self.flush_render(Duration::from_millis(8))
    }
}
