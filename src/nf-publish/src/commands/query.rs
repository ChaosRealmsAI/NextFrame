//! command query helpers
use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2_foundation::{NSError, NSString};
use objc2_web_kit::WKWebView;

use crate::error::error_with_fix;
use crate::eval::eval_js;
use crate::state::{log_activity, read_activity_log, tab_index_for_webview};

use super::{
    js_string, parse_selector_and_timeout, parse_selector_and_value, write_error, write_result,
};

pub(super) fn find_element_js(selector: &str) -> String {
    let sel_escaped = serde_json::to_string(selector).unwrap_or_else(|_| "\"\"".to_owned());

    if let Some(text) = selector.strip_prefix("text:") {
        let te = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_owned());
        format!(
            "try{{var found=null;\
            var all=document.querySelectorAll('*');\
            for(var i=0;i<all.length;i++){{if(all[i].textContent.trim()==={te}&&all[i].offsetWidth>0&&all[i].children.length<=3){{found=all[i];break;}}}}\
            if(!found){{for(var i=0;i<all.length;i++){{if(all[i].textContent.trim().indexOf({te})===0&&all[i].offsetWidth>0&&all[i].children.length<=3&&all[i].textContent.trim().length<30){{found=all[i];break;}}}}}}\
            if(!found){{var w=document.querySelector('wujie-app');if(w&&w.shadowRoot){{var sa=w.shadowRoot.querySelectorAll('*');for(var i=0;i<sa.length;i++){{if(sa[i].textContent.trim()==={te}&&sa[i].offsetWidth>0&&sa[i].children.length<=3){{found=sa[i];break;}}}}}}}}\
            if(found){{var r=found.getBoundingClientRect();String(Math.round(r.x+r.width/2))+','+String(Math.round(r.y+r.height/2))}}else{{'not_found'}}\
            }}catch(e){{'error: '+e.message}}",
        )
    } else {
        format!(
            "try{{\
            var el=document.querySelector({sel_escaped});\
            if(!el){{var w=document.querySelector('wujie-app');if(w&&w.shadowRoot)el=w.shadowRoot.querySelector({sel_escaped});}}\
            if(el&&el.offsetWidth>0){{var r=el.getBoundingClientRect();String(Math.round(r.x+r.width/2))+','+String(Math.round(r.y+r.height/2))}}\
            else{{'not_found'}}\
            }}catch(e){{'error: '+e.message}}",
        )
    }
}

pub(super) fn element_lookup_snippet(selector: &str) -> String {
    if let Some(text) = selector.strip_prefix("text:") {
        let text_json = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_owned());
        format!(
            "var __needle={text_json};\
            var __roots=[document];\
            document.querySelectorAll('wujie-app').forEach(function(__host){{if(__host.shadowRoot)__roots.push(__host.shadowRoot);}});\
            var __matchText=function(__root){{\
                var __all=__root.querySelectorAll('*');\
                for(var __i=0;__i<__all.length;__i++){{\
                    var __candidate=__all[__i];\
                    var __text=(__candidate.textContent||'').trim();\
                    if(!__text)continue;\
                    var __rect=__candidate.getBoundingClientRect();\
                    if((__text===__needle||__text.indexOf(__needle)===0)&&__rect.width>0&&__rect.height>0){{return __candidate;}}\
                }}\
                return null;\
            }};\
            var el=null;\
            for(var __r=0;__r<__roots.length&&!el;__r++){{el=__matchText(__roots[__r]);}};"
        )
    } else {
        let selector_json = serde_json::to_string(selector).unwrap_or_else(|_| "\"\"".to_owned());
        format!(
            "var __selector={selector_json};\
            var __roots=[document];\
            document.querySelectorAll('wujie-app').forEach(function(__host){{if(__host.shadowRoot)__roots.push(__host.shadowRoot);}});\
            var el=null;\
            for(var __r=0;__r<__roots.length&&!el;__r++){{el=__roots[__r].querySelector(__selector);}};"
        )
    }
}

