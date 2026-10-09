//! Game talk-key targets and output abstraction.

use thiserror::Error;

/// A key target that can be pressed with OS input APIs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyTarget {
    /// Keyboard virtual key and extended-key hint.
    Keyboard {
        /// Windows virtual-key code.
        vkey: u16,
        /// Whether this key uses the extended scan-code prefix.
        extended: bool,
    },
    /// Mouse button target.
    Mouse(MouseButton),
}

/// Supported mouse button targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    /// Middle mouse button.
    Middle,
    /// First X button.
    X1,
    /// Second X button.
    X2,
}

/// Error returned when game talk keys cannot be pressed.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum TalkKeyError {
    /// Windows refused the key press.
    #[error("{0}")]
    Blocked(String),
    /// The configured key has no output target.
    #[error("Unknown key: {0}")]
    Unknown(String),
}

/// Output interface for holding and releasing game talk keys.
pub trait KeyOutput: Send {
    /// Holds every key in `keys`.
    fn hold(&mut self, keys: &[String]) -> Result<(), TalkKeyError>;
    /// Releases all keys this output is holding.
    fn release_all(&mut self);
    /// Returns keys currently held by this output.
    fn holding(&self) -> Vec<String>;
    /// Returns true for keys this output sent recently.
    fn recently_sent(&self, key: &str) -> bool;
}

/// Returns the OS output target for a Ringpad key name.
#[must_use]
pub fn key_target(name: &str) -> Option<KeyTarget> {
    let lower = name.to_ascii_lowercase();
    match lower.as_str() {
        "mouse3" => Some(KeyTarget::Mouse(MouseButton::Middle)),
        "mouse4" => Some(KeyTarget::Mouse(MouseButton::X1)),
        "mouse5" => Some(KeyTarget::Mouse(MouseButton::X2)),
        _ => keyboard_target(&lower),
    }
}

fn keyboard_target(name: &str) -> Option<KeyTarget> {
    let vkey = match name {
        "backspace" => 0x08,
        "tab" => 0x09,
        "enter" | "numenter" => 0x0d,
        "pause" => 0x13,
        "capslock" => 0x14,
        "escape" => 0x1b,
        "space" => 0x20,
        "pageup" => 0x21,
        "pagedown" => 0x22,
        "end" => 0x23,
        "home" => 0x24,
        "left" => 0x25,
        "up" => 0x26,
        "right" => 0x27,
        "down" => 0x28,
        "printscreen" => 0x2c,
        "insert" => 0x2d,
        "delete" => 0x2e,
        "lwin" => 0x5b,
        "rwin" => 0x5c,
        "menu" => 0x5d,
        "nummul" => 0x6a,
        "numadd" => 0x6b,
        "numsub" => 0x6d,
        "numdec" => 0x6e,
        "numdiv" => 0x6f,
        "scrolllock" => 0x91,
        "lshift" => 0xa0,
        "rshift" => 0xa1,
        "lctrl" => 0xa2,
        "rctrl" => 0xa3,
        "lalt" => 0xa4,
        "ralt" => 0xa5,
        "mute" => 0xad,
        "volumedown" => 0xae,
        "volumeup" => 0xaf,
        "nexttrack" => 0xb0,
        "prevtrack" => 0xb1,
        "playpause" => 0xb3,
        "semicolon" => 0xba,
        "equals" => 0xbb,
        "comma" => 0xbc,
        "minus" => 0xbd,
        "period" => 0xbe,
        "slash" => 0xbf,
        "backtick" => 0xc0,
        "lbracket" => 0xdb,
        "backslash" => 0xdc,
        "rbracket" => 0xdd,
        "quote" => 0xde,
        _ => letter_digit_function_or_numpad(name)?,
    };
    Some(KeyTarget::Keyboard {
        vkey,
        extended: extended(name),
    })
}

fn letter_digit_function_or_numpad(name: &str) -> Option<u16> {
    if name.len() == 1 {
        let byte = name.as_bytes()[0];
        if byte.is_ascii_digit() || byte.is_ascii_lowercase() {
            return Some(u16::from(byte.to_ascii_uppercase()));
        }
    }
    if let Some(number) = name.strip_prefix('f').and_then(|n| n.parse::<u16>().ok()) {
        return (1..=24).contains(&number).then_some(0x6f + number);
    }
    if let Some(number) = name.strip_prefix("num").and_then(|n| n.parse::<u16>().ok()) {
        return (0..=9).contains(&number).then_some(0x60 + number);
    }
    None
}

fn extended(name: &str) -> bool {
    matches!(
        name,
        "rctrl"
            | "ralt"
            | "rwin"
            | "lwin"
            | "menu"
            | "numenter"
            | "numdiv"
            | "up"
            | "down"
            | "left"
            | "right"
            | "insert"
            | "delete"
            | "home"
            | "end"
            | "pageup"
            | "pagedown"
            | "printscreen"
    )
}

#[cfg(windows)]
#[path = "talk_keys_win.rs"]
mod win;

#[cfg(windows)]
pub use win::{
    foreground_exe, foreground_is_elevated, release_keys, ringpad_is_elevated, KeyPresser,
};

/// Sends ups for these keys regardless of state.
#[cfg(not(windows))]
pub fn release_keys(_names: &[String]) {}

/// Returns the foreground executable name.
#[cfg(not(windows))]
#[must_use]
pub fn foreground_exe() -> Option<String> {
    None
}

/// Returns whether the foreground process is elevated.
#[cfg(not(windows))]
#[must_use]
pub fn foreground_is_elevated() -> bool {
    false
}

/// Returns whether Ringpad is elevated.
#[cfg(not(windows))]
#[must_use]
pub fn ringpad_is_elevated() -> bool {
    false
}

/// Stub key presser for non-Windows platforms.
#[cfg(not(windows))]
pub struct KeyPresser;

#[cfg(not(windows))]
impl KeyPresser {
    /// Creates a non-Windows key presser.
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

#[cfg(not(windows))]
impl Default for KeyPresser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(not(windows))]
impl KeyOutput for KeyPresser {
    fn hold(&mut self, _keys: &[String]) -> Result<(), TalkKeyError> {
        Err(TalkKeyError::Blocked(
            "Pressing keys is only available on Windows".to_string(),
        ))
    }

    fn release_all(&mut self) {}

    fn holding(&self) -> Vec<String> {
        Vec::new()
    }

    fn recently_sent(&self, _key: &str) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hotkeys::key_name_from_vkey;
    use ringpad_core::keys::NAMED_KEYS;

    #[test]
    fn every_named_key_has_a_target() {
        for key in NAMED_KEYS {
            assert!(key_target(key).is_some(), "{key}");
        }
    }

    #[test]
    fn keyboard_targets_round_trip_to_hotkey_names() {
        for key in NAMED_KEYS {
            let Some(KeyTarget::Keyboard { vkey, extended }) = key_target(key) else {
                continue;
            };
            let scan_code = if *key == "rshift" { 0x36 } else { 0 };
            let flags = if extended { 0x0002 } else { 0 };
            assert_eq!(key_name_from_vkey(vkey, scan_code, flags), *key);
        }
    }

    #[test]
    fn unknown_names_have_no_target() {
        assert_eq!(key_target(""), None);
        assert_eq!(key_target("ctrl"), None);
        assert_eq!(key_target("vk7c"), None);
    }
}
