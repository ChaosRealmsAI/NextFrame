use nf_recorder::{Recorder, StubRecorder};

fn main() -> anyhow::Result<()> {
    let rec = StubRecorder::new();
    let progress = rec.progress();
    let out = serde_json::json!({
        "ok": true,
        "crate": "nf-recorder",
        "version": nf_recorder::version(),
        "frames_done": progress.frames_done,
        "total": progress.total,
        "status": "walking-skeleton",
    });
    println!("{}", serde_json::to_string(&out)?);
    Ok(())
}
