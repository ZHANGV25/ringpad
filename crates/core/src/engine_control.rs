//! Engine control half and shared lock-free state.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use rtrb::{Consumer, Producer};
use thiserror::Error;

use crate::clip::Clip;
use crate::engine::{
    DUCK_GAIN, FIFO_MAX_SECONDS, FIFO_PRIME_SECONDS, HISTORY_SECONDS, MONITOR_VOLUME, SEND_VOLUME,
};
use crate::fifo::SampleFifo;
use crate::history::History;

/// Engine configuration supplied by the platform crate.
#[derive(Debug, Clone)]
pub struct EngineConfig {
    /// Virtual microphone and internal engine sample rate.
    pub engine_rate: u32,
    /// Source capture device sample rate.
    pub source_rate: u32,
    /// Optional real microphone sample rate.
    pub mic_rate: Option<u32>,
    /// Headphone playback sample rate.
    pub headphone_rate: u32,
    /// Whether monitoring to headphones is enabled.
    pub monitoring: bool,
    /// Initial monitor volume.
    pub monitor_volume: f32,
    /// Initial send volume.
    pub send_volume: f32,
    /// Whether source audio is forwarded to headphones.
    pub forward_source: bool,
    /// Whether source capture records the same device as headphones.
    pub recording_headphones: bool,
    /// Initial mic duck gain.
    pub duck_gain: f32,
    /// Whether mic ducking starts enabled.
    pub ducking: bool,
    /// Rolling history length in seconds (clamped to 10..=120 by the engine).
    pub history_seconds: f32,
}

impl EngineConfig {
    /// Creates a config with prototype defaults.
    #[must_use]
    pub fn new(
        engine_rate: u32,
        source_rate: u32,
        mic_rate: Option<u32>,
        headphone_rate: u32,
    ) -> Self {
        Self {
            engine_rate,
            source_rate,
            mic_rate,
            headphone_rate,
            monitoring: true,
            monitor_volume: MONITOR_VOLUME,
            send_volume: SEND_VOLUME,
            forward_source: false,
            recording_headphones: false,
            duck_gain: DUCK_GAIN,
            ducking: true,
            history_seconds: HISTORY_SECONDS,
        }
    }
}

/// Peak meter values for UI display.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PeakMeters {
    /// Source-capture peak for the latest block.
    pub source: f32,
    /// Real-microphone peak for the latest block.
    pub mic: f32,
    /// Outgoing virtual-microphone peak for the latest block.
    pub outgoing: f32,
}

/// Error returned when a nonblocking engine command cannot be queued.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum EngineCommandError {
    /// The audio command queue is full.
    #[error("engine command queue is full")]
    QueueFull,
}

/// Control-thread handle for queueing commands and reading shared state.
pub struct EngineHandle {
    pub(crate) rate: u32,
    pub(crate) shared: Arc<SharedState>,
    pub(crate) commands: Producer<EngineCommand>,
    pub(crate) retired: Consumer<Clip>,
    pub(crate) current_send: Clip,
}

impl EngineHandle {
    /// Returns the engine sample rate.
    #[must_use]
    pub fn rate(&self) -> u32 {
        self.rate
    }

    /// Returns the shared rolling history.
    #[must_use]
    pub fn history(&self) -> &History {
        &self.shared.history
    }

    /// Returns whether the preview player exists.
    #[must_use]
    pub fn preview_enabled(&self) -> bool {
        self.shared.preview_enabled
    }

    /// Returns the current send clip mirror.
    #[must_use]
    pub fn current_send_clip(&self) -> Clip {
        Arc::clone(&self.current_send)
    }

    /// Queues a send-clip load command without blocking.
    pub fn load_send_clip(&mut self, clip: Clip) -> Result<(), EngineCommandError> {
        self.push(EngineCommand::LoadSend(Arc::clone(&clip)))?;
        self.current_send = clip;
        Ok(())
    }

    /// Queues immediate send playback without blocking.
    pub fn play_send_clip(&mut self, clip: Clip) -> Result<(), EngineCommandError> {
        self.push(EngineCommand::PlaySend(Arc::clone(&clip)))?;
        self.current_send = clip;
        Ok(())
    }

    /// Queues replay of the mirrored send clip without blocking.
    pub fn replay_send_clip(&mut self) -> Result<(), EngineCommandError> {
        self.push(EngineCommand::ReplaySend)
    }

    /// Queues headphones-only preview playback without blocking.
    pub fn play_preview_clip(&mut self, clip: Clip) -> Result<(), EngineCommandError> {
        self.push(EngineCommand::PlayPreview(clip))
    }

    /// Queues send-player stop without blocking.
    pub fn stop_send(&mut self) -> Result<(), EngineCommandError> {
        self.push(EngineCommand::StopSend)
    }

    /// Queues preview-player stop without blocking.
    pub fn stop_preview(&mut self) -> Result<(), EngineCommandError> {
        self.push(EngineCommand::StopPreview)
    }

    /// Queues stop for every player without blocking.
    pub fn stop_all(&mut self) -> Result<(), EngineCommandError> {
        self.push(EngineCommand::StopAll)
    }

