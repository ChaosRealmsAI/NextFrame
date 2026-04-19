//! T-17 · Pure-Rust MP4 atom verifier · product-built self-verification.
//!
//! **Why exist**: `self-verification` rule bans external `mediainfo` / `ffprobe`
//! for product verification. Recording quality checks must be internal to the
//! product so a fresh Claude session can verify with only `./nf-recorder verify`.
//!
//! ## What it checks (6 assertions for v1.14)
//! 1. `moov_front` — moov atom appears before mdat (network / web playback OK)
//! 2. `color_primaries == bt709` — H.264 VUI color primaries
//! 3. `transfer_characteristics == bt709` — gamma
//! 4. `frame_rate ≈ expected_fps ± 0.1%` — from stts
//! 5. `bit_rate ≈ expected_bitrate ± 15%` — mdat_size * 8 / duration
//! 6. `codec == avc1 / H.264` — from stsd
//!
//! ## Hard constraints
//! - ❌ NO external deps (mp4parse / mediainfo / ffprobe)
//! - ❌ NO unwrap / expect / panic / todo (workspace lints deny)
//! - ✅ Pure std + thiserror · ~500 LOC self-contained
//! - ✅ Exp-Golomb decode inline for SPS colour_description

use serde::Serialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// fps tolerance window (± 0.1%).
const FPS_TOLERANCE: f64 = 0.001;

/// Bitrate tolerance window (± 15%) · encoder sees target as a soft ceiling.
const BITRATE_TOLERANCE: f64 = 0.15;

/// Full verdict of one MP4 file · serializable for JSON output.
#[derive(Debug, Clone, Serialize)]
pub struct Mp4Verdict {
    pub file: String,
    pub file_size: u64,
    pub moov_front: bool,
    pub moov_offset: u64,
    pub mdat_offset: u64,
    pub ftyp_brand: String,
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub frame_rate: f64,
    pub bit_rate: u64,
    pub color_primaries: String,
    pub transfer: String,
    pub ycbcr_matrix: String,
    pub has_b_frames: bool,
    pub time_scale: u32,
    pub duration_ms: u64,
    pub sample_count: u64,
}

/// One MP4 assertion result.
#[derive(Debug, Clone, Serialize)]
pub struct Assertion {
    pub name: String,
    pub expected: String,
    pub actual: String,
    pub pass: bool,
}

/// Errors from `verify`.
#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    #[error("io: {0}")]
    Io(String),
    #[error("malformed mp4: {0}")]
    Malformed(String),
    #[error("unsupported codec: {0}")]
    UnsupportedCodec(String),
}

