//! Shared support for commands, hotkeys, tray, and pump.

use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_autostart::ManagerExt as _;

use crate::dto::{self, EngineStatus, PadInfo, Playback};
use crate::runtime::AppState;
use crate::settings;

/// Small event payload for error messages.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    /// Error message.
    pub message: String,
}

/// Small event payload for key capture.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyCapturedPayload {
    /// Captured key name.
    pub key: String,
}

/// Small event payload for live history peaks.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivePayload {
    /// Rolling peaks.
    pub peaks: Vec<f32>,
}

/// Emits current playback.
pub fn emit_playback(app: &AppHandle, state: &AppState) {
    if let Ok(session) = state.runtime.session.lock() {
        emit(app, "playback", playback_from_session(&session));
    }
}

/// Emits an error event.
pub fn emit_error(app: &AppHandle, message: impl Into<String>) {
    emit(
        app,
        "error",
        ErrorPayload {
            message: message.into(),
        },
    );
}

/// Builds playback from a session.
#[must_use]
pub fn playback_from_session(session: &ringpad_core::actions::Session) -> Playback {
    Playback {
        sending: session.handle.sending(),
        previewing: session.handle.previewing(),
        save_armed: session.arm.is_armed(now_seconds()),
    }
}

/// Applies metadata, persists pads, emits pads, and returns one pad.
pub fn update_saved_pad(app: &AppHandle, state: &AppState, slot: usize) -> Result<PadInfo, String> {
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        let store = state.pads_store.lock().map_err(lock_error)?.clone();
        store.apply_to_bank(&mut session.pads);
        save_pad_metadata(state, &session.pads)?;
    }
    emit_pads(app, state)?;
    pad_by_slot(state, slot)
}

/// Persists filled core pad metadata.
pub fn save_pad_metadata(
    state: &AppState,
    bank: &ringpad_core::pads::PadBank,
) -> Result<(), String> {
    let mut store = state.pads_store.lock().map_err(lock_error)?;
    for pad in bank.filled() {
        if let Some(metadata) = store.get_mut(pad.number) {
            metadata.name = pad.name;
            metadata.volume = pad.volume;
            metadata.hotkey = pad.hotkey;
        }
    }
    store.save(&state.paths.pads_json).map_err(string_error)
}

/// Emits the pads array.
pub fn emit_pads(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let store = state.pads_store.lock().map_err(lock_error)?.clone();
    let pads = {
        let session = state.runtime.session.lock().map_err(lock_error)?;
        dto::pads_info(&session.pads, &store, session.handle.rate())
    };
    emit(app, "pads", pads);
    Ok(())
}

/// Returns one filled pad.
pub fn pad_by_slot(state: &AppState, slot: usize) -> Result<PadInfo, String> {
    let session = state.runtime.session.lock().map_err(lock_error)?;
    let pad = session
        .pads
        .get(slot)
        .map_err(string_error)?
        .ok_or_else(|| format!("Pad {slot} is empty"))?;
    Ok(dto::pad_info(pad, session.handle.rate()))
}

/// Applies settings that do not require audio restart.
pub fn apply_live_settings(
    state: &AppState,
    previous: &settings::Settings,
    next: &settings::Settings,
) {
    if let Ok(mut session) = state.runtime.session.lock() {
        if previous.send_volume != next.send_volume {
            session.handle.set_send_volume(next.send_volume);
        }
        if previous.monitor_volume != next.monitor_volume {
            session.handle.set_monitor_volume(next.monitor_volume);
        }
        if previous.ducking != next.ducking {
            session.handle.set_ducking(next.ducking);
        }
        if previous.grab_seconds != next.grab_seconds {
            session.seconds = next.grab_seconds;
        }
    }
}

/// Applies autostart changes.
pub fn apply_autostart(
    app: &AppHandle,
    previous: &settings::Settings,
    next: &settings::Settings,
) -> Result<(), String> {
    if previous.start_with_windows == next.start_with_windows {
        return Ok(());
    }
    if next.start_with_windows {
        app.autolaunch().enable().map_err(string_error)
    } else {
        app.autolaunch().disable().map_err(string_error)
    }
}

/// Returns whether settings require an audio restart.
#[must_use]
pub fn needs_audio_restart(previous: &settings::Settings, next: &settings::Settings) -> bool {
    previous.source != next.source
        || previous.relay_source != next.relay_source
        || previous.virtual_output != next.virtual_output
        || previous.mic != next.mic
        || previous.mic_enabled != next.mic_enabled
        || previous.headphones != next.headphones
        || previous.history_seconds != next.history_seconds
}

/// Restarts audio when a device change affects it, then reports the new status.
pub fn on_devices_changed(
    app: &AppHandle,
    state: &AppState,
    devices: &[ringpad_windows::DeviceInfo],
) {
    let settings = match state.settings.lock() {
        Ok(settings) => settings.clone(),
        Err(error) => return log::warn!("device change ignored: {error}"),
    };
    let pads = match state.pads_store.lock() {
        Ok(pads) => pads.clone(),
        Err(error) => return log::warn!("device change ignored: {error}"),
    };
    if let Some(status) = state
        .runtime
        .refresh_audio(&settings, &state.paths, &pads, devices)
    {
        set_status(app, state, status);
        emit_playback(app, state);
    }
}

/// Stores and emits engine status.
pub fn set_status(app: &AppHandle, state: &AppState, status: EngineStatus) {
    if let Ok(mut current) = state.status.lock() {
        *current = status.clone();
    }
    emit(app, "status", status);
}

/// Returns the capture-side virtual cable hint.
pub fn virtual_capture_hint(
    devices: &[ringpad_windows::DeviceInfo],
    saved_id: Option<&str>,
) -> Option<String> {
    let output = ringpad_windows::devices::pick_virtual_output(devices, saved_id).ok()?;
    ringpad_windows::devices::matching_capture_side(&output, devices).map(|device| device.name)
}

/// Converts a zero-based UI slot into one-based core slot.
pub fn slot_one_based(slot: usize) -> Result<usize, String> {
    if slot < 8 {
        Ok(slot + 1)
    } else {
        Err(format!("slot {slot} is out of range 0..=7"))
    }
}

/// Cleans a pad name.
#[must_use]
pub fn clean_pad_name(name: String, slot: usize) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        format!("Pad {slot}")
    } else {
        trimmed.to_string()
    }
}

/// Returns the next fallback clip id.
pub fn next_clip_id(state: &AppState) -> String {
    let id = state.clip_counter.fetch_add(1, Ordering::AcqRel) + 1;
    format!("clip-{id}")
}

/// Returns wall-clock seconds for save-arm checks.
pub fn now_seconds() -> f64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs_f64(),
        Err(_) => 0.0,
    }
}

/// Emits a Tauri event and logs failures.
pub fn emit<S>(app: &AppHandle, event: &str, payload: S)
where
    S: Serialize + Clone,
{
    if let Err(error) = app.emit(event, payload) {
        log::warn!("emit {event} failed: {error}");
    }
}

/// Converts a poisoned lock error to a string.
pub fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    error.to_string()
}

/// Converts display errors to strings.
pub fn string_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
