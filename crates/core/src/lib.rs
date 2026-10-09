//! Ringpad's audio engine.
//!
//! Holds everything that doesn't touch the operating system: the rolling ring buffer, clip
//! trimming and levelling, the mixer, the echo gate, jitter buffers, and pads. Platform crates
//! (such as `ringpad-windows`) feed it audio and play what it renders.

/// Version of the engine, shown in the About page.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_the_workspace() {
        assert_eq!(version(), "0.1.0");
    }
}
