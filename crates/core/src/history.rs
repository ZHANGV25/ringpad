//! Rolling source-audio history.

use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};

const READ_RETRIES: usize = 4;
/// Extra ring slots beyond the readable capacity, as a share of it, with a floor below.
const HEADROOM_DIVISOR: usize = 8;
/// Minimum headroom: larger than any audio block the writer may have started but not
/// yet published (WASAPI blocks are about 480 samples).
const MIN_HEADROOM: usize = 4096;

/// Rolling history of the newest source samples at the engine rate.
///
/// One audio thread writes samples and any control thread reads snapshots. The
/// writer stores sample bits first, then publishes the total-written counter
/// with release ordering once per block. The ring keeps headroom beyond the
/// readable capacity so an unpublished block can never land in a window being read.
pub struct History {
    ring: Box<[AtomicU32]>,
    capacity: usize,
    headroom: usize,
    written: AtomicUsize,
}

impl History {
    /// Creates a rolling history with `capacity` retained samples.
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        let headroom = (capacity / HEADROOM_DIVISOR).max(MIN_HEADROOM);
        let ring = (0..capacity + headroom)
            .map(|_| AtomicU32::new(0))
            .collect();
        Self {
            ring,
            capacity,
            headroom,
            written: AtomicUsize::new(0),
        }
    }

    /// Creates a rolling history for `seconds` at `rate`.
    #[must_use]
    pub fn for_seconds(seconds: f32, rate: u32) -> Self {
        Self::new(((seconds.max(0.0)) * rate as f32).round() as usize)
    }

    /// Returns the retained sample capacity.
    #[must_use]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Pushes source samples from the single audio writer.
    ///
    /// This method does not lock, allocate, or free memory.
    pub fn push_from_audio(&self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        let start = self.write_start();
        for (offset, sample) in samples.iter().enumerate() {
            self.write_sample_at(start + offset, *sample);
        }
        self.publish_write(start.saturating_add(samples.len()));
    }

    /// Pushes samples through the same single-writer path, useful for tests.
    pub fn push(&self, samples: &[f32]) {
        self.push_from_audio(samples);
    }

    /// Returns up to the newest `n` samples.
    ///
    /// The reader retries when enough concurrent writes occurred to make the
    /// copied window possibly torn. If writing keeps racing the reader, it
    /// returns an empty safe snapshot after a few attempts.
    #[must_use]
    pub fn last(&self, n: usize) -> Vec<f32> {
        let requested = n.min(self.capacity);
        if requested == 0 {
            return Vec::new();
        }
        for _ in 0..READ_RETRIES {
            let before = self.written.load(Ordering::Acquire);
            let count = requested.min(before);
            let out = self.copy_window(before, count);
            let after = self.written.load(Ordering::Acquire);
            // The writer may also be part-way through a block it hasn't published; the
            // headroom covers that, so only published progress counts against the slack.
            let published = after.saturating_sub(before);
            if published + self.headroom <= self.ring.len().saturating_sub(count) {
                return out;
            }
        }
        Vec::new()
    }

    fn copy_window(&self, total: usize, count: usize) -> Vec<f32> {
        let mut out = Vec::with_capacity(count);
        let start = total.saturating_sub(count);
        for offset in 0..count {
            let slot = (start + offset) % self.ring.len();
            out.push(f32::from_bits(self.ring[slot].load(Ordering::Relaxed)));
        }
        out
    }

    pub(crate) fn write_start(&self) -> usize {
        self.written.load(Ordering::Relaxed)
    }

    pub(crate) fn write_sample_at(&self, index: usize, sample: f32) {
        let slot = index % self.ring.len();
        self.ring[slot].store(sample.to_bits(), Ordering::Relaxed);
    }

    pub(crate) fn publish_write(&self, total: usize) {
        self.written.store(total, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_window_wraps_across_ring_end() {
        let history = History::new(4);
        let ring_len = history.ring.len();
        for offset in 0..4 {
            history.write_sample_at(ring_len - 2 + offset, offset as f32 + 1.0);
        }
        history.publish_write(ring_len + 2);
        assert_eq!(history.last(4), vec![1.0, 2.0, 3.0, 4.0]);
    }
}
