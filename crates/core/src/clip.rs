//! Shared clip buffers.

use std::sync::Arc;

/// Immutable mono audio held at the engine sample rate.
pub type Clip = Arc<[f32]>;

/// Returns an empty clip.
#[must_use]
pub fn empty_clip() -> Clip {
    Arc::<[f32]>::from([])
}

/// Converts owned samples into a shared immutable clip.
#[must_use]
pub fn clip_from_vec(samples: Vec<f32>) -> Clip {
    Arc::<[f32]>::from(samples)
}
