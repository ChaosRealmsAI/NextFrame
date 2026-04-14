use std::ffi::c_ushort;

use block2::RcBlock;
use objc2::msg_send;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSEventType};
use objc2_foundation::{NSError, NSPoint, NSString};
use objc2_web_kit::WKWebView;

use super::{catch_objc, native_click_at};

pub(crate) fn send_key_to_webview(
    webview: &WKWebView,
    ch: &str,
    keycode: c_ushort,
    modifiers: NSEventModifierFlags,
) {
    let ns_ch = NSString::from_str(ch);
    let window = webview.window();
    let win_num = window.as_ref().map(|w| w.windowNumber()).unwrap_or(0);

    let down = NSEvent::keyEventWithType_location_modifierFlags_timestamp_windowNumber_context_characters_charactersIgnoringModifiers_isARepeat_keyCode(
        NSEventType::KeyDown,
        NSPoint::new(0.0, 0.0),
        modifiers,
        0.0,
        win_num,
        None,
        &ns_ch,
        &ns_ch,
        false,
        keycode,
    );
    if let Some(event) = &down
        && let Err(err) = catch_objc(|| {
            // SAFETY: `webview` is a live WKWebView and `keyDown:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, keyDown: &**event] }; // SAFETY: see comment above.
        })
    {
        crate::state::log_crash("WARN", "keyboard", &format!("keyDown: {err}"));
    }

    let up = NSEvent::keyEventWithType_location_modifierFlags_timestamp_windowNumber_context_characters_charactersIgnoringModifiers_isARepeat_keyCode(
        NSEventType::KeyUp,
        NSPoint::new(0.0, 0.0),
        modifiers,
        0.0,
        win_num,
        None,
        &ns_ch,
        &ns_ch,
        false,
        keycode,
    );
    if let Some(event) = &up
        && let Err(err) = catch_objc(|| {
            // SAFETY: `webview` is a live WKWebView and `keyUp:` is a valid responder selector for the synthesized NSEvent.
            let _: () = unsafe { msg_send![webview, keyUp: &**event] }; // SAFETY: see comment above.
        })
    {
        crate::state::log_crash("WARN", "keyboard", &format!("keyUp: {err}"));
    }
}

fn shifted_ascii_key(ch: char) -> Option<c_ushort> {
    match ch {
        '!' => Some(18),
        '@' => Some(19),
        '#' => Some(20),
        '$' => Some(21),
        '%' => Some(23),
        '^' => Some(22),
        '&' => Some(26),
        '*' => Some(28),
        '(' => Some(25),
        ')' => Some(29),
        '_' => Some(27),
        '+' => Some(24),
        '{' => Some(33),
        '}' => Some(30),
        '|' => Some(42),
        ':' => Some(41),
        '"' => Some(39),
        '<' => Some(43),
        '>' => Some(47),
        '?' => Some(44),
        '~' => Some(50),
        _ => None,
    }
}

pub(crate) fn key_spec_for_text(ch: char) -> (String, c_ushort, NSEventModifierFlags) {
    match ch {
        '\r' | '\n' => ("\r".to_owned(), 36, NSEventModifierFlags::empty()),
        '\t' => ("\t".to_owned(), 48, NSEventModifierFlags::empty()),
        ' ' => (" ".to_owned(), 49, NSEventModifierFlags::empty()),
        _ if ch.is_ascii_uppercase() => (
            ch.to_string(),
            mac_keycode(ch.to_ascii_lowercase()),
            NSEventModifierFlags::Shift,
        ),
        _ if shifted_ascii_key(ch).is_some() => (
            ch.to_string(),
            shifted_ascii_key(ch).unwrap_or(0),
            NSEventModifierFlags::Shift,
        ),
        _ => {
            let keycode = if ch.is_ascii() { mac_keycode(ch) } else { 0 };
            (ch.to_string(), keycode, NSEventModifierFlags::empty())
        }
    }
}

fn named_key_spec(key: &str) -> Option<(String, c_ushort)> {
    match key {
        "space" => Some((" ".to_owned(), 49)),
        "enter" | "return" => Some(("\r".to_owned(), 36)),
        "tab" => Some(("\t".to_owned(), 48)),
        "backspace" | "delete" => Some(("\u{7f}".to_owned(), 51)),
        "escape" | "esc" => Some(("\u{1b}".to_owned(), 53)),
        "left" => Some(("\u{F702}".to_owned(), 123)),
        "right" => Some(("\u{F703}".to_owned(), 124)),
        "up" => Some(("\u{F700}".to_owned(), 126)),
        "down" => Some(("\u{F701}".to_owned(), 125)),
        "home" => Some(("\u{F729}".to_owned(), 115)),
        "end" => Some(("\u{F72B}".to_owned(), 119)),
        _ => None,
    }
}

