use anyhow::Result;
use serde_json::to_string;
use videocut_core::CutReport;
use videocut_cut::{CutOptions, cut_plan};

use crate::cli::CutArgs;

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
                println!("{line}");
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
