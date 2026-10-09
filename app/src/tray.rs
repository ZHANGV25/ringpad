//! Tray icon and main window helpers.

use std::sync::atomic::Ordering;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::window::Color;
use tauri::{AppHandle, Manager, Theme, WebviewWindow, WebviewWindowBuilder};

use crate::runtime::AppState;
use crate::settings::ThemePreference;

pub const MAIN_LABEL: &str = "main";
const OPEN_ID: &str = "open-ringpad";
const STOP_ID: &str = "stop-playback";
const QUIT_ID: &str = "quit-ringpad";

/// Builds the system tray icon.
pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, OPEN_ID, "Open Ringpad", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, STOP_ID, "Stop playback", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, QUIT_ID, "Quit", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &stop, &sep, &quit_item])?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Ringpad")
        .on_menu_event(|app, event| match event.id() {
            id if id == OPEN_ID => open_main_window(app),
            id if id == STOP_ID => stop_playback(app),
            id if id == QUIT_ID => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                open_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app).map(|_tray| ())
}

/// Opens, shows, and focuses the main window.
pub fn open_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let Some(config) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_LABEL)
        .cloned()
    else {
        log::warn!("main window config missing");
        return;
    };
    // Built hidden, so it can take the page's background colour before it first shows: no white
    // flash when the app is dark.
    match WebviewWindowBuilder::from_config(app, &config)
        .and_then(|builder| builder.visible(false).build())
    {
        Ok(window) => {
            paint_background(app, &window);
            let _ = window.show();
            let _ = window.set_focus();
        }
        Err(error) => log::warn!("open window failed: {error}"),
    }
}

/// Matches the window to the UI's background (styles/tokens.css --bg) for the chosen theme.
fn paint_background(app: &AppHandle, window: &WebviewWindow) {
    let preference = app
        .state::<AppState>()
        .settings
        .lock()
        .map(|settings| settings.theme.clone())
        .unwrap_or(ThemePreference::System);
    let system = window.theme().unwrap_or(Theme::Light);
    let _ = window.set_background_color(Some(background_for(&preference, system)));
}

fn background_for(preference: &ThemePreference, system: Theme) -> Color {
    let dark = match preference {
        ThemePreference::Dark => true,
        ThemePreference::Light => false,
        ThemePreference::System => system == Theme::Dark,
    };
    if dark {
        Color(0x0e, 0x0e, 0x0e, 0xff)
    } else {
        Color(0xff, 0xff, 0xff, 0xff)
    }
}

fn stop_playback(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(mut session) = state.runtime.session.lock() {
        let _ = ringpad_core::actions::stop_all(&mut session);
        let _ = session.arm.consume(crate::commands::now_seconds());
    }
    crate::commands::emit_playback(app, state.inner());
}

fn quit(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.quit.store(true, Ordering::Release);
    state.runtime.stop_all();
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn background_follows_the_chosen_theme_then_the_system() {
        let dark = Color(0x0e, 0x0e, 0x0e, 0xff);
        let light = Color(0xff, 0xff, 0xff, 0xff);
        assert_eq!(background_for(&ThemePreference::Dark, Theme::Light), dark);
        assert_eq!(background_for(&ThemePreference::Light, Theme::Dark), light);
        assert_eq!(background_for(&ThemePreference::System, Theme::Dark), dark);
        assert_eq!(
            background_for(&ThemePreference::System, Theme::Light),
            light
        );
    }
}
