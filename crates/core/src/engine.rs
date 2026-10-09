//! Platform-independent engine and mixer.

use std::sync::atomic::Ordering;
use std::sync::Arc;

use rtrb::{Consumer, Producer, PushError, RingBuffer};

use crate::clip::{empty_clip, Clip};
use crate::dsp::{clip_sample, StreamingResampler};
use crate::engine_control::{add_fifo, default_fifo, peak, EngineCommand, SharedState, VecRetire};
pub use crate::engine_control::{EngineCommandError, EngineConfig, EngineHandle, PeakMeters};
use crate::fifo::SampleFifo;
use crate::gate::EchoGate;
use crate::player::ClipPlayer;

/// Default rolling history length in seconds.
pub const HISTORY_SECONDS: f32 = 30.0;
/// Shortest allowed rolling history in seconds.
pub const MIN_HISTORY_SECONDS: f32 = 10.0;
/// Longest allowed rolling history in seconds.
pub const MAX_HISTORY_SECONDS: f32 = 120.0;
/// Default headphone monitor volume.
pub const MONITOR_VOLUME: f32 = 0.6;
/// Default virtual-mic send volume.
pub const SEND_VOLUME: f32 = 0.5;
/// Echo-gate tail in seconds.
pub const ECHO_TAIL_SECONDS: f64 = 0.3;
/// Default FIFO prime duration in seconds.
pub const FIFO_PRIME_SECONDS: f32 = 0.03;
/// Default FIFO maximum latency in seconds.
pub const FIFO_MAX_SECONDS: f32 = 0.12;
/// Default mic duck gain while a sent clip plays.
pub const DUCK_GAIN: f32 = 0.15;
/// Duck attack duration in seconds.
pub const DUCK_ATTACK_SECONDS: f32 = 0.010;
/// Duck release duration in seconds.
pub const DUCK_RELEASE_SECONDS: f32 = 0.150;

const COMMAND_CAPACITY: usize = 64;
const RETIRED_CAPACITY: usize = 256;

/// Platform-independent Ringpad audio engine owned by the audio thread.
pub struct Engine {
    rate: u32,
    headphone_rate: u32,
    shared: Arc<SharedState>,
    commands: Consumer<EngineCommand>,
    retired: Producer<Clip>,
    player: ClipPlayer,
    preview: Option<ClipPlayer>,
    source_resampler: StreamingResampler,
    mic_resampler: Option<StreamingResampler>,
    headphones_resampler: StreamingResampler,
    mic_fifo: Option<SampleFifo>,
    clip_fifo: Option<SampleFifo>,
    voice_fifo: Option<SampleFifo>,
    gate: Option<EchoGate>,
    duck_state: f32,
    mix_scratch: Vec<f32>,
    clip_scratch: Vec<f32>,
    mic_scratch: Vec<f32>,
    retire_overflow: Vec<Option<Clip>>,
    now_seconds: f64,
}

impl Engine {
    /// Creates an engine and its control-thread handle with no OS calls.
    #[must_use]
    pub fn new(config: EngineConfig) -> (Self, EngineHandle) {
        let rate = config.engine_rate.max(1);
        let headphone_rate = config.headphone_rate.max(1);
        let source_rate = config.source_rate.max(1);
        let (command_tx, command_rx) = RingBuffer::new(COMMAND_CAPACITY);
        let (retired_tx, retired_rx) = RingBuffer::new(RETIRED_CAPACITY);
        let shared = Arc::new(SharedState::new(
            config
                .history_seconds
                .clamp(MIN_HISTORY_SECONDS, MAX_HISTORY_SECONDS),
            rate,
            config.monitor_volume,
            config.send_volume,
            config.duck_gain,
            config.ducking,
            config.monitoring,
        ));
        let engine = Self {
            rate,
            headphone_rate,
            shared: Arc::clone(&shared),
            commands: command_rx,
            retired: retired_tx,
            player: ClipPlayer::new(),
            preview: config.monitoring.then(ClipPlayer::new),
            source_resampler: StreamingResampler::new(source_rate, rate),
            mic_resampler: config
                .mic_rate
                .map(|mic_rate| StreamingResampler::new(mic_rate.max(1), rate)),
            headphones_resampler: StreamingResampler::new(rate, headphone_rate),
            mic_fifo: config.mic_rate.map(|_| default_fifo(rate)),
            clip_fifo: config.monitoring.then(|| default_fifo(rate)),
            voice_fifo: config.forward_source.then(|| default_fifo(rate)),
            gate: (config.monitoring && config.recording_headphones)
                .then(|| EchoGate::new(ECHO_TAIL_SECONDS)),
            duck_state: 1.0,
            mix_scratch: vec![0.0; rate as usize + 4],
            clip_scratch: vec![0.0; rate as usize + 4],
            mic_scratch: vec![0.0; rate as usize + 4],
            retire_overflow: (0..RETIRED_CAPACITY).map(|_| None).collect(),
            now_seconds: 0.0,
        };
        let handle = EngineHandle {
            rate,
            shared,
            commands: command_tx,
            retired: retired_rx,
            current_send: empty_clip(),
        };
        (engine, handle)
    }

