//! Stdout writers shared by nf-source subcommands.
use std::io::{self, Write};

use anyhow::Result;

pub fn write_json_pretty(value: &serde_json::Value) -> Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer_pretty(&mut stdout, value)?;
    stdout.write_all(b"\n")?;
    Ok(())
}

pub fn write_stdout_line(line: &str) -> Result<()> {
    let mut stdout = io::stdout().lock();
    stdout.write_all(line.as_bytes())?;
    stdout.write_all(b"\n")?;
    Ok(())
}
