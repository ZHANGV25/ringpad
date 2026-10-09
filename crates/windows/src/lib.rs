//! Ringpad's Windows backend.
//!
//! Implements the engine's platform traits with WASAPI (device loopback, per-app process
//! loopback, render to the virtual mic and headphones) and Raw Input for hotkeys.

/// Name of the backend, shown in the About page.
pub fn backend_name() -> &'static str {
    "WASAPI"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_backend() {
        assert_eq!(backend_name(), "WASAPI");
        assert!(!ringpad_core::version().is_empty());
    }
}