    /// Returns the engine sample rate.
    #[must_use]
    pub fn rate(&self) -> u32 {
        self.rate
    }

    /// Returns engine-rate samples consumed by headphone rendering.
    #[must_use]
    pub fn headphone_engine_samples_consumed(&self) -> usize {
        self.headphones_resampler.input_samples_processed()
    }

    /// Injects deterministic engine time in seconds for tests.
    pub fn set_time_seconds(&mut self, now_seconds: f64) {
        self.now_seconds = now_seconds;
    }

    /// Feeds source-capture mono samples.
    ///
    /// This callback path does not block, allocate, lock, or free clip memory.
    pub fn on_source(&mut self, samples: &[f32]) {
        self.drain_commands();
        self.shared.source_peak.store(peak(samples));
        let gate_open = self
            .gate
            .as_ref()
            .map(|gate| gate.is_open(self.now_seconds))
            .unwrap_or(true);
        let history = &self.shared.history;
        let history_start = history.write_start();
        let mut history_written = 0;
        let voice_fifo = &mut self.voice_fifo;
        self.source_resampler.process_with(samples, |sample| {
            if let Some(fifo) = voice_fifo.as_mut() {
                fifo.push(&[sample]);
            }
            if gate_open {
                history.write_sample_at(history_start + history_written, sample);
                history_written += 1;
            }
        });
        if history_written > 0 {
            history.publish_write(history_start + history_written);
        }
    }

    /// Feeds real microphone mono samples.
    ///
    /// This callback path does not block, allocate, lock, or free clip memory.
    pub fn on_mic(&mut self, samples: &[f32]) {
        self.drain_commands();
        self.shared.mic_peak.store(peak(samples));
        let Some(fifo) = self.mic_fifo.as_mut() else {
            return;
        };
        if let Some(resampler) = self.mic_resampler.as_mut() {
            resampler.process_with(samples, |sample| fifo.push(&[sample]));
        }
    }

    /// Renders the virtual microphone mono output at the engine rate.
    ///
    /// This callback path does not block, allocate, lock, or free clip memory.
    pub fn render_virtual_mic(&mut self, out: &mut [f32]) {
        self.drain_commands();
        let chunk_len = self.clip_scratch.len();
        for chunk in out.chunks_mut(chunk_len) {
            self.render_virtual_mic_chunk(chunk);
        }
        self.shared.outgoing_peak.store(peak(out));
    }

    /// Renders headphone mono output at the headphone rate.
    ///
    /// This callback path does not block, allocate, lock, or free clip memory.
    pub fn render_headphones(&mut self, out: &mut [f32]) {
        self.drain_commands();
        let max_chunk = self.headphone_rate.max(1) as usize;
        for chunk in out.chunks_mut(max_chunk) {
            self.render_headphones_chunk(chunk);
        }
    }

    fn render_virtual_mic_chunk(&mut self, out: &mut [f32]) {
        let was_playing = self.player.playing();
        self.player.pull_into(&mut self.clip_scratch[..out.len()]);
        let clip_playing = was_playing || self.player.playing();
        self.shared.sending.store(clip_playing, Ordering::Release);
        if clip_playing {
            if let Some(gate) = self.gate.as_mut() {
                gate.mark(self.now_seconds);
            }
        }
        if let Some(fifo) = self.clip_fifo.as_mut() {
            let monitor = self.shared.monitor_volume.load();
            fifo.push_scaled(&self.clip_scratch[..out.len()], monitor);
        }

        if let Some(fifo) = self.mic_fifo.as_mut() {
            fifo.pull_into(&mut self.mic_scratch[..out.len()]);
        } else {
            self.mic_scratch[..out.len()].fill(0.0);
        }

        let send = self.shared.send_volume.load();
        let mut index = 0;
        while index < out.len() {
            let clip = self.clip_scratch[index];
            let mic = self.mic_scratch[index];
            let duck = self.next_duck_gain(clip_playing);
            out[index] = clip_sample(clip * send + mic * duck);
            index += 1;
        }
        self.now_seconds += out.len() as f64 / f64::from(self.rate);
    }

    fn render_headphones_chunk(&mut self, out: &mut [f32]) {
        let engine_len = self.headphones_resampler.input_needed_for_output(out.len());
        self.mix_scratch[..engine_len].fill(0.0);
        add_fifo(
            &mut self.mix_scratch[..engine_len],
            &mut self.clip_scratch,
            self.clip_fifo.as_mut(),
        );
        add_fifo(
            &mut self.mix_scratch[..engine_len],
            &mut self.clip_scratch,
            self.voice_fifo.as_mut(),
        );
        self.add_preview(engine_len);
        self.headphones_resampler
            .process_exact_into(&self.mix_scratch[..engine_len], out);
        for sample in out {
            *sample = clip_sample(*sample);
        }
    }

