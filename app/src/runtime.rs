//! Runtime ownership for audio, input, watcher, and shared app state.

use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use ringpad_core::actions::{load_slots, Session};
use ringpad_core::engine::{Engine, EngineConfig, EngineHandle};
use ringpad_windows::devices::{pick_headphones, pick_mic, pick_virtual_output};
use ringpad_windows::{
    AudioService, BackendError, DeviceDirection, DeviceInfo, DeviceWatcher, HotkeyListener,
    ServiceConfig, SourceSpec,
};

use crate::dto::{ClipInfo, EngineStatus};
use crate::pads_store::PadsStore;
use crate::paths::AppPaths;
use crate::settings::{Settings, SourceSetting};

/// Shared application state managed by Tauri.
pub struct AppState {
    /// Resolved data paths.
    pub paths: AppPaths,
    /// Current settings.
    pub settings: Mutex<Settings>,
    /// Pad metadata.
    pub pads_store: Mutex<PadsStore>,
    /// Running backend pieces.
    pub runtime: Arc<AppRuntime>,
    /// One-shot key capture flag.
    pub key_capture: AtomicBool,
    /// Whether Quit was explicitly requested.
    pub quit: AtomicBool,
    /// Monotonic clip id fallback.
    pub clip_counter: AtomicU64,
    /// Last captured clip DTO.
    pub last_clip: Mutex<Option<ClipInfo>>,
    /// Last reported status.
    pub status: Mutex<EngineStatus>,
}

/// Runtime pieces that must be stopped explicitly.
pub struct AppRuntime {
    /// Core session and engine handle.
    pub session: Arc<Mutex<Session>>,
    audio: Mutex<Option<AudioService>>,
    hotkeys: Mutex<Option<HotkeyListener>>,
    watcher: Mutex<Option<DeviceWatcher>>,
    retry: Mutex<Option<Settings>>,
    /// Identifies the devices the running service uses; see `plan_audio`.
    running_key: Mutex<Option<String>>,
    /// What the running service records, for the status line.
    label: Mutex<String>,
}

impl AppState {
    /// Builds app state around persisted settings and metadata.
    pub fn new(paths: AppPaths, settings: Settings, pads_store: PadsStore) -> Self {
        let (_, handle) = Engine::new(EngineConfig::new(48_000, 48_000, None, 48_000));
        let mut session = Session::new(handle);
        session.seconds = settings.grab_seconds;
        session.clips_dir = Some(paths.clips_dir.clone());
        session.slots_dir = Some(paths.slots_dir.clone());
        let _ = load_slots(&mut session);
        pads_store.apply_to_bank(&mut session.pads);
        Self {
            paths,
            settings: Mutex::new(settings),
            pads_store: Mutex::new(pads_store),
            runtime: Arc::new(AppRuntime {
                session: Arc::new(Mutex::new(session)),
                audio: Mutex::new(None),
                hotkeys: Mutex::new(None),
                watcher: Mutex::new(None),
                retry: Mutex::new(None),
                running_key: Mutex::new(None),
                label: Mutex::new(String::new()),
            }),
            key_capture: AtomicBool::new(false),
            quit: AtomicBool::new(false),
            clip_counter: AtomicU64::new(0),
            last_clip: Mutex::new(None),
            status: Mutex::new(EngineStatus::Starting),
        }
    }
}

impl AppRuntime {
    /// Stores the hotkey listener so it lives for the process.
    pub fn set_hotkeys(&self, listener: HotkeyListener) {
        if let Ok(mut hotkeys) = self.hotkeys.lock() {
            *hotkeys = Some(listener);
        }
    }

    /// Starts the device watcher.
    pub fn start_watcher(
        &self,
        callback: impl Fn(Vec<ringpad_windows::DeviceInfo>) + Send + 'static,
    ) -> Result<(), BackendError> {
        let watcher = DeviceWatcher::start(Duration::from_secs(2), callback)?;
        if let Ok(mut current) = self.watcher.lock() {
            *current = Some(watcher);
        }
        Ok(())
    }

    /// Stops audio, input, and watcher threads.
    pub fn stop_all(&self) {
        if let Ok(mut audio) = self.audio.lock() {
            if let Some(service) = audio.take() {
                service.stop();
            }
        }
        if let Ok(mut hotkeys) = self.hotkeys.lock() {
            if let Some(listener) = hotkeys.take() {
                listener.stop();
            }
        }
        if let Ok(mut watcher) = self.watcher.lock() {
            if let Some(watcher) = watcher.take() {
                watcher.stop();
            }
        }
    }

    /// Starts or restarts the audio service from settings.
    pub fn start_audio(
        &self,
        settings: &Settings,
        paths: &AppPaths,
        pads: &PadsStore,
    ) -> EngineStatus {
        match ringpad_windows::devices::list_devices() {
            Ok(devices) => self.start_planned(settings, paths, pads, &devices),
            Err(error) => {
                self.stop_audio();
                stopped(error.to_string())
            }
        }
    }

