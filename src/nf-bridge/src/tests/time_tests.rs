//! time tests
use super::*;

#[test]
fn time_iso_now_matches_iso_8601_utc_format() {
    let now = time::iso_now();
    assert!(
        is_basic_iso_8601_utc(&now),
        "expected ISO 8601 UTC timestamp, got {now}"
    );
}

#[test]
fn time_epoch_days_to_date_matches_known_values() {
    assert_eq!(time::epoch_days_to_date(0), (1970, 1, 1));
    assert_eq!(time::epoch_days_to_date(18_628), (2021, 1, 1));
}

#[test]
fn time_unix_timestamp_secs_returns_reasonable_value() {
    let timestamp = time::unix_timestamp_secs().expect("unix timestamp should be available");
    assert!(
        timestamp > 1_700_000_000,
        "unexpected unix timestamp: {timestamp}"
    );
}

#[test]
fn time_trim_float_trims_trailing_zeroes() {
    assert_eq!(time::trim_float(1.000), "1");
    assert_eq!(time::trim_float(1.500), "1.5");
    assert_eq!(time::trim_float(1.234), "1.234");
}

#[test]
fn time_epoch_days_to_date_handles_leap_year_dates() {
    assert_eq!(time::epoch_days_to_date(18_320), (2020, 2, 28));
    assert_eq!(time::epoch_days_to_date(18_321), (2020, 2, 29));
    assert_eq!(time::epoch_days_to_date(18_322), (2020, 3, 1));
}

#[test]
fn time_epoch_days_to_date_handles_end_of_month_boundaries() {
    assert_eq!(time::epoch_days_to_date(18_658), (2021, 1, 31));
    assert_eq!(time::epoch_days_to_date(18_659), (2021, 2, 1));
    assert_eq!(time::epoch_days_to_date(18_747), (2021, 4, 30));
    assert_eq!(time::epoch_days_to_date(18_748), (2021, 5, 1));
}

#[test]
fn time_trim_float_handles_negative_numbers() {
    assert_eq!(time::trim_float(-2.000), "-2");
    assert_eq!(time::trim_float(-1.500), "-1.5");
    assert_eq!(time::trim_float(-0.040), "-0.04");
}

#[test]
fn time_trim_float_handles_very_small_decimals() {
    assert_eq!(time::trim_float(0.004), "0.004");
    assert_eq!(time::trim_float(0.010), "0.01");
    assert_eq!(time::trim_float(0.0004), "0");
}
