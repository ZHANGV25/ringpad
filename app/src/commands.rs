//! Tauri commands matching the UI IPC contract.

use ringpad_core::actions;
use ringpad_core::clip::clip_from_vec;
use ringpad_core::keys::is_valid_key_name;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt as _;

use crate::command_support::{
    apply_autostart, apply_live_settings, clean_pad_name, emit, lock_error, needs_audio_restart,
    next_clip_id, pad_by_slot, set_status, slot_one_based, string_error, update_saved_pad,
    virtual_capture_hint,
};
use crate::dto::{self, AudioApp, ClipInfo, DeviceInfo, MicUser, PadInfo, Snapshot};
use crate::import;
use crate::runtime::AppState;
use crate::settings;

pub(crate) use crate::command_support::{
    emit_error, emit_pads, emit_playback, emit_talk, now_seconds, playback_from_session,
    save_pad_metadata,
};

/// Returns a complete UI snapshot.
#[tauri::command]
pub async fn get_snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let settings = state.settings.lock().map_err(lock_error)?.clone();
    let devices_raw = ringpad_windows::devices::list_devices().map_err(string_error)?;
    let virtual_capture_hint =
        virtual_capture_hint(&devices_raw, settings.virtual_output.as_deref());
    let devices = devices_raw.into_iter().map(DeviceInfo::from).collect();
    let status = state.status.lock().map_err(lock_error)?.clone();
    let pads_store = state.pads_store.lock().map_err(lock_error)?.clone();
    let (pads, playback) = {
        let session = state.runtime.session.lock().map_err(lock_error)?;
        (
            dto::pads_info(&session.pads, &pads_store, session.handle.rate()),
            playback_from_session(&session),
        )
    };
    let talk = state.talk.lock().map_err(lock_error)?.snapshot();
    Ok(Snapshot {
        version: env!("CARGO_PKG_VERSION"),
        backend: ringpad_windows::backend_name(),
        status,
        settings,
        devices,
        clip: state.last_clip.lock().map_err(lock_error)?.clone(),
        pads,
        playback,
        virtual_capture_hint,
        talk,
    })
}

/// Lists audio devices.
#[tauri::command]
pub async fn list_devices(
    app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<Vec<DeviceInfo>, String> {
    let devices: Vec<_> = ringpad_windows::devices::list_devices()
        .map_err(string_error)?
        .into_iter()
        .map(DeviceInfo::from)
        .collect();
    emit(&app, "devices", devices.clone());
    Ok(devices)
}

/// Lists apps with audio sessions.
#[tauri::command]
pub async fn list_audio_apps() -> Result<Vec<AudioApp>, String> {
    Ok(ringpad_windows::sessions::list_audio_apps()
        .map_err(string_error)?
        .into_iter()
        .map(AudioApp::from)
        .collect())
}

/// Apps recording from any microphone right now, and whether it is Ringpad's (the recording
/// side of the virtual cable Ringpad plays into, such as "CABLE Output"). Discord records
/// while in a call or on its Voice & Video page. Sessions an app has stopped using linger
/// in Windows' list, so only active ones count.
#[tauri::command]
pub async fn mic_users(state: State<'_, AppState>) -> Result<Vec<MicUser>, String> {
    let chosen = state
        .settings
        .lock()
        .map_err(lock_error)?
        .virtual_output
        .clone();
    let devices = ringpad_windows::devices::list_devices().map_err(string_error)?;
    let ringpad_mic = ringpad_windows::devices::pick_virtual_output(&devices, chosen.as_deref())
        .ok()
        .and_then(|output| ringpad_windows::devices::matching_capture_side(&output, &devices))
        .map(|capture| capture.id);
    let mut users = Vec::new();
    for mic in devices
        .iter()
        .filter(|device| device.direction == ringpad_windows::DeviceDirection::Input)
    {
        let apps = ringpad_windows::sessions::apps_using_device(&mic.id).map_err(string_error)?;
        users.extend(
            apps.into_iter()
                .filter(|app| app.active)
                .map(|app| MicUser {
                    pid: app.pid,
                    exe: app.exe_name,
                    name: app.display_name,
                    mic: mic.name.clone(),
                    ringpad: ringpad_mic.as_deref() == Some(mic.id.as_str()),
                }),
        );
    }
    Ok(users)
}

/// Updates settings by JSON patch.
#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    patch: Value,
) -> Result<settings::Settings, String> {
    let (previous, next) = {
        let mut current = state.settings.lock().map_err(lock_error)?;
        let previous = current.clone();
        let next = settings::apply_patch(&current, patch).map_err(string_error)?;
        let pads = state.pads_store.lock().map_err(lock_error)?.clone();
        validate_talk_pad_conflicts(&next, &pads)?;
        settings::save(&state.paths.settings_json, &next).map_err(string_error)?;
        *current = next.clone();
        (previous, next)
    };
    apply_live_settings(&state, &previous, &next);
    if let Some(talk) = state.talk.lock().map_err(lock_error)?.apply_settings(&next) {
        emit_talk(&app, state.inner(), talk);
    }
    apply_autostart(&app, &previous, &next)?;
    if needs_audio_restart(&previous, &next) {
        let pads = state.pads_store.lock().map_err(lock_error)?.clone();
        let status = state.runtime.start_audio(&next, &state.paths, &pads);
        set_status(&app, &state, status);
    }
    emit(&app, "settings", next.clone());
    Ok(next)
}

