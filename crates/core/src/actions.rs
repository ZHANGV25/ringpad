//! Control-thread actions for clipping, sending, stopping, and pads.

use std::path::PathBuf;

use thiserror::Error;

use crate::clip::{clip_from_vec, Clip};
use crate::clip_files::{load_wav, save_wav, timestamped_path, ClipFileError};
use crate::controls::SaveArm;
use crate::dsp::{normalize, trim_silence};
use crate::engine::{EngineCommandError, EngineHandle};
use crate::pads::{PadBank, PadError};

/// Default grab duration in seconds.
pub const DEFAULT_GRAB_SECONDS: f32 = 5.0;
/// Save-arm timeout in seconds.
pub const SAVE_ARM_SECONDS: f64 = 5.0;
/// Grab hotkey.
pub const KEY_GRAB: &str = "f8";
/// Send/replay hotkey.
pub const KEY_REPEAT: &str = "f7";
/// Stop hotkey.
pub const KEY_STOP: &str = "f9";
/// Save-arm hotkey.
pub const KEY_SAVE: &str = "f6";
/// Slot hotkeys for the eight pads.
pub const SLOT_KEYS: [Option<&str>; 8] = [
    Some("f1"),
    Some("f2"),
    Some("f3"),
    Some("f4"),
    None,
    None,
    None,
    None,
];

/// Events emitted by actions instead of printed text.
#[derive(Debug, Clone, PartialEq)]
pub enum ActionEvent {
    /// No non-silent audio was found.
    NothingHeard {
        /// Seconds searched.
        seconds: f32,
    },
    /// A clip was captured.
    Clipped {
        /// Clip duration in seconds.
        seconds: f32,
        /// Whether it was previewed.
        previewed: bool,
        /// Optional saved copy path.
        path: Option<PathBuf>,
    },
    /// Replay/send started.
    SendingClip,
    /// No clip exists yet.
    NoClipYet,
    /// Players were stopped.
    Stopped,
    /// Save mode was armed.
    SaveArmed,
    /// Save mode was cancelled.
    SaveCancelled,
    /// Clip was saved to a pad.
    SavedToPad {
        /// One-based slot number.
        slot: usize,
        /// Optional saved WAV path.
        path: Option<PathBuf>,
    },
    /// There was no current clip to save.
    NothingToSave,
    /// Pad playback started.
    PlayingPad {
        /// One-based slot number.
        slot: usize,
    },
    /// The requested pad was empty.
    EmptyPad {
        /// One-based slot number.
        slot: usize,
    },
    /// A slot file failed to load.
    SkippedSlot {
        /// One-based slot number.
        slot: usize,
        /// Error string.
        error: String,
    },
}

