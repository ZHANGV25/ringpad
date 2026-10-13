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
    /// Filesystem error.
    #[error("{0}")]
    Io(#[from] std::io::Error),
    /// Decoder/probe error.
    #[error("{0}")]
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

    let file = File::open(path)?;
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
    let mut out = Vec::new();

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
        let mono = to_mono(buffer.samples(), channels);
        append_resampled(&mut out, &mono, spec.rate);
        if out.len() >= IMPORT_RATE as usize * MAX_IMPORT_SECONDS {
            out.truncate(IMPORT_RATE as usize * MAX_IMPORT_SECONDS);
            break;
        }
    }

    if out.is_empty() {
        Err(ImportError::NoAudio)
    } else {
        Ok(out)
    }
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
    ImportError::Decode(error.to_string())
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
}