pub(crate) fn send_key_command(webview: &WKWebView, key: &str) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("empty key".to_owned());
    }

    let mut modifiers = NSEventModifierFlags::empty();
    let mut parts = key
        .split('+')
        .filter(|part| !part.trim().is_empty())
        .peekable();
    let mut key_part = None;

    while let Some(part) = parts.next() {
        let part = part.trim();
        if parts.peek().is_none() {
            key_part = Some(part);
            break;
        }
        match part {
            "cmd" | "command" => modifiers = modifiers.union(NSEventModifierFlags::Command),
            "shift" => modifiers = modifiers.union(NSEventModifierFlags::Shift),
            "alt" | "option" => modifiers = modifiers.union(NSEventModifierFlags::Option),
            "ctrl" | "control" => modifiers = modifiers.union(NSEventModifierFlags::Control),
            _ => return Err(format!("unsupported modifier: {part}")),
        }
    }

    let key_part = key_part.ok_or_else(|| "missing key".to_owned())?;
    let (chars, keycode, inferred_modifiers) =
        if let Some((chars, keycode)) = named_key_spec(key_part) {
            (chars, keycode, NSEventModifierFlags::empty())
        } else if let Some(ch) = (key_part.chars().count() == 1)
            .then(|| key_part.chars().next())
            .flatten()
        {
            key_spec_for_text(ch)
        } else {
            return Err(format!("unsupported key: {key_part}"));
        };

    send_key_to_webview(
        webview,
        &chars,
        keycode,
        modifiers.union(inferred_modifiers),
    );
    Ok(())
}

pub(crate) fn paste_text_native(webview: &WKWebView, text: &str) -> Result<(), String> {
    // SAFETY: `NSPasteboard` responds to these standard pasteboard selectors and the temporary NSString values live for the duration of the calls.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        let pb: Retained<AnyObject> = msg_send![objc2::class!(NSPasteboard), generalPasteboard];
        let _: () = msg_send![&*pb, clearContents];
        let ns_str = NSString::from_str(text);
        let ns_type = NSString::from_str("public.utf8-plain-text");
        let _: bool = msg_send![&*pb, setString: &*ns_str, forType: &*ns_type];
    }

    send_key_command(webview, "cmd+v")
}

pub(crate) fn mac_keycode(ch: char) -> c_ushort {
    match ch.to_ascii_lowercase() {
        'a' => 0,
        's' => 1,
        'd' => 2,
        'f' => 3,
        'h' => 4,
        'g' => 5,
        'z' => 6,
        'x' => 7,
        'c' => 8,
        'v' => 9,
        'b' => 11,
        'q' => 12,
        'w' => 13,
        'e' => 14,
        'r' => 15,
        'y' => 16,
        't' => 17,
        '1' => 18,
        '2' => 19,
        '3' => 20,
        '4' => 21,
        '6' => 22,
        '5' => 23,
        '=' => 24,
        '9' => 25,
        '7' => 26,
        '-' => 27,
        '8' => 28,
        '0' => 29,
        ']' => 30,
        'o' => 31,
        'u' => 32,
        '[' => 33,
        'i' => 34,
        'p' => 35,
        '\n' => 36,
        'l' => 37,
        'j' => 38,
        '\'' => 39,
        'k' => 40,
        ';' => 41,
        '\\' => 42,
        ',' => 43,
        '/' => 44,
        'n' => 45,
        'm' => 46,
        '.' => 47,
        '\t' => 48,
        ' ' => 49,
        '`' => 50,
        '#' => 20,
        _ => 0,
    }
}

pub(crate) fn jitter(min: u64, max: u64, seed: u64) -> u64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    let h = nanos
        .wrapping_mul(6364136223846793005)
        .wrapping_add(seed.wrapping_mul(1442695040888963407));
    min + (h % (max - min + 1))
}

pub(crate) fn type_text_native(webview: &WKWebView, text: &str, result_path: &str) {
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();
    let result_path = result_path.to_owned();
    let wv_ptr = webview as *const WKWebView as usize;

    for (i, ch) in chars.into_iter().enumerate() {
        let rp = result_path.clone();
        let delay_ms: u64 = (0..i).map(|j| jitter(55, 130, j as u64)).sum();
        dispatch::Queue::main().exec_after(std::time::Duration::from_millis(delay_ms), move || {
            // SAFETY: `wv_ptr` was captured from a live WKWebView owned by app state and this work runs back on the main queue before the tab is torn down.
            let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
            let (chars, keycode, modifiers) = key_spec_for_text(ch);
            send_key_to_webview(wv, &chars, keycode, modifiers);
            if i == total - 1 {
                let _ = std::fs::write(&rp, format!("ok: typed {total} chars"));
            }
        });
    }

    if total == 0 {
        let _ = std::fs::write(&result_path, "ok: nothing to type");
    }
}