/// Captures a clip from recent history.
#[tauri::command]
pub async fn grab_clip(app: AppHandle, state: State<'_, AppState>) -> Result<ClipInfo, String> {
    let event = {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        actions::grab(&mut session).map_err(string_error)?
    };
    match event {
        actions::ActionEvent::Clipped { path, .. } => {
            let clip = {
                let session = state.runtime.session.lock().map_err(lock_error)?;
                session.handle.current_send_clip()
            };
            let id = next_clip_id(&state);
            let info = dto::clip_info(&clip, 48_000, path.as_deref(), &id);
            *state.last_clip.lock().map_err(lock_error)? = Some(info.clone());
            emit(&app, "clip", info.clone());
            emit_playback(&app, &state);
            Ok(info)
        }
        actions::ActionEvent::NothingHeard { seconds } => Err(format!(
            "Nothing heard in the last {} s",
            seconds.round() as u32
        )),
        _ => Err("Clip failed".to_string()),
    }
}

/// Previews the current clip.
#[tauri::command]
pub async fn preview_clip(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        let clip = session.handle.current_send_clip();
        if clip.is_empty() {
            return Err("No clip yet".to_string());
        }
        session
            .handle
            .play_preview_clip(clip)
            .map_err(string_error)?;
    }
    emit_playback(&app, &state);
    Ok(())
}

/// Sends the current clip.
#[tauri::command]
pub async fn send_clip(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    {
        let session = state.runtime.session.lock().map_err(lock_error)?;
        if session.handle.current_send_clip().is_empty() {
            return Err("No clip yet".to_string());
        }
    }
    let wait = before_clip(&app, state.inner())?;
    if !wait.is_zero() {
        delayed_send(app, state.inner(), wait);
        return Ok(());
    }
    let event = {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        actions::send_last(&mut session).map_err(string_error)?
    };
    match event {
        actions::ActionEvent::SendingClip => {
            emit_playback(&app, &state);
            Ok(())
        }
        actions::ActionEvent::NoClipYet => Err("No clip yet".to_string()),
        _ => Ok(()),
    }
}

/// Stops all playback.
#[tauri::command]
pub async fn stop_all(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        actions::stop_all(&mut session).map_err(string_error)?;
        let _ = session.arm.consume(now_seconds());
    }
    if let Some(talk) = state.talk.lock().map_err(lock_error)?.stop() {
        emit_talk(&app, state.inner(), talk);
    }
    emit_playback(&app, &state);
    Ok(())
}

/// Saves the current clip to a pad.
#[tauri::command]
pub async fn save_clip_to_pad(
    app: AppHandle,
    state: State<'_, AppState>,
    slot: usize,
) -> Result<PadInfo, String> {
    let one = slot_one_based(slot)?;
    let event = {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        actions::save_current_to_pad(&mut session, one).map_err(string_error)?
    };
    match event {
        actions::ActionEvent::SavedToPad { .. } => {
            let pad = update_saved_pad(&app, &state, one)?;
            emit_playback(&app, &state);
            Ok(pad)
        }
        actions::ActionEvent::NothingToSave => Err("No clip to save".to_string()),
        _ => Err("Pad save failed".to_string()),
    }
}