/// Verify an MP4 file · returns verdict + list of 6 assertions.
///
/// # Arguments
/// - `path`: MP4 file path
/// - `expect_fps`: expected frame rate (e.g., 60)
/// - `expect_bitrate`: optional expected bitrate bps (if `None`, skip bitrate assertion)
pub fn verify(
    path: &Path,
    expect_fps: u32,
    expect_bitrate: Option<u32>,
) -> Result<(Mp4Verdict, Vec<Assertion>), VerifyError> {
    let mut file = File::open(path).map_err(|e| VerifyError::Io(format!("{e}")))?;
    let file_size = file
        .metadata()
        .map_err(|e| VerifyError::Io(format!("metadata: {e}")))?
        .len();

    // 1. Scan top-level atoms · capture ftyp / moov / mdat offsets + moov bytes.
    let TopLevel {
        ftyp_brand,
        moov_offset,
        mdat_offset,
        mdat_size,
        moov_bytes,
    } = scan_top_level(&mut file, file_size)?;

    // 2. Parse moov tree · extract trak for video · pull sample tables.
    let info = parse_moov(&moov_bytes)?;

    // 3. Derive fps + bitrate.
    let duration_ms = if info.movie_timescale == 0 {
        0
    } else {
        (info.duration_units * 1000) / u64::from(info.movie_timescale)
    };

    let frame_rate = if info.avg_sample_duration == 0 || info.media_timescale == 0 {
        0.0
    } else {
        f64::from(info.media_timescale) / (info.avg_sample_duration as f64)
    };

    let bit_rate = if duration_ms == 0 {
        0
    } else {
        (mdat_size.saturating_mul(8).saturating_mul(1000)) / duration_ms
    };

    let verdict = Mp4Verdict {
        file: path.display().to_string(),
        file_size,
        moov_front: moov_offset < mdat_offset,
        moov_offset,
        mdat_offset,
        ftyp_brand,
        codec: info.codec.clone(),
        width: info.width,
        height: info.height,
        frame_rate,
        bit_rate,
        color_primaries: info.color_primaries.clone(),
        transfer: info.transfer.clone(),
        ycbcr_matrix: info.matrix.clone(),
        has_b_frames: info.has_b_frames,
        time_scale: info.media_timescale,
        duration_ms,
        sample_count: info.sample_count,
    };

    // 4. Build 6 assertions.
    let mut asserts: Vec<Assertion> = Vec::with_capacity(6);

    // A1 · moov-front
    asserts.push(Assertion {
        name: "moov_front".into(),
        expected: "moov_offset < mdat_offset".into(),
        actual: format!(
            "moov@{} mdat@{}",
            verdict.moov_offset, verdict.mdat_offset
        ),
        pass: verdict.moov_front,
    });

    // A2 · color_primaries bt709
    let primaries_pass = verdict.color_primaries.contains("709");
    asserts.push(Assertion {
        name: "color_primaries_bt709".into(),
        expected: "contains \"709\"".into(),
        actual: verdict.color_primaries.clone(),
        pass: primaries_pass,
    });

    // A3 · transfer bt709
    let transfer_pass = verdict.transfer.contains("709");
    asserts.push(Assertion {
        name: "transfer_bt709".into(),
        expected: "contains \"709\"".into(),
        actual: verdict.transfer.clone(),
        pass: transfer_pass,
    });

    // A4 · fps within ± 0.1%
    let fps_expected = f64::from(expect_fps);
    let fps_delta = (verdict.frame_rate - fps_expected).abs();
    let fps_tol = fps_expected * FPS_TOLERANCE;
    let fps_pass = verdict.frame_rate > 0.0 && fps_delta <= fps_tol;
    asserts.push(Assertion {
        name: "frame_rate".into(),
        expected: format!("{fps_expected:.3} ± {:.3} (0.1%)", fps_tol),
        actual: format!("{:.3}", verdict.frame_rate),
        pass: fps_pass,
    });

    // A5 · bitrate within ± 15% (only if expect_bitrate provided).
    match expect_bitrate {
        Some(exp) => {
            let exp_f = f64::from(exp);
            let lo = exp_f * (1.0 - BITRATE_TOLERANCE);
            let hi = exp_f * (1.0 + BITRATE_TOLERANCE);
            let actual_f = verdict.bit_rate as f64;
            let pass = actual_f >= lo && actual_f <= hi;
            asserts.push(Assertion {
                name: "bit_rate".into(),
                expected: format!(
                    "{exp} bps ± 15% (range {:.0}..{:.0})",
                    lo, hi
                ),
                actual: format!("{} bps", verdict.bit_rate),
                pass,
            });
        }
        None => {
            asserts.push(Assertion {
                name: "bit_rate".into(),
                expected: "skipped (no --expect-bitrate)".into(),
                actual: format!("{} bps", verdict.bit_rate),
                pass: true,
            });
        }
    }

    // A6 · codec avc1 / H.264
    let codec_pass = verdict.codec == "avc1" || verdict.codec.to_uppercase().contains("H.264");
    asserts.push(Assertion {
        name: "codec_avc1".into(),
        expected: "avc1 (H.264)".into(),
        actual: verdict.codec.clone(),
        pass: codec_pass,
    });

    Ok((verdict, asserts))
}

// ────────────────────────── top-level atom scan ──────────────────────────

struct TopLevel {
    ftyp_brand: String,
    moov_offset: u64,
    mdat_offset: u64,
    mdat_size: u64,
    moov_bytes: Vec<u8>,
}

