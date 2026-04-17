use nf_shell_mac::{RuntimeMode, ShellController, StubShell};

fn main() -> anyhow::Result<()> {
    let shell = StubShell::new(RuntimeMode::Play);
    let out = serde_json::json!({
        "ok": true,
        "crate": "nf-shell-mac",
        "version": nf_shell_mac::version(),
        "mode": format!("{:?}", shell.current_mode()),
        "status": "walking-skeleton",
    });
    println!("{}", serde_json::to_string(&out)?);
    Ok(())
}
