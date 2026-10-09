//! Sample-format helpers for WASAPI's stereo float32 byte streams.

const STEREO_F32_FRAME_BYTES: usize = 8;

/// Converts interleaved little-endian stereo f32 bytes to mono samples.
///
/// Returns the number of frames written. Trailing partial frames are ignored.
pub fn stereo_bytes_to_mono(bytes: &[u8], out: &mut [f32]) -> usize {
    let frames = (bytes.len() / STEREO_F32_FRAME_BYTES).min(out.len());
    for (frame, sample) in bytes
        .chunks_exact(STEREO_F32_FRAME_BYTES)
        .take(frames)
        .zip(out.iter_mut())
    {
        let left = f32::from_le_bytes([frame[0], frame[1], frame[2], frame[3]]);
        let right = f32::from_le_bytes([frame[4], frame[5], frame[6], frame[7]]);
        *sample = (left + right) * 0.5;
    }
    frames
}

/// Converts mono samples to interleaved little-endian stereo f32 bytes.
///
/// Returns the number of frames written. Trailing partial byte capacity is ignored.
pub fn mono_to_stereo_bytes(mono: &[f32], bytes: &mut [u8]) -> usize {
    let frames = mono.len().min(bytes.len() / STEREO_F32_FRAME_BYTES);
    for (sample, frame) in mono
        .iter()
        .take(frames)
        .zip(bytes.chunks_exact_mut(STEREO_F32_FRAME_BYTES))
    {
        let sample = sample.to_le_bytes();
        frame[..4].copy_from_slice(&sample);
        frame[4..].copy_from_slice(&sample);
    }
    frames
}