fn scan_top_level(file: &mut File, file_size: u64) -> Result<TopLevel, VerifyError> {
    file.seek(SeekFrom::Start(0))
        .map_err(|e| VerifyError::Io(format!("seek0: {e}")))?;

    let mut offset: u64 = 0;
    let mut ftyp_brand = String::new();
    let mut moov_offset: Option<u64> = None;
    let mut mdat_offset: Option<u64> = None;
    let mut mdat_size: u64 = 0;
    let mut moov_bytes: Vec<u8> = Vec::new();

    let mut header = [0u8; 16];

    while offset + 8 <= file_size {
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| VerifyError::Io(format!("seek {offset}: {e}")))?;
        let n = read_fully(file, &mut header[..8])?;
        if n < 8 {
            break;
        }
        let size32 = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
        let atom_type = [header[4], header[5], header[6], header[7]];

        let (atom_size, header_len) = if size32 == 1 {
            // 64-bit size
            let n2 = read_fully(file, &mut header[8..16])?;
            if n2 < 8 {
                return Err(VerifyError::Malformed(format!(
                    "truncated largesize at {offset}"
                )));
            }
            let mut sz64 = [0u8; 8];
            sz64.copy_from_slice(&header[8..16]);
            (u64::from_be_bytes(sz64), 16u64)
        } else if size32 == 0 {
            // extends to EOF
            (file_size - offset, 8u64)
        } else {
            (u64::from(size32), 8u64)
        };

        if atom_size < header_len {
            return Err(VerifyError::Malformed(format!(
                "atom size {atom_size} < header {header_len} at {offset}"
            )));
        }

        match &atom_type {
            b"ftyp" => {
                // first 4 bytes of body = major brand
                let mut brand = [0u8; 4];
                if read_fully(file, &mut brand)? == 4 {
                    ftyp_brand = ascii_code(&brand);
                }
            }
            b"moov" => {
                moov_offset = Some(offset);
                let body_len = atom_size - header_len;
                let Ok(body_len_usize) = usize::try_from(body_len) else {
                    return Err(VerifyError::Malformed(format!(
                        "moov too large: {body_len}"
                    )));
                };
                let mut buf = vec![0u8; body_len_usize];
                let n = read_fully(file, &mut buf)?;
                if n < body_len_usize {
                    return Err(VerifyError::Malformed(format!(
                        "short moov read: {n}/{body_len_usize}"
                    )));
                }
                moov_bytes = buf;
            }
            b"mdat" => {
                if mdat_offset.is_none() {
                    mdat_offset = Some(offset);
                    mdat_size = atom_size.saturating_sub(header_len);
                }
            }
            _ => {}
        }

        let next = offset.saturating_add(atom_size);
        if next <= offset {
            return Err(VerifyError::Malformed(format!(
                "non-advancing atom at {offset}"
            )));
        }
        offset = next;
    }

    let moov_offset =
        moov_offset.ok_or_else(|| VerifyError::Malformed("no moov atom".into()))?;
    let mdat_offset =
        mdat_offset.ok_or_else(|| VerifyError::Malformed("no mdat atom".into()))?;
    if moov_bytes.is_empty() {
        return Err(VerifyError::Malformed("empty moov body".into()));
    }

    Ok(TopLevel {
        ftyp_brand,
        moov_offset,
        mdat_offset,
        mdat_size,
        moov_bytes,
    })
}

fn read_fully(file: &mut File, buf: &mut [u8]) -> Result<usize, VerifyError> {
    let mut filled = 0;
    while filled < buf.len() {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) => return Err(VerifyError::Io(format!("read: {e}"))),
        }
    }
    Ok(filled)
}

fn ascii_code(b: &[u8; 4]) -> String {
    let mut s = String::with_capacity(4);
    for c in b {
        if c.is_ascii_graphic() || *c == b' ' {
            s.push(*c as char);
        } else {
            s.push('?');
        }
    }
    s
}

// ────────────────────────── moov parsing ──────────────────────────

#[derive(Debug, Default)]
struct MoovInfo {
    movie_timescale: u32,
    duration_units: u64,
    media_timescale: u32,
    codec: String,
    width: u32,
    height: u32,
    color_primaries: String,
    transfer: String,
    matrix: String,
    has_b_frames: bool,
    avg_sample_duration: u64,
    sample_count: u64,
}