/// Errors from action operations.
#[derive(Debug, Error)]
pub enum ActionError {
    /// Pad operation failed.
    #[error("{0}")]
    Pad(#[from] PadError),
    /// Clip file operation failed.
    #[error("{0}")]
    ClipFile(#[from] ClipFileError),
    /// Engine command could not be queued.
    #[error("{0}")]
    Command(#[from] EngineCommandError),
}

/// Control-thread state used by the action API.
pub struct Session {
    /// Engine control handle.
    pub handle: EngineHandle,
    /// Pad slots.
    pub pads: PadBank,
    /// Save-arm state.
    pub arm: SaveArm,
    /// Seconds captured by [`grab`].
    pub seconds: f32,
    /// Optional directory for every captured clip.
    pub clips_dir: Option<PathBuf>,
    /// Optional directory for saved pads.
    pub slots_dir: Option<PathBuf>,
}

impl Session {
    /// Creates a session with default action state.
    #[must_use]
    pub fn new(handle: EngineHandle) -> Self {
        Self {
            handle,
            pads: PadBank::new(),
            arm: SaveArm::new(SAVE_ARM_SECONDS),
            seconds: DEFAULT_GRAB_SECONDS,
            clips_dir: None,
            slots_dir: None,
        }
    }
}

/// Clips recent history, trims/normalizes it, loads it for sending, and previews it.
pub fn grab(session: &mut Session) -> Result<ActionEvent, ActionError> {
    let wanted = (session.seconds * session.handle.rate() as f32).round() as usize;
    let raw = session.handle.history().last(wanted);
    let clip = normalize(&trim_silence(&raw, session.handle.rate()));
    if clip.is_empty() {
        return Ok(ActionEvent::NothingHeard {
            seconds: session.seconds,
        });
    }

    let clip = clip_from_vec(clip);
    session.handle.load_send_clip(clip.clone())?;
    let previewed = session.handle.preview_enabled();
    if previewed {
        session.handle.play_preview_clip(clip.clone())?;
    }
    let path = save_grab_copy(session, &clip)?;
    Ok(ActionEvent::Clipped {
        seconds: clip.len() as f32 / session.handle.rate() as f32,
        previewed,
        path,
    })
}

/// Stops both the send and preview players.
pub fn stop_all(session: &mut Session) -> Result<ActionEvent, ActionError> {
    session.handle.stop_all()?;
    Ok(ActionEvent::Stopped)
}

/// Sends the current clip, stopping any preview first.
pub fn send_last(session: &mut Session) -> Result<ActionEvent, ActionError> {
    if session.handle.current_send_clip().is_empty() {
        return Ok(ActionEvent::NoClipYet);
    }
    session.handle.stop_preview()?;
    session.handle.replay_send_clip()?;
    Ok(ActionEvent::SendingClip)
}

/// Toggles save-arm state.
#[must_use]
pub fn toggle_save(session: &mut Session, now: f64) -> ActionEvent {
    if session.arm.toggle(now) {
        ActionEvent::SaveArmed
    } else {
        ActionEvent::SaveCancelled
    }
}

/// Handles a pad key, storing when save is armed and playing otherwise.
pub fn slot_pressed(
    session: &mut Session,
    slot: usize,
    now: f64,
) -> Result<ActionEvent, ActionError> {
    if session.arm.consume(now) {
        save_current_to_pad(session, slot)
    } else {
        play_pad(session, slot)
    }
}

/// Saves the current clip to a pad.
pub fn save_current_to_pad(session: &mut Session, slot: usize) -> Result<ActionEvent, ActionError> {
    let clip = session.handle.current_send_clip();
    if clip.is_empty() {
        return Ok(ActionEvent::NothingToSave);
    }
    session
        .pads
        .store(slot, clip.clone(), format!("Slot {slot}"))?;
    let path = if let Some(dir) = session.slots_dir.as_ref() {
        let path = dir.join(format!("slot{slot}.wav"));
        Some(save_wav(&clip, session.handle.rate(), path)?)
    } else {
        None
    };
    Ok(ActionEvent::SavedToPad { slot, path })
}

/// Plays a pad at its stored volume.
pub fn play_pad(session: &mut Session, slot: usize) -> Result<ActionEvent, ActionError> {
    let Some(pad) = session.pads.get(slot)?.cloned() else {
        return Ok(ActionEvent::EmptyPad { slot });
    };
    if (pad.volume - 1.0).abs() <= f32::EPSILON {
        session.handle.play_send_clip(pad.clip)?;
    } else {
        let scaled: Vec<f32> = pad.clip.iter().map(|sample| sample * pad.volume).collect();
        session.handle.play_send_clip(clip_from_vec(scaled))?;
    }
    Ok(ActionEvent::PlayingPad { slot })
}

/// Loads saved slot WAV files from `slots_dir`.
pub fn load_slots(session: &mut Session) -> Vec<ActionEvent> {
    let mut events = Vec::new();
    let Some(dir) = session.slots_dir.clone() else {
        return events;
    };
    for slot in 1..=PadBank::SLOT_COUNT {
        let path = dir.join(format!("slot{slot}.wav"));
        if !path.exists() {
            continue;
        }
        match load_wav(&path, session.handle.rate()) {
            Ok(samples) => {
                let _ = session
                    .pads
                    .store(slot, clip_from_vec(samples), format!("Slot {slot}"));
            }
            Err(error) => events.push(ActionEvent::SkippedSlot {
                slot,
                error: error.to_string(),
            }),
        }
    }
    events
}

fn save_grab_copy(session: &Session, clip: &Clip) -> Result<Option<PathBuf>, ActionError> {
    let Some(dir) = session.clips_dir.as_ref() else {
        return Ok(None);
    };
    let path = timestamped_path(dir)?;
    Ok(Some(save_wav(clip, session.handle.rate(), path)?))
}