    /// Restarts audio after a device change when the devices it would use are different,
    /// or when it is not running. Returns the new status, or `None` when nothing changed.
    pub fn refresh_audio(
        &self,
        settings: &Settings,
        paths: &AppPaths,
        pads: &PadsStore,
        devices: &[DeviceInfo],
    ) -> Option<EngineStatus> {
        let key = plan_audio(settings, devices).ok().map(|plan| plan.key);
        let unchanged = key.is_some()
            && self.is_running()
            && self.running_key.lock().is_ok_and(|running| *running == key);
        if unchanged {
            return None;
        }
        Some(self.start_planned(settings, paths, pads, devices))
    }

    /// Restarts retryable audio sources if one is pending.
    pub fn retry_audio(&self, paths: &AppPaths, pads: &PadsStore) -> Option<EngineStatus> {
        let settings = self.retry.lock().ok().and_then(|retry| retry.clone())?;
        Some(self.start_audio(&settings, paths, pads))
    }

    /// Returns the running service's status, or `None` when no service was started.
    pub fn audio_status(&self) -> Option<EngineStatus> {
        let audio = self.audio.lock().ok()?;
        let status = audio.as_ref()?.status();
        Some(match status {
            ringpad_windows::ServiceStatus::Running => EngineStatus::Running {
                source_label: self
                    .label
                    .lock()
                    .map(|label| label.clone())
                    .unwrap_or_default(),
            },
            ringpad_windows::ServiceStatus::Stopped { reason } => stopped(reason),
        })
    }

    fn start_planned(
        &self,
        settings: &Settings,
        paths: &AppPaths,
        pads: &PadsStore,
        devices: &[DeviceInfo],
    ) -> EngineStatus {
        self.stop_audio();
        let plan = match plan_audio(settings, devices) {
            Ok(plan) => plan,
            Err(status) => return status,
        };
        match AudioService::start(plan.config) {
            Ok((service, handle)) => {
                self.replace_session(handle, settings, paths, pads);
                if let Ok(mut audio) = self.audio.lock() {
                    *audio = Some(service);
                }
                if let Ok(mut running) = self.running_key.lock() {
                    *running = Some(plan.key);
                }
                if let Ok(mut label) = self.label.lock() {
                    label.clone_from(&plan.label);
                }
                self.clear_retry();
                EngineStatus::Running {
                    source_label: plan.label,
                }
            }
            Err(BackendError::AppNotRunning(_exe)) => {
                self.set_retry(settings.clone());
                stopped(format!("Waiting for {}", plan.label))
            }
            Err(error) => stopped(error.to_string()),
        }
    }

    fn is_running(&self) -> bool {
        matches!(self.audio_status(), Some(EngineStatus::Running { .. }))
    }

    fn stop_audio(&self) {
        if let Ok(mut audio) = self.audio.lock() {
            if let Some(service) = audio.take() {
                service.stop();
            }
        }
        if let Ok(mut running) = self.running_key.lock() {
            *running = None;
        }
    }

    fn replace_session(
        &self,
        handle: EngineHandle,
        settings: &Settings,
        paths: &AppPaths,
        pads_store: &PadsStore,
    ) {
        let Ok(mut session) = self.session.lock() else {
            return;
        };
        let pads = std::mem::take(&mut session.pads);
        // Keep the current clip across a restart, so Send still works after a device change.
        let clip = session.handle.current_send_clip();
        *session = Session::new(handle);
        if !clip.is_empty() {
            let _ = session.handle.load_send_clip(clip);
        }
        session.pads = pads;
        session.seconds = settings.grab_seconds;
        session.clips_dir = Some(paths.clips_dir.clone());
        session.slots_dir = Some(paths.slots_dir.clone());
        pads_store.apply_to_bank(&mut session.pads);
        session.handle.set_send_volume(settings.send_volume);
        session.handle.set_monitor_volume(settings.monitor_volume);
        session.handle.set_ducking(settings.ducking);
    }

    fn set_retry(&self, settings: Settings) {
        if let Ok(mut retry) = self.retry.lock() {
            *retry = Some(settings);
        }
    }

    fn clear_retry(&self) {
        if let Ok(mut retry) = self.retry.lock() {
            *retry = None;
        }
    }
}

fn source_spec(source: &SourceSetting) -> SourceSpec {
    match source {
        SourceSetting::Default => SourceSpec::DefaultOutputLoopback,
        SourceSetting::Device { id } => SourceSpec::DeviceLoopback(id.clone()),
        SourceSetting::App { exe, .. } => SourceSpec::App(exe.clone()),
    }
}

/// The service config resolved from settings and the current devices.
struct AudioPlan {
    config: ServiceConfig,
    label: String,
    /// Changes whenever a device the service would use changes.
    key: String,
}