fn parse_moov(body: &[u8]) -> Result<MoovInfo, VerifyError> {
    let mut info = MoovInfo::default();

    // moov children: mvhd · trak · ...
    let children = iter_children(body)?;
    for (atype, sub) in &children {
        match atype {
            b"mvhd" => {
                let (ts, dur) = parse_mvhd(sub)?;
                info.movie_timescale = ts;
                info.duration_units = dur;
            }
            b"trak" => {
                // Only take the first video trak. If a second trak looks non-video
                // we ignore it (audio / text).
                if info.codec.is_empty() {
                    parse_trak(sub, &mut info)?;
                }
            }
            _ => {}
        }
    }

    if info.codec.is_empty() {
        return Err(VerifyError::Malformed("no video trak found".into()));
    }
    Ok(info)
}

/// Iterate direct children of a container (list of `(type, body)`).
fn iter_children(body: &[u8]) -> Result<Vec<([u8; 4], &[u8])>, VerifyError> {
    let mut out = Vec::new();
    let mut i = 0usize;
    while i + 8 <= body.len() {
        let size32 = u32::from_be_bytes([body[i], body[i + 1], body[i + 2], body[i + 3]]);
        let at = [body[i + 4], body[i + 5], body[i + 6], body[i + 7]];
        let (size, hlen) = if size32 == 1 {
            if i + 16 > body.len() {
                return Err(VerifyError::Malformed("child largesize truncated".into()));
            }
            let mut s = [0u8; 8];
            s.copy_from_slice(&body[i + 8..i + 16]);
            (u64::from_be_bytes(s) as usize, 16usize)
        } else if size32 == 0 {
            (body.len() - i, 8usize)
        } else {
            (size32 as usize, 8usize)
        };
        if size < hlen || i + size > body.len() {
            return Err(VerifyError::Malformed(format!(
                "child atom size {size} exceeds parent at {i}"
            )));
        }
        out.push((at, &body[i + hlen..i + size]));
        i += size;
    }
    Ok(out)
}

fn parse_mvhd(body: &[u8]) -> Result<(u32, u64), VerifyError> {
    if body.len() < 4 {
        return Err(VerifyError::Malformed("mvhd too short".into()));
    }
    let version = body[0];
    if version == 1 {
        // version 1: 4 flag + 8 ctime + 8 mtime + 4 timescale + 8 duration
        if body.len() < 4 + 8 + 8 + 4 + 8 {
            return Err(VerifyError::Malformed("mvhd v1 too short".into()));
        }
        let ts = u32::from_be_bytes([body[20], body[21], body[22], body[23]]);
        let mut dur = [0u8; 8];
        dur.copy_from_slice(&body[24..32]);
        Ok((ts, u64::from_be_bytes(dur)))
    } else {
        // version 0: 4 flag + 4 ctime + 4 mtime + 4 timescale + 4 duration
        if body.len() < 4 + 4 + 4 + 4 + 4 {
            return Err(VerifyError::Malformed("mvhd v0 too short".into()));
        }
        let ts = u32::from_be_bytes([body[12], body[13], body[14], body[15]]);
        let dur = u32::from_be_bytes([body[16], body[17], body[18], body[19]]);
        Ok((ts, u64::from(dur)))
    }
}

fn parse_trak(body: &[u8], info: &mut MoovInfo) -> Result<(), VerifyError> {
    // trak children: tkhd · mdia
    let children = iter_children(body)?;
    for (atype, sub) in &children {
        if atype == b"mdia" {
            parse_mdia(sub, info)?;
        }
    }
    Ok(())
}

fn parse_mdia(body: &[u8], info: &mut MoovInfo) -> Result<(), VerifyError> {
    // mdia children: mdhd · hdlr · minf
    let children = iter_children(body)?;
    let mut is_video = false;
    for (atype, sub) in &children {
        match atype {
            b"mdhd" => {
                let ts = parse_mdhd_timescale(sub)?;
                // captured tentatively · only apply if video
                info.media_timescale = ts;
            }
            b"hdlr" => {
                if hdlr_is_video(sub) {
                    is_video = true;
                }
            }
            b"minf" => {
                if is_video {
                    parse_minf(sub, info)?;
                } else {
                    // defer — we need hdlr first. If hdlr came earlier we already set is_video.
                    // If hdlr is after minf (unusual), we'll handle by second pass below.
                }
            }
            _ => {}
        }
    }

    // If hdlr came after minf, do a second pass.
    if !is_video {
        for (atype, sub) in &children {
            if atype == b"hdlr" && hdlr_is_video(sub) {
                is_video = true;
            }
        }
        if is_video {
            for (atype, sub) in &children {
                if atype == b"minf" {
                    parse_minf(sub, info)?;
                }
            }
        } else {
            // audio or other · clear media_timescale so we don't apply audio ts to video.
            info.media_timescale = 0;
        }
    }

    Ok(())
}

