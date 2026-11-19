//! Pad audio import.

use std::fs::File;
use std::path::{Path, PathBuf};

use ringpad_core::clip::clip_from_vec;
use ringpad_core::clip_files::save_wav;
use ringpad_core::dsp::{resample, to_mono};
use ringpad_core::pads::PadBank;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use thiserror::Error;

use crate::pads_store::PadsStore;

const IMPORT_RATE: u32 = 48_000;
/// The file types a pad can take.
pub const SOUND_EXTENSIONS: [&str; 4] = ["wav", "mp3", "ogg", "flac"];
const MAX_IMPORT_SECONDS: usize = 30;

/// Import errors suitable for display.
#[derive(Debug, Error)]
pub enum ImportError {
    /// Unsupported extension.
    #[error("Ringpad can import WAV, MP3, OGG and FLAC")]
    UnsupportedExtension,
    /// File contained no decodable samples.
    #[error("No audio found in that file")]
    NoAudio,
    /// The file was moved or deleted before it was read.
    #[error("That file isn't there any more. It may have been moved or deleted")]
    Missing,
    /// Filesystem error.
    #[error("{0}")]
    Io(#[from] std::io::Error),
    /// Decoder/probe error. The detail goes to the log; the sentence goes to the user.
    #[error("Ringpad can't read that file. It may be damaged, or not really a sound file")]
    Decode(String),
    /// Core clip-file error.
    #[error("{0}")]
    ClipFile(#[from] ringpad_core::clip_files::ClipFileError),
    /// Pad operation error.
    #[error("{0}")]
    Pad(#[from] ringpad_core::pads::PadError),
}

/// Imports a supported file into a one-based pad slot.
pub fn import_pad_file(
    path: &Path,
    slot: usize,
    slots_dir: &Path,
    bank: &mut PadBank,
    metadata: &mut PadsStore,
) -> Result<(), ImportError> {
    let samples = decode_file(path)?;
    let stem = match path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.trim().is_empty())
        .map(str::to_string)
    {
        Some(stem) => stem,
        None => format!("Pad {slot}"),
    };
    let slot_path = slots_dir.join(format!("slot{slot}.wav"));
    save_wav(&samples, IMPORT_RATE, slot_path)?;
    bank.store(slot, clip_from_vec(samples), stem.clone())?;
    metadata.set_filled_defaults(slot, stem);
    metadata.apply_to_bank(bank);
    Ok(())
}

/// Decodes a supported audio file to mono 48 kHz samples capped at 30 seconds.
pub fn decode_file(path: &Path) -> Result<Vec<f32>, ImportError> {
    let extension = normalized_extension(path).ok_or(ImportError::UnsupportedExtension)?;
    if !SOUND_EXTENSIONS.contains(&extension.as_str()) {
        return Err(ImportError::UnsupportedExtension);
    }

    let file = File::open(path).map_err(open_error)?;
    let media = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(&extension);
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            media,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(map_probe_error)?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or(ImportError::NoAudio)?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(map_probe_error)?;
    let cap = IMPORT_RATE as usize * MAX_IMPORT_SECONDS;
    let mut out = Vec::new();
    // Samples at the file's own rate, resampled in one pass so the time grid never restarts at a
    // packet boundary (restarting it nudges timing by a fraction of a sample at every packet).
    let mut pending = Vec::new();
    let mut pending_rate = None;

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(error) => return Err(map_probe_error(error)),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(error) => return Err(map_probe_error(error)),
        };
        let spec = *decoded.spec();
        let channels = spec.channels.count();
        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        if let Some(rate) = pending_rate.filter(|rate| *rate != spec.rate) {
            append_resampled(&mut out, &pending, rate);
            pending.clear();
        }
        pending_rate = Some(spec.rate);
        pending.extend(to_mono(buffer.samples(), channels));
        if out.len() + resampled_len(pending.len(), spec.rate) >= cap {
            break;
        }
    }
    if let Some(rate) = pending_rate {
        append_resampled(&mut out, &pending, rate);
    }
    out.truncate(cap);

    if out.is_empty() {
        Err(ImportError::NoAudio)
    } else {
        Ok(out)
    }
}

/// How many 48 kHz samples `len` samples at `rate` become.
fn resampled_len(len: usize, rate: u32) -> usize {
    if rate == 0 {
        return 0;
    }
    (len as u64 * u64::from(IMPORT_RATE) / u64::from(rate)) as usize
}

fn append_resampled(out: &mut Vec<f32>, mono: &[f32], rate: u32) {
    if rate == IMPORT_RATE {
        out.extend_from_slice(mono);
    } else {
        out.extend(resample(mono, rate, IMPORT_RATE));
    }
}

fn normalized_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

fn map_probe_error(error: SymphoniaError) -> ImportError {
    log::warn!("could not read a sound file: {error}");
    ImportError::Decode(error.to_string())
}