pub(super) fn element_query_js(selector: &str, found_expr: &str, not_found_expr: &str) -> String {
    let body = format!("if(el){{{found_expr}}}return {not_found_expr};");
    format!(
        "(function(){{try{{{}{} }}catch(e){{return 'error: '+e.message;}}}})()",
        element_lookup_snippet(selector),
        body
    )
}

fn write_dump(
    webview: &WKWebView,
    js: &str,
    path: String,
    result_path: String,
    null_message: &'static str,
    write_error_label: &'static str,
) {
    let target_path = path.clone();
    let js_str = NSString::from_str(js);
    let handler = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
        if !error.is_null() {
            // SAFETY: WebKit passes a valid NSError pointer when `error` is non-null.
            let err = unsafe { &*error }; // SAFETY: see comment above.
            write_error(
                &result_path,
                error_with_fix(
                    "evaluate the query JavaScript",
                    err.localizedDescription(),
                    "Check the script and make sure the page is still loaded before retrying.",
                ),
            );
            return;
        }
        if result.is_null() {
            write_result(&result_path, null_message);
            return;
        }
        let content = js_string(result);
        match std::fs::write(&target_path, &content) {
            Ok(()) => write_result(
                &result_path,
                format!("ok: {} ({} bytes)", target_path, content.len()),
            ),
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(
                &result_path,
                error_with_fix(
                    &format!("write the {write_error_label} output"),
                    err,
                    "Check that the destination path is writable and retry the command.",
                ),
            ),
        }
    });
    unsafe {
        // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
        webview.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
    }
}

fn waitfor_element(webview: &WKWebView, selector: &str, timeout_ms: u64, result_path: String) {
    let check_js = element_query_js(
        selector,
        "var text=(el.textContent||'').trim().substring(0,100);return text||'(found)';",
        "null",
    );
    let interval_ms: u64 = 300;
    let max_attempts = (timeout_ms / interval_ms).max(1);
    let wv_ptr = webview as *const WKWebView as usize;

    fn schedule_check(
        wv_ptr: usize,
        js: String,
        result_path: String,
        attempt: u64,
        max_attempts: u64,
        interval_ms: u64,
    ) {
        dispatch::Queue::main().exec_after(
            std::time::Duration::from_millis(interval_ms),
            move || {
                // SAFETY: `wv_ptr` was captured from a live WKWebView and this poll runs on the main queue while that tab exists.
                let webview = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                let rp = result_path.clone();
                let js_clone = js.clone();
                let handler = RcBlock::new(move |result: *mut AnyObject, _error: *mut NSError| {
                    let found = if !result.is_null() {
                        let text = js_string(result);
                        if text != "null" { Some(text) } else { None }
                    } else {
                        None
                    };
                    if let Some(text) = found {
                        write_result(&rp, format!("ok: {text}"));
                    } else if attempt >= max_attempts {
                        write_error(
                            &rp,
                            error_with_fix(
                                "wait for the target element",
                                format!(
                                    "the element did not appear within {} ms",
                                    max_attempts * interval_ms
                                ),
                                "Increase the timeout or verify the selector matches a visible element.",
                            ),
                        );
                    } else {
                        schedule_check(
                            wv_ptr,
                            js_clone.clone(),
                            rp.clone(),
                            attempt + 1,
                            max_attempts,
                            interval_ms,
                        );
                    }
                });
                let wrapped = format!(
                    "try{{var __r=eval({});__r==null?'null':String(__r)}}catch(__e){{'error: '+__e.message}}",
                    serde_json::to_string(js.as_str()).unwrap_or_else(|_| "\"\"".to_owned())
                );
                let wrapped_str = NSString::from_str(&wrapped);
                unsafe { // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
                    webview.evaluateJavaScript_completionHandler(&wrapped_str, Some(&handler));
                }
            },
        );
    }

    schedule_check(wv_ptr, check_js, result_path, 0, max_attempts, interval_ms);
}