fn parse_mdhd_timescale(body: &[u8]) -> Result<u32, VerifyError> {
    if body.len() < 4 {
        return Err(VerifyError::Malformed("mdhd too short".into()));
    }
    let version = body[0];
    let ts_off = if version == 1 { 4 + 8 + 8 } else { 4 + 4 + 4 };
    if body.len() < ts_off + 4 {
        return Err(VerifyError::Malformed("mdhd truncated".into()));
    }
    Ok(u32::from_be_bytes([
        body[ts_off],
        body[ts_off + 1],
        body[ts_off + 2],
        body[ts_off + 3],
    ]))
}

fn hdlr_is_video(body: &[u8]) -> bool {
    // hdlr: 4 version+flags · 4 predefined · 4 handler_type
    if body.len() < 12 {
        return false;
    }
    &body[8..12] == b"vide"
}

fn parse_minf(body: &[u8], info: &mut MoovInfo) -> Result<(), VerifyError> {
    // minf children: vmhd · dinf · stbl
    let children = iter_children(body)?;
    for (atype, sub) in &children {
        if atype == b"stbl" {
            parse_stbl(sub, info)?;
        }
    }
    Ok(())
}

fn parse_stbl(body: &[u8], info: &mut MoovInfo) -> Result<(), VerifyError> {
    // stbl children: stsd · stts · ctts · stsc · stsz · stco / co64
    let children = iter_children(body)?;
    for (atype, sub) in &children {
        match atype {
            b"stsd" => parse_stsd(sub, info)?,
            b"stts" => parse_stts(sub, info)?,
            b"ctts" => parse_ctts(sub, info)?,
            _ => {}
        }
    }
    Ok(())
}

fn parse_stsd(body: &[u8], info: &mut MoovInfo) -> Result<(), VerifyError> {
    // 4 version+flags · 4 entry_count · then sample entries.
    if body.len() < 8 {
        return Err(VerifyError::Malformed("stsd too short".into()));
    }
    let i = 8usize;
    if i + 8 <= body.len() {
        let size = u32::from_be_bytes([body[i], body[i + 1], body[i + 2], body[i + 3]]) as usize;
        let at = [body[i + 4], body[i + 5], body[i + 6], body[i + 7]];
        if size < 8 || i + size > body.len() {
            return Err(VerifyError::Malformed("stsd entry size".into()));
        }
        let entry_body = &body[i + 8..i + size];
        info.codec = ascii_code(&at);
        // Sample entry box layout (VisualSampleEntry, ISO/IEC 14496-12):
        //  - 6 reserved · 2 data_reference_index  = 8
        //  - 16 predefined/reserved
        //  - 2 width · 2 height                   = + 4
        //  - 4 horizresolution · 4 vertresolution
        //  - 4 reserved
        //  - 2 frame_count · 32 compressorname · 2 depth · 2 pre_defined (-1)
        //  = 78 bytes, then boxes (avcC / colr / pasp ...)
        const VIS_HDR: usize = 78;
        if entry_body.len() >= 32 {
            // width@24-26 height@26-28 (0-based within entry_body)
            info.width = u32::from(u16::from_be_bytes([entry_body[24], entry_body[25]]));
            info.height = u32::from(u16::from_be_bytes([entry_body[26], entry_body[27]]));
        }
        if entry_body.len() > VIS_HDR {
            let inner = &entry_body[VIS_HDR..];
            // iter children (avcC · colr · pasp · btrt ...)
            if let Ok(children) = iter_children(inner) {
                for (ctype, cbody) in &children {
                    match ctype {
                        b"avcC" => parse_avc_c(cbody, info),
                        b"colr" => parse_colr(cbody, info),
                        _ => {}
                    }
                }
            }
        }
        // Only first sample entry is read (v1.14 encoder emits one).
    }
    Ok(())
}