fn open_error(error: std::io::Error) -> ImportError {
    if error.kind() == std::io::ErrorKind::NotFound {
        ImportError::Missing
    } else {
        ImportError::Io(error)
    }
}

/// Returns the slot WAV path for a one-based slot.
#[must_use]
pub fn slot_path(slots_dir: &Path, slot: usize) -> PathBuf {
    slots_dir.join(format!("slot{slot}.wav"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ringpad_core::clip_files::save_wav;

    #[test]
    fn imports_generated_wav() {
        let dir = tempfile::tempdir().expect("tempdir");
        let source = dir.path().join("tone.wav");
        save_wav(&[0.1; 480], IMPORT_RATE, &source).expect("save wav");
        let mut bank = PadBank::new();
        let mut store = PadsStore::default();
        import_pad_file(&source, 1, dir.path(), &mut bank, &mut store).expect("import");
        assert!(bank.get(1).expect("bounds").is_some());
        assert!(dir.path().join("slot1.wav").exists());
    }

    /// Pitch over the middle half of `samples` (48 kHz): rising zero crossings, placed between
    /// samples by interpolation, divided by the time from the first to the last one.
    fn pitch_hz(samples: &[f32]) -> f32 {
        let start = samples.len() / 4;
        let middle = &samples[start..samples.len() * 3 / 4];
        let rises: Vec<f32> = middle
            .windows(2)
            .enumerate()
            .filter(|(_, pair)| pair[0] < 0.0 && pair[1] >= 0.0)
            .map(|(i, pair)| i as f32 + pair[0] / (pair[0] - pair[1]))
            .collect();
        let (Some(first), Some(last)) = (rises.first(), rises.last()) else {
            return 0.0;
        };
        (rises.len() - 1) as f32 * IMPORT_RATE as f32 / (last - first)
    }

    /// Largest jump between neighbouring samples over the middle half: a click shows up here.
    fn largest_step(samples: &[f32]) -> f32 {
        samples[samples.len() / 4..samples.len() * 3 / 4]
            .windows(2)
            .map(|pair| (pair[1] - pair[0]).abs())
            .fold(0.0, f32::max)
    }

    #[test]
    fn a_44k1_mp3_keeps_its_speed_and_pitch() {
        // 1 s of a 440 Hz sine at 44.1 kHz, stereo, 64 kbps (made with ffmpeg's sine source).
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone-440hz-44k1.mp3");
        let samples = decode_file(&path).expect("decode mp3");
        // MP3 adds encoder delay and padding (a few ms at each end), never a different length.
        let seconds = samples.len() as f32 / IMPORT_RATE as f32;
        assert!((1.0..1.1).contains(&seconds), "{seconds} s");
        let pitch = pitch_hz(&samples);
        assert!((pitch - 440.0).abs() < 0.5, "{pitch} Hz");
    }

    #[test]
    fn a_44k1_wav_keeps_its_length_and_pitch_with_no_clicks() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("tone.wav");
        let tone: Vec<f32> = (0..44_100)
            .map(|i| 0.5 * (std::f32::consts::TAU * 440.0 * i as f32 / 44_100.0).sin())
            .collect();
        save_wav(&tone, 44_100, &path).expect("save wav");
        let samples = decode_file(&path).expect("decode wav");
        assert!(
            (47_990..=48_010).contains(&samples.len()),
            "{}",
            samples.len()
        );
        let pitch = pitch_hz(&samples);
        assert!((pitch - 440.0).abs() < 0.5, "{pitch} Hz");
        // A 440 Hz sine at 0.5 moves at most 0.5 * 2 * pi * 440 / 48000 = 0.029 per sample.
        assert!(largest_step(&samples) < 0.035, "{}", largest_step(&samples));
    }

    #[test]
    fn rejects_unsupported_extension() {
        let err = decode_file(Path::new("clip.txt")).expect_err("unsupported");
        assert_eq!(err.to_string(), "Ringpad can import WAV, MP3, OGG and FLAC");
    }

    #[test]
    fn rejects_empty_wav() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("empty.wav");
        save_wav(&[], IMPORT_RATE, &path).expect("save empty");
        let err = decode_file(&path).expect_err("empty");
        assert_eq!(err.to_string(), "No audio found in that file");
    }

    #[test]
    fn says_plainly_when_a_file_is_not_really_audio() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("notes.mp3");
        std::fs::write(&path, "not audio").expect("write");
        let err = decode_file(&path).expect_err("not audio");
        assert_eq!(
            err.to_string(),
            "Ringpad can't read that file. It may be damaged, or not really a sound file"
        );
    }

    #[test]
    fn says_plainly_when_a_file_is_gone() {
        let dir = tempfile::tempdir().expect("tempdir");
        let err = decode_file(&dir.path().join("moved.wav")).expect_err("missing");
        assert_eq!(
            err.to_string(),
            "That file isn't there any more. It may have been moved or deleted"
        );
    }
}
