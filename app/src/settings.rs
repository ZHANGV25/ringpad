//! Settings persistence and validation.

use std::fs;
use std::io::Write;
use std::path::Path;

use ringpad_core::keys::is_valid_key_name;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// User theme preference.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemePreference {
    /// Follow the operating system.
    System,
    /// Light theme.
    Light,
    /// Dark theme.
    Dark,
}

/// Audio source selected by the user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SourceSetting {
    /// Capture the default playback device.
    Default,
    /// Capture one playback device by id.
    Device {
        /// Device id.
        id: String,
    },
    /// Capture one app by executable name.
    App {
        /// Executable file name.
        exe: String,
        /// Display name.
        name: String,
    },
}

/// Main hotkey settings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Hotkeys {
    /// Grab recent audio.
    pub grab: Option<String>,
    /// Send the current clip.
    pub send: Option<String>,
    /// Alternate send key.
    pub send_alt: Option<String>,
    /// Stop playback.
    pub stop: Option<String>,
    /// Arm save-to-pad.
    pub save: Option<String>,
}

/// Persisted app settings matching the UI contract. Missing fields take their defaults,
/// so a settings file from an older version still loads.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Theme preference.
    pub theme: ThemePreference,
    /// Audio source to capture.
    pub source: SourceSetting,
    /// Plays a recorded output device in the headphones too.
    pub relay_source: bool,
    /// Virtual microphone render endpoint id.
    pub virtual_output: Option<String>,
    /// Real microphone endpoint id.
    pub mic: Option<String>,
    /// Whether the real microphone is mixed in.
    pub mic_enabled: bool,
    /// Headphone monitor endpoint id.
    pub headphones: Option<String>,
    /// Volume sent to the virtual mic.
    pub send_volume: f32,
    /// Monitor volume for headphones.
    pub monitor_volume: f32,
    /// Whether mic ducking is enabled.
    pub ducking: bool,
    /// Rolling history length in seconds.
    pub history_seconds: f32,
    /// Clip grab length in seconds.
    pub grab_seconds: f32,
    /// Main hotkeys.
    pub hotkeys: Hotkeys,
    /// Start without creating the main window.
    pub start_minimized: bool,
    /// Register launch-at-login.
    pub start_with_windows: bool,
    /// Days of clip files to keep. Zero keeps all clips.
    pub clip_retention_days: u32,
    /// Whether onboarding has completed.
    pub first_run_done: bool,
}

/// Settings persistence error.
#[derive(Debug, Error)]
pub enum SettingsError {
    /// Filesystem error.
    #[error("{0}")]
    Io(#[from] std::io::Error),
    /// JSON error.
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    /// Hotkey name is not recognized.
    #[error("Invalid key: {0}")]
    InvalidKey(String),
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self {
            grab: Some("f8".to_string()),
            send: Some("f7".to_string()),
            send_alt: Some("mouse5".to_string()),
            stop: Some("f9".to_string()),
            save: Some("f6".to_string()),
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: ThemePreference::System,
            source: SourceSetting::Default,
            relay_source: false,
            virtual_output: None,
            mic: None,
            mic_enabled: true,
            headphones: None,
            send_volume: 0.5,
            monitor_volume: 0.6,
            ducking: true,
            history_seconds: 30.0,
            grab_seconds: 5.0,
            hotkeys: Hotkeys::default(),
            start_minimized: false,
            start_with_windows: false,
            clip_retention_days: 7,
            first_run_done: false,
        }
    }
}

/// Loads settings, returning defaults when the file is missing or corrupt.
pub fn load(path: &Path) -> Result<Settings, SettingsError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Settings::default())
        }
        Err(error) => return Err(error.into()),
    };
    let parsed = serde_json::from_slice::<Settings>(&bytes)
        .map_err(SettingsError::from)
        .and_then(validate_and_clamp);
    match parsed {
        Ok(settings) => Ok(settings),
        Err(error) => {
            log::warn!("settings unreadable, starting from defaults: {error}");
            let bad = path.with_file_name("settings.json.bad");
            let _ = fs::remove_file(&bad);
            fs::rename(path, bad)?;
            Ok(Settings::default())
        }
    }
}

/// Saves settings atomically by writing a sibling temp file and renaming it.
pub fn save(path: &Path, settings: &Settings) -> Result<(), SettingsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!("json.tmp.{}", std::process::id()));
    let mut file = fs::File::create(&tmp)?;
    let bytes = serde_json::to_vec_pretty(settings)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    replace_file(&tmp, path)?;
    Ok(())
}

/// Applies a top-level JSON merge patch, then validates and clamps values.
pub fn apply_patch(current: &Settings, patch: Value) -> Result<Settings, SettingsError> {
    let mut value = serde_json::to_value(current)?;
    let Some(object) = value.as_object_mut() else {
        return Ok(current.clone());
    };
    if let Value::Object(patch) = patch {
        for (key, patch_value) in patch {
            object.insert(key, patch_value);
        }
    }
    validate_and_clamp(serde_json::from_value(value)?)
}

