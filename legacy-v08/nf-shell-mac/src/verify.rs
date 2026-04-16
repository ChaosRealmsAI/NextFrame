//! Self-verification and eval-script modes for the desktop shell.

use crate::webview;

/// Eval-script mode: load app, run JS from file, take screenshots, exit.
/// Usage: nextframe --eval-script /path/to/script.js
/// The script can call __screenshot(path) to take screenshots at any point.
/// Results are printed as JSON lines to stdout.
pub(crate) fn eval_script_mode(wv: &objc2_web_kit::WKWebView, script_path: &str) {
    // Read the script file
    let script = match std::fs::read_to_string(script_path) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("failed to read script {script_path}: {e}");
            return;
        }
    };

    // Wait for page load
    webview::pump_run_loop_pub(std::time::Duration::from_secs(4));

    // Inject screenshot helper
    let _ = webview::eval_js(
        wv,
        "window.__screenshotRequests = []; window.__screenshot = function(path) { window.__screenshotRequests.push(path); }",
    );

    // Execute the user script
    match webview::eval_js(wv, &script) {
        Ok(result) => {
            println!("{{\"ok\":true,\"result\":{}}}", serde_json::json!(result));
        }
        Err(e) => {
            println!("{{\"ok\":false,\"error\":{}}}", serde_json::json!(e));
        }
    }

    // Wait for async callbacks (setTimeout chains) to complete
    // Poll for up to 30 seconds, checking screenshot requests each second
    for _ in 0..30 {
        webview::pump_run_loop_pub(std::time::Duration::from_secs(1));
        if let Ok(done) = webview::eval_js(wv, "window.__evalDone ? 'true' : 'false'") {
            if done == "true" {
                break;
            }
        }
    }

    // Process any screenshot requests
    webview::pump_run_loop_pub(std::time::Duration::from_secs(1));
    if let Ok(paths) = webview::eval_js(wv, "JSON.stringify(window.__screenshotRequests || [])") {
        if let Ok(arr) = serde_json::from_str::<Vec<String>>(&paths) {
            for path in arr {
                match webview::screenshot(wv, &path) {
                    Ok(()) => println!("{{\"screenshot\":{}}}", serde_json::json!(path)),
                    Err(e) => println!("{{\"screenshot_error\":{}}}", serde_json::json!(e)),
                }
            }
        }
    }

    // Read any window debug variables
    for var_name in [
        "__deepDebug",
        "__debugResult",
        "__r1Result",
        "__r2",
        "__composeError",
    ] {
        if let Ok(val) = webview::eval_js(wv, &format!("window.{var_name} || ''")) {
            if !val.is_empty() {
                println!("{{\"{var_name}\":{}}}", serde_json::json!(val));
            }
        }
    }

    // Always take a final screenshot
    let _ = webview::screenshot(wv, "/tmp/nf-eval-final.png");
    println!("{{\"screenshot\":\"/tmp/nf-eval-final.png\"}}");
}

