//! Small platform-independent DSP helpers.

/// RMS below this value is treated as silence by [`trim_silence`].
pub const SILENCE_RMS: f32 = 0.01;
/// Silence analysis window length in seconds.
pub const TRIM_WINDOW_SECONDS: f32 = 0.02;
/// Amount of context kept around non-silent audio in seconds.
pub const TRIM_PAD_SECONDS: f32 = 0.05;
/// Peak used by [`normalize`].
pub const TARGET_PEAK: f32 = 0.9;
/// Maximum gain applied by [`normalize`].
pub const MAX_GAIN: f32 = 8.0;

/// A stateful linear resampler for streaming mono audio.
///
/// The resampler keeps sample-position state across calls, so adjacent device
/// blocks do not restart interpolation at their edges.
#[derive(Debug, Clone)]
pub struct StreamingResampler {
    src_rate: u32,
    dst_rate: u32,
    total_in: usize,
    emitted: usize,
    last_sample: Option<f32>,
}

impl StreamingResampler {
    /// Creates a resampler from `src_rate` to `dst_rate`.
    #[must_use]
    pub fn new(src_rate: u32, dst_rate: u32) -> Self {
        Self {
            src_rate,
            dst_rate,
            total_in: 0,
            emitted: 0,
            last_sample: None,
        }
    }

    /// Returns the source sample rate.
    #[must_use]
    pub fn src_rate(&self) -> u32 {
        self.src_rate
    }

    /// Returns the destination sample rate.
    #[must_use]
    pub fn dst_rate(&self) -> u32 {
        self.dst_rate
    }

    /// Resets the stream position.
    pub fn reset(&mut self) {
        self.total_in = 0;
        self.emitted = 0;
        self.last_sample = None;
    }

    /// Processes `input`, calling `emit` for each output sample.
    pub fn process_with(&mut self, input: &[f32], mut emit: impl FnMut(f32)) {
        if input.is_empty() {
            return;
        }
        if self.src_rate == self.dst_rate {
            for &sample in input {
                emit(sample);
            }
            self.total_in = self.total_in.saturating_add(input.len());
            self.emitted = self.emitted.saturating_add(input.len());
            self.last_sample = input.last().copied();
            return;
        }

        let old_total = self.total_in;
        self.total_in = self.total_in.saturating_add(input.len());
        let target = ((self.total_in as f64) * f64::from(self.dst_rate) / f64::from(self.src_rate))
            .round() as usize;
        while self.emitted < target {
            let t = (self.emitted as f64) * f64::from(self.src_rate) / f64::from(self.dst_rate);
            emit(self.sample_at(t, old_total, input));
            self.emitted += 1;
        }
        self.last_sample = input.last().copied();
    }

    /// Processes `input` and appends output samples to `out`.
    pub fn process_into(&mut self, input: &[f32], out: &mut Vec<f32>) {
        self.process_with(input, |sample| out.push(sample));
    }

    /// Returns source samples needed to produce exactly `output_samples`.
    #[must_use]
    pub fn input_needed_for_output(&self, output_samples: usize) -> usize {
        if output_samples == 0 {
            return 0;
        }
        if self.src_rate == self.dst_rate {
            return output_samples;
        }
        let last_output = self.emitted.saturating_add(output_samples - 1);
        let needed_total = ((last_output as f64) * f64::from(self.src_rate)
            / f64::from(self.dst_rate))
        .floor() as usize
            + 2;
        needed_total.saturating_sub(self.total_in)
    }

    /// Processes `input` into the fixed output slice without allocating.
    pub fn process_exact_into(&mut self, input: &[f32], out: &mut [f32]) {
        if out.is_empty() {
            return;
        }
        if self.src_rate == self.dst_rate {
            let copied = input.len().min(out.len());
            out[..copied].copy_from_slice(&input[..copied]);
            if copied < out.len() {
                out[copied..].fill(input.last().copied().unwrap_or(0.0));
            }
            self.total_in = self.total_in.saturating_add(input.len());
            self.emitted = self.emitted.saturating_add(out.len());
            self.last_sample = input.last().copied();
            return;
        }

        let old_total = self.total_in;
        for sample in out {
            let t = (self.emitted as f64) * f64::from(self.src_rate) / f64::from(self.dst_rate);
            *sample = self.sample_at(t, old_total, input);
            self.emitted += 1;
        }
        self.total_in = self.total_in.saturating_add(input.len());
        self.last_sample = input.last().copied();
    }

