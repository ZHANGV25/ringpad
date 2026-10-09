//! Serializable DTOs for the UI IPC contract.

use std::path::Path;

use ringpad_core::clip::Clip;
use ringpad_core::engine::PeakMeters;
use ringpad_core::pads::{PadBank, PadSlot};
use ringpad_windows::{DeviceDirection, VirtualCable};
use serde::Serialize;

use crate::pads_store::{PadsStore, PAD_COUNT};
use crate::settings::Settings;

/// Device metadata for the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    /// Endpoint id.
    pub id: String,
    /// Friendly name.
    pub name: String,
    /// Direction: output or input.
    pub direction: &'static str,
    /// Whether this is the default endpoint.
    pub is_default: bool,
    /// Virtual cable family.
    pub virtual_cable: Option<&'static str>,
}

/// Audio app metadata for the UI.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioApp {
    /// Process id.
    pub pid: u32,
    /// Executable file name.
    pub exe: String,
    /// Display name.
    pub name: String,
    /// Whether the app session is active.
    pub active: bool,
    /// Current app peak.
    pub peak: f32,
}

/// Clip metadata for the UI.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipInfo {
    /// Stable clip id.
    pub id: String,
    /// Clip duration in seconds.
    pub seconds: f32,
    /// Waveform peaks.
    pub peaks: Vec<f32>,
    /// Saved path, when present.
    pub saved_path: Option<String>,
}

/// Pad metadata for the UI.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PadInfo {
    /// Zero-based UI slot.
    pub slot: usize,
    /// Pad name.
    pub name: String,
    /// Pad duration.
    pub seconds: f32,
    /// Pad playback volume.
    pub volume: f32,
    /// Pad hotkey.
    pub hotkey: Option<String>,
    /// Waveform peaks.
    pub peaks: Vec<f32>,
}

/// Peak meters for the UI.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meters {
    /// Source peak.
    pub source: f32,
    /// Mic peak.
    pub mic: f32,
    /// Outgoing peak.
    pub outgoing: f32,
}

/// Playback state for the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    /// Sending to virtual mic.
    pub sending: bool,
    /// Previewing to headphones.
    pub previewing: bool,
    /// Save-arm is active.
    pub save_armed: bool,
}

/// Engine status for the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum EngineStatus {
    /// Audio is starting.
    Starting,
    /// Audio is running.
    Running {
        /// User-visible source label.
        source_label: String,
    },
    /// Audio is stopped.
    Stopped {
        /// Reason shown to the user.
        reason: String,
    },
    /// User setup is required.
    NeedsSetup {
        /// Reason shown to the user.
        reason: String,
    },
}

/// Snapshot returned at UI startup.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// App version.
    pub version: &'static str,
    /// Backend name.
    pub backend: &'static str,
    /// Current audio status.
    pub status: EngineStatus,
    /// Current settings.
    pub settings: Settings,
    /// Audio devices.
    pub devices: Vec<DeviceInfo>,
    /// Current clip.
    pub clip: Option<ClipInfo>,
    /// Pads by zero-based slot.
    pub pads: Vec<Option<PadInfo>>,
    /// Playback state.
    pub playback: Playback,
    /// Virtual capture-side device hint.
    pub virtual_capture_hint: Option<String>,
}

impl From<ringpad_windows::DeviceInfo> for DeviceInfo {
    fn from(device: ringpad_windows::DeviceInfo) -> Self {
        Self {
            id: device.id,
            name: device.name,
            direction: match device.direction {
                DeviceDirection::Output => "output",
                DeviceDirection::Input => "input",
            },
            is_default: device.is_default,
            virtual_cable: device.virtual_cable.map(virtual_cable_name),
        }
    }
}

impl From<ringpad_windows::AudioApp> for AudioApp {
    fn from(app: ringpad_windows::AudioApp) -> Self {
        Self {
            pid: app.pid,
            exe: app.exe_name,
            name: app.display_name,
            active: app.active,
            peak: app.peak.clamp(0.0, 1.0),
        }
    }
}

