//! Time formatting and numeric helpers used across cut planning and reporting.

/// Round a seconds value to two decimal places.
pub fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// Convert seconds to rounded milliseconds, clamping negative and non-finite input to zero.
pub fn seconds_to_millis(seconds: f64) -> u64 {
    if !seconds.is_finite() {
        return 0;
    }

    let rounded = (seconds.max(0.0) * 1000.0).round();
    if rounded >= u64::MAX as f64 {
        u64::MAX
    } else {
        rounded as u64
    }
}

/// Convert milliseconds to fractional seconds.
pub fn millis_to_seconds(value: u64) -> f64 {
    value as f64 / 1000.0
}

/// Format a seconds value as `HH:MM:SS,mmm` for SRT.
pub fn format_srt_timestamp(seconds: f64) -> String {
    let total_millis = seconds_to_millis(seconds);
    let hours = total_millis / 3_600_000;
    let minutes = (total_millis / 60_000) % 60;
    let secs = (total_millis / 1000) % 60;
    let millis = total_millis % 1000;
    format!("{hours:02}:{minutes:02}:{secs:02},{millis:03}")
}

/// Format a seconds value as `H:MM:SS.ss`.
pub fn format_hms(seconds: f64) -> String {
    let total_millis = seconds_to_millis(seconds);
    let hours = total_millis / 3_600_000;
    let minutes = (total_millis / 60_000) % 60;
    let secs = (total_millis % 60_000) as f64 / 1000.0;
    format!("{hours}:{minutes:02}:{secs:05.2}")
}

/// Clamp a `(start, end)` range to `[0, max_end]`.
pub fn clamp_range(start: f64, end: f64, max_end: f64) -> (f64, f64) {
    let bounded_start = start.max(0.0).min(max_end);
    let bounded_end = end.max(bounded_start).min(max_end);
    (bounded_start, bounded_end)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn srt_timestamp_formats_millis() {
        assert_eq!(format_srt_timestamp(61.234), "00:01:01,234");
    }

    #[test]
    fn seconds_to_millis_clamps_invalid_values() {
        assert_eq!(seconds_to_millis(-1.0), 0);
        assert_eq!(seconds_to_millis(f64::NAN), 0);
    }

    #[test]
    fn millis_to_seconds_preserves_fractional_value() {
        assert_eq!(millis_to_seconds(1234), 1.234);
    }

    #[test]
    fn hms_formats_hours_minutes_and_seconds() {
        assert_eq!(format_hms(3661.2), "1:01:01.20");
    }

    #[test]
    fn clamp_range_limits_to_bounds() {
        assert_eq!(clamp_range(-0.2, 11.4, 10.0), (0.0, 10.0));
        assert_eq!(clamp_range(5.0, 4.0, 10.0), (5.0, 5.0));
    }
}
