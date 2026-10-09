//! App data path resolution.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};
use thiserror::Error;

/// Ringpad data paths.
#[derive(Debug, Clone)]
pub struct AppPaths {
    /// Captured clips directory.
    pub clips_dir: PathBuf,
    /// Pad slot WAV directory.
    pub slots_dir: PathBuf,
    /// Settings JSON path.
    pub settings_json: PathBuf,
    /// Pad metadata JSON path.
    pub pads_json: PathBuf,
}

/// Path resolution error.
#[derive(Debug, Error)]
pub enum PathError {
    /// Filesystem error.
    #[error("{0}")]
    Io(#[from] std::io::Error),
    /// Tauri path resolution error.
    #[error("{0}")]
    Tauri(#[from] tauri::Error),
}

impl AppPaths {
    /// Resolves and creates the Ringpad app data folders.
    pub fn resolve<R: Runtime>(app: &AppHandle<R>) -> Result<Self, PathError> {
        let data_dir = match std::env::var_os("APPDATA") {
            Some(path) => PathBuf::from(path).join("Ringpad"),
            None => app.path().app_data_dir()?,
        };
        let clips_dir = data_dir.join("clips");
        let slots_dir = data_dir.join("slots");
        fs::create_dir_all(&clips_dir)?;
        fs::create_dir_all(&slots_dir)?;
        Ok(Self {
            settings_json: data_dir.join("settings.json"),
            pads_json: data_dir.join("pads.json"),
            clips_dir,
            slots_dir,
        })
    }
}