fn validate_and_clamp(mut settings: Settings) -> Result<Settings, SettingsError> {
    settings.send_volume = settings.send_volume.clamp(0.0, 1.0);
    settings.monitor_volume = settings.monitor_volume.clamp(0.0, 1.0);
    settings.history_seconds = settings.history_seconds.clamp(10.0, 120.0);
    settings.grab_seconds = settings.grab_seconds.clamp(1.0, 30.0);
    settings.clip_retention_days = settings.clip_retention_days.min(365);
    validate_key(settings.hotkeys.grab.as_deref())?;
    validate_key(settings.hotkeys.send.as_deref())?;
    validate_key(settings.hotkeys.send_alt.as_deref())?;
    validate_key(settings.hotkeys.stop.as_deref())?;
    validate_key(settings.hotkeys.save.as_deref())?;
    Ok(settings)
}

fn validate_key(key: Option<&str>) -> Result<(), SettingsError> {
    if let Some(key) = key {
        if !is_valid_key_name(key) {
            return Err(SettingsError::InvalidKey(key.to_string()));
        }
    }
    Ok(())
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

    #[test]
    fn defaults_match_contract() {
        let settings = Settings::default();
        assert_eq!(settings.theme, ThemePreference::System);
        assert_eq!(settings.hotkeys.send_alt.as_deref(), Some("mouse5"));
        assert!(settings.mic_enabled);
        assert!(!settings.relay_source);
        assert_eq!(settings.clip_retention_days, 7);
    }

    #[test]
    fn round_trips_and_uses_camel_case() {
        let json = serde_json::to_string(&Settings::default()).expect("serialize settings");
        assert!(json.contains("sendVolume"));
        assert!(json.contains("sendAlt"));
        let back: Settings = serde_json::from_str(&json).expect("deserialize settings");
        assert_eq!(back, Settings::default());
    }

    #[test]
    fn patch_merges_top_level_fields() {
        let patched = apply_patch(
            &Settings::default(),
            serde_json::json!({"sendVolume": 0.8, "firstRunDone": true}),
        )
        .expect("patch");
        assert_eq!(patched.send_volume, 0.8);
        assert!(patched.first_run_done);
        assert_eq!(patched.hotkeys.grab.as_deref(), Some("f8"));
    }

    #[test]
    fn clamps_numeric_values() {
        let patched = apply_patch(
            &Settings::default(),
            serde_json::json!({
                "sendVolume": 4.0,
                "monitorVolume": -1.0,
                "historySeconds": 500.0,
                "grabSeconds": 0.1,
                "clipRetentionDays": 999
            }),
        )
        .expect("patch");
        assert_eq!(patched.send_volume, 1.0);
        assert_eq!(patched.monitor_volume, 0.0);
        assert_eq!(patched.history_seconds, 120.0);
        assert_eq!(patched.grab_seconds, 1.0);
        assert_eq!(patched.clip_retention_days, 365);
    }

    #[test]
    fn invalid_key_is_rejected() {
        let err = apply_patch(
            &Settings::default(),
            serde_json::json!({"hotkeys": {"grab": "nope", "send": "f7", "sendAlt": null, "stop": "f9", "save": "f6"}}),
        )
        .expect_err("invalid key");
        assert!(err.to_string().contains("Invalid key"));
    }

    #[test]
    fn corrupt_file_is_renamed() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("settings.json");
        fs::write(&path, b"{ nope").expect("write corrupt settings");
        let loaded = load(&path).expect("load defaults");
        assert_eq!(loaded, Settings::default());
        assert!(dir.path().join("settings.json.bad").exists());
    }

    #[test]
    fn a_file_from_an_older_version_keeps_its_values() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("settings.json");
        fs::write(
            &path,
            br#"{"sendVolume": 0.3, "firstRunDone": true, "hotkeys": {"grab": "g"}}"#,
        )
        .expect("write old settings");
        let loaded = load(&path).expect("load");
        assert_eq!(loaded.send_volume, 0.3);
        assert!(loaded.first_run_done);
        assert_eq!(loaded.hotkeys.grab.as_deref(), Some("g"));
        assert_eq!(loaded.hotkeys.send.as_deref(), Some("f7"));
        assert!(loaded.mic_enabled);
        assert!(!dir.path().join("settings.json.bad").exists());
    }

    #[test]
    fn a_file_with_a_bad_key_falls_back_to_defaults() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("settings.json");
        fs::write(&path, br#"{"hotkeys": {"grab": "nope"}}"#).expect("write settings");
        assert_eq!(load(&path).expect("load"), Settings::default());
        assert!(dir.path().join("settings.json.bad").exists());
    }
}
