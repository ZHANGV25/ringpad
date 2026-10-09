//! Jitter FIFO between device clocks.

/// Jitter buffer that primes before playback and reprimes after underrun.
///
/// `SampleFifo` is a single-threaded audio-thread ring. It is preallocated and
/// drops the oldest samples when queued audio exceeds the maximum latency.
pub struct SampleFifo {
    ring: Vec<f32>,
    read: usize,
    write: usize,
    len: usize,
    prime_samples: usize,
    starved: bool,
}

impl SampleFifo {
    /// Creates a FIFO with a bounded latency and prime threshold.
    #[must_use]
    pub fn new(max_samples: usize, prime_samples: usize) -> Self {
        let capacity = max_samples.max(1);
        Self {
            ring: vec![0.0; capacity],
            read: 0,
            write: 0,
            len: 0,
            prime_samples,
            starved: true,
        }
    }

    /// Creates a FIFO from seconds at a sample rate.
    #[must_use]
    pub fn from_seconds(rate: u32, max_seconds: f32, prime_seconds: f32) -> Self {
        Self::new(
            (max_seconds * rate as f32).round() as usize,
            (prime_seconds * rate as f32).round() as usize,
        )
    }

    /// Returns queued sample count.
    #[must_use]
    pub fn len(&self) -> usize {
        self.len
    }

    /// Returns true when no samples are queued.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Pushes samples from an audio callback.
    ///
    /// This method does not lock, allocate, or free memory. Oldest excess
    /// samples are discarded so latency stays bounded.
    pub fn push(&mut self, samples: &[f32]) {
        for &sample in samples {
            self.push_one(sample);
        }
    }

    /// Pushes scaled samples from an audio callback.
    ///
    /// This method does not lock, allocate, or free memory.
    pub fn push_scaled(&mut self, samples: &[f32], scale: f32) {
        for &sample in samples {
            self.push_one(sample * scale);
        }
    }

    /// Pulls samples into `out`, padding with silence when empty.
    ///
    /// This method does not lock, allocate, or free memory. After underrun it
    /// outputs silence until at least the prime amount has queued again.
    pub fn pull_into(&mut self, out: &mut [f32]) {
        if self.starved && self.len < self.prime_samples {
            out.fill(0.0);
            return;
        }
        let got = self.pop_into(out);
        if got < out.len() {
            out[got..].fill(0.0);
            self.starved = true;
        } else {
            self.starved = false;
        }
    }

    /// Pulls `n` samples into a newly allocated vector for control-thread tests.
    #[must_use]
    pub fn pull(&mut self, n: usize) -> Vec<f32> {
        let mut out = vec![0.0; n];
        self.pull_into(&mut out);
        out
    }

    fn push_one(&mut self, sample: f32) {
        self.ring[self.write] = sample;
        self.write = (self.write + 1) % self.ring.len();
        if self.len == self.ring.len() {
            self.read = self.write;
        } else {
            self.len += 1;
        }
    }

    fn pop_into(&mut self, out: &mut [f32]) -> usize {
        let mut written = 0;
        for sample in out {
            if self.len == 0 {
                break;
            }
            *sample = self.ring[self.read];
            self.read = (self.read + 1) % self.ring.len();
            self.len -= 1;
            written += 1;
        }
        written
    }
}
