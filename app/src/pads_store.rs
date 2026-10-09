//! Pad metadata persistence.

use std::fs;
use std::io::Write;
use std::path::Path;

use ringpad_core::pads::PadBank;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Number of pad slots in Ringpad.
pub const PAD_COUNT: usize = 8;

/// Default pad hotkeys, indexed by zero-based UI slot.
pub const DEFAULT_PAD_HOTKEYS: [Option<&str>; PAD_COUNT] = [
    Some("f1"),
    Some("f2"),
    Some("f3"),
    Some("f4"),
    None,
    None,
    None,
    None,
];

/// Persisted metadata for one one-based pad slot.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PadMetadata {
    /// One-based slot number.
    pub slot: usize,
    /// User-visible pad name.
    pub name: String,
    /// Playback volume.
    pub volume: f32,
    /// Optional hotkey name.
    pub hotkey: Option<String>,
}

/// Metadata for all pads.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PadsStore {
    /// Slot metadata.
    pub pads: Vec<PadMetadata>,
}

/// Pad metadata persistence error.
#[derive(Debug, Error)]
pub enum PadsStoreError {
    /// Filesystem error.
    #[error("{0}")]
    Io(#[from] std::io::Error),
    /// JSON error.
    #[error("{0}")]
    Json(#[from] serde_json::Error),
}

impl Default for PadsStore {
    fn default() -> Self {
        Self {
            pads: (1..=PAD_COUNT).map(default_metadata).collect(),
        }
    }
}

impl PadsStore {
    /// Loads pad metadata, returning defaults when the file is missing or invalid.
    pub fn load(path: &Path) -> Result<Self, PadsStoreError> {
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(error) => return Err(error.into()),
        };
        let mut store = serde_json::from_slice::<Self>(&bytes).unwrap_or_default();
        store.normalize();
        Ok(store)
    }

    /// Saves pad metadata atomically.
    pub fn save(&self, path: &Path) -> Result<(), PadsStoreError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let tmp = path.with_extension(format!("json.tmp.{}", std::process::id()));
        let mut file = fs::File::create(&tmp)?;
        file.write_all(&serde_json::to_vec_pretty(self)?)?;
        file.sync_all()?;
        replace_file(&tmp, path)?;
        Ok(())
    }

    /// Returns metadata for a one-based slot.
    #[cfg(test)]
    #[must_use]
    pub fn get(&self, slot: usize) -> Option<&PadMetadata> {
        self.pads.iter().find(|pad| pad.slot == slot)
    }

    /// Returns mutable metadata for a one-based slot.
    pub fn get_mut(&mut self, slot: usize) -> Option<&mut PadMetadata> {
        self.pads.iter_mut().find(|pad| pad.slot == slot)
    }

    /// Applies persisted metadata to filled core pad slots.
    pub fn apply_to_bank(&self, bank: &mut PadBank) {
        for metadata in &self.pads {
            let _ = bank.rename(metadata.slot, metadata.name.clone());
            let _ = bank.set_volume(metadata.slot, metadata.volume);
            let _ = bank.set_hotkey(metadata.slot, metadata.hotkey.clone());
        }
    }

    /// Updates metadata for an imported or saved filled slot.
    pub fn set_filled_defaults(&mut self, slot: usize, name: impl Into<String>) {
        if let Some(metadata) = self.get_mut(slot) {
            metadata.name = clean_name(name.into(), slot);
            metadata.volume = metadata.volume.clamp(0.0, 1.0);
        }
    }

    /// Clears metadata back to defaults for a one-based slot.
    pub fn reset_slot(&mut self, slot: usize) {
        if let Some(metadata) = self.get_mut(slot) {
            *metadata = default_metadata(slot);
        }
    }

    fn normalize(&mut self) {
        let mut pads = Vec::with_capacity(PAD_COUNT);
        for slot in 1..=PAD_COUNT {
            let mut metadata = match self.pads.iter().find(|pad| pad.slot == slot).cloned() {
                Some(metadata) => metadata,
                None => default_metadata(slot),
            };
            metadata.name = clean_name(metadata.name, slot);
            metadata.volume = metadata.volume.clamp(0.0, 1.0);
            pads.push(metadata);
        }
        self.pads = pads;
    }
}

fn default_metadata(slot: usize) -> PadMetadata {
    PadMetadata {
        slot,
        name: format!("Pad {slot}"),
        volume: 1.0,
        hotkey: DEFAULT_PAD_HOTKEYS[slot - 1].map(str::to_string),
    }
}

fn clean_name(name: String, slot: usize) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        format!("Pad {slot}")
    } else {
        trimmed.to_string()
    }
}

fn replace_file(tmp: &Path, path: &Path) -> Result<(), std::io::Error> {
    match fs::rename(tmp, path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            fs::remove_file(path)?;
            fs::rename(tmp, path)
        }
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ringpad_core::clip::clip_from_vec;

    #[test]
    fn defaults_match_ui_hotkeys() {
        let store = PadsStore::default();
        assert_eq!(
            store.get(1).and_then(|pad| pad.hotkey.as_deref()),
            Some("f1")
        );
        assert_eq!(
            store.get(4).and_then(|pad| pad.hotkey.as_deref()),
            Some("f4")
        );
        assert_eq!(store.get(5).and_then(|pad| pad.hotkey.as_deref()), None);
    }

    #[test]
    fn round_trips() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("pads.json");
        let mut store = PadsStore::default();
        store.get_mut(3).expect("slot").name = "Nice".to_string();
        store.save(&path).expect("save");
        assert_eq!(PadsStore::load(&path).expect("load"), store);
    }

    #[test]
    fn applies_metadata_to_filled_pads_only() {
        let mut bank = PadBank::new();
        bank.store(2, clip_from_vec(vec![0.1, 0.2]), "Old")
            .expect("store");
        let mut store = PadsStore::default();
        let metadata = store.get_mut(2).expect("slot");
        metadata.name = "New".to_string();
        metadata.volume = 0.4;
        metadata.hotkey = Some("f8".to_string());
        store.apply_to_bank(&mut bank);
        let pad = bank.get(2).expect("bounds").expect("filled");
        assert_eq!(pad.name, "New");
        assert_eq!(pad.volume, 0.4);
        assert_eq!(pad.hotkey.as_deref(), Some("f8"));
    }
}
