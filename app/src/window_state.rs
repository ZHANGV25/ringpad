//! Puts the main window's webview to sleep while it is minimized.
//!
//! A minimized WebView2 still renders unless it is told otherwise. Hiding it stops rendering and
//! tells the page it is hidden (the UI then pauses every animation), and the pump stops sending
//! meters and peaks until the window comes back.

use std::sync::atomic::Ordering;

use tauri::{Manager, Runtime, Window, WindowEvent};

use crate::runtime::AppState;

/// Handles window events for every window; only the main window's size changes matter.
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if window.label() != crate::tray::MAIN_LABEL {
        return;
    }
    match event {
        WindowEvent::Resized(_) => {
            let awake = !window.is_minimized().unwrap_or(false);
            set_awake(window, awake);
        }
        // A window built again later starts awake.
        WindowEvent::Destroyed => {
            if let Some(state) = window.try_state::<AppState>() {
                state.window_awake.store(true, Ordering::Release);
            }
        }
        _ => {}
    }
}

fn set_awake<R: Runtime>(window: &Window<R>, awake: bool) {
    let Some(state) = window.try_state::<AppState>() else {
        return;
    };
    if state.window_awake.swap(awake, Ordering::AcqRel) == awake {
        return;
    }
    #[cfg(windows)]
    if let Some(webview) = window.get_webview_window(window.label()) {
        let _ = webview.with_webview(move |webview| {
            // SAFETY: called on the main thread with the live controller wry owns.
            let _ = unsafe { webview.controller().SetIsVisible(awake) };
        });
    }
}
