//! Eight-slot pad bank.

use thiserror::Error;

use crate::clip::Clip;

/// Errors returned by pad operations.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum PadError {
    /// The slot is outside the valid range.
    #[error("slot {slot} is out of range 1..={max}")]
    OutOfRange {
        /// Requested slot.
        slot: usize,
        /// Maximum valid slot.
        max: usize,
    },
}

/// One filled pad slot.
#[derive(Clone)]
pub struct PadSlot {
    /// One-based slot number.
    pub number: usize,
    /// Clip name shown in the UI.
    pub name: String,
    /// Slot playback volume from 0 to 1.
    pub volume: f32,
    /// Optional hotkey label.
    pub hotkey: Option<String>,
    /// Immutable clip buffer.
    pub clip: Clip,
}

/// Pad bank containing eight one-based slots.
pub struct PadBank {
    slots: Vec<Option<PadSlot>>,
}

impl Default for PadBank {
    fn default() -> Self {
        Self::new()
    }
}

impl PadBank {
    /// Number of slots in a bank.
    pub const SLOT_COUNT: usize = 8;

    /// Creates an empty eight-slot pad bank.
    #[must_use]
    pub fn new() -> Self {
        Self {
            slots: vec![None; Self::SLOT_COUNT],
        }
    }

    /// Stores a clip in `slot`.
    pub fn store(
        &mut self,
        slot: usize,
        clip: Clip,
        name: impl Into<String>,
    ) -> Result<(), PadError> {
        self.check(slot)?;
        self.slots[slot - 1] = Some(PadSlot {
            number: slot,
            name: name.into(),
            volume: 1.0,
            hotkey: None,
            clip,
        });
        Ok(())
    }

    /// Returns a filled slot.
    pub fn get(&self, slot: usize) -> Result<Option<&PadSlot>, PadError> {
        self.check(slot)?;
        Ok(self.slots[slot - 1].as_ref())
    }

    /// Clears a slot.
    pub fn clear(&mut self, slot: usize) -> Result<(), PadError> {
        self.check(slot)?;
        self.slots[slot - 1] = None;
        Ok(())
    }

    /// Renames a filled slot; empty slots are ignored after bounds checking.
    pub fn rename(&mut self, slot: usize, name: impl Into<String>) -> Result<(), PadError> {
        self.check(slot)?;
        if let Some(pad) = self.slots[slot - 1].as_mut() {
            pad.name = name.into();
        }
        Ok(())
    }

    /// Sets a filled slot volume, clamped to 0..=1.
    pub fn set_volume(&mut self, slot: usize, volume: f32) -> Result<(), PadError> {
        self.check(slot)?;
        if let Some(pad) = self.slots[slot - 1].as_mut() {
            pad.volume = volume.clamp(0.0, 1.0);
        }
        Ok(())
    }

    /// Sets a filled slot hotkey; empty slots are ignored after bounds checking.
    pub fn set_hotkey(&mut self, slot: usize, hotkey: Option<String>) -> Result<(), PadError> {
        self.check(slot)?;
        if let Some(pad) = self.slots[slot - 1].as_mut() {
            pad.hotkey = hotkey;
        }
        Ok(())
    }

    /// Lists the filled slots.
    #[must_use]
    pub fn filled(&self) -> Vec<PadSlot> {
        self.slots.iter().filter_map(Clone::clone).collect()
    }

    fn check(&self, slot: usize) -> Result<(), PadError> {
        if (1..=self.slots.len()).contains(&slot) {
            Ok(())
        } else {
            Err(PadError::OutOfRange {
                slot,
                max: self.slots.len(),
            })
        }
    }
}