    fn add_preview(&mut self, engine_len: usize) {
        let Some(preview) = self.preview.as_mut() else {
            self.shared.previewing.store(false, Ordering::Release);
            return;
        };
        let was_playing = preview.playing();
        preview.pull_into(&mut self.clip_scratch[..engine_len]);
        let preview_playing = was_playing || preview.playing();
        self.shared
            .previewing
            .store(preview_playing, Ordering::Release);
        if preview_playing {
            if let Some(gate) = self.gate.as_mut() {
                gate.mark(self.now_seconds);
            }
        }
        let monitor = self.shared.monitor_volume.load();
        for (mixed, preview) in self.mix_scratch[..engine_len]
            .iter_mut()
            .zip(&self.clip_scratch)
        {
            *mixed += preview * monitor;
        }
    }

    fn drain_commands(&mut self) {
        self.flush_retired_overflow();
        while let Ok(command) = self.commands.pop() {
            self.apply_command(command);
        }
    }

    fn apply_command(&mut self, command: EngineCommand) {
        match command {
            EngineCommand::LoadSend(clip) => self.load_send(clip),
            EngineCommand::PlaySend(clip) => self.play_send(clip),
            EngineCommand::ReplaySend => {
                let mut retired = VecRetire::new();
                let replayed = self.player.replay_for_audio(|clip| retired.push(clip));
                self.shared.sending.store(replayed, Ordering::Release);
                self.retire_all(retired);
            }
            EngineCommand::PlayPreview(clip) => self.play_preview(clip),
            EngineCommand::StopSend => self.stop_send(),
            EngineCommand::StopPreview => self.stop_preview(),
            EngineCommand::StopAll => {
                self.stop_send();
                self.stop_preview();
            }
        }
    }

    fn load_send(&mut self, clip: Clip) {
        let mut retired = VecRetire::new();
        self.player
            .load_for_audio(clip, |old_clip| retired.push(old_clip));
        self.retire_all(retired);
    }

    fn play_send(&mut self, clip: Clip) {
        let mut retired = VecRetire::new();
        self.player
            .play_for_audio(clip, |old_clip| retired.push(old_clip));
        self.shared.sending.store(true, Ordering::Release);
        self.retire_all(retired);
    }

    fn play_preview(&mut self, clip: Clip) {
        let Some(preview) = self.preview.as_mut() else {
            self.retire_clip(clip);
            self.shared.previewing.store(false, Ordering::Release);
            return;
        };
        let mut retired = VecRetire::new();
        preview.play_for_audio(clip, |old_clip| retired.push(old_clip));
        self.shared.previewing.store(true, Ordering::Release);
        self.retire_all(retired);
    }

    fn stop_send(&mut self) {
        self.player.stop();
        self.shared.sending.store(false, Ordering::Release);
    }

    fn stop_preview(&mut self) {
        if let Some(preview) = self.preview.as_mut() {
            preview.stop();
        }
        self.shared.previewing.store(false, Ordering::Release);
    }

    fn retire_all(&mut self, retired: VecRetire) {
        for clip in retired.into_clips().into_iter().flatten() {
            self.retire_clip(clip);
        }
    }

    fn retire_clip(&mut self, clip: Clip) {
        if clip.is_empty() {
            return;
        }
        match self.retired.push(clip) {
            Ok(()) => {}
            Err(PushError::Full(clip)) => self.store_retired_overflow(clip),
        }
    }

    fn store_retired_overflow(&mut self, clip: Clip) {
        for slot in &mut self.retire_overflow {
            if slot.is_none() {
                *slot = Some(clip);
                return;
            }
        }
        std::mem::forget(clip);
    }

    fn flush_retired_overflow(&mut self) {
        for slot in &mut self.retire_overflow {
            let Some(clip) = slot.take() else {
                continue;
            };
            match self.retired.push(clip) {
                Ok(()) => {}
                Err(PushError::Full(clip)) => {
                    *slot = Some(clip);
                    return;
                }
            }
        }
    }

    fn next_duck_gain(&mut self, clip_playing: bool) -> f32 {
        let target = if clip_playing && self.shared.ducking.load(Ordering::Acquire) {
            self.shared.duck_gain.load()
        } else {
            1.0
        };
        let seconds = if target < self.duck_state {
            DUCK_ATTACK_SECONDS
        } else {
            DUCK_RELEASE_SECONDS
        };
        let step =
            ((1.0 - self.shared.duck_gain.load()).abs() / (seconds * self.rate as f32)).max(0.0);
        if self.duck_state < target {
            self.duck_state = (self.duck_state + step).min(target);
        } else if self.duck_state > target {
            self.duck_state = (self.duck_state - step).max(target);
        }
        self.duck_state
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clip::clip_from_vec;

    #[test]
    fn handle_reports_preview_playback_state() {
        let config = EngineConfig::new(48_000, 48_000, None, 48_000);
        let (mut engine, mut handle) = Engine::new(config);
        assert!(!handle.previewing());

        handle
            .play_preview_clip(clip_from_vec(vec![0.2; 64]))
            .expect("preview command queues");
        engine.render_headphones(&mut [0.0; 32]);
        assert!(handle.previewing());

        engine.render_headphones(&mut [0.0; 128]);
        engine.render_headphones(&mut [0.0; 1]);
        assert!(!handle.previewing());
    }
}