pub(super) fn handle_command(webview: &WKWebView, cmd: &str, result_path: String) -> bool {
    if let Some(selector) = cmd.strip_prefix("exists ") {
        let js = element_query_js(selector.trim(), "return 'true';", "'false'");
        eval_js(webview, &js, result_path);
        true
    } else if let Some(selector) = cmd.strip_prefix("visible ") {
        let js = element_query_js(
            selector.trim(),
            "var r=el.getBoundingClientRect();\
            var s=window.getComputedStyle(el);\
            var visible=r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&r.bottom>=0&&r.right>=0&&r.top<=window.innerHeight&&r.left<=window.innerWidth;\
            return visible?'true':'false';",
            "'false'",
        );
        eval_js(webview, &js, result_path);
        true
    } else if let Some(rest) = cmd.strip_prefix("attr ") {
        match parse_selector_and_value(rest, "attr <selector> <attribute>") {
            Ok((selector, attr)) => {
                let attr_json = serde_json::to_string(&attr).unwrap_or_else(|_| "\"\"".to_owned());
                let js = element_query_js(
                    &selector,
                    &format!("var v=el.getAttribute({attr_json});return v==null?'null':String(v);"),
                    "'__NOT_FOUND__'",
                );
                eval_js(webview, &js, result_path);
            }
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&result_path, err),
        }
        true
    } else if let Some(selector) = cmd.strip_prefix("count ") {
        let selector = selector.trim();
        let js = if let Some(text) = selector.strip_prefix("text:") {
            let text_json = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_owned());
            format!(
                "(function(){{try{{\
                var __needle={text_json};\
                var __roots=[document];\
                document.querySelectorAll('wujie-app').forEach(function(__host){{if(__host.shadowRoot)__roots.push(__host.shadowRoot);}});\
                var __count=0;\
                for(var __r=0;__r<__roots.length;__r++){{\
                    var __all=__roots[__r].querySelectorAll('*');\
                    for(var __i=0;__i<__all.length;__i++){{\
                        var __candidate=__all[__i];\
                        var __text=(__candidate.textContent||'').trim();\
                        if(__text&&(__text===__needle||__text.indexOf(__needle)===0))__count++;\
                    }}\
                }}\
                return String(__count);\
                }}catch(e){{return 'error: '+e.message;}}}})()"
            )
        } else {
            let selector_json =
                serde_json::to_string(selector).unwrap_or_else(|_| "\"\"".to_owned());
            format!(
                "(function(){{try{{\
                var __selector={selector_json};\
                var __roots=[document];\
                document.querySelectorAll('wujie-app').forEach(function(__host){{if(__host.shadowRoot)__roots.push(__host.shadowRoot);}});\
                var __count=0;\
                for(var __r=0;__r<__roots.length;__r++){{__count+=__roots[__r].querySelectorAll(__selector).length;}}\
                return String(__count);\
                }}catch(e){{return 'error: '+e.message;}}}})()"
            )
        };
        eval_js(webview, &js, result_path);
        true
    } else if let Some(selector) = cmd.strip_prefix("htmlel ") {
        let js = element_query_js(
            selector.trim(),
            "return el.innerHTML==null?'null':String(el.innerHTML);",
            "'__NOT_FOUND__'",
        );
        eval_js(webview, &js, result_path);
        true
    } else if let Some(selector) = cmd.strip_prefix("readel ") {
        let js = element_query_js(
            selector.trim(),
            "return (el.textContent||'').trim();",
            "'__NOT_FOUND__'",
        );
        eval_js(webview, &js, result_path);
        true
    } else if let Some(rest) = cmd.strip_prefix("wait ") {
        match parse_selector_and_timeout(rest, 5000) {
            Ok((selector, timeout_ms)) => {
                waitfor_element(webview, &selector, timeout_ms, result_path)
            }
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&result_path, err),
        }
        true
    } else if let Some(rest) = cmd.strip_prefix("waitfor ") {
        match parse_selector_and_timeout(rest, 5000) {
            Ok((selector, timeout_ms)) => {
                waitfor_element(webview, &selector, timeout_ms, result_path)
            }
            Err(err) /* Fix: propagate or serialize the formatted error below */ => write_error(&result_path, err),
        }
        true
    } else if cmd == "url" {
        eval_js(webview, "window.location.href||''", result_path);
        true
    } else if cmd == "title" {
        eval_js(webview, "document.title||''", result_path);
        true
    } else if cmd == "text" {
        let tab_idx = tab_index_for_webview(webview).unwrap_or(0);
        write_dump(
            webview,
            "document.body.innerText",
            format!("/tmp/wp-text-{tab_idx}.txt"),
            result_path,
            "error: failed to read page text: the page returned null. Fix: Reload the page and retry after the DOM is ready.",
            "write",
        );
        true
    } else if cmd == "text_shadow" {
        let tab_idx = tab_index_for_webview(webview).unwrap_or(0);
        write_dump(
            webview,
            "(function(){var t=document.body.innerText;var apps=document.querySelectorAll('wujie-app');for(var i=0;i<apps.length;i++){if(apps[i].shadowRoot){var el=apps[i].shadowRoot.querySelector('div');if(el)t+='\\n---SHADOW---\\n'+el.innerText;}}return t;})()",
            format!("/tmp/wp-text-{tab_idx}.txt"),
            result_path,
            "error: failed to read page text: the page returned null. Fix: Reload the page and retry after the DOM is ready.",
            "write",
        );
        true
    } else if cmd == "html" {
        let tab_idx = tab_index_for_webview(webview).unwrap_or(0);
        write_dump(
            webview,
            "document.documentElement.outerHTML",
            format!("/tmp/wp-html-{tab_idx}.html"),
            result_path,
            "error: failed to read page HTML: the page returned null. Fix: Reload the page and retry after the DOM is ready.",
            "write failed",
        );
        true
    } else if cmd == "html_shadow" {
        let tab_idx = tab_index_for_webview(webview).unwrap_or(0);
        write_dump(
            webview,
            "(function(){var h=document.documentElement.outerHTML;var apps=document.querySelectorAll('wujie-app');for(var i=0;i<apps.length;i++){if(apps[i].shadowRoot){h+='\\n<!-- SHADOW_ROOT_'+i+' -->\\n'+apps[i].shadowRoot.innerHTML;}}return h;})()",
            format!("/tmp/wp-html-{tab_idx}.html"),
            result_path,
            "error: failed to read page HTML: the page returned null. Fix: Reload the page and retry after the DOM is ready.",
            "write failed",
        );
        true
    } else if let Some(rest) = cmd.strip_prefix("log ") {
        let parts: Vec<&str> = rest.splitn(3, ':').collect();
        let (event_type, platform, details) = match parts.len() {
            3 => (parts[0].trim(), parts[1].trim(), parts[2].trim()),
            2 => (parts[0].trim(), parts[1].trim(), ""),
            _ => ("event", rest.trim(), ""),
        };
        log_activity(event_type, platform, details);
        write_result(&result_path, format!("ok: logged {event_type}:{platform}"));
        true
    } else if let Some(rest) = cmd.strip_prefix("stats ") {
        let n: usize = rest.trim().parse().unwrap_or(20);
        let log = read_activity_log(n);
        write_result(&result_path, format!("ok: {log}"));
        true
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn element_lookup_snippet_builds_text_lookup_js() {
        let snippet = element_lookup_snippet("text:Submit");

        assert_eq!(snippet.contains("var __needle=\"Submit\";"), true);
        assert_eq!(snippet.contains("var __matchText=function"), true);
        assert_eq!(snippet.contains("var __selector="), false);
    }

    #[test]
    fn element_lookup_snippet_builds_css_lookup_js() {
        let snippet = element_lookup_snippet("#submit-button");

        assert_eq!(snippet.contains("var __selector=\"#submit-button\";"), true);
        assert_eq!(snippet.contains("querySelector(__selector)"), true);
        assert_eq!(snippet.contains("var __needle="), false);
    }

    #[test]
    fn parse_selector_and_value_parses_quoted_input() {
        assert_eq!(
            parse_selector_and_value("\"text:Save draft\" hello world", "usage"),
            Ok(("text:Save draft".to_owned(), "hello world".to_owned()))
        );
    }

    #[test]
    fn parse_selector_and_value_parses_unquoted_input() {
        assert_eq!(
            parse_selector_and_value("button.primary hello", "usage"),
            Ok(("button.primary".to_owned(), "hello".to_owned()))
        );
    }
}
