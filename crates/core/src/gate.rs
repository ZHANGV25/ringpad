//! Echo gate used to keep our own playback out of history.

/// Gate that closes after local playback is marked, then reopens after a tail.
#[derive(Debug, Clone)]
pub struct EchoGate {
    tail_seconds: f64,
    last_clip_at: f64,
}

impl EchoGate {
    /// Creates an echo gate with a tail in seconds.
    #[must_use]
    pub fn new(tail_seconds: f64) -> Self {
        Self {
            tail_seconds,
            last_clip_at: f64::NEG_INFINITY,
        }
    }

    /// Marks local playback as audible at `now_seconds`.
    pub fn mark(&mut self, now_seconds: f64) {
        self.last_clip_at = now_seconds;
    }

    /// Returns true when source history may record at `now_seconds`.
    #[must_use]
    pub fn is_open(&self, now_seconds: f64) -> bool {
        now_seconds - self.last_clip_at > self.tail_seconds
    }
}
