//! WASAPI-backed audio service.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use ringpad_core::engine::{Engine, EngineConfig, EngineHandle};

#[cfg(windows)]
#[path = "service_win.rs"]
mod service_win;
#[cfg(windows)]
use service_win::start_platform;

const RATE: u32 = 48_000;
#[cfg(windows)]
const CHANNELS: usize = 2;
#[cfg(windows)]
const BYTES_PER_FRAME: usize = CHANNELS * std::mem::size_of::<f32>();
#[cfg(windows)]
const SCRATCH_FRAMES: usize = RATE as usize;

/// Source captured into Ringpad history.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceSpec {
    /// Capture the default output device with WASAPI loopback.
    DefaultOutputLoopback,
    /// Capture a specific output device with WASAPI loopback.
    DeviceLoopback(String),
    /// Capture a process tree by executable name.
    App(String),
    /// Record nothing. Used while the chosen app is closed, so the mic and clips still play.
    Nothing,
}

/// Audio-service configuration.
#[derive(Debug, Clone)]
pub struct ServiceConfig {
    /// Source captured into the rolling history.
    pub source: SourceSpec,
    /// Output endpoint id of the virtual microphone cable.
    pub virtual_output_id: String,
    /// Optional real microphone endpoint id.
    pub mic_id: Option<String>,
    /// Optional headphone monitor endpoint id.
    pub headphones_id: Option<String>,
    /// Initial send volume.
    pub send_volume: f32,
    /// Initial monitor volume.
    pub monitor_volume: f32,
    /// Whether mic ducking is enabled.
    pub ducking: bool,
    /// Rolling history length in seconds.
    pub history_seconds: f32,
    /// Plays the recorded source in the headphones too. For voice chat sent to an output
    /// with nothing plugged in (such as S/PDIF), which the user would otherwise not hear.
    pub forward_source: bool,
}

impl ServiceConfig {
    /// Builds the core engine config implied by this service config.
    ///
    /// `default_output_id` is the current default output's endpoint id, used to tell
    /// whether a default-output loopback records the headphones (then the echo gate
    /// keeps previews out of the history).
    #[must_use]
    pub fn engine_config(&self, default_output_id: Option<&str>) -> EngineConfig {
        let mut config = EngineConfig::new(RATE, RATE, self.mic_id.as_ref().map(|_| RATE), RATE);
        config.monitoring = self.headphones_id.is_some();
        let recorded_output = match &self.source {
            SourceSpec::DefaultOutputLoopback => default_output_id,
            SourceSpec::DeviceLoopback(id) => Some(id.as_str()),
            SourceSpec::App(_) | SourceSpec::Nothing => None,
        };
        config.recording_headphones =
            recorded_output.is_some() && recorded_output == self.headphones_id.as_deref();
        // Relaying the headphones into themselves would play everything twice.
        config.forward_source =
            self.forward_source && config.monitoring && !config.recording_headphones;
        config.send_volume = self.send_volume;
        config.monitor_volume = self.monitor_volume;
        config.ducking = self.ducking;
        config.history_seconds = self.history_seconds;
        config
    }
}

/// Current audio-service status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServiceStatus {
    /// The audio thread is running.
    Running,
    /// The audio thread has stopped.
    Stopped {
        /// Human-readable stop reason.
        reason: String,
    },
}

/// Running audio service.
pub struct AudioService {
    stop: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    reason: Arc<Mutex<Option<String>>>,
    thread: Option<JoinHandle<()>>,
    /// The process an app source records, so a closed app can be noticed.
    source_pid: Option<u32>,
}

impl AudioService {
    /// Starts the audio thread and returns the service plus engine handle.
    pub fn start(config: ServiceConfig) -> Result<(Self, EngineHandle), crate::BackendError> {
        let default_output = match config.source {
            SourceSpec::DefaultOutputLoopback => crate::devices::list_devices()?
                .into_iter()
                .find(|device| {
                    device.is_default && device.direction == crate::DeviceDirection::Output
                })
                .map(|device| device.id),
            _ => None,
        };
        let (engine, handle) = Engine::new(config.engine_config(default_output.as_deref()));
        start_platform(config, engine).map(|service| (service, handle))
    }

    /// The process an app source records (`SourceSpec::App`), or `None` for other sources.
    #[must_use]
    pub fn source_pid(&self) -> Option<u32> {
        self.source_pid
    }

    /// Returns whether the service is still running, or why it stopped.
    #[must_use]
    pub fn status(&self) -> ServiceStatus {
        if self.running.load(Ordering::Acquire) {
            return ServiceStatus::Running;
        }
        let reason = self
            .reason
            .lock()
            .ok()
            .and_then(|reason| reason.clone())
            .unwrap_or_else(|| "stopped".to_string());
        ServiceStatus::Stopped { reason }
    }

    /// Stops the audio thread and joins it.
    pub fn stop(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for AudioService {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

#[cfg(not(windows))]
fn start_platform(
    _config: ServiceConfig,
    _engine: Engine,
) -> Result<AudioService, crate::BackendError> {
    Err(crate::BackendError::ThreadStart(
        "WASAPI audio service is only available on Windows".to_string(),
    ))
}
