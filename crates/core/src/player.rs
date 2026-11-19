//! Clip playback.

use std::sync::Arc;

use crate::clip::{empty_clip, Clip};

/// Playback state for one current clip.
///
/// The type itself is single-threaded. Platform code should update it from the
/// control side between callback invocations, or wrap commands externally; the
/// audio callback calls only [`ClipPlayer::pull_into`].
pub struct ClipPlayer {
    loaded: Clip,
    playing: Clip,
    pos: usize,
}

impl Default for ClipPlayer {
    fn default() -> Self {
        Self::new()
    }
}

impl ClipPlayer {
    /// Creates an empty player.
    #[must_use]
    pub fn new() -> Self {
        let empty = empty_clip();
        Self {
            loaded: empty.clone(),
            playing: empty,
            pos: 0,
        }
    }

    /// Loads a clip without starting playback.
    pub fn load(&mut self, clip: Clip) {
        self.loaded = clip;
    }

    /// Loads and starts a clip.
    pub fn play(&mut self, clip: Clip) {
        self.loaded = clip.clone();
        self.playing = clip;
        self.pos = 0;
    }

    /// Replays the current clip, returning false when no clip is loaded.
    pub fn replay(&mut self) -> bool {
        if self.loaded.is_empty() {
            return false;
        }
        self.playing = self.loaded.clone();
        self.pos = 0;
        true
    }

    /// Stops playback while preserving the current clip.
    pub fn stop(&mut self) {
        self.pos = self.playing.len();
    }

    /// Returns true while playback has samples left.
    #[must_use]
    pub fn playing(&self) -> bool {
        self.pos < self.playing.len()
    }

    /// Returns the current clip that replay would play.
    #[must_use]
    pub fn current(&self) -> Clip {
        self.loaded.clone()
    }

    /// Pulls player audio into `out`.
    ///
    /// This method does not lock, allocate, or free memory. It only reads from
    /// already-held clip references and advances the play cursor.
    pub fn pull_into(&mut self, out: &mut [f32]) {
        let available = self.playing.len().saturating_sub(self.pos);
        let copied = available.min(out.len());
        if copied > 0 {
            out[..copied].copy_from_slice(&self.playing[self.pos..self.pos + copied]);
            self.pos += copied;
        }
        if copied < out.len() {
            out[copied..].fill(0.0);
        }
    }

    /// Pulls `n` samples into a newly allocated vector for control-thread tests.
    #[must_use]
    pub fn pull(&mut self, n: usize) -> Vec<f32> {
        let mut out = vec![0.0; n];
        self.pull_into(&mut out);
        out
    }

    pub(crate) fn load_for_audio(&mut self, clip: Clip, mut retire: impl FnMut(Clip)) {
        let old = std::mem::replace(&mut self.loaded, clip);
        retire(old);
    }

    /// Starts `clip` once and leaves the loaded clip alone, so a pad played over the clip
    /// does not change what replay plays.
    pub(crate) fn play_once_for_audio(&mut self, clip: Clip, mut retire: impl FnMut(Clip)) {
        let old_playing = std::mem::replace(&mut self.playing, clip);
        self.pos = 0;
        retire(old_playing);
    }

    pub(crate) fn play_for_audio(&mut self, clip: Clip, mut retire: impl FnMut(Clip)) {
        let old_loaded = std::mem::replace(&mut self.loaded, Arc::clone(&clip));
        let old_playing = std::mem::replace(&mut self.playing, clip);
        self.pos = 0;
        retire(old_loaded);
        retire(old_playing);
    }

    pub(crate) fn replay_for_audio(&mut self, mut retire: impl FnMut(Clip)) -> bool {
        if self.loaded.is_empty() {
            return false;
        }
        let old_playing = std::mem::replace(&mut self.playing, Arc::clone(&self.loaded));
        self.pos = 0;
        retire(old_playing);
        true
    }
}