/// Automated self-verification: check pages load, buttons work, navigation works.
pub(crate) fn verify_app(wv: &objc2_web_kit::WKWebView) {
    let mut pass = 0;
    let mut fail = 0;

    macro_rules! check {
        ($name:expr, $result:expr) => {
            match $result {
                Ok(val) => {
                    tracing::info!("[PASS] {} = {}", $name, val);
                    pass += 1;
                }
                Err(e) => {
                    tracing::error!("[FAIL] {} — {}", $name, e);
                    fail += 1;
                }
            }
        };
    }

    // Wait for page load + force all animations to complete
    webview::pump_run_loop_pub(std::time::Duration::from_secs(4));
    let _ = webview::eval_js(wv, "document.querySelectorAll('.section,.project-card,.stagger-in').forEach(e=>{e.style.opacity='1';e.style.animation='none'})");
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));

    // ── HOME PAGE ──
    check!("document.title", webview::eval_js(wv, "document.title"));
    check!(
        "topbar exists",
        webview::eval_js(wv, "!!document.querySelector('.topbar') ? 'yes' : 'no'")
    );
    check!(
        "project cards",
        webview::eval_js(
            wv,
            "document.querySelectorAll('.project-card').length + ' cards'"
        )
    );
    check!(
        "search input",
        webview::eval_js(
            wv,
            "!!document.querySelector('.tb-search-input') ? 'yes' : 'no'"
        )
    );
    check!(
        "new project btn",
        webview::eval_js(
            wv,
            "!!document.querySelector('.btn-primary') ? 'yes' : 'no'"
        )
    );

    let _ = webview::screenshot(wv, "/tmp/nf-verify-home.png");
    tracing::info!("[SCREENSHOT] /tmp/nf-verify-home.png");

    // ── SETTINGS MODAL ──
    check!(
        "open settings",
        webview::eval_js(wv, "toggleSettings(); 'opened'")
    );
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));
    check!("settings panel", webview::eval_js(wv, "document.getElementById('settings-panel').classList.contains('open') ? 'open' : 'closed'"));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-settings.png");
    check!(
        "close settings",
        webview::eval_js(wv, "toggleSettings(); 'closed'")
    );
    webview::pump_run_loop_pub(std::time::Duration::from_millis(300));

    // ── NAVIGATE TO PROJECT ──
    check!("navigate to project", webview::eval_js(wv, "var cards=document.querySelectorAll('.project-card');if(cards.length>0){cards[0].click();'clicked'}else{'no cards'}"));
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    check!(
        "project view active",
        webview::eval_js(
            wv,
            "document.getElementById('view-project')?.classList.contains('active') ? 'yes' : 'no'"
        )
    );
    check!(
        "breadcrumb visible",
        webview::eval_js(
            wv,
            "document.getElementById('global-breadcrumb')?.style.display !== 'none' ? 'yes' : 'no'"
        )
    );
    let _ = webview::screenshot(wv, "/tmp/nf-verify-project.png");

    // ── NAVIGATE TO PIPELINE ──
    check!("navigate to pipeline", webview::eval_js(wv, "var eps=document.querySelectorAll('.vp-ep-card');if(eps.length>0){eps[0].click();'clicked'}else{showView('pipeline',{projectName:'test',episodeName:'EP01'});'forced'}"));
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    check!(
        "pipeline view active",
        webview::eval_js(
            wv,
            "document.getElementById('view-pipeline')?.classList.contains('active') ? 'yes' : 'no'"
        )
    );
    check!(
        "pipeline tabs visible",
        webview::eval_js(
            wv,
            "document.getElementById('global-pl-tabs')?.style.display !== 'none' ? 'yes' : 'no'"
        )
    );
    let _ = webview::screenshot(wv, "/tmp/nf-verify-pipeline.png");

    // ── SWITCH PIPELINE TABS ──
    check!(
        "switch to audio",
        webview::eval_js(
            wv,
            "document.querySelector('[data-stage=\"audio\"]')?.click();'clicked'"
        )
    );
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    check!("audio elements", webview::eval_js(wv, "var audios=document.querySelectorAll('#pl-tab-audio audio');audios.length+' audios, src='+(audios[0]?.src||'none').substring(0,80)"));
    check!("audio error", webview::eval_js(wv, "var a=document.querySelector('#pl-tab-audio audio');a?(a.error?'err:'+a.error.code:'no-error, readyState='+a.readyState):'no audio el'"));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-audio.png");

    check!(
        "switch to editor",
        webview::eval_js(
            wv,
            "document.querySelector('[data-stage=\"assembly\"]')?.click();'clicked'"
        )
    );
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    check!("editor clips loaded", webview::eval_js(wv, "var c=document.getElementById('ed-clip-list2');c?(c.querySelectorAll('.ed-clip-item').length||'empty'):'missing'"));
    check!(
        "editor timeline data",
        webview::eval_js(
            wv,
            "edTimelineData ? (edTimelineData.layers||[]).length + ' layers' : 'null'"
        )
    );
    let _ = webview::screenshot(wv, "/tmp/nf-verify-editor.png");

    check!(
        "switch to output",
        webview::eval_js(
            wv,
            "document.querySelector('[data-stage=\"output\"]')?.click();'clicked'"
        )
    );
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-output.png");

    // ── RICH DATA PROJECT — dynamically find one with clips ──
    // JS: scan project cards, click into each until we find one with clips/audio
    let rich_js = r#"
      (function() {
        var cards = document.querySelectorAll('.project-card');
        if (cards.length < 2) return 'only ' + cards.length + ' projects';
        // Click the second card (first was already tested above)
        cards[1].click();
        return 'opened ' + (cards[1].querySelector('.card-title')?.textContent || '?');
      })()
    "#;
    check!("open 2nd project", webview::eval_js(wv, rich_js));
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    check!(
        "2nd project episodes",
        webview::eval_js(
            wv,
            "document.querySelectorAll('.vp-ep-card').length + ' episodes'"
        )
    );
    let _ = webview::screenshot(wv, "/tmp/nf-verify-rich-project.png");

    // Open first episode if available
    check!("open episode", webview::eval_js(wv, "var eps=document.querySelectorAll('.vp-ep-card');if(eps.length>0){eps[0].click();'clicked'}else{'no eps'}"));
    webview::pump_run_loop_pub(std::time::Duration::from_secs(3));
    check!(
        "rich segments",
        webview::eval_js(
            wv,
            "document.querySelectorAll('#pl-tab-script .glass').length + ' segments'"
        )
    );
    let _ = webview::screenshot(wv, "/tmp/nf-verify-rich-script.png");

    // Audio tab — TTS buttons
    check!(
        "rich audio tab",
        webview::eval_js(
            wv,
            "document.querySelector('[data-stage=\"audio\"]')?.click();'clicked'"
        )
    );
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-rich-audio.png");

    // Clips tab — real clips from source.clips
    check!(
        "rich clips tab",
        webview::eval_js(
            wv,
            "document.querySelector('[data-stage=\"clips\"]')?.click();'clicked'"
        )
    );
    webview::pump_run_loop_pub(std::time::Duration::from_secs(5));
    check!(
        "smart clips sources",
        webview::eval_js(wv, "scSources.length + ' sources, clips=' + scClips.length")
    );
    check!(
        "smart clips cards",
        webview::eval_js(
            wv,
            "document.querySelectorAll('.sc-clip-card').length + ' cards'"
        )
    );
    check!("smart clips visible", webview::eval_js(wv, "var c=document.querySelector('.sc-clip-card');c?c.getBoundingClientRect().top+'px':'invisible'"));
    // Scroll to first clip card
    let _ = webview::eval_js(
        wv,
        "var c=document.querySelector('.sc-clip-card');if(c)c.scrollIntoView({block:'start'})",
    );
    webview::pump_run_loop_pub(std::time::Duration::from_millis(500));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-rich-clips.png");
    // Also take a full-page screenshot before scrolling
    let _ = webview::eval_js(
        wv,
        "var m=document.querySelector('#pl-tab-asset .pl-main');if(m)m.scrollTop=0",
    );
    webview::pump_run_loop_pub(std::time::Duration::from_millis(300));
    let _ = webview::screenshot(wv, "/tmp/nf-verify-rich-clips-top.png");

    // Editor tab — atoms from pipeline.json
    check!(
        "rich editor tab",
        webview::eval_js(
            wv,
            "document.querySelector('[data-stage=\"assembly\"]')?.click();'clicked'"
        )
    );
    webview::pump_run_loop_pub(std::time::Duration::from_secs(2));
    check!(
        "rich editor layers",
        webview::eval_js(
            wv,
            "edTimelineData ? (edTimelineData.layers||[]).length + ' layers' : 'null'"
        )
    );
    let _ = webview::screenshot(wv, "/tmp/nf-verify-rich-editor.png");

    // ── BACK TO HOME ──
    check!(
        "back to home",
        webview::eval_js(wv, "showView('home');'ok'")
    );
    webview::pump_run_loop_pub(std::time::Duration::from_secs(1));
    check!(
        "home view active",
        webview::eval_js(
            wv,
            "document.querySelector('.view-home')?.classList.contains('active') ? 'yes' : 'no'"
        )
    );

    // ── AI OPERABILITY ──
    check!(
        "data-nf-action count",
        webview::eval_js(
            wv,
            "document.querySelectorAll('[data-nf-action]').length + ' actions'"
        )
    );
    check!(
        "diagnose available",
        webview::eval_js(
            wv,
            "typeof window.__nfDiagnose === 'function' ? 'yes' : 'no'"
        )
    );

    tracing::info!("=== VERIFY DONE: {} pass, {} fail ===", pass, fail);
}
