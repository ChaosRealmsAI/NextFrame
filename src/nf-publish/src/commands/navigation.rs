use crate::state::{
    all_tab_ids, go_back, go_forward, log_crash, navigate_active_input, navigate_tab_to_url,
    reload_tab,
};

use super::{write_error, write_result};

fn parse_optional_tab_id(input: &str) -> Result<Option<usize>, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        trimmed
            .parse::<usize>()
            .map(Some)
            .map_err(|_| format!("invalid tab id: {trimmed}"))
    }
}

fn parse_targeted_goto(input: &str) -> Option<(usize, &str)> {
    let trimmed = input.trim();
    let (first, rest) = trimmed.split_once(' ')?;
    let tab_id = first.parse::<usize>().ok()?;
    Some((tab_id, rest.trim()))
}

pub(super) fn handle_command(cmd: &str, result_path: &str) -> bool {
    if let Some(url) = cmd.strip_prefix("goto ") {
        if let Some((tab_id, target_url)) = parse_targeted_goto(url) {
            match navigate_tab_to_url(tab_id, target_url) {
                Ok(()) => write_result(
                    result_path,
                    format!("ok: navigating tab {tab_id} to {target_url}"),
                ),
                Err(err) => write_error(result_path, err),
            }
        } else {
            match navigate_active_input(url.trim()) {
                Ok(tab_id) => write_result(result_path, format!("ok: navigating tab {tab_id}")),
                Err(err) => write_error(result_path, err),
            }
        }
        true
    } else if cmd == "back" {
        match go_back(None) {
            Ok(()) => write_result(result_path, "ok: back"),
            Err(err) => write_error(result_path, err),
        }
        true
    } else if let Some(idx) = cmd.strip_prefix("back ") {
        match parse_optional_tab_id(idx) {
            Ok(target) => match go_back(target) {
                Ok(()) => write_result(result_path, "ok: back"),
                Err(err) => write_error(result_path, err),
            },
            Err(err) => write_error(result_path, err),
        }
        true
    } else if cmd == "forward" {
        match go_forward(None) {
            Ok(()) => write_result(result_path, "ok: forward"),
            Err(err) => write_error(result_path, err),
        }
        true
    } else if let Some(idx) = cmd.strip_prefix("forward ") {
        match parse_optional_tab_id(idx) {
            Ok(target) => match go_forward(target) {
                Ok(()) => write_result(result_path, "ok: forward"),
                Err(err) => write_error(result_path, err),
            },
            Err(err) => write_error(result_path, err),
        }
        true
    } else if cmd == "reload" {
        match reload_tab(None) {
            Ok(()) => write_result(result_path, "ok: reloading"),
            Err(err) => write_error(result_path, err),
        }
        true
    } else if let Some(idx) = cmd.strip_prefix("reload ") {
        match parse_optional_tab_id(idx) {
            Ok(target) => match reload_tab(target) {
                Ok(()) => write_result(result_path, "ok: reloading"),
                Err(err) => write_error(result_path, err),
            },
            Err(err) => write_error(result_path, err),
        }
        true
    } else if cmd == "reload_all" {
        for tab_id in all_tab_ids() {
            if let Err(err) = reload_tab(Some(tab_id)) {
                log_crash("WARN", "reload_all", &err);
            }
        }
        write_result(result_path, "ok: reloading all tabs");
        true
    } else {
        false
    }
}
