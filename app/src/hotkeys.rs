//! App-side hotkey routing.

use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::thread;

use tauri::{AppHandle, Emitter, Manager};

use crate::command_support::KeyCapturedPayload;
use crate::commands;
use crate::runtime::AppState;
use crate::settings::Settings;

/// Action matched from a hotkey.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Grab recent audio.
    Grab,
    /// Send current clip.
    Send,
    /// Stop playback.
    Stop,
    /// Toggle save-arm.
    Save,
    /// Press one one-based pad slot.
    Pad(usize),
}

/// Starts the hotkey listener and dispatch thread.
pub fn start(
    app: AppHandle,
) -> Result<ringpad_windows::HotkeyListener, ringpad_windows::BackendError> {
    let (tx, rx) = mpsc::channel();
    let listener = ringpad_windows::HotkeyListener::start(tx)?;
    thread::Builder::new()
        .name("ringpad-hotkeys".to_string())
        .spawn(move || hotkey_loop(app, rx))
        .map_err(|error| ringpad_windows::BackendError::ThreadStart(error.to_string()))?;
    Ok(listener)
}

/// Returns the action for a key. Main actions win over pad duplicates.
#[must_use]
pub fn key_action(
    key: &str,
    settings: &Settings,
    pad_hotkeys: &[(usize, Option<String>)],
) -> Option<Action> {
    if matches_key(settings.hotkeys.grab.as_deref(), key) {
        return Some(Action::Grab);
    }
    if matches_key(settings.hotkeys.send.as_deref(), key)
        || matches_key(settings.hotkeys.send_alt.as_deref(), key)
    {
        return Some(Action::Send);
    }
    if matches_key(settings.hotkeys.stop.as_deref(), key) {
        return Some(Action::Stop);
    }
    if matches_key(settings.hotkeys.save.as_deref(), key) {
        return Some(Action::Save);
    }
    pad_hotkeys
        .iter()
        .find(|(_slot, hotkey)| matches_key(hotkey.as_deref(), key))
        .map(|(slot, _hotkey)| Action::Pad(*slot))
}

fn hotkey_loop(app: AppHandle, rx: mpsc::Receiver<ringpad_windows::HotkeyEvent>) {
    while let Ok(event) = rx.recv() {
        if !event.down {
            continue;
        }
        let state = app.state::<AppState>();
        if state.key_capture.swap(false, Ordering::AcqRel) {
            let _ = app.emit("key-captured", KeyCapturedPayload { key: event.key });
            continue;
        }
        let settings = match state.settings.lock() {
            Ok(settings) => settings.clone(),
            Err(error) => {
                commands::emit_error(&app, error.to_string());
                continue;
            }
        };
        let pad_hotkeys = match state.pads_store.lock() {
            Ok(store) => store
                .pads
                .iter()
                .map(|pad| (pad.slot, pad.hotkey.clone()))
                .collect::<Vec<_>>(),
            Err(error) => {
                commands::emit_error(&app, error.to_string());
                continue;
            }
        };
        if let Some(action) = key_action(&event.key, &settings, &pad_hotkeys) {
            handle_action(&app, state.inner(), action);
        }
    }
}

fn handle_action(app: &AppHandle, state: &AppState, action: Action) {
    let result = match action {
        Action::Grab => handle_grab(app, state),
        Action::Send => handle_send(state),
        Action::Stop => handle_stop(state),
        Action::Save => handle_save(state),
        Action::Pad(slot) => handle_pad(app, state, slot),
    };
    if let Err(message) = result {
        commands::emit_error(app, message);
    }
    commands::emit_playback(app, state);
}

