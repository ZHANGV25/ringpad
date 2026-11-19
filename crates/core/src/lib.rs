//! Ringpad's audio engine.
//!
//! Holds everything that doesn't touch the operating system: the rolling ring buffer, clip
//! trimming and levelling, the mixer, the echo gate, jitter buffers, and pads. Platform crates
//! (such as `ringpad-windows`) feed it audio and play what it renders.

pub mod actions;
pub mod clip;
pub mod clip_files;
pub mod controls;
pub mod dsp;
pub mod engine;
mod engine_control;
pub mod fifo;
pub mod gate;
pub mod history;
pub mod keys;
pub mod pads;
pub mod player;
pub mod talk;

/// Version of the engine, shown in the About page.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The release workflow holds the tag to the app's version, so the engine must report it too.
    #[test]
    fn version_matches_the_app() {
        let app_config = include_str!("../../../app/tauri.conf.json");
        assert!(
            app_config.contains(&format!("\"version\": \"{}\"", version())),
            "Cargo.toml says {} but app/tauri.conf.json differs",
            version()
        );
    }
}