    /// Drops clips retired by the audio thread.
    pub fn collect_garbage(&mut self) {
        while self.retired.pop().is_ok() {}
    }

    /// Sets monitor volume from the control thread.
    pub fn set_monitor_volume(&self, volume: f32) {
        self.shared.monitor_volume.store(volume.clamp(0.0, 1.0));
    }

    /// Sets send volume from the control thread.
    pub fn set_send_volume(&self, volume: f32) {
        self.shared.send_volume.store(volume.clamp(0.0, 1.0));
    }

    /// Sets mic duck gain from the control thread.
    pub fn set_duck_gain(&self, gain: f32) {
        self.shared.duck_gain.store(gain.clamp(0.0, 1.0));
    }

    /// Enables or disables mic ducking from the control thread.
    pub fn set_ducking(&self, enabled: bool) {
        self.shared.ducking.store(enabled, Ordering::Release);
    }

    /// Returns true when the audio thread reports send playback.
    #[must_use]
    pub fn sending(&self) -> bool {
        self.shared.sending.load(Ordering::Acquire)
    }

    /// Returns true when the audio thread reports preview playback.
    #[must_use]
    pub fn previewing(&self) -> bool {
        self.shared.previewing.load(Ordering::Acquire)
    }

    /// Returns the latest peak meters.
    #[must_use]
    pub fn meters(&self) -> PeakMeters {
        PeakMeters {
            source: self.shared.source_peak.load(),
            mic: self.shared.mic_peak.load(),
            outgoing: self.shared.outgoing_peak.load(),
        }
    }

    fn push(&mut self, command: EngineCommand) -> Result<(), EngineCommandError> {
        self.commands
            .push(command)
            .map_err(|_error| EngineCommandError::QueueFull)
    }
}

pub(crate) struct SharedState {
    pub(crate) history: History,
    pub(crate) monitor_volume: AtomicF32,
    pub(crate) send_volume: AtomicF32,
    pub(crate) duck_gain: AtomicF32,
    pub(crate) ducking: AtomicBool,
    pub(crate) sending: AtomicBool,
    pub(crate) previewing: AtomicBool,
    pub(crate) source_peak: AtomicF32,
    pub(crate) mic_peak: AtomicF32,
    pub(crate) outgoing_peak: AtomicF32,
    pub(crate) preview_enabled: bool,
}

impl SharedState {
    pub(crate) fn new(
        history_seconds: f32,
        rate: u32,
        monitor_volume: f32,
        send_volume: f32,
        duck_gain: f32,
        ducking: bool,
        preview_enabled: bool,
    ) -> Self {
        Self {
            history: History::for_seconds(history_seconds, rate),
            monitor_volume: AtomicF32::new(monitor_volume),
            send_volume: AtomicF32::new(send_volume),
            duck_gain: AtomicF32::new(duck_gain),
            ducking: AtomicBool::new(ducking),
            sending: AtomicBool::new(false),
            previewing: AtomicBool::new(false),
            source_peak: AtomicF32::new(0.0),
            mic_peak: AtomicF32::new(0.0),
            outgoing_peak: AtomicF32::new(0.0),
            preview_enabled,
        }
    }
}

pub(crate) struct AtomicF32(AtomicU32);

impl AtomicF32 {
    fn new(value: f32) -> Self {
        Self(AtomicU32::new(value.to_bits()))
    }

    pub(crate) fn load(&self) -> f32 {
        f32::from_bits(self.0.load(Ordering::Acquire))
    }

    pub(crate) fn store(&self, value: f32) {
        self.0.store(value.to_bits(), Ordering::Release);
    }
}

pub(crate) enum EngineCommand {
    LoadSend(Clip),
    PlaySend(Clip),
    ReplaySend,
    PlayPreview(Clip),
    StopSend,
    StopPreview,
    StopAll,
}

pub(crate) struct VecRetire {
    clips: [Option<Clip>; 2],
}

impl VecRetire {
    pub(crate) fn new() -> Self {
        Self {
            clips: [None, None],
        }
    }

    pub(crate) fn push(&mut self, clip: Clip) {
        for slot in &mut self.clips {
            if slot.is_none() {
                *slot = Some(clip);
                return;
            }
        }
        std::mem::forget(clip);
    }

    pub(crate) fn into_clips(self) -> [Option<Clip>; 2] {
        self.clips
    }
}

pub(crate) fn add_fifo(out: &mut [f32], scratch: &mut [f32], fifo: Option<&mut SampleFifo>) {
    let Some(fifo) = fifo else {
        return;
    };
    let len = out.len();
    fifo.pull_into(&mut scratch[..len]);
    for (mixed, sample) in out.iter_mut().zip(&scratch[..len]) {
        *mixed += *sample;
    }
}

pub(crate) fn default_fifo(rate: u32) -> SampleFifo {
    SampleFifo::from_seconds(rate, FIFO_MAX_SECONDS, FIFO_PRIME_SECONDS)
}

pub(crate) fn peak(samples: &[f32]) -> f32 {
    samples
        .iter()
        .map(|sample| sample.abs())
        .fold(0.0, f32::max)
}
