// nf-shell-mac · macOS 原生桌面端外壳
// T-04 · `--test-mode window-only` 启动只开窗口（不挂 panel / preview / runtime）
// T-11 会换成完整启动流程（topbar + preview WKWebView + timeline + inspector）

use std::process::ExitCode;

use nf_shell_mac::window::{MainWindow, WindowError};
use objc2_foundation::MainThreadMarker;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let window_only = args.iter().any(|a| a == "window-only")
        && args.iter().any(|a| a == "--test-mode");

    if window_only {
        return match run_window_only() {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("nf-shell-mac: {err}");
                ExitCode::from(1)
            }
        };
    }

    // 其他模式 T-11 填 · 本版 placeholder 保持 exit 0 便于 CI
    println!("nf-shell-mac v0.1.0 · T-04 window-only mode: --test-mode window-only");
    ExitCode::SUCCESS
}

fn run_window_only() -> Result<(), WindowError> {
    let mtm = MainThreadMarker::new().ok_or(WindowError::NotOnMainThread)?;
    let _window = MainWindow::new(mtm)?;
    nf_shell_mac::window::run_app(mtm); // 阻塞 · 关闭窗口 → NSApp.terminate 退出
    Ok(())
}
