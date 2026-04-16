use std::env;
use std::path::Path;
use std::process;

use anyhow::{bail, Context, Result};
use serde::Serialize;

#[derive(Debug, Serialize)]
struct DiffReport {
    pixel_diff: u64,
    total_pixels: u64,
    max_channel_diff: u8,
    identical: bool,
}

fn main() {
    match run() {
        Ok(code) => process::exit(code),
        Err(error) => {
            eprintln!("error: {error:#}");
            eprintln!("Fix: provide two readable PNG files with matching dimensions");
            process::exit(2);
        }
    }
}

fn run() -> Result<i32> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("wysiwyg-diff <png-a> <png-b>");
        println!("Compare two PNGs and emit JSON pixel-diff stats.");
        return Ok(0);
    }

    let [left_path, right_path] = args.as_slice() else {
        eprintln!("usage: wysiwyg-diff <png-a> <png-b>");
        return Ok(3);
    };

    let report = diff_pngs(Path::new(left_path), Path::new(right_path))?;
    println!("{}", serde_json::to_string(&report)?);
    Ok(if report.identical { 0 } else { 1 })
}

fn diff_pngs(left_path: &Path, right_path: &Path) -> Result<DiffReport> {
    let left = image::open(left_path)
        .with_context(|| format!("cannot read {}", left_path.display()))?
        .to_rgba8();
    let right = image::open(right_path)
        .with_context(|| format!("cannot read {}", right_path.display()))?
        .to_rgba8();

    let left_dims = left.dimensions();
    let right_dims = right.dimensions();
    if left_dims != right_dims {
        bail!(
            "PNG dimensions differ: {} is {}x{}, {} is {}x{}",
            left_path.display(),
            left_dims.0,
            left_dims.1,
            right_path.display(),
            right_dims.0,
            right_dims.1
        );
    }

    let total_pixels = u64::from(left_dims.0) * u64::from(left_dims.1);
    let mut pixel_diff = 0_u64;
    let mut max_channel_diff = 0_u8;

    for (left_pixel, right_pixel) in left.pixels().zip(right.pixels()) {
        let mut per_pixel_diff = 0_u32;
        for index in 0..4 {
            let channel_diff = left_pixel.0[index].abs_diff(right_pixel.0[index]);
            per_pixel_diff += u32::from(channel_diff);
            max_channel_diff = max_channel_diff.max(channel_diff);
        }
        pixel_diff += u64::from(per_pixel_diff);
    }

    Ok(DiffReport {
        pixel_diff,
        total_pixels,
        max_channel_diff,
        identical: pixel_diff == 0,
    })
}
