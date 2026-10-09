use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};

use super::{
    key_name_from_vkey, mouse_events_from_button_flags, HotkeyEvent, RawKeyboardEvent,
    RawMouseEvent, RI_KEY_BREAK,
};

const WM_RINGPAD_STOP: u32 = windows::Win32::UI::WindowsAndMessaging::WM_APP + 41;

/// Raw Input listener.
pub struct HotkeyListener {
    hwnd: Arc<AtomicIsize>,
    thread: Option<JoinHandle<()>>,
}

impl HotkeyListener {
    /// Starts a listener thread that sends hotkey events.
    pub fn start(sender: Sender<HotkeyEvent>) -> Result<Self, crate::BackendError> {
        Self::start_with_raw(sender, None, None)
    }

    /// Starts a listener thread that also reports raw keyboard and mouse details.
    pub fn start_with_raw(
        sender: Sender<HotkeyEvent>,
        raw_keyboard: Option<Sender<RawKeyboardEvent>>,
        raw_mouse: Option<Sender<RawMouseEvent>>,
    ) -> Result<Self, crate::BackendError> {
        let hwnd = Arc::new(AtomicIsize::new(0));
        let thread_hwnd = Arc::clone(&hwnd);
        let thread = std::thread::Builder::new()
            .name("ringpad-input".to_string())
            .spawn(move || input_thread(thread_hwnd, sender, raw_keyboard, raw_mouse))
            .map_err(|error| crate::BackendError::ThreadStart(error.to_string()))?;
        Ok(Self {
            hwnd,
            thread: Some(thread),
        })
    }

