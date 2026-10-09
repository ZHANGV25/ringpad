//! Polling watcher for audio-device changes.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::devices::{list_devices, DeviceDirection, DeviceInfo};

/// Comparable device snapshot used by the polling watcher.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceSnapshot {
    /// Sorted active device ids and names.
    pub devices: Vec<(String, String)>,
    /// Default output device id.
    pub default_output_id: Option<String>,
    /// Default input device id.
    pub default_input_id: Option<String>,
}

impl DeviceSnapshot {
    /// Builds a comparable snapshot from device metadata.
    #[must_use]
    pub fn from_devices(devices: &[DeviceInfo]) -> Self {
        let mut entries: Vec<_> = devices
            .iter()
            .map(|device| (device.id.clone(), device.name.clone()))
            .collect();
        entries.sort();
        let default_output_id = devices
            .iter()
            .find(|device| device.direction == DeviceDirection::Output && device.is_default)
            .map(|device| device.id.clone());
        let default_input_id = devices
            .iter()
            .find(|device| device.direction == DeviceDirection::Input && device.is_default)
            .map(|device| device.id.clone());
        Self {
            devices: entries,
            default_output_id,
            default_input_id,
        }
    }
}

/// Returns true when two device snapshots differ.
#[must_use]
pub fn snapshot_changed(previous: Option<&DeviceSnapshot>, next: &DeviceSnapshot) -> bool {
    previous != Some(next)
}

/// Polling audio-device watcher.
pub struct DeviceWatcher {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl DeviceWatcher {
    /// Starts a watcher thread that calls `callback` when devices change.
    pub fn start(
        interval: Duration,
        callback: impl Fn(Vec<DeviceInfo>) + Send + 'static,
    ) -> Result<Self, crate::BackendError> {
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let thread = thread::Builder::new()
            .name("ringpad-devices".to_string())
            .spawn(move || watcher_loop(interval, thread_stop, callback))
            .map_err(|error| crate::BackendError::ThreadStart(error.to_string()))?;
        Ok(Self {
            stop,
            thread: Some(thread),
        })
    }

    /// Stops the watcher and joins its thread.
    pub fn stop(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for DeviceWatcher {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

fn watcher_loop(
    interval: Duration,
    stop: Arc<AtomicBool>,
    callback: impl Fn(Vec<DeviceInfo>) + Send + 'static,
) {
    #[cfg(windows)]
    {
        let _ = wasapi::initialize_mta();
    }
    let mut previous = None;
    while !stop.load(Ordering::Acquire) {
        if let Ok(devices) = list_devices() {
            let snapshot = DeviceSnapshot::from_devices(&devices);
            if snapshot_changed(previous.as_ref(), &snapshot) {
                previous = Some(snapshot);
                callback(devices);
            }
        }
        sleep_interruptibly(interval, &stop);
    }
}

fn sleep_interruptibly(interval: Duration, stop: &AtomicBool) {
    let mut slept = Duration::ZERO;
    let step = Duration::from_millis(100);
    while slept < interval && !stop.load(Ordering::Acquire) {
        let remaining = interval.saturating_sub(slept);
        let next = remaining.min(step);
        thread::sleep(next);
        slept += next;
    }
}