/// `colr` box: type `nclx` / `nclc` gives three codes (primaries / transfer / matrix).
fn parse_colr(body: &[u8], info: &mut MoovInfo) {
    if body.len() < 4 {
        return;
    }
    let kind = [body[0], body[1], body[2], body[3]];
    if (&kind == b"nclx" || &kind == b"nclc") && body.len() >= 10 {
        let prim = u16::from_be_bytes([body[4], body[5]]);
        let tf = u16::from_be_bytes([body[6], body[7]]);
        let mat = u16::from_be_bytes([body[8], body[9]]);
        // Only update if not already set by SPS (SPS is authoritative per Apple writer).
        if info.color_primaries.is_empty() {
            info.color_primaries = describe_primaries(prim);
        }
        if info.transfer.is_empty() {
            info.transfer = describe_transfer(tf);
        }
        if info.matrix.is_empty() {
            info.matrix = describe_matrix(mat);
        }
    }
}

fn describe_primaries(code: u16) -> String {
    match code {
        1 => "bt709".into(),
        9 => "bt2020".into(),
        other => format!("code{other}"),
    }
}

fn describe_transfer(code: u16) -> String {
    match code {
        1 => "bt709".into(),
        16 => "smpte2084".into(),
        18 => "hlg".into(),
        other => format!("code{other}"),
    }
}

fn describe_matrix(code: u16) -> String {
    match code {
        1 => "bt709".into(),
        9 => "bt2020ncl".into(),
        other => format!("code{other}"),
    }
}

/// Parse `avcC` (AVCDecoderConfigurationRecord) · pull the first SPS and decode
/// its VUI colour_description to overwrite colr if SPS says otherwise.
///
/// Layout (ISO/IEC 14496-15):
/// - 1  configurationVersion
/// - 1  AVCProfileIndication
/// - 1  profile_compatibility
/// - 1  AVCLevelIndication
/// - 1  0xFC | (lengthSizeMinusOne & 0x03)
/// - 1  0xE0 | (numOfSequenceParameterSets & 0x1F)
/// - for each SPS: 2 bytes size · N bytes NAL
fn parse_avc_c(body: &[u8], info: &mut MoovInfo) {
    if body.len() < 6 {
        return;
    }
    let num_sps = body[5] & 0x1F;
    if num_sps == 0 {
        return;
    }
    let mut i = 6usize;
    if i + 2 > body.len() {
        return;
    }
    let sps_len = u16::from_be_bytes([body[i], body[i + 1]]) as usize;
    i += 2;
    if i + sps_len > body.len() || sps_len == 0 {
        return;
    }
    let sps_nal = &body[i..i + sps_len];
    // First byte = NAL header (forbidden_zero_bit + nal_ref_idc + nal_unit_type=7).
    // SPS payload starts at byte 1 (after emulation-prevention removal).
    if sps_nal.len() < 2 {
        return;
    }
    let rbsp = strip_emulation_prevention(&sps_nal[1..]);
    parse_sps_vui(&rbsp, info);
}

/// Remove emulation-prevention bytes (0x00 0x00 0x03 → 0x00 0x00).
fn strip_emulation_prevention(nal: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(nal.len());
    let mut i = 0;
    while i < nal.len() {
        if i + 2 < nal.len() && nal[i] == 0 && nal[i + 1] == 0 && nal[i + 2] == 3 {
            out.push(0);
            out.push(0);
            i += 3;
        } else {
            out.push(nal[i]);
            i += 1;
        }
    }
    out
}

/// Minimal bit reader for exp-Golomb on a byte slice (MSB-first).
struct BitReader<'a> {
    data: &'a [u8],
    pos: usize, // bit position
}

