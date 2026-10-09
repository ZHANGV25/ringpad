//! WAV clip file loading and saving.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use thiserror::Error;

use crate::dsp::{resample, to_mono};

const INT16_SCALE: f32 = 32767.0;

/// Errors from clip file IO.
#[derive(Debug, Error)]
pub enum ClipFileError {
    /// Filesystem error.
    #[error("{0}")]
    Io(#[from] std::io::Error),
    /// WAV parser/writer error.
    #[error("{0}")]
    Wav(#[from] hound::Error),
    /// Unsupported WAV format.
    #[error("{0}")]
    Unsupported(String),
    /// System clock was before Unix epoch.
    #[error("{0}")]
    Time(#[from] std::time::SystemTimeError),
}

/// Returns a timestamped WAV path in `folder`.
pub fn timestamped_path(folder: impl AsRef<Path>) -> Result<PathBuf, ClipFileError> {
    let seconds = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    Ok(folder.as_ref().join(format!("clip-{seconds}.wav")))
}

/// Saves a mono 16-bit WAV file, creating parent folders.
pub fn save_wav(clip: &[f32], rate: u32, path: impl AsRef<Path>) -> Result<PathBuf, ClipFileError> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec)?;
    for &sample in clip {
        writer.write_sample((sample.clamp(-1.0, 1.0) * INT16_SCALE) as i16)?;
    }
    writer.finalize()?;
    Ok(path.to_path_buf())
}

/// Loads a 16-bit WAV, mixes it to mono, and resamples to `rate`.
pub fn load_wav(path: impl AsRef<Path>, rate: u32) -> Result<Vec<f32>, ClipFileError> {
    let path = path.as_ref();
    let reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    if spec.bits_per_sample != 16 || spec.sample_format != hound::SampleFormat::Int {
        return Err(ClipFileError::Unsupported(format!(
            "{}: only 16-bit PCM WAV files are supported",
            path.file_name().and_then(|n| n.to_str()).unwrap_or("clip")
        )));
    }
    let channels = usize::from(spec.channels);
    let frames: Result<Vec<f32>, hound::Error> = reader
        .into_samples::<i16>()
        .map(|sample| sample.map(|value| f32::from(value) / INT16_SCALE))
        .collect();
    let mono = to_mono(&frames?, channels);
    Ok(resample(&mono, spec.sample_rate, rate))
}
