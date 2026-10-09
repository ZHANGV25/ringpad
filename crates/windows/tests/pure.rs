use ringpad_windows::devices::{
    classify_device_name, matching_capture_side, pick_headphones, pick_mic, pick_virtual_output,
    DeviceDirection, DeviceInfo, DevicePickError, VirtualCable,
};
use ringpad_windows::hotkeys::{key_name_from_vkey, mouse_events_from_button_flags};
use ringpad_windows::mixdown::{mono_to_stereo_bytes, stereo_bytes_to_mono};
use ringpad_windows::sessions::{merge_audio_apps, resolve_app_pid_from, AudioApp, SessionError};
use ringpad_windows::watcher::{snapshot_changed, DeviceSnapshot};
use ringpad_windows::{ServiceConfig, SourceSpec};

fn device(id: &str, name: &str, direction: DeviceDirection, is_default: bool) -> DeviceInfo {
    DeviceInfo {
        id: id.to_string(),
        name: name.to_string(),
        direction,
        is_default,
        virtual_cable: classify_device_name(name),
    }
}

#[test]
fn classifies_known_virtual_cables_case_insensitively() {
    assert_eq!(
        classify_device_name("CABLE Input (VB-Audio Virtual Cable)"),
        Some(VirtualCable::VbCable)
    );
    assert_eq!(
        classify_device_name("Microphone (Voicemod Virtual Audio Device)"),
        Some(VirtualCable::Voicemod)
    );
    assert_eq!(
        classify_device_name("VoiceMeeter Input"),
        Some(VirtualCable::VoiceMeeter)
    );
    assert_eq!(classify_device_name("Speakers"), None);
}

#[test]
fn virtual_output_prefers_saved_active_then_best_known_name() {
    let devices = vec![
        device("vm", "Line (Voicemod)", DeviceDirection::Output, false),
        device("vb", "CABLE Input", DeviceDirection::Output, false),
    ];
    assert_eq!(
        pick_virtual_output(&devices, Some("vm")).expect("saved").id,
        "vm"
    );
    assert_eq!(pick_virtual_output(&devices, None).expect("best").id, "vb");
}

#[test]
fn virtual_output_errors_without_virtual_cable() {
    let devices = vec![device("spk", "Speakers", DeviceDirection::Output, true)];
    assert_eq!(
        pick_virtual_output(&devices, None),
        Err(DevicePickError::NoVirtualCable)
    );
}

#[test]
fn mic_uses_default_non_virtual_then_first_real_and_allows_none() {
    let devices = vec![
        device("vc", "CABLE Output", DeviceDirection::Input, true),
        device("mic", "USB Mic", DeviceDirection::Input, false),
    ];
    assert_eq!(
        pick_mic(&devices, None).expect("fallback").unwrap().id,
        "mic"
    );
    assert!(pick_mic(&[], None).expect("none").is_none());
}

#[test]
fn mic_rejects_saved_virtual_device() {
    let devices = vec![device("vc", "CABLE Output", DeviceDirection::Input, false)];
    assert!(matches!(
        pick_mic(&devices, Some("vc")),
        Err(DevicePickError::SavedMicIsVirtual(_))
    ));
}

#[test]
fn headphones_reject_virtual_defaults() {
    let devices = vec![device("vc", "CABLE Input", DeviceDirection::Output, true)];
    assert!(matches!(
        pick_headphones(&devices, None),
        Err(DevicePickError::HeadphonesAreVirtual(_))
    ));
}

#[test]
fn matching_capture_side_finds_family_pair() {
    let output = device("out", "CABLE Input", DeviceDirection::Output, false);
    let devices = vec![device("in", "CABLE Output", DeviceDirection::Input, false)];
    assert_eq!(
        matching_capture_side(&output, &devices)
            .expect("capture")
            .id,
        "in"
    );
}

#[test]
fn stereo_bytes_to_mono_ignores_partial_frames() {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&1.0_f32.to_le_bytes());
    bytes.extend_from_slice(&3.0_f32.to_le_bytes());
    bytes.extend_from_slice(&9.0_f32.to_le_bytes());
    let mut out = [0.0; 2];
    assert_eq!(stereo_bytes_to_mono(&bytes, &mut out), 1);
    assert_eq!(out[0], 2.0);
}

#[test]
fn mono_to_stereo_bytes_duplicates_samples() {
    let mut bytes = [0_u8; 16];
    assert_eq!(mono_to_stereo_bytes(&[0.25, -0.5], &mut bytes), 2);
    let mut round_trip = [0.0; 2];
    assert_eq!(stereo_bytes_to_mono(&bytes, &mut round_trip), 2);
    assert_eq!(round_trip, [0.25, -0.5]);
}