impl<'a> BitReader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    fn read_bit(&mut self) -> Option<u32> {
        let byte_idx = self.pos / 8;
        let bit_idx = 7 - (self.pos % 8);
        if byte_idx >= self.data.len() {
            return None;
        }
        let b = (self.data[byte_idx] >> bit_idx) & 1;
        self.pos += 1;
        Some(u32::from(b))
    }

    fn read_bits(&mut self, n: u32) -> Option<u32> {
        if n > 32 {
            return None;
        }
        let mut v = 0u32;
        for _ in 0..n {
            v = (v << 1) | self.read_bit()?;
        }
        Some(v)
    }

    /// Unsigned exp-Golomb (ue(v)).
    fn read_ue(&mut self) -> Option<u32> {
        let mut zeros = 0u32;
        while self.read_bit()? == 0 {
            zeros += 1;
            if zeros > 31 {
                return None;
            }
        }
        if zeros == 0 {
            return Some(0);
        }
        let suffix = self.read_bits(zeros)?;
        Some((1u32 << zeros) - 1 + suffix)
    }

    /// Signed exp-Golomb (se(v)).
    fn read_se(&mut self) -> Option<i32> {
        let k = self.read_ue()?;
        if k == 0 {
            return Some(0);
        }
        let mag = (k as i64 + 1) / 2;
        if k & 1 == 1 {
            Some(mag as i32)
        } else {
            Some(-(mag as i32))
        }
    }
}

/// Parse SPS RBSP up through VUI colour_description + ref_frames hint (7.3.2.1.1).
///
/// Only fields we need:
/// - profile_idc (to know if chroma_format_idc appears)
/// - chroma_format_idc (if profile in {100,110,122,244,44,83,86,118,128,138,139,134,135})
/// - log2_max_frame_num_minus4 ... etc (ignored via skip)
/// - max_num_ref_frames (we keep — used for has_b_frames hint)
/// - frame_mbs_only_flag
/// - frame_cropping ...
/// - vui_parameters_present_flag
///     - aspect / overscan / video_signal_type_present_flag
///         - colour_description_present_flag
///             - colour_primaries · transfer · matrix (each u8)
fn parse_sps_vui(rbsp: &[u8], info: &mut MoovInfo) {
    let mut r = BitReader::new(rbsp);
    let Some(profile_idc) = r.read_bits(8) else { return };
    // constraint_set_flags (8) + reserved_zero_2bits (already in 8)
    if r.read_bits(8).is_none() { return; }
    // level_idc
    if r.read_bits(8).is_none() { return; }
    // seq_parameter_set_id ue
    if r.read_ue().is_none() { return; }

    let has_chroma = matches!(profile_idc, 100|110|122|244|44|83|86|118|128|138|139|134|135);
    if has_chroma {
        let chroma = match r.read_ue() { Some(v) => v, None => return };
        if chroma == 3 {
            // separate_colour_plane_flag
            if r.read_bit().is_none() { return; }
        }
        // bit_depth_luma_minus8 ue
        if r.read_ue().is_none() { return; }
        // bit_depth_chroma_minus8 ue
        if r.read_ue().is_none() { return; }
        // qpprime_y_zero_transform_bypass_flag u1
        if r.read_bit().is_none() { return; }
        // seq_scaling_matrix_present_flag u1
        let scaling_present = match r.read_bit() { Some(v) => v, None => return };
        if scaling_present == 1 {
            // 8 or 12 scaling_list flags each possibly followed by a list · complex.
            // Skip pragmatically — if present, we fail gracefully and leave VUI unset
            // (caller falls back to colr box). For Apple-written MP4 this is usually 0.
            return;
        }
    }

    // log2_max_frame_num_minus4 ue
    if r.read_ue().is_none() { return; }
    // pic_order_cnt_type ue
    let poc_type = match r.read_ue() { Some(v) => v, None => return };
    if poc_type == 0 {
        if r.read_ue().is_none() { return; } // log2_max_pic_order_cnt_lsb_minus4
    } else if poc_type == 1 {
        if r.read_bit().is_none() { return; } // delta_pic_order_always_zero_flag
        if r.read_se().is_none() { return; } // offset_for_non_ref_pic
        if r.read_se().is_none() { return; } // offset_for_top_to_bottom_field
        let num_ref = match r.read_ue() { Some(v) => v, None => return };
        for _ in 0..num_ref {
            if r.read_se().is_none() { return; }
        }
    }

    // max_num_ref_frames ue
    let _max_ref = match r.read_ue() { Some(v) => v, None => return };
    // gaps_in_frame_num_value_allowed_flag u1
    if r.read_bit().is_none() { return; }
    // pic_width_in_mbs_minus1 ue
    if r.read_ue().is_none() { return; }
    // pic_height_in_map_units_minus1 ue
    if r.read_ue().is_none() { return; }
    // frame_mbs_only_flag u1
    let frame_mbs_only = match r.read_bit() { Some(v) => v, None => return };
    if frame_mbs_only == 0 {
        if r.read_bit().is_none() { return; } // mb_adaptive_frame_field_flag
    }
    // direct_8x8_inference_flag u1
    if r.read_bit().is_none() { return; }
    // frame_cropping_flag u1
    let crop = match r.read_bit() { Some(v) => v, None => return };
    if crop == 1 {
        if r.read_ue().is_none() { return; }
        if r.read_ue().is_none() { return; }
        if r.read_ue().is_none() { return; }
        if r.read_ue().is_none() { return; }
    }
    // vui_parameters_present_flag
    let vui = match r.read_bit() { Some(v) => v, None => return };
    if vui == 0 { return; }

    // VUI (E.1.1): aspect / overscan / video_signal_type / chroma_loc / timing / ...
    // aspect_ratio_info_present_flag
    let ar_present = match r.read_bit() { Some(v) => v, None => return };
    if ar_present == 1 {
        let idc = match r.read_bits(8) { Some(v) => v, None => return };
        if idc == 255 {
            if r.read_bits(16).is_none() { return; }
            if r.read_bits(16).is_none() { return; }
        }
    }
    // overscan_info_present_flag
    let ov = match r.read_bit() { Some(v) => v, None => return };
    if ov == 1 {
        if r.read_bit().is_none() { return; } // overscan_appropriate_flag
    }
    // video_signal_type_present_flag
    let vs = match r.read_bit() { Some(v) => v, None => return };
    if vs == 0 { return; }
    // video_format u3
    if r.read_bits(3).is_none() { return; }
    // video_full_range_flag u1
    if r.read_bit().is_none() { return; }
    // colour_description_present_flag
    let cdp = match r.read_bit() { Some(v) => v, None => return };
    if cdp == 0 { return; }
    let prim = match r.read_bits(8) { Some(v) => v, None => return };
    let tf = match r.read_bits(8) { Some(v) => v, None => return };
    let mat = match r.read_bits(8) { Some(v) => v, None => return };
    info.color_primaries = describe_primaries(prim as u16);
    info.transfer = describe_transfer(tf as u16);
    info.matrix = describe_matrix(mat as u16);
}

