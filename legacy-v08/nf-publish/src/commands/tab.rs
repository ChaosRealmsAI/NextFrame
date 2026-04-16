//! command tab helpers
use objc2_web_kit::WKWebView;

use crate::error::error_with_fix;
use crate::state::{all_tab_infos, close_tab, create_dynamic_tab, switch_tab};

use super::{write_error, write_result};

pub(super) fn handle_command(_webview: &WKWebView, cmd: &str, result_path: &str) -> bool {
    if cmd == "tabs" {
        match serde_json::to_string_pretty(&all_tab_infos()) {
            Ok(json) => write_result(result_path, json),
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if let Some(url) = cmd.strip_prefix("tab_new ") {
        match create_dynamic_tab(Some(url.trim()), true) {
            Ok(tab_id) => write_result(result_path, format!("ok: created tab {tab_id}")),
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if cmd == "tab_new" {
        match create_dynamic_tab(Some("about:blank"), true) {
            Ok(tab_id) => write_result(result_path, format!("ok: created tab {tab_id}")),
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
        }
        true
    } else if let Some(idx) = cmd.strip_prefix("tab_close ") {
        match idx.trim().parse::<usize>() {
            Ok(tab_id) => match close_tab(tab_id) {
                Ok(()) => write_result(result_path, format!("ok: closed tab {tab_id}")),
                Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(result_path, err),
            },
            Err(_) /* Internal: fallback error branch handled below */ => write_error(
                result_path,
                error_with_fix(
                    "parse the tab id",
                    format!("`{}` is not a valid tab id", idx.trim()),
                    "Use a numeric tab id from the `tabs` command output.",
                ),
            ),
        }
        true
    } else if let Some(idx) = cmd.strip_prefix("tab ") {
        if let Ok(tab_id) = idx.trim().parse::<usize>() {
            switch_tab(tab_id);
            write_result(result_path, format!("ok: switched to tab {tab_id}"));
        }
        true
    } else {
        false
    }
}
