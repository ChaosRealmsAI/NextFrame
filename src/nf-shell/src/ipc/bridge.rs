//! ipc bridge ipc helpers
use nf_bridge::{Request, Response};
use serde_json::Value;

use super::write_http_response;
use crate::ai_ops::PendingAppCtlMap;

pub(crate) fn parse_request(payload: &str) -> Result<Request, serde_json::Error> {
    serde_json::from_str(payload)
}

pub(crate) fn invalid_request_response(error: serde_json::Error) -> Response {
    Response {
        id: "invalid".to_string(),
        ok: false,
        result: Value::Null,
        error: Some(format!("invalid IPC request: {error}")),
    }
}

pub(crate) fn handle_appctl_ipc_result(pending_appctl: &PendingAppCtlMap, params: &Value) {
    let Some(req_id) = params.get("reqId").and_then(Value::as_str) else {
        trace_log!("[appctl] missing reqId in IPC result");
        return;
    };
    let ok = params.get("ok").and_then(Value::as_bool).unwrap_or(true);
    let payload = if ok {
        params
            .get("result")
            .and_then(Value::as_str)
            .unwrap_or("null")
            .to_string()
    } else {
        params
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("app control evaluation failed")
            .to_string()
    };

    let pending_request = match pending_appctl.lock() {
        Ok(mut requests) => requests.remove(req_id),
        Err(error) => {
            trace_log!("[appctl] pending request state poisoned: {error}");
            None
        }
    };

    let Some(mut pending_request) = pending_request else {
        trace_log!("[appctl] no pending request for {req_id}");
        return;
    };

    let status = if ok { 200 } else { 500 };
    let status_text = if ok { "OK" } else { "Internal Server Error" };
    if let Err(error) = write_http_response(
        &mut pending_request.stream,
        status,
        status_text,
        if ok {
            pending_request.success_content_type
        } else {
            "text/plain; charset=utf-8"
        },
        payload.as_bytes(),
    ) {
        trace_log!("[appctl] failed to reply to {req_id}: {error}");
    }
}