impl From<PeakMeters> for Meters {
    fn from(meters: PeakMeters) -> Self {
        Self {
            source: meters.source.clamp(0.0, 1.0),
            mic: meters.mic.clamp(0.0, 1.0),
            outgoing: meters.outgoing.clamp(0.0, 1.0),
        }
    }
}

/// Builds clip info from a clip and optional saved path.
#[must_use]
pub fn clip_info(clip: &Clip, rate: u32, saved_path: Option<&Path>, id_hint: &str) -> ClipInfo {
    let id = match saved_path
        .and_then(|path| path.file_stem())
        .and_then(|stem| stem.to_str())
    {
        Some(id) => id.to_string(),
        None => id_hint.to_string(),
    };
    ClipInfo {
        id,
        seconds: clip.len() as f32 / rate as f32,
        peaks: peaks(clip, 120),
        saved_path: saved_path.map(path_string),
    }
}

/// Builds one pad DTO.
#[must_use]
pub fn pad_info(slot: &PadSlot, rate: u32) -> PadInfo {
    PadInfo {
        slot: slot.number - 1,
        name: slot.name.clone(),
        seconds: slot.clip.len() as f32 / rate as f32,
        volume: slot.volume,
        hotkey: slot.hotkey.clone(),
        peaks: peaks(&slot.clip, 48),
    }
}

/// Builds the complete zero-based pads array.
#[must_use]
pub fn pads_info(bank: &PadBank, _metadata: &PadsStore, rate: u32) -> Vec<Option<PadInfo>> {
    (1..=PAD_COUNT)
        .map(|slot| match bank.get(slot) {
            Ok(Some(pad)) => Some(pad_info(pad, rate)),
            _ => None,
        })
        .collect()
}

/// Computes bucket peak values in 0..=1.
#[must_use]
pub fn peaks(samples: &[f32], n: usize) -> Vec<f32> {
    if n == 0 {
        return Vec::new();
    }
    if samples.is_empty() {
        return vec![0.0; n];
    }
    (0..n)
        .map(|bucket| {
            let start = bucket * samples.len() / n;
            let end = ((bucket + 1) * samples.len() / n)
                .max(start + 1)
                .min(samples.len());
            samples[start..end]
                .iter()
                .map(|sample| sample.abs().clamp(0.0, 1.0))
                .fold(0.0, f32::max)
        })
        .collect()
}

fn virtual_cable_name(cable: VirtualCable) -> &'static str {
    match cable {
        VirtualCable::VbCable => "vbcable",
        VirtualCable::Voicemod => "voicemod",
        VirtualCable::VoiceMeeter => "voicemeeter",
        VirtualCable::Other => "other",
    }
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ringpad_core::clip::clip_from_vec;

    #[test]
    fn peaks_are_bucket_maxima() {
        assert_eq!(peaks(&[0.1, -0.7, 0.2, 0.9], 2), vec![0.7, 0.9]);
        assert_eq!(peaks(&[], 3), vec![0.0, 0.0, 0.0]);
    }

    #[test]
    fn clip_info_uses_file_stem_id() {
        let clip = clip_from_vec(vec![0.0; 48_000]);
        let info = clip_info(&clip, 48_000, Some(Path::new("clip-1.wav")), "fallback");
        assert_eq!(info.id, "clip-1");
        assert_eq!(info.seconds, 1.0);
        assert_eq!(info.peaks.len(), 120);
    }

    #[test]
    fn device_conversion_uses_contract_names() {
        let dto = DeviceInfo::from(ringpad_windows::DeviceInfo {
            id: "id".to_string(),
            name: "Cable Input".to_string(),
            direction: DeviceDirection::Output,
            is_default: true,
            virtual_cable: Some(VirtualCable::VbCable),
        });
        assert_eq!(dto.direction, "output");
        assert_eq!(dto.virtual_cable, Some("vbcable"));
    }
}
