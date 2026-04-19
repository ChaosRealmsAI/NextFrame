//! T-11 · FM-ASYNC gate · nf-recorder crate 源码禁 the forbidden WKWebView sync API.
//!
//! 双保险（跟 `scripts/arch-no-eval.sh` 对齐）：遍历 crate 下所有 `.rs` 文件，
//! **过滤 Rust 行注释**（以 `//` 开头，含 `///` 和 `//!`），然后统计剩余行
//! 里字面量 needle 的出现次数 —— 必须为 0。
//!
//! 注释里可以合法提到 needle（例如禁用 API 的教学提醒），所以过滤注释后再
//! count，否则会误报。Needle 本身由 runtime 拼接构造，避免让这个 test 文件
//! 自己成为被扫的违规源。

#![allow(clippy::unwrap_used)] // integration tests are allowed to unwrap
#![allow(clippy::expect_used)]

use std::fs;
use std::path::{Path, PathBuf};

/// Build the forbidden identifier at runtime so this file never contains the
/// literal string (scanner would otherwise flag itself).
fn needle() -> String {
    format!("{}{}", "evaluate", "JavaScript")
}

#[test]
fn nf_recorder_has_no_evaluate_javascript() {
    let crate_root = env!("CARGO_MANIFEST_DIR");
    let src_dir = Path::new(crate_root).join("src");
    assert!(
        src_dir.is_dir(),
        "src dir not found at {}",
        src_dir.display()
    );

    let needle = needle();
    let mut hits: Vec<(PathBuf, usize, String)> = Vec::new();
    collect_hits(&src_dir, &needle, &mut hits);

    assert!(
        hits.is_empty(),
        "FM-ASYNC violation · found {} non-comment occurrence(s) of `{}` in nf-recorder src:\n{}",
        hits.len(),
        needle,
        format_hits(&hits),
    );
}

fn collect_hits(dir: &Path, needle: &str, out: &mut Vec<(PathBuf, usize, String)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_hits(&p, needle, out);
        } else if p.extension().map_or(false, |x| x == "rs") {
            let Ok(content) = fs::read_to_string(&p) else {
                continue;
            };
            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim_start();
                // Filter Rust line comments: `//`, `///`, `//!`.
                if trimmed.starts_with("//") {
                    continue;
                }
                if line.contains(needle) {
                    out.push((p.clone(), idx + 1, line.to_string()));
                }
            }
        }
    }
}

fn format_hits(hits: &[(PathBuf, usize, String)]) -> String {
    hits.iter()
        .map(|(p, ln, l)| format!("  {}:{}: {}", p.display(), ln, l.trim()))
        .collect::<Vec<_>>()
        .join("\n")
}
