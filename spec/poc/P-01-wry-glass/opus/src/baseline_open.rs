//! baseline-open: Open editor-v0.1.html in Safari (macOS system WKWebView
//! via Safari shell). Used purely to produce the baseline screenshot.

use std::path::PathBuf;
use std::process::Command;

fn main() -> std::io::Result<()> {
    let manifest = env!("CARGO_MANIFEST_DIR");
    let html = PathBuf::from(manifest)
        .parent()
        .map(|p| p.join("spec/design/prototypes/editor-v0.1.html"))
        .unwrap_or_else(|| PathBuf::from("../spec/design/prototypes/editor-v0.1.html"));
    if !html.exists() {
        eprintln!("[baseline] not found: {:?}", html);
        std::process::exit(2);
    }
    eprintln!("[baseline] opening {}", html.display());
    Command::new("open")
        .arg("-a")
        .arg("Safari")
        .arg(&html)
        .status()?;
    Ok(())
}