/// Plays a pad.
#[tauri::command]
pub async fn play_pad(
    app: AppHandle,
    state: State<'_, AppState>,
    slot: usize,
) -> Result<(), String> {
    let one = slot_one_based(slot)?;
    {
        let session = state.runtime.session.lock().map_err(lock_error)?;
        if session.pads.get(one).map_err(string_error)?.is_none() {
            return Err(format!("Pad {one} is empty"));
        }
    }
    let wait = before_clip(&app, state.inner())?;
    if !wait.is_zero() {
        delayed_pad(app, state.inner(), one, wait);
        return Ok(());
    }
    let event = {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        actions::play_pad(&mut session, one).map_err(string_error)?
    };
    match event {
        actions::ActionEvent::PlayingPad { .. } => {
            emit_playback(&app, &state);
            Ok(())
        }
        actions::ActionEvent::EmptyPad { slot } => Err(format!("Pad {slot} is empty")),
        _ => Ok(()),
    }
}

/// Imports an audio file into a pad.
#[tauri::command]
pub async fn import_pad(
    app: AppHandle,
    state: State<'_, AppState>,
    slot: usize,
    path: String,
) -> Result<PadInfo, String> {
    let one = slot_one_based(slot)?;
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        let mut store = state.pads_store.lock().map_err(lock_error)?;
        import::import_pad_file(
            &PathBuf::from(path),
            one,
            &state.paths.slots_dir,
            &mut session.pads,
            &mut store,
        )
        .map_err(string_error)?;
        store.save(&state.paths.pads_json).map_err(string_error)?;
    }
    emit_pads(&app, &state)?;
    pad_by_slot(&state, one)
}

/// Asks for a sound file to put on a pad. `None` when the picker is closed without one.
#[tauri::command]
pub async fn pick_sound_file(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Add a sound")
        .add_filter("Sound", &import::SOUND_EXTENSIONS)
        .blocking_pick_file()
        .map(|file| {
            file.into_path()
                .map(|path| path.to_string_lossy().into_owned())
        })
        .transpose()
        .map_err(string_error)
}

/// Renames a filled pad.
#[tauri::command]
pub async fn rename_pad(
    app: AppHandle,
    state: State<'_, AppState>,
    slot: usize,
    name: String,
) -> Result<PadInfo, String> {
    let one = slot_one_based(slot)?;
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        session
            .pads
            .rename(one, clean_pad_name(name, one))
            .map_err(string_error)?;
        save_pad_metadata(&state, &session.pads)?;
    }
    emit_pads(&app, &state)?;
    pad_by_slot(&state, one)
}

/// Sets pad volume.
#[tauri::command]
pub async fn set_pad_volume(
    app: AppHandle,
    state: State<'_, AppState>,
    slot: usize,
    volume: f32,
) -> Result<PadInfo, String> {
    let one = slot_one_based(slot)?;
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        session.pads.set_volume(one, volume).map_err(string_error)?;
        save_pad_metadata(&state, &session.pads)?;
    }
    emit_pads(&app, &state)?;
    pad_by_slot(&state, one)
}

/// Sets pad hotkey.
#[tauri::command]
pub async fn set_pad_hotkey(
    app: AppHandle,
    state: State<'_, AppState>,
    slot: usize,
    hotkey: Option<String>,
) -> Result<PadInfo, String> {
    let one = slot_one_based(slot)?;
    if let Some(key) = hotkey.as_deref() {
        if !is_valid_key_name(key) {
            return Err(format!("Invalid key: {key}"));
        }
        let settings = state.settings.lock().map_err(lock_error)?;
        if settings
            .hotkeys
            .talk
            .as_deref()
            .is_some_and(|talk| talk.eq_ignore_ascii_case(key))
            || settings
                .game_talk_keys
                .iter()
                .any(|talk| talk.eq_ignore_ascii_case(key))
        {
            return Err(format!("Pad hotkey {key} conflicts with talk keys"));
        }
    }
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        session.pads.set_hotkey(one, hotkey).map_err(string_error)?;
        save_pad_metadata(&state, &session.pads)?;
    }
    emit_pads(&app, &state)?;
    pad_by_slot(&state, one)
}

/// Clears a pad.
#[tauri::command]
pub async fn clear_pad(
    app: AppHandle,
    state: State<'_, AppState>,
    slot: usize,
) -> Result<(), String> {
    let one = slot_one_based(slot)?;
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        session.pads.clear(one).map_err(string_error)?;
        let _ = std::fs::remove_file(import::slot_path(&state.paths.slots_dir, one));
        let mut store = state.pads_store.lock().map_err(lock_error)?;
        store.reset_slot(one);
        store.save(&state.paths.pads_json).map_err(string_error)?;
    }
    emit_pads(&app, &state)?;
    Ok(())
}

