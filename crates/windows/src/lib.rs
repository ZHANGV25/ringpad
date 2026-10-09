//! Ringpad's Windows backend.
//!
//! Implements the engine's platform traits with WASAPI (device loopback, per-app process
//! loopback, render to the virtual mic and headphones) and Raw Input for hotkeys.

pub mod devices;
pub mod hotkeys;
pub mod mixdown;
pub mod service;
pub mod sessions;
pub mod watcher;

use thiserror::Error;

pub use devices::{DeviceDirection, DeviceInfo, DevicePickError, VirtualCable};
pub use hotkeys::{HotkeyEvent, HotkeyListener, RawKeyboardEvent, RawMouseEvent};
pub use service::{AudioService, ServiceConfig, ServiceStatus, SourceSpec};
pub use sessions::{AudioApp, SessionError};
pub use watcher::DeviceWatcher;

/// Errors returned by the Windows backend.
#[derive(Debug, Error)]
pub enum BackendError {
    /// A WASAPI call failed.
    #[error("WASAPI error: {0}")]
    Wasapi(String),
    /// A configured device was not found.
    #[error("device not found: {0}")]
    DeviceNotFound(String),
    /// A configured app was not running.
    #[error("app not running: {0}")]
    AppNotRunning(String),
    /// Device picking failed.
    #[error("{0}")]
    Pick(#[from] DevicePickError),
    /// Audio or input thread startup failed.
    #[error("thread start failed: {0}")]
    ThreadStart(String),
}

impl BackendError {
    /// Converts a WASAPI error without exposing the dependency on non-Windows targets.
    #[cfg(windows)]
    pub fn from_wasapi(error: wasapi::WasapiError) -> Self {
        Self::Wasapi(error.to_string())
    }
}

impl From<SessionError> for BackendError {
    fn from(error: SessionError) -> Self {
        match error {
            SessionError::AppNotRunning(exe) => Self::AppNotRunning(exe),
            SessionError::Windows(message) => Self::ThreadStart(message),
        }
    }
}

/// Name of the backend, shown in the About page.
pub fn backend_name() -> &'static str {
    "WASAPI"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_backend() {
        assert_eq!(backend_name(), "WASAPI");
        assert!(!ringpad_core::version().is_empty());
    }
}