/// stts: (version+flags 4) + entry_count 4 + N × (sample_count 4, sample_delta 4).
fn parse_stts(body: &[u8], info: &mut MoovInfo) -> Result<(), VerifyError> {
    if body.len() < 8 {
        return Err(VerifyError::Malformed("stts too short".into()));
    }
    let count = u32::from_be_bytes([body[4], body[5], body[6], body[7]]) as usize;
    let mut total_samples: u64 = 0;
    let mut total_duration: u64 = 0;
    let mut i = 8usize;
    for _ in 0..count {
        if i + 8 > body.len() {
            return Err(VerifyError::Malformed("stts entry truncated".into()));
        }
        let n = u32::from_be_bytes([body[i], body[i + 1], body[i + 2], body[i + 3]]) as u64;
        let d = u32::from_be_bytes([body[i + 4], body[i + 5], body[i + 6], body[i + 7]]) as u64;
        total_samples = total_samples.saturating_add(n);
        total_duration = total_duration.saturating_add(n.saturating_mul(d));
        i += 8;
    }
    info.sample_count = total_samples;
    info.avg_sample_duration = if total_samples == 0 {
        0
    } else {
        total_duration / total_samples
    };
    Ok(())
}

/// ctts (composition time offsets) → non-zero offset = B-frame present.
fn parse_ctts(body: &[u8], info: &mut MoovInfo) -> Result<(), VerifyError> {
    if body.len() < 8 {
        return Ok(());
    }
    let count = u32::from_be_bytes([body[4], body[5], body[6], body[7]]) as usize;
    let mut i = 8usize;
    for _ in 0..count {
        if i + 8 > body.len() {
            break;
        }
        let off = u32::from_be_bytes([body[i + 4], body[i + 5], body[i + 6], body[i + 7]]);
        if off != 0 {
            info.has_b_frames = true;
            return Ok(());
        }
        i += 8;
    }
    Ok(())
}