/// Starts one-shot key capture.
#[tauri::command]
pub async fn begin_key_capture(state: State<'_, AppState>) -> Result<(), String> {
    state.key_capture.store(true, Ordering::Release);
    Ok(())
}

/// Cancels one-shot key capture.
#[tauri::command]
pub async fn cancel_key_capture(state: State<'_, AppState>) -> Result<(), String> {
    state.key_capture.store(false, Ordering::Release);
    Ok(())
}

/// Plays a 1-second 440 Hz test tone.
#[tauri::command]
pub async fn play_test_tone(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let samples: Vec<f32> = (0..48_000)
        .map(|index| {
            let phase = index as f32 * 440.0 * std::f32::consts::TAU / 48_000.0;
            phase.sin() * 0.3
        })
        .collect();
    {
        let mut session = state.runtime.session.lock().map_err(lock_error)?;
        session
            .handle
            .play_send_clip(clip_from_vec(samples))
            .map_err(string_error)?;
    }
    emit_playback(&app, &state);
    Ok(())
}

/// Tests game talk-key pressing for two seconds.
#[tauri::command]
pub async fn test_talk_keys(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let talk = state
        .talk
        .lock()
        .map_err(lock_error)?
        .start_test(now_seconds())?;
    if let Some(talk) = talk {
        emit_talk(&app, state.inner(), talk);
    }
    let release_app = app.clone();
    std::thread::Builder::new()
        .name("ringpad-talk-test".to_string())
        .spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let state = release_app.state::<AppState>();
            let talk = state
                .talk
                .lock()
                .ok()
                .and_then(|mut talk| talk.finish_test());
            if let Some(talk) = talk {
                emit_talk(&release_app, state.inner(), talk);
            }
        })
        .map_err(string_error)?;
    Ok(())
}

/// Opens an external HTTPS URL.
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Only https links can be opened".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(string_error)
}

/// Opens the clips folder.
#[tauri::command]
pub async fn open_clips_folder(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    app.opener()
        .open_path(
            state.paths.clips_dir.to_string_lossy().to_string(),
            None::<&str>,
        )
        .map_err(string_error)
}

fn before_clip(app: &AppHandle, state: &AppState) -> Result<std::time::Duration, String> {
    let (wait, talk) = state
        .talk
        .lock()
        .map_err(lock_error)?
        .before_clip(now_seconds());
    if let Some(talk) = talk {
        emit_talk(app, state, talk);
    }
    Ok(wait)
}

fn validate_talk_pad_conflicts(
    settings: &settings::Settings,
    pads: &crate::pads_store::PadsStore,
) -> Result<(), String> {
    for pad in &pads.pads {
        let Some(hotkey) = pad.hotkey.as_deref() else {
            continue;
        };
        if settings
            .hotkeys
            .talk
            .as_deref()
            .is_some_and(|talk| talk.eq_ignore_ascii_case(hotkey))
        {
            return Err(format!("Talk key {hotkey} conflicts with a pad hotkey"));
        }
        if settings
            .game_talk_keys
            .iter()
            .any(|key| key.eq_ignore_ascii_case(hotkey))
        {
            return Err(format!(
                "Game talk key {hotkey} conflicts with a pad hotkey"
            ));
        }
    }
    Ok(())
}

fn delayed_send(app: AppHandle, state: &AppState, wait: std::time::Duration) {
    let session = state.runtime.session.clone();
    let _ = std::thread::Builder::new()
        .name("ringpad-talk-send".to_string())
        .spawn(move || {
            std::thread::sleep(wait);
            let result = session.lock().map_err(lock_error).and_then(|mut session| {
                actions::send_last(&mut session).map_err(string_error)?;
                Ok(())
            });
            if let Err(error) = result {
                emit_error(&app, error);
            }
            let state = app.state::<AppState>();
            emit_playback(&app, state.inner());
        });
}

fn delayed_pad(app: AppHandle, state: &AppState, slot: usize, wait: std::time::Duration) {
    let session = state.runtime.session.clone();
    let _ = std::thread::Builder::new()
        .name("ringpad-talk-pad".to_string())
        .spawn(move || {
            std::thread::sleep(wait);
            let result = session.lock().map_err(lock_error).and_then(|mut session| {
                actions::play_pad(&mut session, slot).map_err(string_error)?;
                Ok(())
            });
            if let Err(error) = result {
                emit_error(&app, error);
            }
            let state = app.state::<AppState>();
            emit_playback(&app, state.inner());
        });
}
