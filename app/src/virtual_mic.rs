//! Installs the bundled VB-CABLE when the PC has no virtual cable to use as Ringpad's mic.
//!
//! VB-CABLE is VB-Audio's donationware; see third_party/README.md for what Ringpad ships and why.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use ringpad_windows::elevate::{run_elevated, ElevatedRun};
use ringpad_windows::{DeviceDirection, DeviceInfo, VirtualCable};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::command_support::{emit, string_error};
use crate::dto;

/// Folder under the resource directory that holds the unzipped VB-CABLE pack.
pub const PACKAGE_DIR: &str = "vbcable";
/// VB-CABLE's 64-bit setup program.
pub const SETUP_EXE: &str = "VBCABLE_Setup_x64.exe";
/// Install (`-i`) without VB-CABLE's own window (`-h`). Windows still shows its driver prompt.
pub const SETUP_ARGS: &str = "-i -h";
/// Long enough for someone to read both Windows prompts.
const SETUP_LIMIT: Duration = Duration::from_secs(10 * 60);
/// Windows can take a few seconds to list a new device after its driver installs.
const APPEAR_LIMIT: Duration = Duration::from_secs(10);
const APPEAR_POLL: Duration = Duration::from_millis(500);
const MISSING: &str =
    "This copy of Ringpad is missing VB-CABLE's setup. Get VB-CABLE from vb-cable.com instead.";
const STILL_RUNNING: &str =
    "VB-CABLE's setup is still waiting for an answer. Finish it, then press Check again.";

/// How an install attempt ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallOutcome {
    /// VB-CABLE is installed and Windows lists it.
    Installed,
    /// The user answered No at the admin prompt.
    Declined,
    /// Setup finished but Windows does not list the cable yet. A restart finishes the install,
    /// unless the driver prompt was declined.
    NeedsRestart,
}

/// Installs VB-CABLE from the copy bundled with Ringpad.
#[tauri::command]
pub async fn install_virtual_mic(app: AppHandle) -> Result<InstallOutcome, String> {
    let setup = setup_path(&app.path().resource_dir().map_err(string_error)?);
    if !setup.is_file() {
        return Err(MISSING.to_string());
    }
    let (run, devices) = tauri::async_runtime::spawn_blocking(move || {
        let run = run_elevated(&setup, SETUP_ARGS, SETUP_LIMIT)?;
        let devices = match run {
            ElevatedRun::Exited(_) => wait_for_cable(),
            ElevatedRun::Declined | ElevatedRun::TimedOut => None,
        };
        Ok::<_, ringpad_windows::BackendError>((run, devices))
    })
    .await
    .map_err(string_error)?
    .map_err(string_error)?;
    let listed = devices.as_deref().is_some_and(has_vb_cable);
    log::info!("VB-CABLE setup: {run:?}, cable listed: {listed}");
    if let Some(devices) = devices {
        let dto: Vec<_> = devices.into_iter().map(dto::DeviceInfo::from).collect();
        emit(&app, "devices", dto);
    }
    outcome(run, listed)
}

/// Where the bundled setup program lives.
#[must_use]
pub fn setup_path(resource_dir: &Path) -> PathBuf {
    resource_dir.join(PACKAGE_DIR).join(SETUP_EXE)
}

/// Whether Windows lists VB-CABLE's playback side, the one Ringpad plays into.
#[must_use]
pub fn has_vb_cable(devices: &[DeviceInfo]) -> bool {
    devices.iter().any(|device| {
        device.direction == DeviceDirection::Output
            && device.virtual_cable == Some(VirtualCable::VbCable)
    })
}

/// Turns how setup ended, and whether the cable is listed, into what the UI says.
pub fn outcome(run: ElevatedRun, listed: bool) -> Result<InstallOutcome, String> {
    match run {
        ElevatedRun::Declined => Ok(InstallOutcome::Declined),
        ElevatedRun::TimedOut => Err(STILL_RUNNING.to_string()),
        ElevatedRun::Exited(_) if listed => Ok(InstallOutcome::Installed),
        ElevatedRun::Exited(_) => Ok(InstallOutcome::NeedsRestart),
    }
}

