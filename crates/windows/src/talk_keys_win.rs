use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::mem::size_of;
use std::os::windows::ffi::OsStringExt;
use std::path::Path;
use std::time::{Duration, Instant};

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
    PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE,
    KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC_EX,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, MOUSEINPUT,
    VIRTUAL_KEY, VK_MBUTTON, VK_XBUTTON1, VK_XBUTTON2,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

use super::{key_target, KeyOutput, KeyTarget, MouseButton, TalkKeyError};

const RECENTLY_SENT: Duration = Duration::from_millis(500);

/// Sends normal Windows key presses for game talk keys.
pub struct KeyPresser {
    held: HashSet<String>,
    released: HashMap<String, Instant>,
}

impl KeyPresser {
    /// Creates a key presser.
    #[must_use]
    pub fn new() -> Self {
        Self {
            held: HashSet::new(),
            released: HashMap::new(),
        }
    }
}

impl Default for KeyPresser {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyOutput for KeyPresser {
    fn hold(&mut self, keys: &[String]) -> Result<(), TalkKeyError> {
        for key in keys {
            let target = key_target(key).ok_or_else(|| TalkKeyError::Unknown(key.clone()))?;
            if target_down(target) {
                continue;
            }
            send_target(target, true)?;
            self.held.insert(key.clone());
            self.released.remove(key);
        }
        Ok(())
    }

    fn release_all(&mut self) {
        let keys = self.held.drain().collect::<Vec<_>>();
        for key in keys {
            if let Some(target) = key_target(&key) {
                let _ = send_target(target, false);
            }
            self.released.insert(key, Instant::now());
        }
    }

    fn holding(&self) -> Vec<String> {
        let mut keys = self.held.iter().cloned().collect::<Vec<_>>();
        keys.sort();
        keys
    }

    fn recently_sent(&self, key: &str) -> bool {
        self.held.contains(key)
            || self
                .released
                .get(key)
                .is_some_and(|when| when.elapsed() <= RECENTLY_SENT)
    }
}

impl Drop for KeyPresser {
    fn drop(&mut self) {
        self.release_all();
    }
}

/// Sends ups for these keys regardless of state.
pub fn release_keys(names: &[String]) {
    for name in names {
        if let Some(target) = key_target(name) {
            let _ = send_target(target, false);
        }
    }
}

/// Returns the foreground executable file name.
#[must_use]
pub fn foreground_exe() -> Option<String> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return None;
    }
    let mut pid = 0_u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return None;
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()? };
    let result = process_image_name(process);
    let _ = unsafe { CloseHandle(process) };
    result
}

/// Returns whether the foreground process is elevated.
#[must_use]
pub fn foreground_is_elevated() -> bool {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return false;
    }
    let mut pid = 0_u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return false;
    }
    let Ok(process) = (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) })
    else {
        return false;
    };
    let elevated = is_elevated(process);
    let _ = unsafe { CloseHandle(process) };
    elevated
}

/// Returns whether this Ringpad process is elevated.
#[must_use]
pub fn ringpad_is_elevated() -> bool {
    is_elevated(unsafe { GetCurrentProcess() })
}

fn target_down(target: KeyTarget) -> bool {
    let vkey = match target {
        KeyTarget::Keyboard { vkey, .. } => vkey,
        KeyTarget::Mouse(MouseButton::Middle) => VK_MBUTTON.0,
        KeyTarget::Mouse(MouseButton::X1) => VK_XBUTTON1.0,
        KeyTarget::Mouse(MouseButton::X2) => VK_XBUTTON2.0,
    };
    let state = unsafe { GetAsyncKeyState(i32::from(vkey)) };
    state < 0
}

fn send_target(target: KeyTarget, down: bool) -> Result<(), TalkKeyError> {
    let input = match target {
        KeyTarget::Keyboard { vkey, extended } => keyboard_input(vkey, extended, down),
        KeyTarget::Mouse(button) => mouse_input(button, down),
    };
    let sent = unsafe { SendInput(&[input], size_of::<INPUT>() as i32) };
    if sent == 1 {
        Ok(())
    } else {
        Err(TalkKeyError::Blocked(blocked_sentence()))
    }
}

fn keyboard_input(vkey: u16, extended: bool, down: bool) -> INPUT {
    let mapped = unsafe { MapVirtualKeyW(u32::from(vkey), MAPVK_VK_TO_VSC_EX) };
    let scan = (mapped & 0xff) as u16;
    let mapped_extended = (mapped & 0xff00) != 0;
    let mut flags = KEYEVENTF_SCANCODE;
    if extended || mapped_extended {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    if !down {
        flags |= KEYEVENTF_KEYUP;
    }
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn mouse_input(button: MouseButton, down: bool) -> INPUT {
    let (flags, data) = match (button, down) {
        (MouseButton::Middle, true) => (MOUSEEVENTF_MIDDLEDOWN, 0),
        (MouseButton::Middle, false) => (MOUSEEVENTF_MIDDLEUP, 0),
        (MouseButton::X1, true) => (MOUSEEVENTF_XDOWN, 1),
        (MouseButton::X1, false) => (MOUSEEVENTF_XUP, 1),
        (MouseButton::X2, true) => (MOUSEEVENTF_XDOWN, 2),
        (MouseButton::X2, false) => (MOUSEEVENTF_XUP, 2),
    };
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: data,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn blocked_sentence() -> String {
    if foreground_is_elevated() && !ringpad_is_elevated() {
        if let Some(exe) = foreground_exe() {
            return format!(
                "{exe} runs as administrator, so Windows blocks Ringpad's key presses. Run Ringpad as administrator too."
            );
        }
    }
    "Windows blocked Ringpad's key press.".to_string()
}

fn process_image_name(process: HANDLE) -> Option<String> {
    let mut buffer = vec![0_u16; 32_768];
    let mut len = buffer.len() as u32;
    unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut len,
        )
        .ok()?;
    }
    buffer.truncate(len as usize);
    let path = OsString::from_wide(&buffer);
    Path::new(&path).file_name()?.to_str().map(str::to_string)
}

fn is_elevated(process: HANDLE) -> bool {
    let mut token = HANDLE::default();
    if unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) }.is_err() {
        return false;
    }
    let mut elevation = TOKEN_ELEVATION::default();
    let mut returned = 0_u32;
    let ok = unsafe {
        GetTokenInformation(
            token,
            TokenElevation,
            Some((&mut elevation as *mut TOKEN_ELEVATION).cast()),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        )
    }
    .is_ok();
    let _ = unsafe { CloseHandle(token) };
    ok && elevation.TokenIsElevated != 0
}
