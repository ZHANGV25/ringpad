//! Background event pump for meters, history, playback, status, and retries.

use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::command_support::{emit_talk, playback_from_session, LivePayload};
use crate::dto::{self, EngineStatus, Playback};
use crate::runtime::AppState;

/// Starts the app event pump.
pub fn start(app: AppHandle) {
    let _ = thread::Builder::new()
        .name("ringpad-pump".to_string())
        .spawn(move || pump_loop(app));
}

fn pump_loop(app: AppHandle) {
    let mut last_playback = None::<Playback>;
    let mut last_status = None::<EngineStatus>;
    let mut live = Vec::<f32>::new();
    let mut next_live = Instant::now();
    let mut next_status = Instant::now();
    loop {
        thread::sleep(Duration::from_millis(33));
        let state = app.state::<AppState>();
        if state.quit.load(std::sync::atomic::Ordering::Acquire) {
            break;
        }
        let window_exists = app.get_webview_window("main").is_some();
        let history_seconds = match state.settings.lock() {
            Ok(settings) => settings.history_seconds,
            Err(_) => 30.0,
        };
        let (meters, playback, newest_peak, live_len) = {
            let Ok(mut session) = state.runtime.session.lock() else {
                continue;
            };
            session.handle.collect_garbage();
            let meters = dto::Meters::from(session.handle.meters());
            let playback = playback_from_session(&session);
            let history = session.handle.history().last(4_800);
            let peak = dto::peaks(&history, 1).into_iter().next().unwrap_or(0.0);
            let live_len = (session.handle.rate() as f32 * history_seconds / 4_800.0)
                .round()
                .max(1.0) as usize;
            (meters, playback, peak, live_len)
        };
        if window_exists {
            let _ = app.emit("meters", meters);
        }
        if last_playback != Some(playback) {
            last_playback = Some(playback);
            let _ = app.emit("playback", playback);
        }
        let talk = state
            .talk
            .lock()
            .ok()
            .and_then(|mut talk| talk.tick(crate::commands::now_seconds(), playback.sending));
        if let Some(talk) = talk {
            emit_talk(&app, state.inner(), talk);
        }
        if Instant::now() >= next_live {
            next_live = Instant::now() + Duration::from_millis(100);
            live.push(newest_peak);
            if live.len() > live_len {
                let remove = live.len() - live_len;
                live.drain(0..remove);
            }
            if window_exists {
                let _ = app.emit(
                    "live",
                    LivePayload {
                        peaks: live.clone(),
                    },
                );
            }
        }
        if Instant::now() >= next_status {
            next_status = Instant::now() + Duration::from_secs(2);
            let status = status_tick(state.inner());
            if last_status.as_ref() != Some(&status) {
                last_status = Some(status.clone());
                if let Ok(mut current) = state.status.lock() {
                    *current = status.clone();
                }
                let _ = app.emit("status", status);
            }
        }
    }
}

fn status_tick(state: &AppState) -> EngineStatus {
    let pads = match state.pads_store.lock() {
        Ok(pads) => pads.clone(),
        Err(error) => {
            return EngineStatus::Stopped {
                reason: error.to_string(),
            }
        }
    };
    if let Some(status) = state.runtime.retry_audio(&state.paths, &pads) {
        return status;
    }
    // With no service running, the status from the last start (say "No virtual cable
    // found") is still the right one to show.
    let current = state
        .status
        .lock()
        .map(|status| status.clone())
        .unwrap_or(EngineStatus::Starting);
    state.runtime.audio_status().unwrap_or(current)
}
