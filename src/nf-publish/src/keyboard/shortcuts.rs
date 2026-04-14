use std::ffi::c_ushort;
use std::ptr::{NonNull, null_mut};

use block2::RcBlock;
use objc2::msg_send;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags};

use crate::state::{APP_STATE, close_tab, create_dynamic_tab, switch_tab};

use super::catch_objc;

fn visible_tab_ids() -> Vec<usize> {
    let Some(state) = APP_STATE.get() else {
        return Vec::new();
    };
    let Ok(tabs) = state.browser_tabs.lock() else {
        return Vec::new();
    };
    tabs.iter()
        .filter(|tab| tab.visible)
        .map(|tab| tab.id)
        .collect()
}

fn shortcut_tab_target(keycode: c_ushort) -> Option<usize> {
    let visible = visible_tab_ids();
    match keycode {
        18..=28 => {}
        _ => return None,
    }
    if visible.is_empty() {
        return None;
    }
    match keycode {
        18 => visible.first().copied(),
        19 => visible.get(1).copied(),
        20 => visible.get(2).copied(),
        21 => visible.get(3).copied(),
        23 => visible.get(4).copied(),
        22 => visible.get(5).copied(),
        26 => visible.get(6).copied(),
        28 => visible.get(7).copied(),
        25 => visible.last().copied(),
        _ => None,
    }
}

fn handle_browser_shortcut(event: NonNull<NSEvent>) -> bool {
    // SAFETY: AppKit passes a non-null NSEvent pointer to the local monitor callback for the duration of this call.
    let event = unsafe { event.as_ref() }; // SAFETY: see comment above.
    if event.isARepeat() {
        return false;
    }

    let modifiers = event.modifierFlags() & NSEventModifierFlags::DeviceIndependentFlagsMask;
    if modifiers != NSEventModifierFlags::Command {
        return false;
    }

    match event.keyCode() {
        17 => {
            if let Err(err) = create_dynamic_tab(Some("about:blank"), true) {
                crate::state::log_crash("WARN", "keyboard", &format!("Cmd+T: {err}"));
            }
            true
        }
        13 => {
            let Some(state) = APP_STATE.get() else {
                return false;
            };
            let active_tab_id = state.current_tab.load(std::sync::atomic::Ordering::Relaxed);
            if let Err(err) = close_tab(active_tab_id) {
                crate::state::log_crash("WARN", "keyboard", &format!("Cmd+W: {err}"));
            }
            true
        }
        37 => {
            let Some(state) = APP_STATE.get() else {
                return false;
            };
            // SAFETY: `address_field_ptr` is initialized once from the live toolbar NSTextField and remains valid for the app lifetime.
            let field = unsafe { &*state.address_field_ptr }; // SAFETY: see comment above.
            if let Err(err) = catch_objc(|| unsafe { // SAFETY: see comment above.
                // SAFETY: `field` is a live NSTextField and both Objective-C selectors are standard text-field responder APIs.
                field.selectText(None);
                let _: bool = msg_send![field, becomeFirstResponder];
            }) {
                crate::state::log_crash("WARN", "keyboard", &format!("Cmd+L: {err}"));
            }
            true
        }
        18 | 19 | 20 | 21 | 23 | 22 | 26 | 28 | 25 => {
            let Some(tab_id) = shortcut_tab_target(event.keyCode()) else {
                return false;
            };
            switch_tab(tab_id);
            true
        }
        _ => false,
    }
}

pub(crate) fn install_browser_shortcuts() {
    let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        if handle_browser_shortcut(event) {
            null_mut()
        } else {
            event.as_ptr()
        }
    });
    // SAFETY: `addLocalMonitorForEventsMatchingMask:handler:` is the documented AppKit API and the block stays retained by the monitor.
    let monitor = unsafe { // SAFETY: see comment above.
        // SAFETY: see comment above.
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &handler)
    };
    let Some(monitor) = monitor else {
        crate::state::log_crash("WARN", "keyboard", "failed to install local key monitor");
        return;
    };
    let _ = objc2::rc::Retained::into_raw(monitor);
}
