#![cfg(target_os = "macos")]

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use serde_json::Value;

#[test]
#[ignore = "requires ScreenCaptureKit permission"]
fn poc_recorder_binary_writes_pixel_verified_mp4() -> Result<()> {
    let bundle_path = temp_path("integration-pixel.html");
    let out_path = temp_path("integration-pixel.mp4");
    fs::write(&bundle_path, test_html()).context("write integration HTML fixture")?;

    let output = Command::new(env!("CARGO_BIN_EXE_poc-recorder"))
        .args([
            "--bundle",
            &bundle_path.display().to_string(),
            "--out",
            &out_path.display().to_string(),
            "--duration",
            "1",
            "--fps",
            "30",
            "--size",
            "720x480",
            "--verify",
        ])
        .output()
        .context("run poc-recorder")?;
    if !output.status.success() {
        bail!(
            "poc-recorder failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let stdout = String::from_utf8(output.stdout)?;
    let done = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .last()
        .context("poc-recorder did not emit final JSON")?;
    let payload: Value = serde_json::from_str(done).context("parse poc-recorder JSON")?;
    let verify = payload
        .get("verify")
        .and_then(Value::as_object)
        .context("verify payload missing")?;
    let avg = verify
        .get("center_avg_rgb")
        .and_then(Value::as_array)
        .context("center_avg_rgb missing")?;
    if avg.len() != 3 {
        bail!("center_avg_rgb should contain 3 channels");
    }
    let max_channel = avg
        .iter()
        .filter_map(Value::as_f64)
        .fold(0.0_f64, f64::max);
    if max_channel <= 80.0 {
        bail!("center region stayed too dark: {avg:?}");
    }

    let diff_ratio = verify
        .get("diff_ratio_frame0_frame14")
        .and_then(Value::as_f64)
        .context("diff_ratio_frame0_frame14 missing")?;
    if diff_ratio <= 0.05 {
        bail!("animation diff too small: {diff_ratio}");
    }

    if !out_path.is_file() {
        bail!("recorder did not produce {}", out_path.display());
    }
    Ok(())
}

fn temp_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("nf-recorder-{nonce}-{name}"))
}

fn test_html() -> &'static str {
    r#"<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #0f1830;
      }
      body {
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #08111f 0%, #18345b 100%);
      }
      #square {
        width: 180px;
        height: 180px;
        border-radius: 24px;
        background: rgb(238, 52, 39);
        box-shadow: 0 32px 96px rgba(238, 52, 39, 0.35);
        transform-origin: center;
      }
    </style>
  </head>
  <body>
    <div id="square"></div>
    <script>
      const square = document.getElementById("square");
      const send = async (payload) => {
        const handler = window.webkit?.messageHandlers?.__nfBridge;
        if (!handler) return;
        try { await handler.postMessage(JSON.stringify(payload)); } catch (_) {}
      };
      const render = (t) => {
        const shift = Math.sin(t * Math.PI * 2) * 72;
        const rotate = t * 90;
        square.style.transform = `translate(${shift}px, 0px) rotate(${rotate}deg)`;
      };
      window.__nfTick = (seq, t) => {
        render(t);
        void send({ kind: "frameReady", seq });
      };
      render(0);
      void send({ kind: "ready" });
    </script>
  </body>
</html>
"#
}
