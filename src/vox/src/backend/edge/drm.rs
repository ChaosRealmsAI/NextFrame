use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use super::TRUSTED_CLIENT_TOKEN;

/// Windows epoch offset from Unix epoch in seconds (1601-01-01 to 1970-01-01).
const WIN_EPOCH: i64 = 11644473600;

/// Clock skew correction in milliseconds.
static CLOCK_SKEW_MS: AtomicI64 = AtomicI64::new(0);

/// Adjust clock skew based on server response.
pub(super) fn adjust_clock_skew(server_timestamp_s: f64) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64();
    let skew_ms = ((server_timestamp_s - now) * 1000.0) as i64;
    CLOCK_SKEW_MS.store(skew_ms, Ordering::Relaxed);
}

/// Get current unix timestamp with clock skew correction.
fn corrected_unix_secs() -> f64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64();
    now + (CLOCK_SKEW_MS.load(Ordering::Relaxed) as f64 / 1000.0)
}

/// Generate Sec-MS-GEC token value.
///
/// Algorithm:
/// 1. Get current UTC timestamp (with skew correction)
/// 2. Add Windows epoch offset
/// 3. Round down to nearest 5 minutes
/// 4. Convert to 100-nanosecond intervals (Windows file time)
/// 5. Concatenate with trusted client token
/// 6. SHA256 hash, uppercase hex
pub(super) fn generate_sec_ms_gec() -> String {
    let mut ticks = corrected_unix_secs();
    ticks += WIN_EPOCH as f64;
    ticks -= ticks % 300.0;
    ticks *= 1e9 / 100.0; // to 100-nanosecond intervals

    let str_to_hash = format!("{ticks:.0}{TRUSTED_CLIENT_TOKEN}");
    let hash = Sha256::digest(str_to_hash.as_bytes());
    format!("{hash:X}")
}

/// Generate a random MUID cookie value.
pub(super) fn generate_muid() -> String {
    use std::fmt::Write;
    let bytes: [u8; 16] = rand_bytes();
    let mut s = String::with_capacity(32);
    for b in bytes {
        write!(s, "{b:02X}").unwrap();
    }
    s
}

fn rand_bytes() -> [u8; 16] {
    let mut buf = [0u8; 16];
    getrandom(&mut buf);
    buf
}

fn getrandom(buf: &mut [u8]) {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    // Use RandomState as a simple entropy source (no extra crate needed).
    for chunk in buf.chunks_mut(8) {
        let val = RandomState::new().build_hasher().finish().to_le_bytes();
        let len = chunk.len().min(8);
        chunk[..len].copy_from_slice(&val[..len]);
    }
}

pub(super) fn sec_ms_gec_version() -> String {
    format!("1-{}", super::CHROMIUM_FULL_VERSION)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gec_token_format() {
        let token = generate_sec_ms_gec();
        assert_eq!(token.len(), 64); // SHA256 hex = 64 chars
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_muid_format() {
        let muid = generate_muid();
        assert_eq!(muid.len(), 32);
        assert!(muid.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
