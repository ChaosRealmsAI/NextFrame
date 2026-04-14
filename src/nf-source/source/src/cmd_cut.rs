//! Cut command for producing clips and a cut report.
use anyhow::Result;
use nf_cut::{CutOptions, cut_plan};
use nf_cut_core::CutReport;
use serde_json::to_string;

use crate::cli::CutArgs;
use crate::output::write_stdout_line;

pub fn run(args: CutArgs) -> Result<()> {
    let report_path = args.out_dir.join("cut_report.json");
    let report = cut_plan(
        &CutOptions {
            video: args.video,
            sentences_path: args.sentences_path,
            plan_path: args.plan_path,
            out_dir: args.out_dir,
            margin_sec: args.margin_sec,
        },
        |event| {
            if let Ok(line) = to_string(event) {
                let _ = write_stdout_line(&line);
            }
        },
    )?;

    report.write_to_path(&report_path)?;
    print_summary(&report);
    Ok(())
}

fn print_summary(report: &CutReport) {
    eprintln!(
        "cut complete: {} succeeded, {} failed",
        report.success.len(),
        report.failed.len()
    );
}