    /// Stops the listener and joins its thread.
    pub fn stop(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        post_stop(self.hwnd.load(Ordering::Acquire));
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for HotkeyListener {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

static INPUT_STATE: Mutex<Option<InputState>> = Mutex::new(None);

struct InputState {
    sender: Sender<HotkeyEvent>,
    raw_keyboard: Option<Sender<RawKeyboardEvent>>,
    raw_mouse: Option<Sender<RawMouseEvent>>,
    pressed: [bool; 256],
}

fn input_thread(
    hwnd_slot: Arc<AtomicIsize>,
    sender: Sender<HotkeyEvent>,
    raw_keyboard: Option<Sender<RawKeyboardEvent>>,
    raw_mouse: Option<Sender<RawMouseEvent>>,
) {
    use std::mem::size_of;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::{RegisterRawInputDevices, RAWINPUTDEVICE, RIDEV_INPUTSINK};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DispatchMessageW, GetMessageW, RegisterClassExW, TranslateMessage,
        CS_HREDRAW, CS_VREDRAW, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WNDCLASSEXW,
    };

    let _ = wasapi::initialize_mta();
    if let Ok(mut state) = INPUT_STATE.lock() {
        *state = Some(InputState {
            sender,
            raw_keyboard,
            raw_mouse,
            pressed: [false; 256],
        });
    } else {
        return;
    }

    let class_name = wide_null("RingpadRawInput");
    let module = unsafe { GetModuleHandleW(PCWSTR::null()) }.ok();
    let hinstance = module.map(|module| HINSTANCE(module.0));
    let wnd = WNDCLASSEXW {
        cbSize: size_of::<WNDCLASSEXW>() as u32,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(window_proc),
        hInstance: hinstance.unwrap_or_default(),
        lpszClassName: PCWSTR(class_name.as_ptr()),
        ..Default::default()
    };
    unsafe {
        RegisterClassExW(&wnd);
    }
    let hwnd = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            PCWSTR(class_name.as_ptr()),
            PCWSTR(class_name.as_ptr()),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            hinstance,
            None,
        )
    };
    let Ok(hwnd) = hwnd else {
        clear_input_state();
        return;
    };
    hwnd_slot.store(hwnd.0 as isize, Ordering::Release);
    let devices = [
        RAWINPUTDEVICE {
            usUsagePage: 1,
            usUsage: 6,
            dwFlags: RIDEV_INPUTSINK,
            hwndTarget: hwnd,
        },
        RAWINPUTDEVICE {
            usUsagePage: 1,
            usUsage: 2,
            dwFlags: RIDEV_INPUTSINK,
            hwndTarget: hwnd,
        },
    ];
    if unsafe { RegisterRawInputDevices(&devices, size_of::<RAWINPUTDEVICE>() as u32) }.is_err() {
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::DestroyWindow(hwnd);
        }
        clear_input_state();
        return;
    }
    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0).as_bool() } {
        unsafe {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
    clear_input_state();
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{
        DefWindowProcW, DestroyWindow, PostQuitMessage, WM_CLOSE, WM_INPUT,
    };
    match msg {
        WM_INPUT => {
            handle_raw_input(lparam);
            LRESULT(0)
        }
        WM_CLOSE | WM_RINGPAD_STOP => {
            let _ = unsafe { DestroyWindow(hwnd) };
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

fn handle_raw_input(lparam: LPARAM) {
    use std::mem::size_of;
    use windows::Win32::UI::Input::{
        GetRawInputData, HRAWINPUT, RAWINPUT, RAWINPUTHEADER, RID_INPUT, RIM_TYPEKEYBOARD,
        RIM_TYPEMOUSE,
    };

    let mut raw = RAWINPUT::default();
    let mut size = size_of::<RAWINPUT>() as u32;
    let read = unsafe {
        GetRawInputData(
            HRAWINPUT(lparam.0 as *mut _),
            RID_INPUT,
            Some((&mut raw as *mut RAWINPUT).cast()),
            &mut size,
            size_of::<RAWINPUTHEADER>() as u32,
        )
    };
    if read == u32::MAX {
        return;
    }
    if raw.header.dwType == RIM_TYPEKEYBOARD.0 {
        let keyboard = unsafe { raw.data.keyboard };
        emit_keyboard(keyboard.VKey, keyboard.MakeCode, keyboard.Flags);
    } else if raw.header.dwType == RIM_TYPEMOUSE.0 {
        let mouse = unsafe { raw.data.mouse };
        let buttons = unsafe { mouse.Anonymous.Anonymous };
        emit_mouse(buttons.usButtonFlags);
    }
}

fn emit_keyboard(vkey: u16, scan_code: u16, flags: u16) {
    let key = key_name_from_vkey(vkey, scan_code, flags);
    let down = flags & RI_KEY_BREAK == 0;
    let Ok(mut state) = INPUT_STATE.lock() else {
        return;
    };
    let Some(state) = state.as_mut() else {
        return;
    };
    if let Some(sender) = state.raw_keyboard.as_ref() {
        let _ = sender.send(RawKeyboardEvent {
            vkey,
            scan_code,
            flags,
        });
    }
    let index = usize::from(vkey.min(255));
    if down {
        if state.pressed[index] {
            return;
        }
        state.pressed[index] = true;
    } else {
        state.pressed[index] = false;
    }
    let _ = state.sender.send(HotkeyEvent { key, down });
}

fn emit_mouse(flags: u16) {
    if flags == 0 {
        return;
    }
    let Ok(state) = INPUT_STATE.lock() else {
        return;
    };
    let Some(state) = state.as_ref() else {
        return;
    };
    // Report anything except left/right buttons and the wheels (RI_MOUSE_WHEEL, RI_MOUSE_HWHEEL).
    if flags & !(0x000f | 0x0400 | 0x0800) != 0 {
        if let Some(sender) = state.raw_mouse.as_ref() {
            let _ = sender.send(RawMouseEvent {
                button_flags: flags,
            });
        }
    }
    for (key, down) in mouse_events_from_button_flags(flags) {
        let _ = state.sender.send(HotkeyEvent { key, down });
    }
}

fn post_stop(hwnd: isize) {
    if hwnd == 0 {
        return;
    }
    let _ = unsafe {
        windows::Win32::UI::WindowsAndMessaging::PostMessageW(
            Some(HWND(hwnd as *mut _)),
            WM_RINGPAD_STOP,
            WPARAM(0),
            LPARAM(0),
        )
    };
}

fn clear_input_state() {
    if let Ok(mut state) = INPUT_STATE.lock() {
        *state = None;
    }
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