fn handle_grab(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let event = {
        let mut session = state
            .runtime
            .session
            .lock()
            .map_err(|error| error.to_string())?;
        ringpad_core::actions::grab(&mut session).map_err(|error| error.to_string())?
    };
    match event {
        ringpad_core::actions::ActionEvent::Clipped { path, .. } => {
            let clip = {
                let session = state
                    .runtime
                    .session
                    .lock()
                    .map_err(|error| error.to_string())?;
                session.handle.current_send_clip()
            };
            let info = crate::dto::clip_info(&clip, 48_000, path.as_deref(), "clip-hotkey");
            if let Ok(mut last_clip) = state.last_clip.lock() {
                *last_clip = Some(info.clone());
            }
            let _ = app.emit("clip", info);
            Ok(())
        }
        ringpad_core::actions::ActionEvent::NothingHeard { seconds } => Err(format!(
            "Nothing heard in the last {} s",
            seconds.round() as u32
        )),
        _ => Ok(()),
    }
}

fn handle_send(state: &AppState) -> Result<(), String> {
    let mut session = state
        .runtime
        .session
        .lock()
        .map_err(|error| error.to_string())?;
    match ringpad_core::actions::send_last(&mut session).map_err(|error| error.to_string())? {
        ringpad_core::actions::ActionEvent::NoClipYet => Err("No clip yet".to_string()),
        _ => Ok(()),
    }
}

fn handle_stop(state: &AppState) -> Result<(), String> {
    let mut session = state
        .runtime
        .session
        .lock()
        .map_err(|error| error.to_string())?;
    ringpad_core::actions::stop_all(&mut session).map_err(|error| error.to_string())?;
    let _ = session.arm.consume(commands::now_seconds());
    Ok(())
}

fn handle_save(state: &AppState) -> Result<(), String> {
    let mut session = state
        .runtime
        .session
        .lock()
        .map_err(|error| error.to_string())?;
    let _ = ringpad_core::actions::toggle_save(&mut session, commands::now_seconds());
    Ok(())
}

fn handle_pad(app: &AppHandle, state: &AppState, slot: usize) -> Result<(), String> {
    let event = {
        let mut session = state
            .runtime
            .session
            .lock()
            .map_err(|error| error.to_string())?;
        ringpad_core::actions::slot_pressed(&mut session, slot, commands::now_seconds())
            .map_err(|error| error.to_string())?
    };
    match event {
        ringpad_core::actions::ActionEvent::SavedToPad { .. } => {
            let mut session = state
                .runtime
                .session
                .lock()
                .map_err(|error| error.to_string())?;
            let store = state
                .pads_store
                .lock()
                .map_err(|error| error.to_string())?
                .clone();
            store.apply_to_bank(&mut session.pads);
            commands::save_pad_metadata(state, &session.pads)?;
            commands::emit_pads(app, state)
        }
        ringpad_core::actions::ActionEvent::EmptyPad { slot } => {
            Err(format!("Pad {slot} is empty"))
        }
        _ => Ok(()),
    }
}

fn matches_key(configured: Option<&str>, key: &str) -> bool {
    configured.is_some_and(|configured| configured.eq_ignore_ascii_case(key))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Hotkeys;

    #[test]
    fn maps_main_actions_and_send_alt() {
        let settings = Settings::default();
        assert_eq!(key_action("f8", &settings, &[]), Some(Action::Grab));
        assert_eq!(key_action("mouse5", &settings, &[]), Some(Action::Send));
    }

    #[test]
    fn main_actions_win_over_pads() {
        let settings = Settings::default();
        let pads = vec![(3, Some("f8".to_string()))];
        assert_eq!(key_action("f8", &settings, &pads), Some(Action::Grab));
    }

    #[test]
    fn null_keys_never_match() {
        let settings = Settings {
            hotkeys: Hotkeys {
                grab: None,
                send: None,
                send_alt: None,
                stop: None,
                save: None,
            },
            ..Settings::default()
        };
        assert_eq!(key_action("f8", &settings, &[(2, None)]), None);
    }

    #[test]
    fn maps_pad_hotkeys() {
        let settings = Settings::default();
        assert_eq!(
            key_action("f3", &settings, &[(3, Some("f3".to_string()))]),
            Some(Action::Pad(3))
        );
    }
}
