// T4-HARNESS stub — T4-CLI will overwrite this with the real implementation.
// Exists only so `cargo build --workspace` succeeds during harness baseline.

fn main() {
    // stdout must be JSON-only (rule-ai-operable).
    println!(r#"{{"event":"cli.stub"}}"#);
}
