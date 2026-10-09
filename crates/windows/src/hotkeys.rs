//! Raw Input hotkey listener and key-code mapping.

#[cfg(windows)]
const RI_KEY_BREAK: u16 = 0x0001;
const RI_KEY_E0: u16 = 0x0002;
pub(crate) const MOUSE_MIDDLE_DOWN: u16 = 0x0010;
pub(crate) const MOUSE_MIDDLE_UP: u16 = 0x0020;
pub(crate) const MOUSE_4_DOWN: u16 = 0x0040;
pub(crate) const MOUSE_4_UP: u16 = 0x0080;
pub(crate) const MOUSE_5_DOWN: u16 = 0x0100;
pub(crate) const MOUSE_5_UP: u16 = 0x0200;

/// A hotkey press or release event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeyEvent {
    /// Ringpad key name.
    pub key: String,
    /// True for key/button down, false for up.
    pub down: bool,
}

/// Raw keyboard details useful while probing unfamiliar hardware.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawKeyboardEvent {
    /// Windows virtual-key code.
    pub vkey: u16,
    /// Hardware scan code.
    pub scan_code: u16,
    /// Raw Input keyboard flags.
    pub flags: u16,
}

/// Raw mouse-button flags useful while probing unfamiliar hardware.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawMouseEvent {
    /// Raw Input mouse button flags.
    pub button_flags: u16,
}

/// Maps a Windows virtual-key event to Ringpad's key-name scheme.
#[must_use]
pub fn key_name_from_vkey(vkey: u16, scan_code: u16, flags: u16) -> String {
    let e0 = flags & RI_KEY_E0 != 0;
    if let Some(name) = numpad_navigation_name(vkey, scan_code, e0) {
        return name.to_string();
    }
    match vkey {
        0x08 => "backspace".to_string(),
        0x09 => "tab".to_string(),
        0x0d if e0 => "numenter".to_string(),
        0x0d => "enter".to_string(),
        0x10 if scan_code == 0x36 => "rshift".to_string(),
        0x10 => "lshift".to_string(),
        0x11 if e0 => "rctrl".to_string(),
        0x11 => "lctrl".to_string(),
        0x12 if e0 => "ralt".to_string(),
        0x12 => "lalt".to_string(),
        0x13 => "pause".to_string(),
        0x14 => "capslock".to_string(),
        0x1b => "escape".to_string(),
        0x20 => "space".to_string(),
        0x21 => "pageup".to_string(),
        0x22 => "pagedown".to_string(),
        0x23 => "end".to_string(),
        0x24 => "home".to_string(),
        0x25 => "left".to_string(),
        0x26 => "up".to_string(),
        0x27 => "right".to_string(),
        0x28 => "down".to_string(),
        0x2c => "printscreen".to_string(),
        0x2d => "insert".to_string(),
        0x2e => "delete".to_string(),
        0x30..=0x39 => char::from_u32(u32::from(vkey)).unwrap_or('0').to_string(),
        0x41..=0x5a => char::from_u32(u32::from(vkey))
            .unwrap_or('a')
            .to_ascii_lowercase()
            .to_string(),
        0x5b => "lwin".to_string(),
        0x5c => "rwin".to_string(),
        0x5d => "menu".to_string(),
        0x60..=0x69 => format!("num{}", vkey - 0x60),
        0x6a => "nummul".to_string(),
        0x6b => "numadd".to_string(),
        0x6d => "numsub".to_string(),
        0x6e => "numdec".to_string(),
        0x6f => "numdiv".to_string(),
        0x70..=0x87 => format!("f{}", vkey - 0x6f),
        0x91 => "scrolllock".to_string(),
        0xa0 => "lshift".to_string(),
        0xa1 => "rshift".to_string(),
        0xa2 => "lctrl".to_string(),
        0xa3 => "rctrl".to_string(),
        0xa4 => "lalt".to_string(),
        0xa5 => "ralt".to_string(),
        0xad => "mute".to_string(),
        0xae => "volumedown".to_string(),
        0xaf => "volumeup".to_string(),
        0xb0 => "nexttrack".to_string(),
        0xb1 => "prevtrack".to_string(),
        0xb3 => "playpause".to_string(),
        0xba => "semicolon".to_string(),
        0xbb => "equals".to_string(),
        0xbc => "comma".to_string(),
        0xbd => "minus".to_string(),
        0xbe => "period".to_string(),
        0xbf => "slash".to_string(),
        0xc0 => "backtick".to_string(),
        0xdb => "lbracket".to_string(),
        0xdc => "backslash".to_string(),
        0xdd => "rbracket".to_string(),
        0xde => "quote".to_string(),
        _ => format!("vk{vkey:02x}"),
    }
}

/// Converts Raw Input mouse button flags into Ringpad mouse-button events.
#[must_use]
pub fn mouse_events_from_button_flags(flags: u16) -> Vec<(String, bool)> {
    let mut events = Vec::with_capacity(6);
    push_mouse_event(flags, MOUSE_MIDDLE_DOWN, "mouse3", true, &mut events);
    push_mouse_event(flags, MOUSE_MIDDLE_UP, "mouse3", false, &mut events);
    push_mouse_event(flags, MOUSE_4_DOWN, "mouse4", true, &mut events);
    push_mouse_event(flags, MOUSE_4_UP, "mouse4", false, &mut events);
    push_mouse_event(flags, MOUSE_5_DOWN, "mouse5", true, &mut events);
    push_mouse_event(flags, MOUSE_5_UP, "mouse5", false, &mut events);
    events
}

fn push_mouse_event(
    flags: u16,
    mask: u16,
    name: &str,
    down: bool,
    events: &mut Vec<(String, bool)>,
) {
    if flags & mask != 0 {
        events.push((name.to_string(), down));
    }
}

fn numpad_navigation_name(vkey: u16, scan_code: u16, e0: bool) -> Option<&'static str> {
    if e0 {
        return None;
    }
    match (vkey, scan_code) {
        (0x24, 0x47) => Some("num7"),
        (0x26, 0x48) => Some("num8"),
        (0x21, 0x49) => Some("num9"),
        (0x25, 0x4b) => Some("num4"),
        (0x0c, 0x4c) => Some("num5"),
        (0x27, 0x4d) => Some("num6"),
        (0x23, 0x4f) => Some("num1"),
        (0x28, 0x50) => Some("num2"),
        (0x22, 0x51) => Some("num3"),
        (0x2d, 0x52) => Some("num0"),
        (0x2e, 0x53) => Some("numdec"),
        _ => None,
    }
}

/// Raw Input listener.
#[cfg(windows)]
#[path = "hotkeys_win.rs"]
mod win;

#[cfg(windows)]
pub use win::HotkeyListener;

/// Raw Input listener.
#[cfg(not(windows))]
pub struct HotkeyListener;

#[cfg(not(windows))]
impl HotkeyListener {
    /// Starts a listener thread that sends hotkey events.
    pub fn start(
        _sender: std::sync::mpsc::Sender<HotkeyEvent>,
    ) -> Result<Self, crate::BackendError> {
        Err(crate::BackendError::ThreadStart(
            "Raw Input hotkeys are only available on Windows".to_string(),
        ))
    }

    /// Stops the listener.
    pub fn stop(self) {}
}