    /// Returns source samples consumed so far.
    #[must_use]
    pub fn input_samples_processed(&self) -> usize {
        self.total_in
    }

    fn sample_at(&self, t: f64, block_start: usize, input: &[f32]) -> f32 {
        if t <= 0.0 {
            return input.first().copied().unwrap_or(0.0);
        }
        let floor = t.floor() as usize;
        let frac = (t - floor as f64) as f32;
        if floor + 1 < block_start {
            return self.last_sample.unwrap_or_else(|| input[0]);
        }
        if floor < block_start {
            let a = self.last_sample.unwrap_or_else(|| input[0]);
            let b = input[0];
            return lerp(a, b, frac);
        }
        let i = floor - block_start;
        let a = input
            .get(i)
            .copied()
            .unwrap_or_else(|| *input.last().unwrap_or(&0.0));
        let b = input.get(i + 1).copied().unwrap_or(a);
        lerp(a, b, frac)
    }
}

/// Averages interleaved frames down to mono.
#[must_use]
pub fn to_mono(frames: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return frames.to_vec();
    }
    frames
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

/// Copies mono samples into `channels` interleaved channels.
#[must_use]
pub fn to_channels(mono: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return mono.to_vec();
    }
    let mut out = Vec::with_capacity(mono.len() * channels);
    for &sample in mono {
        out.extend(std::iter::repeat(sample).take(channels));
    }
    out
}

/// Pads with silence or cuts so the output is exactly `n` samples.
#[must_use]
pub fn fit_length(samples: &[f32], n: usize) -> Vec<f32> {
    let mut out = vec![0.0; n];
    let copied = samples.len().min(n);
    out[..copied].copy_from_slice(&samples[..copied]);
    out
}

/// Stateless linear resampling for file/control-thread work.
#[must_use]
pub fn resample(samples: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    if src_rate == dst_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let n_out =
        ((samples.len() as f64) * f64::from(dst_rate) / f64::from(src_rate)).round() as usize;
    let mut out = Vec::with_capacity(n_out);
    for i in 0..n_out {
        let t = (i as f64) * f64::from(src_rate) / f64::from(dst_rate);
        let floor = t.floor() as usize;
        let frac = (t - floor as f64) as f32;
        let a = samples
            .get(floor)
            .copied()
            .unwrap_or_else(|| *samples.last().unwrap_or(&0.0));
        let b = samples.get(floor + 1).copied().unwrap_or(a);
        out.push(lerp(a, b, frac));
    }
    out
}

/// Trims quiet audio from both ends using the prototype constants.
#[must_use]
pub fn trim_silence(samples: &[f32], rate: u32) -> Vec<f32> {
    let window = ((rate as f32) * TRIM_WINDOW_SECONDS).max(1.0) as usize;
    let n_windows = samples.len() / window;
    if n_windows == 0 {
        return Vec::new();
    }

    let mut first = None;
    let mut last = None;
    for index in 0..n_windows {
        let start = index * window;
        let chunk = &samples[start..start + window];
        let rms = (chunk.iter().map(|s| s * s).sum::<f32>() / window as f32).sqrt();
        if rms >= SILENCE_RMS {
            first.get_or_insert(index);
            last = Some(index);
        }
    }

    let (Some(first), Some(last)) = (first, last) else {
        return Vec::new();
    };
    let pad = ((rate as f32) * TRIM_PAD_SECONDS) as usize;
    let start = first.saturating_mul(window).saturating_sub(pad);
    let end = ((last + 1) * window + pad).min(samples.len());
    samples[start..end].to_vec()
}

/// Scales the clip so the loudest sample reaches the target peak, up to a gain cap.
#[must_use]
pub fn normalize(samples: &[f32]) -> Vec<f32> {
    let peak = samples.iter().map(|s| s.abs()).fold(0.0_f32, f32::max);
    if peak == 0.0 {
        return samples.to_vec();
    }
    let gain = (TARGET_PEAK / peak).min(MAX_GAIN);
    samples.iter().map(|s| s * gain).collect()
}

#[must_use]
pub(crate) fn clip_sample(sample: f32) -> f32 {
    sample.clamp(-1.0, 1.0)
}

#[must_use]
fn lerp(a: f32, b: f32, frac: f32) -> f32 {
    a + (b - a) * frac
}
