//! Hotkey edge and save-arm helpers.

use std::collections::BTreeSet;

/// Converts raw key events into one trigger per press.
#[derive(Default)]
pub struct KeyEdge {
    held: BTreeSet<String>,
}

impl KeyEdge {
    /// Creates empty key-edge state.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Records an event; returns true only for the first down event of a press.
    pub fn update(&mut self, key: impl Into<String>, down: bool) -> bool {
        let key = key.into();
        if !down {
            self.held.remove(&key);
            return false;
        }
        self.held.insert(key)
    }
}

/// Save arming state: one save key, then one pad key within a timeout.
#[derive(Debug, Clone)]
pub struct SaveArm {
    timeout: f64,
    armed_at: Option<f64>,
}

impl SaveArm {
    /// Creates a save arm with `timeout` seconds.
    #[must_use]
    pub fn new(timeout: f64) -> Self {
        Self {
            timeout,
            armed_at: None,
        }
    }

    /// Arms, or cancels if already armed. Returns whether it is armed now.
    pub fn toggle(&mut self, now: f64) -> bool {
        self.armed_at = if self.armed(now) { None } else { Some(now) };
        self.armed_at.is_some()
    }

    /// Consumes one armed save if the timeout has not expired.
    pub fn consume(&mut self, now: f64) -> bool {
        let armed = self.armed(now);
        self.armed_at = None;
        armed
    }

    fn armed(&self, now: f64) -> bool {
        self.armed_at
            .map(|armed_at| now - armed_at <= self.timeout)
            .unwrap_or(false)
    }
}
