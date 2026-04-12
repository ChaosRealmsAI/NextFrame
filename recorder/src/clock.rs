//! Frame scheduling utilities for subtitle and cue-driven recording.

use crate::parser::{FrameMetadata, SubtitleCue};

/// Computes which frames need a fresh capture for one segment.
pub struct SegmentClock {
    fps: usize,
    offset_sec: f64,
    total_duration_sec: f64,
    duration_sec: f64,
    total_frames: usize,
    cue_times: Vec<f64>,
    subtitles: Vec<SubtitleCue>,
    total_cues: usize,
    no_skip: bool,
    transition_frames: usize,
    capture_until: usize,
    last_cue: i32,
    last_subtitle: String,
    skipped_frames: usize,
}

/// Describes the DOM state that should be rendered for a frame.
pub struct FrameDecision {
    pub cue_index: i32,
    pub subtitle_text: String,
    pub progress_pct: f64,
    pub needs_capture: bool,
    /// Segment-local timestamp in seconds (frame_index / fps).
    pub timestamp_sec: f64,
}

impl SegmentClock {
    /// Builds a frame clock from parsed segment metadata and runtime settings.
    pub fn new(
        metadata: &FrameMetadata,
        fps: usize,
        offset_sec: f64,
        total_duration_sec: f64,
        duration_sec: f64,
        no_skip: bool,
        skip_aggressive: bool,
    ) -> Self {
        let total_frames = ((duration_sec + 0.5) * fps as f64).ceil().max(1.0) as usize;
        let cue_times = build_cue_times(metadata);
        Self {
            fps,
            offset_sec,
            total_duration_sec,
            duration_sec,
            total_frames,
            cue_times,
            subtitles: metadata.subtitles.clone(),
            total_cues: metadata.total_cues,
            no_skip,
            transition_frames: if skip_aggressive {
                (0.3 * fps as f64).ceil() as usize
            } else {
                (0.5 * fps as f64).ceil() as usize
            },
            capture_until: 0,
            last_cue: -1,
            last_subtitle: String::new(),
            skipped_frames: 0,
        }
    }

    /// Returns the total number of frames that will be emitted for the segment.
    pub fn total_frames(&self) -> usize {
        self.total_frames
    }

    /// Returns how many frames reused the previous image instead of recapturing.
    pub fn skipped_frames(&self) -> usize {
        self.skipped_frames
    }

    /// Advances the clock and returns the render decision for the requested frame index.
    pub fn next(&mut self, frame_index: usize) -> FrameDecision {
        let timestamp_sec = frame_index as f64 / self.fps as f64;
        let cue_index = self.find_active_cue(timestamp_sec);
        let subtitle_text = self.find_active_subtitle(timestamp_sec);
        let progress_pct = if self.total_duration_sec > 0.0 {
            ((self.offset_sec + timestamp_sec.min(self.duration_sec)) / self.total_duration_sec)
                * 100.0
        } else {
            0.0
        };

        let cue_changed = cue_index != self.last_cue;
        let subtitle_changed = subtitle_text != self.last_subtitle;

        if cue_changed || subtitle_changed {
            self.capture_until = self
                .capture_until
                .max(frame_index.saturating_add(self.transition_frames));
        }

        let needs_capture = if self.no_skip {
            true
        } else {
            frame_index == 0 || cue_changed || subtitle_changed || frame_index < self.capture_until
        };
        if !needs_capture {
            self.skipped_frames += 1;
        }

        self.last_cue = cue_index;
        self.last_subtitle = subtitle_text.clone();

        FrameDecision {
            cue_index,
            subtitle_text,
            progress_pct,
            needs_capture,
            timestamp_sec,
        }
    }

    fn find_active_cue(&self, timestamp_sec: f64) -> i32 {
        if self.total_cues == 0 {
            return -1;
        }
        for (index, cue_time) in self.cue_times.iter().enumerate().rev() {
            if timestamp_sec >= *cue_time {
                return index.min(self.total_cues.saturating_sub(1)) as i32;
            }
        }
        -1
    }

    fn find_active_subtitle(&self, timestamp_sec: f64) -> String {
        for subtitle in self.subtitles.iter().rev() {
            if timestamp_sec >= subtitle.start && timestamp_sec < subtitle.end {
                return subtitle.text.clone();
            }
        }
        String::new()
    }
}

fn build_cue_times(metadata: &FrameMetadata) -> Vec<f64> {
    if !metadata.cuemap.is_empty() {
        return metadata
            .cuemap
            .iter()
            .filter_map(|index| metadata.subtitles.get(*index))
            .map(|subtitle| subtitle.start)
            .collect();
    }
    if metadata.total_cues > 0 && !metadata.subtitles.is_empty() {
        return metadata
            .subtitles
            .iter()
            .take(metadata.total_cues)
            .map(|subtitle| subtitle.start)
            .collect();
    }
    // No SRT/CUEMAP — distribute cues evenly across duration
    // This ensures all data-cue elements eventually get revealed
    if metadata.total_cues > 1 {
        let duration = metadata.subtitles.last().map(|s| s.end).unwrap_or(10.0);
        return (0..metadata.total_cues)
            .map(|i| i as f64 * duration / metadata.total_cues as f64)
            .collect();
    }
    vec![0.0]
}
