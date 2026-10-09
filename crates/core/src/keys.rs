//! Platform-neutral hotkey names and labels.

/// Every named key shown in the settings key picker.
pub const NAMED_KEYS: &[&str] = &[
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7",
    "f8",
    "f9",
    "f10",
    "f11",
    "f12",
    "f13",
    "f14",
    "f15",
    "f16",
    "f17",
    "f18",
    "f19",
    "f20",
    "f21",
    "f22",
    "f23",
    "f24",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "num0",
    "num1",
    "num2",
    "num3",
    "num4",
    "num5",
    "num6",
    "num7",
    "num8",
    "num9",
    "numadd",
    "numsub",
    "nummul",
    "numdiv",
    "numdec",
    "numenter",
    "space",
    "enter",
    "tab",
    "backspace",
    "escape",
    "insert",
    "delete",
    "home",
    "end",
    "pageup",
    "pagedown",
    "up",
    "down",
    "left",
    "right",
    "capslock",
    "scrolllock",
    "pause",
    "printscreen",
    "lshift",
    "rshift",
    "lctrl",
    "rctrl",
    "lalt",
    "ralt",
    "lwin",
    "rwin",
    "menu",
    "minus",
    "equals",
    "lbracket",
    "rbracket",
    "backslash",
    "semicolon",
    "quote",
    "comma",
    "period",
    "slash",
    "backtick",
    "volumeup",
    "volumedown",
    "mute",
    "playpause",
    "nexttrack",
    "prevtrack",
    "mouse3",
    "mouse4",
    "mouse5",
];

/// Returns the user-facing label for a key name.
#[must_use]
pub fn key_label(name: &str) -> Option<String> {
    let lower = name.to_ascii_lowercase();
    if let Some(label) = named_label(&lower) {
        return Some(label.to_string());
    }
    parse_vk_fallback(&lower).map(|value| format!("VK 0x{value:02X}"))
}

/// Returns whether `name` is a recognized key name.
#[must_use]
pub fn is_valid_key_name(name: &str) -> bool {
    key_label(name).is_some()
}

