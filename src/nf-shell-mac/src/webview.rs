//! WKWebView creation for NextFrame desktop.

use objc2::rc::Retained;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString, NSURL};
use objc2_web_kit::{WKWebView, WKWebViewConfiguration, WKWebsiteDataStore};

/// Create a WKWebView that loads a placeholder page.
pub fn create(
    mtm: MainThreadMarker,
    size: NSSize,
) -> Result<Retained<WKWebView>, String> {
    // SAFETY: mtm proves main-thread, required by WKWebViewConfiguration::new.
    let config = unsafe { WKWebViewConfiguration::new(mtm) };

    // SAFETY: mtm proves main-thread, required by nonPersistentDataStore.
    let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };

    // SAFETY: config and store are live WebKit objects.
    unsafe {
        config.setWebsiteDataStore(&store);
    }

    let rect = NSRect::new(NSPoint::new(0.0, 0.0), size);

    // SAFETY: mtm, frame, and config satisfy WKWebView designated initializer.
    let web_view = unsafe {
        WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), rect, &config)
    };

    // Load inline HTML placeholder
    let html = NSString::from_str(PLACEHOLDER_HTML);
    let base = NSURL::URLWithString(&NSString::from_str("about:blank"));

    // SAFETY: loadHTMLString_baseURL:baseURL: is a standard WKWebView method.
    if let Some(ref base_url) = base {
        unsafe {
            web_view.loadHTMLString_baseURL(&html, Some(base_url));
        }
    } else {
        unsafe {
            web_view.loadHTMLString_baseURL(&html, None);
        }
    }

    tracing::info!("WKWebView created");
    Ok(web_view)
}

const PLACEHOLDER_HTML: &str = r#"<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
    height: 100%;
    background: #050507;
    color: rgba(255,255,255,0.95);
    font-family: -apple-system, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
}
body {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 16px;
}
.logo {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.5px;
}
.logo-mark {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 2px solid #a78bfa;
    display: flex;
    align-items: center;
    justify-content: center;
}
.logo-mark::after {
    content: '';
    width: 0;
    height: 0;
    border-left: 10px solid #a78bfa;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    margin-left: 3px;
}
.version {
    font-size: 14px;
    color: rgba(255,255,255,0.50);
    font-weight: 400;
}
.aurora {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
        radial-gradient(ellipse 60% 12% at 50% 2%, rgba(139,92,246,0.10), transparent),
        radial-gradient(ellipse 60% 12% at 50% 98%, rgba(124,58,237,0.05), transparent);
}
</style>
</head>
<body>
<div class="aurora"></div>
<div class="logo">
    <div class="logo-mark"></div>
    NextFrame
</div>
<div class="version">v0.5 · Native macOS · objc2</div>
</body>
</html>"#;
