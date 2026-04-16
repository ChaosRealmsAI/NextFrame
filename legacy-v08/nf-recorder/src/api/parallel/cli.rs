//! api parallel cli helpers
use std::env;
use std::ffi::OsString;
use std::path::PathBuf;

use crate::api::RecordArgs;
use crate::error_with_fix;

pub(super) const RECORDER_PATH_ENV: &str = "NEXTFRAME_RECORDER_PATH";

pub(super) fn resolve_parallel_executable() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os(RECORDER_PATH_ENV).map(PathBuf::from) {
        if path.is_file() {
            return Ok(path);
        }
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "resolve the recorder executable",
                format!(
                    "{RECORDER_PATH_ENV} does not point to a file: {}",
                    path.display()
                ),
                "Set the environment variable to the `nextframe-recorder` CLI binary.",
            ),
        );
    }

    let current = env::current_exe().map_err(|err| {
        error_with_fix(
            "resolve the current recorder executable",
            err,
            "Run the recorder from an installed binary or set NEXTFRAME_RECORDER_PATH explicitly.",
        )
    })?;
    if current.is_file() {
        return Ok(current);
    }

    Err(
        /* Fix: user-facing error formatted below */
        error_with_fix(
            "resolve the recorder executable",
            "the current executable path is not a file",
            "Set NEXTFRAME_RECORDER_PATH to the `nextframe-recorder` CLI binary.",
        ),
    )
}

pub(super) fn build_cli_args(args: &RecordArgs) -> Vec<OsString> {
    let mut cli_args = Vec::with_capacity(args.frames.len() + 16);
    cli_args.push(OsString::from("slide"));
    for frame in &args.frames {
        cli_args.push(frame.as_os_str().to_os_string());
    }
    cli_args.push(OsString::from("--out"));
    cli_args.push(args.out.as_os_str().to_os_string());
    cli_args.push(OsString::from("--fps"));
    cli_args.push(OsString::from(args.fps.to_string()));
    cli_args.push(OsString::from("--crf"));
    cli_args.push(OsString::from(args.crf.to_string()));
    cli_args.push(OsString::from("--dpr"));
    cli_args.push(OsString::from(args.dpr.to_string()));
    cli_args.push(OsString::from("--width"));
    cli_args.push(OsString::from(args.width.to_string()));
    cli_args.push(OsString::from("--height"));
    cli_args.push(OsString::from(args.height.to_string()));

    if let Some(jobs) = args.jobs {
        cli_args.push(OsString::from("--jobs"));
        cli_args.push(OsString::from(jobs.to_string()));
    }
    if args.skip {
        cli_args.push(OsString::from("--skip"));
    }
    if args.skip_aggressive {
        cli_args.push(OsString::from("--skip-aggressive"));
    }
    if args.headed {
        cli_args.push(OsString::from("--headed"));
    }
    if args.render_scale < 1.0 {
        cli_args.push(OsString::from("--render-scale"));
        cli_args.push(OsString::from(args.render_scale.to_string()));
    }
    if args.disable_audio {
        cli_args.push(OsString::from("--disable-audio"));
    }
    cli_args.push(OsString::from("--parallel"));
    cli_args.push(OsString::from(args.parallel.to_string()));

    cli_args
}