fn named_label(name: &str) -> Option<&'static str> {
    if let Some(number) = name.strip_prefix('f').and_then(parse_range_1_24) {
        return match number {
            1 => Some("F1"),
            2 => Some("F2"),
            3 => Some("F3"),
            4 => Some("F4"),
            5 => Some("F5"),
            6 => Some("F6"),
            7 => Some("F7"),
            8 => Some("F8"),
            9 => Some("F9"),
            10 => Some("F10"),
            11 => Some("F11"),
            12 => Some("F12"),
            13 => Some("F13"),
            14 => Some("F14"),
            15 => Some("F15"),
            16 => Some("F16"),
            17 => Some("F17"),
            18 => Some("F18"),
            19 => Some("F19"),
            20 => Some("F20"),
            21 => Some("F21"),
            22 => Some("F22"),
            23 => Some("F23"),
            24 => Some("F24"),
            _ => None,
        };
    }
    if name.len() == 1 && name.as_bytes()[0].is_ascii_alphanumeric() {
        return Some(match name {
            "a" => "A",
            "b" => "B",
            "c" => "C",
            "d" => "D",
            "e" => "E",
            "f" => "F",
            "g" => "G",
            "h" => "H",
            "i" => "I",
            "j" => "J",
            "k" => "K",
            "l" => "L",
            "m" => "M",
            "n" => "N",
            "o" => "O",
            "p" => "P",
            "q" => "Q",
            "r" => "R",
            "s" => "S",
            "t" => "T",
            "u" => "U",
            "v" => "V",
            "w" => "W",
            "x" => "X",
            "y" => "Y",
            "z" => "Z",
            "0" => "0",
            "1" => "1",
            "2" => "2",
            "3" => "3",
            "4" => "4",
            "5" => "5",
            "6" => "6",
            "7" => "7",
            "8" => "8",
            "9" => "9",
            _ => return None,
        });
    }
    match name {
        "num0" => Some("Num 0"),
        "num1" => Some("Num 1"),
        "num2" => Some("Num 2"),
        "num3" => Some("Num 3"),
        "num4" => Some("Num 4"),
        "num5" => Some("Num 5"),
        "num6" => Some("Num 6"),
        "num7" => Some("Num 7"),
        "num8" => Some("Num 8"),
        "num9" => Some("Num 9"),
        "numadd" => Some("Num +"),
        "numsub" => Some("Num -"),
        "nummul" => Some("Num *"),
        "numdiv" => Some("Num /"),
        "numdec" => Some("Num ."),
        "numenter" => Some("Num Enter"),
        "space" => Some("Space"),
        "enter" => Some("Enter"),
        "tab" => Some("Tab"),
        "backspace" => Some("Backspace"),
        "escape" => Some("Escape"),
        "insert" => Some("Insert"),
        "delete" => Some("Delete"),
        "home" => Some("Home"),
        "end" => Some("End"),
        "pageup" => Some("Page Up"),
        "pagedown" => Some("Page Down"),
        "up" => Some("Up"),
        "down" => Some("Down"),
        "left" => Some("Left"),
        "right" => Some("Right"),
        "capslock" => Some("Caps Lock"),
        "scrolllock" => Some("Scroll Lock"),
        "pause" => Some("Pause"),
        "printscreen" => Some("Print Screen"),
        "lshift" => Some("Left Shift"),
        "rshift" => Some("Right Shift"),
        "lctrl" => Some("Left Ctrl"),
        "rctrl" => Some("Right Ctrl"),
        "lalt" => Some("Left Alt"),
        "ralt" => Some("Right Alt"),
        "lwin" => Some("Left Win"),
        "rwin" => Some("Right Win"),
        "menu" => Some("Menu"),
        "minus" => Some("-"),
        "equals" => Some("="),
        "lbracket" => Some("["),
        "rbracket" => Some("]"),
        "backslash" => Some("\\"),
        "semicolon" => Some(";"),
        "quote" => Some("'"),
        "comma" => Some(","),
        "period" => Some("."),
        "slash" => Some("/"),
        "backtick" => Some("`"),
        "volumeup" => Some("Volume Up"),
        "volumedown" => Some("Volume Down"),
        "mute" => Some("Mute"),
        "playpause" => Some("Play/Pause"),
        "nexttrack" => Some("Next Track"),
        "prevtrack" => Some("Previous Track"),
        "mouse3" => Some("Middle click"),
        "mouse4" => Some("Mouse 4 (lower side)"),
        "mouse5" => Some("Mouse 5 (upper side)"),
        _ => None,
    }
}

fn parse_range_1_24(value: &str) -> Option<u8> {
    value.parse::<u8>().ok().filter(|n| (1..=24).contains(n))
}

fn parse_vk_fallback(name: &str) -> Option<u8> {
    let hex = name.strip_prefix("vk")?;
    if hex.is_empty() || hex.len() > 2 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    u8::from_str_radix(hex, 16).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_named_key_has_a_label_and_validates() {
        for key in NAMED_KEYS {
            assert!(is_valid_key_name(key), "{key}");
            assert!(key_label(key).is_some(), "{key}");
        }
    }

    #[test]
    fn labels_special_cases() {
        assert_eq!(key_label("f8").as_deref(), Some("F8"));
        assert_eq!(key_label("mouse5").as_deref(), Some("Mouse 5 (upper side)"));
        assert_eq!(key_label("mouse4").as_deref(), Some("Mouse 4 (lower side)"));
        assert_eq!(key_label("mouse3").as_deref(), Some("Middle click"));
        assert_eq!(key_label("num1").as_deref(), Some("Num 1"));
        assert_eq!(key_label("pageup").as_deref(), Some("Page Up"));
        assert_eq!(key_label("a").as_deref(), Some("A"));
    }

    #[test]
    fn hex_fallback_parses_and_labels() {
        assert!(is_valid_key_name("vk7c"));
        assert_eq!(key_label("vk7c").as_deref(), Some("VK 0x7C"));
        assert_eq!(key_label("VK0a").as_deref(), Some("VK 0x0A"));
    }

    #[test]
    fn junk_is_rejected() {
        for key in ["", "f0", "f25", "mouse1", "vk", "vk100", "vkxz", "ctrl"] {
            assert!(!is_valid_key_name(key), "{key}");
        }
    }
}
