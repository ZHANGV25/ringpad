// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod command_support;
mod commands;
mod dto;
mod hotkeys;
mod import;
mod pads_store;
mod paths;
mod pump;
mod retention;
mod runtime;
mod settings;
mod talk;
mod tray;
mod virtual_mic;
mod window_state;

use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, SystemTime};

use runtime::AppState;
use tauri::{Emitter, Manager};

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::open_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(setup)
        .on_window_event(window_state::on_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::list_devices,
            commands::list_audio_apps,
            commands::mic_users,
            commands::update_settings,
            commands::grab_clip,
            commands::preview_clip,
            commands::send_clip,
            commands::stop_all,
            commands::save_clip_to_pad,
            commands::play_pad,
            commands::import_pad,
            commands::pick_sound_file,
            commands::rename_pad,
            commands::set_pad_volume,
            commands::set_pad_hotkey,
            commands::clear_pad,
            commands::begin_key_capture,
            commands::cancel_key_capture,
            commands::play_test_tone,
            commands::test_talk_keys,
            commands::open_external,
            commands::open_clips_folder,
            virtual_mic::install_virtual_mic
        ]);

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            log::error!("Ringpad failed to start: {error}");
            return;
        }
    };
    // Closing the window keeps Ringpad running in the tray; only Quit exits.
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let should_quit = app
                .try_state::<AppState>()
                .is_some_and(|state| state.quit.load(Ordering::Acquire));
            if !should_quit {
                api.prevent_exit();
            } else if let Some(state) = app.try_state::<AppState>() {
                if let Ok(mut talk) = state.talk.lock() {
                    talk.release_all();
                }
            }
        }
    });
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let paths = paths::AppPaths::resolve(&handle)?;
    talk::release_crash_marker(&paths.data_dir);
    let settings = settings::load(&paths.settings_json)?;
    let pads = pads_store::PadsStore::load(&paths.pads_json)?;
    let start_minimized = settings.start_minimized || launched_minimized();
    let state = AppState::new(paths, settings, pads);
    let status = {
        let settings = state.settings.lock().map(|settings| settings.clone());
        let pads = state.pads_store.lock().map(|pads| pads.clone());
        match (settings, pads) {
            (Ok(settings), Ok(pads)) => state.runtime.start_audio(&settings, &state.paths, &pads),
            (Err(error), _) => dto::EngineStatus::Stopped {
                reason: error.to_string(),
            },
            (_, Err(error)) => dto::EngineStatus::Stopped {
                reason: error.to_string(),
            },
        }
    };
    if let Ok(mut current) = state.status.lock() {
        *current = status;
    }
    app.manage(state);

    let state = handle.state::<AppState>();
    if let Ok(listener) = hotkeys::start(handle.clone()) {
        state.runtime.set_hotkeys(listener);
    }
    let watcher_app = handle.clone();
    if let Err(error) = state.runtime.start_watcher(move |devices| {
        command_support::on_devices_changed(
            &watcher_app,
            watcher_app.state::<AppState>().inner(),
            &devices,
        );
        let dto: Vec<_> = devices.into_iter().map(dto::DeviceInfo::from).collect();
        let _ = watcher_app.emit("devices", dto);
    }) {
        log::warn!("device watcher failed: {error}");
    }
    tray::build(&handle)?;
    pump::start(handle.clone());
    start_retention_thread(handle.clone());
    if !start_minimized {
        tray::open_main_window(&handle);
    }
    Ok(())
}

fn launched_minimized() -> bool {
    std::env::args().any(|arg| arg == "--minimized")
}

fn start_retention_thread(app: tauri::AppHandle) {
    run_retention(&app);
    let _ = thread::Builder::new()
        .name("ringpad-retention".to_string())
        .spawn(move || loop {
            thread::sleep(Duration::from_secs(60 * 60));
            let state = app.state::<AppState>();
            if state.quit.load(Ordering::Acquire) {
                break;
            }
            run_retention(&app);
        });
}

fn run_retention(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let days = match state.settings.lock() {
        Ok(settings) => settings.clip_retention_days,
        Err(error) => {
            log::warn!("retention settings unavailable: {error}");
            return;
        }
    };
    if let Err(error) = retention::cleanup_clips(&state.paths.clips_dir, days, SystemTime::now()) {
        log::warn!("retention cleanup failed: {error}");
    }
}