#[test]
fn merge_audio_apps_combines_pid_active_and_peak_then_sorts() {
    let apps = merge_audio_apps([
        app(2, "game.exe", "Game", false, 0.2),
        app(1, "chat.exe", "Chat", false, 0.4),
        app(2, "game.exe", "Game", true, 0.7),
    ]);
    assert_eq!(apps[0].pid, 2);
    assert!(apps[0].active);
    assert_eq!(apps[0].peak, 0.7);
    assert_eq!(apps[1].pid, 1);
}

#[test]
fn resolve_app_pid_prefers_active_session_then_any_session_then_process() {
    let sessions = vec![
        app(10, "game.exe", "Game", false, 0.0),
        app(11, "game.exe", "Game", true, 0.0),
    ];
    assert_eq!(
        resolve_app_pid_from("GAME.EXE", &sessions, &[99]).expect("active"),
        11
    );
    assert_eq!(
        resolve_app_pid_from("other.exe", &sessions, &[99]).expect("process"),
        99
    );
    assert_eq!(
        resolve_app_pid_from("missing.exe", &[], &[]),
        Err(SessionError::AppNotRunning("missing.exe".to_string()))
    );
}

#[test]
fn snapshot_comparison_catches_devices_and_defaults() {
    let a = DeviceSnapshot::from_devices(&[device("a", "Speakers", DeviceDirection::Output, true)]);
    let b = DeviceSnapshot::from_devices(&[device("b", "Mic", DeviceDirection::Input, true)]);
    assert!(snapshot_changed(None, &a));
    assert!(!snapshot_changed(Some(&a), &a));
    assert!(snapshot_changed(Some(&a), &b));
}

#[test]
fn key_mapping_distinguishes_sides_and_numpad() {
    assert_eq!(key_name_from_vkey(0x10, 0x2a, 0), "lshift");
    assert_eq!(key_name_from_vkey(0x10, 0x36, 0), "rshift");
    assert_eq!(key_name_from_vkey(0x11, 0x1d, 0x02), "rctrl");
    assert_eq!(key_name_from_vkey(0x12, 0x38, 0), "lalt");
    assert_eq!(key_name_from_vkey(0x0d, 0x1c, 0x02), "numenter");
    assert_eq!(key_name_from_vkey(0x24, 0x47, 0), "num7");
    assert_eq!(key_name_from_vkey(0x24, 0x47, 0x02), "home");
    assert_eq!(key_name_from_vkey(0x7c, 0, 0), "f13");
    assert_eq!(key_name_from_vkey(0xff, 0, 0), "vkff");
}

#[test]
fn mouse_mapping_reports_middle_and_side_buttons_only() {
    assert_eq!(
        mouse_events_from_button_flags(0x0010 | 0x0080 | 0x0100),
        vec![
            ("mouse3".to_string(), true),
            ("mouse4".to_string(), false),
            ("mouse5".to_string(), true),
        ]
    );
    assert!(mouse_events_from_button_flags(0x0001 | 0x0002).is_empty());
}

fn app(pid: u32, exe_name: &str, display_name: &str, active: bool, peak: f32) -> AudioApp {
    AudioApp {
        pid,
        exe_name: exe_name.to_string(),
        display_name: display_name.to_string(),
        active,
        peak,
    }
}

fn service_config(source: SourceSpec, headphones: Option<&str>) -> ServiceConfig {
    ServiceConfig {
        source,
        virtual_output_id: "cable".to_string(),
        mic_id: None,
        headphones_id: headphones.map(str::to_string),
        send_volume: 0.5,
        monitor_volume: 0.6,
        ducking: true,
    }
}

#[test]
fn echo_gate_turns_on_only_when_the_source_records_the_headphones() {
    let default_loopback = service_config(SourceSpec::DefaultOutputLoopback, Some("phones"));
    assert!(
        default_loopback
            .engine_config(Some("phones"))
            .recording_headphones
    );
    assert!(
        !default_loopback
            .engine_config(Some("speakers"))
            .recording_headphones
    );
    assert!(!default_loopback.engine_config(None).recording_headphones);

    let device = service_config(
        SourceSpec::DeviceLoopback("phones".to_string()),
        Some("phones"),
    );
    assert!(device.engine_config(None).recording_headphones);

    let app = service_config(SourceSpec::App("Discord.exe".to_string()), Some("phones"));
    assert!(!app.engine_config(Some("phones")).recording_headphones);

    let no_monitor = service_config(SourceSpec::DefaultOutputLoopback, None);
    let config = no_monitor.engine_config(Some("phones"));
    assert!(!config.recording_headphones);
    assert!(!config.monitoring);
}