pub(crate) fn add_tag(webview: &WKWebView, tag: &str, result_path: &str) {
    let rp = result_path.to_owned();
    let tag_owned = tag.to_owned();
    let wv_ptr = webview as *const WKWebView as usize;
    let text = serde_json::to_string("#添加话题").unwrap_or_else(|_| "\"#添加话题\"".to_owned());
    let click_js = format!(
        "try{{var roots=[document];var apps=document.querySelectorAll('wujie-app');for(var j=0;j<apps.length;j++){{if(apps[j].shadowRoot)roots.push(apps[j].shadowRoot);}}var found=null;for(var r=0;r<roots.length&&!found;r++){{var all=roots[r].querySelectorAll('*');for(var i=0;i<all.length;i++){{var el=all[i];if(el.textContent.trim()==={text}&&el.childNodes.length<=3&&el.offsetWidth>0){{found=el;break;}}}}}}if(found){{var rect=found.getBoundingClientRect();String(Math.round(rect.x+rect.width/2))+','+String(Math.round(rect.y+rect.height/2))}}else{{'not_found'}}}}catch(e){{'error: '+e.message}}",
    );
    let js_str = NSString::from_str(&click_js);

    let handler = RcBlock::new(move |result: *mut AnyObject, _error: *mut NSError| {
        let coords = if result.is_null() {
            "null".to_owned()
        } else {
            // SAFETY: this JavaScript callback returns a string result, so non-null `result` is an NSString.
            let s: &NSString = unsafe { &*(result as *const NSString) }; // SAFETY: see comment above.
            s.to_string()
        };

        let parts: Vec<&str> = coords.split(',').collect();
        let (Ok(x), Ok(y)) = (
            parts.first().unwrap_or(&"").parse::<f64>(),
            parts.get(1).unwrap_or(&"").parse::<f64>(),
        ) else {
            let _ = std::fs::write(&rp, format!("error: addtag button {coords}"));
            return;
        };

        // SAFETY: `wv_ptr` was captured from a live WKWebView owned by app state and this handler runs on the main queue.
        let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
        native_click_at(wv, x, y);

        let chars: Vec<char> = tag_owned.chars().collect();
        let n_chars = chars.len();
        for (i, ch) in chars.into_iter().enumerate() {
            let cmd_delay = 1500 + (i as u64) * 300;
            dispatch::Queue::main().exec_after(std::time::Duration::from_millis(cmd_delay), {
                let wv_ptr = wv_ptr;
                move || {
                    // SAFETY: `wv_ptr` was captured from a live WKWebView owned by app state and this work runs on the main queue.
                    let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                    if let Err(err) = send_key_command(wv, "cmd+right") {
                        crate::state::log_crash(
                            "WARN",
                            "keyboard",
                            &format!("add_tag move: {err}"),
                        );
                    }
                }
            });

            let ch_delay = cmd_delay + 150;
            dispatch::Queue::main().exec_after(std::time::Duration::from_millis(ch_delay), {
                let wv_ptr = wv_ptr;
                move || {
                    // SAFETY: `wv_ptr` was captured from a live WKWebView owned by app state and this work runs on the main queue.
                    let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                    if let Err(err) = send_key_command(wv, &ch.to_string()) {
                        crate::state::log_crash(
                            "WARN",
                            "keyboard",
                            &format!("add_tag char: {err}"),
                        );
                    }
                }
            });
        }

        let space_delay = 1500 + (n_chars as u64) * 300 + 500;
        dispatch::Queue::main().exec_after(std::time::Duration::from_millis(space_delay), {
            let rp = rp.clone();
            let tag = tag_owned.clone();
            let wv_ptr = wv_ptr;
            move || {
                // SAFETY: `wv_ptr` was captured from a live WKWebView owned by app state and this work runs on the main queue.
                let wv = unsafe { &*(wv_ptr as *const WKWebView) }; // SAFETY: see comment above.
                if let Err(err) = send_key_command(wv, "space") {
                    let _ = std::fs::write(&rp, format!("error: {err}"));
                    return;
                }

                dispatch::Queue::main().exec_after(
                    std::time::Duration::from_millis(1000),
                    move || {
                        let _ = std::fs::write(&rp, format!("ok: tag #{tag}"));
                    },
                );
            }
        });
    });

    // SAFETY: `webview` is a live WKWebView and `evaluateJavaScript:completionHandler:` accepts this NSString and completion block.
    unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        webview.evaluateJavaScript_completionHandler(&js_str, Some(&handler));
    }
}