/// Lists devices until VB-CABLE shows up or the wait runs out; returns the last list.
fn wait_for_cable() -> Option<Vec<DeviceInfo>> {
    let started = Instant::now();
    loop {
        let devices = ringpad_windows::devices::list_devices().ok();
        let found = devices.as_deref().is_some_and(has_vb_cable);
        if found || started.elapsed() >= APPEAR_LIMIT {
            return devices;
        }
        std::thread::sleep(APPEAR_POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(name: &str, direction: DeviceDirection) -> DeviceInfo {
        DeviceInfo {
            id: name.to_string(),
            name: name.to_string(),
            direction,
            is_default: false,
            virtual_cable: ringpad_windows::devices::classify_device_name(name),
        }
    }

    fn package_dir() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../third_party/vb-cable")
    }

    #[test]
    fn finds_setup_in_the_bundled_folder() {
        let path = setup_path(Path::new("C:/Ringpad/resources"));
        assert_eq!(
            path,
            Path::new("C:/Ringpad/resources/vbcable/VBCABLE_Setup_x64.exe")
        );
    }

    #[test]
    fn counts_only_the_side_ringpad_plays_into() {
        let voicemod = device("Voicemod Virtual Audio Device", DeviceDirection::Output);
        let capture = device(
            "CABLE Output (VB-Audio Virtual Cable)",
            DeviceDirection::Input,
        );
        let playback = device(
            "CABLE Input (VB-Audio Virtual Cable)",
            DeviceDirection::Output,
        );
        assert!(!has_vb_cable(&[voicemod.clone(), capture.clone()]));
        assert!(has_vb_cable(&[voicemod, capture, playback]));
    }

    #[test]
    fn says_what_happened() {
        assert_eq!(
            outcome(ElevatedRun::Exited(0), true),
            Ok(InstallOutcome::Installed)
        );
        assert_eq!(
            outcome(ElevatedRun::Exited(0), false),
            Ok(InstallOutcome::NeedsRestart)
        );
        assert_eq!(
            outcome(ElevatedRun::Declined, false),
            Ok(InstallOutcome::Declined)
        );
        assert_eq!(
            outcome(ElevatedRun::TimedOut, false),
            Err(STILL_RUNNING.to_string())
        );
    }

    #[test]
    fn outcome_names_match_the_ipc_contract() {
        let names: Vec<_> = [
            InstallOutcome::Installed,
            InstallOutcome::Declined,
            InstallOutcome::NeedsRestart,
        ]
        .iter()
        .map(|outcome| serde_json::to_string(outcome).expect("serialize"))
        .collect();
        assert_eq!(names, ["\"installed\"", "\"declined\"", "\"needsRestart\""]);
    }

    #[test]
    fn ships_the_whole_pack_unchanged() {
        let dir = package_dir();
        for file in [
            SETUP_EXE,
            "readme.txt",
            "vbMmeCable64_win10.inf",
            "vbaudio_cable64_win10.cat",
            "vbaudio_cable64_win10.sys",
        ] {
            assert!(dir.join(file).is_file(), "{file} is missing");
        }
        // The catalog signs the INF byte for byte; a CRLF-to-LF checkout would break it.
        let inf = std::fs::read(dir.join("vbMmeCable64_win10.inf")).expect("inf");
        assert!(inf.windows(2).any(|pair| pair == b"\r\n"));
        let readme = std::fs::read(dir.join("readme.txt")).expect("readme");
        let credit = b"www.vb-cable.com";
        assert!(readme.windows(credit.len()).any(|part| part == credit));
    }

    #[test]
    fn installer_bundles_the_pack_where_the_command_looks() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
        let target = &config["bundle"]["resources"]["../third_party/vb-cable/*"];
        assert_eq!(target, &serde_json::json!(format!("{PACKAGE_DIR}/")));
    }
}
