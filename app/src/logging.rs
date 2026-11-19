//! A small log file for bug reports: `%APPDATA%\Ringpad\logs\ringpad.log`.
//!
//! It holds warnings and errors from Ringpad and its libraries, never audio. The file is capped
//! at [`MAX_LOG_BYTES`] and the two newest old files are kept.

use std::path::PathBuf;

use log::LevelFilter;
use tauri::plugin::TauriPlugin;
use tauri::Runtime;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// Largest size of one log file before it rotates.
pub const MAX_LOG_BYTES: u128 = 1_000_000;
/// Old log files kept next to the current one.
const KEEP_OLD_FILES: usize = 2;
/// Log file name, without the extension.
const LOG_FILE_NAME: &str = "ringpad";

/// The folder the log file goes in: next to the settings, so one uninstall checkbox removes both.
pub fn log_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|path| PathBuf::from(path).join("Ringpad").join("logs"))
}

/// Builds the log plugin. Debug builds also print to the console.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    let file = match log_dir() {
        Some(path) => TargetKind::Folder {
            path,
            file_name: Some(LOG_FILE_NAME.to_string()),
        },
        None => TargetKind::LogDir {
            file_name: Some(LOG_FILE_NAME.to_string()),
        },
    };
    let mut targets = vec![Target::new(file)];
    if cfg!(debug_assertions) {
        targets.push(Target::new(TargetKind::Stdout));
    }
    tauri_plugin_log::Builder::new()
        .targets(targets)
        .level(LevelFilter::Warn)
        .level_for("ringpad", LevelFilter::Info)
        .level_for("ringpad_core", LevelFilter::Info)
        .level_for("ringpad_windows", LevelFilter::Info)
        .max_file_size(MAX_LOG_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(KEEP_OLD_FILES))
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}

/// Writes panics to the log before the default handler runs, so a crash leaves a trace.
pub fn log_panics() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        default_hook(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logs_sit_next_to_the_settings() {
        let Some(dir) = log_dir() else {
            return;
        };
        assert!(dir.ends_with("Ringpad\\logs") || dir.ends_with("Ringpad/logs"));
    }
}