fn plan_audio(settings: &Settings, devices: &[DeviceInfo]) -> Result<AudioPlan, EngineStatus> {
    let virtual_output = pick_virtual_output(devices, settings.virtual_output.as_deref())
        .map_err(|_error| needs_setup("No virtual cable found"))?;
    let mic = if settings.mic_enabled {
        pick_mic(devices, settings.mic.as_deref()).map_err(|error| stopped(error.to_string()))?
    } else {
        None
    };
    let headphones = match pick_headphones(devices, settings.headphones.as_deref()) {
        Ok(device) => Some(device),
        Err(error) => {
            log::warn!("headphone monitor disabled: {error}");
            None
        }
    };
    // Recording "what I hear" follows the Windows default output, so a new default is a change.
    let recorded_default = matches!(settings.source, SourceSetting::Default)
        .then(|| default_output(devices).map(|device| device.id.clone()))
        .flatten();
    let config = ServiceConfig {
        source: source_spec(&settings.source),
        virtual_output_id: virtual_output.id,
        mic_id: mic.map(|device| device.id),
        headphones_id: headphones.map(|device| device.id),
        send_volume: settings.send_volume,
        monitor_volume: settings.monitor_volume,
        ducking: settings.ducking,
        history_seconds: settings.history_seconds,
        forward_source: settings.relay_source
            && matches!(settings.source, SourceSetting::Device { .. }),
    };
    let key = format!(
        "{:?}|{}|{:?}|{:?}|{:?}|{}|{}",
        config.source,
        config.virtual_output_id,
        config.mic_id,
        config.headphones_id,
        recorded_default,
        config.forward_source,
        config.history_seconds,
    );
    Ok(AudioPlan {
        label: source_label(&settings.source, devices),
        config,
        key,
    })
}

fn default_output(devices: &[DeviceInfo]) -> Option<&DeviceInfo> {
    devices
        .iter()
        .find(|device| device.direction == DeviceDirection::Output && device.is_default)
}

/// Returns what Ringpad records, in words for the status line.
fn source_label(source: &SourceSetting, devices: &[DeviceInfo]) -> String {
    match source {
        SourceSetting::Default => "what you hear".to_string(),
        SourceSetting::Device { id } => devices.iter().find(|device| &device.id == id).map_or_else(
            || "a disconnected device".to_string(),
            |device| device.name.clone(),
        ),
        SourceSetting::App { name, exe } => {
            if name.trim().is_empty() {
                exe.clone()
            } else {
                name.clone()
            }
        }
    }
}

fn stopped(reason: impl Into<String>) -> EngineStatus {
    EngineStatus::Stopped {
        reason: reason.into(),
    }
}

fn needs_setup(reason: impl Into<String>) -> EngineStatus {
    EngineStatus::NeedsSetup {
        reason: reason.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ringpad_windows::VirtualCable;

    fn device(id: &str, direction: DeviceDirection, is_default: bool) -> DeviceInfo {
        DeviceInfo {
            id: id.to_string(),
            name: format!("{id} name"),
            direction,
            is_default,
            virtual_cable: (id == "cable").then_some(VirtualCable::VbCable),
        }
    }

    fn devices(default_output: &str) -> Vec<DeviceInfo> {
        vec![
            device(
                "phones",
                DeviceDirection::Output,
                default_output == "phones",
            ),
            device(
                "speakers",
                DeviceDirection::Output,
                default_output == "speakers",
            ),
            device("spdif", DeviceDirection::Output, false),
            device("cable", DeviceDirection::Output, false),
            device("mic", DeviceDirection::Input, true),
        ]
    }

    fn key(settings: &Settings, devices: &[DeviceInfo]) -> String {
        plan_audio(settings, devices)
            .map(|plan| plan.key)
            .unwrap_or_default()
    }

    #[test]
    fn a_new_default_output_restarts_only_sources_that_follow_it() {
        let follows = Settings {
            headphones: Some("phones".to_string()),
            ..Settings::default()
        };
        assert_ne!(
            key(&follows, &devices("phones")),
            key(&follows, &devices("speakers"))
        );

        let app = Settings {
            source: SourceSetting::App {
                exe: "Discord.exe".to_string(),
                name: "Discord".to_string(),
            },
            ..follows
        };
        assert_eq!(
            key(&app, &devices("phones")),
            key(&app, &devices("speakers"))
        );
    }

    #[test]
    fn relays_only_a_recorded_device() {
        let spdif = Settings {
            source: SourceSetting::Device {
                id: "spdif".to_string(),
            },
            relay_source: true,
            ..Settings::default()
        };
        let plan = plan_audio(&spdif, &devices("phones")).expect("plan");
        assert!(plan.config.forward_source);
        assert_eq!(plan.label, "spdif name");

        let default = Settings {
            relay_source: true,
            ..Settings::default()
        };
        let plan = plan_audio(&default, &devices("phones")).expect("plan");
        assert!(!plan.config.forward_source);
        assert_eq!(plan.label, "what you hear");
    }

    #[test]
    fn needs_setup_without_a_cable_and_names_a_missing_device() {
        let no_cable: Vec<_> = devices("phones")
            .into_iter()
            .filter(|device| device.virtual_cable.is_none())
            .collect();
        assert!(matches!(
            plan_audio(&Settings::default(), &no_cable),
            Err(EngineStatus::NeedsSetup { .. })
        ));
        let gone = SourceSetting::Device {
            id: "usb".to_string(),
        };
        assert_eq!(
            source_label(&gone, &devices("phones")),
            "a disconnected device"
        );
    }
}
