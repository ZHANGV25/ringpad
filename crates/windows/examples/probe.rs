#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    use ringpad_windows::devices::{
        list_devices, matching_capture_side, pick_headphones, pick_mic, pick_virtual_output,
    };
    use ringpad_windows::hotkeys::HotkeyListener;
    use ringpad_windows::sessions::list_audio_apps;

    let seconds = std::env::args()
        .nth(1)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(120);
    let devices = list_devices()?;
    for device in &devices {
        println!(
            "{:?} default={} {:?}: {} ({})",
            device.direction, device.is_default, device.virtual_cable, device.name, device.id
        );
    }
    match pick_virtual_output(&devices, None) {
        Ok(device) => {
            println!("virtual output: {}", device.name);
            if let Some(capture) = matching_capture_side(&device, &devices) {
                println!("matching capture side: {}", capture.name);
            }
        }
        Err(error) => println!("virtual output: {error}"),
    }
    println!(
        "mic: {:?}",
        pick_mic(&devices, None).map(|d| d.map(|d| d.name))
    );
    println!(
        "headphones: {:?}",
        pick_headphones(&devices, None).map(|d| d.name)
    );

    let (key_tx, key_rx) = mpsc::channel();
    let (raw_key_tx, raw_key_rx) = mpsc::channel();
    let (raw_mouse_tx, raw_mouse_rx) = mpsc::channel();
    let _listener = HotkeyListener::start_with_raw(key_tx, Some(raw_key_tx), Some(raw_mouse_tx))?;

    let deadline = Instant::now() + Duration::from_secs(seconds);
    let mut last_apps = Vec::new();
    while Instant::now() < deadline {
        while let Ok(event) = key_rx.try_recv() {
            println!("key {} down={}", event.key, event.down);
        }
        while let Ok(event) = raw_key_rx.try_recv() {
            println!(
                "raw key vk=0x{:02x} scan=0x{:02x} flags=0x{:04x}",
                event.vkey, event.scan_code, event.flags
            );
        }
        while let Ok(event) = raw_mouse_rx.try_recv() {
            println!("raw mouse button_flags=0x{:04x}", event.button_flags);
        }
        let apps = list_audio_apps()?;
        let app_state: Vec<_> = apps
            .iter()
            .map(|app| (app.pid, app.exe_name.clone(), app.active))
            .collect();
        if app_state != last_apps {
            for app in &apps {
                println!(
                    "app pid={} exe={} display={} active={} peak={:.3}",
                    app.pid, app.exe_name, app.display_name, app.active, app.peak
                );
            }
            last_apps = app_state;
        }
        std::thread::sleep(Duration::from_millis(1000));
    }
    Ok(())
}

#[cfg(not(windows))]
fn main() {
    eprintln!("probe is only available on Windows");
}
