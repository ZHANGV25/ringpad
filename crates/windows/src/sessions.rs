//! Audio-session discovery and process resolution.

use std::collections::BTreeMap;

use thiserror::Error;

/// A process that owns one or more audio sessions.
#[derive(Debug, Clone, PartialEq)]
pub struct AudioApp {
    /// Windows process id.
    pub pid: u32,
    /// Executable file name only.
    pub exe_name: String,
    /// Session display name or executable stem.
    pub display_name: String,
    /// Whether any merged session is active.
    pub active: bool,
    /// Maximum peak meter value among merged sessions.
    pub peak: f32,
}

/// Errors from app/session lookup.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum SessionError {
    /// No process or session matched the executable name.
    #[error("app '{0}' is not running")]
    AppNotRunning(String),
    /// A Windows API call failed.
    #[error("{0}")]
    Windows(String),
}

/// Merges duplicate session entries by process id.
#[must_use]
pub fn merge_audio_apps(apps: impl IntoIterator<Item = AudioApp>) -> Vec<AudioApp> {
    let mut by_pid = BTreeMap::<u32, AudioApp>::new();
    for app in apps {
        by_pid
            .entry(app.pid)
            .and_modify(|existing| {
                if app.active && !existing.active {
                    existing.exe_name.clone_from(&app.exe_name);
                    existing.display_name.clone_from(&app.display_name);
                }
                existing.active |= app.active;
                existing.peak = existing.peak.max(app.peak);
                if existing.display_name.is_empty() {
                    existing.display_name.clone_from(&app.display_name);
                }
            })
            .or_insert(app);
    }
    let mut merged: Vec<_> = by_pid.into_values().collect();
    sort_audio_apps(&mut merged);
    merged
}

/// Sorts active apps first, then by display name and executable name.
pub fn sort_audio_apps(apps: &mut [AudioApp]) {
    apps.sort_by(|left, right| {
        right
            .active
            .cmp(&left.active)
            .then_with(|| {
                left.display_name
                    .to_lowercase()
                    .cmp(&right.display_name.to_lowercase())
            })
            .then_with(|| {
                left.exe_name
                    .to_lowercase()
                    .cmp(&right.exe_name.to_lowercase())
            })
            .then_with(|| left.pid.cmp(&right.pid))
    });
}

/// Chooses the best pid for an executable from sessions and a process-list fallback.
pub fn resolve_app_pid_from(
    exe_name: &str,
    sessions: &[AudioApp],
    process_ids: &[u32],
) -> Result<u32, SessionError> {
    let matches_exe = |app: &&AudioApp| app.exe_name.eq_ignore_ascii_case(exe_name);
    if let Some(app) = sessions.iter().filter(matches_exe).find(|app| app.active) {
        return Ok(app.pid);
    }
    if let Some(app) = sessions
        .iter()
        .find(|app| app.exe_name.eq_ignore_ascii_case(exe_name))
    {
        return Ok(app.pid);
    }
    process_ids
        .first()
        .copied()
        .ok_or_else(|| SessionError::AppNotRunning(exe_name.to_string()))
}

/// Lists audio apps currently present in sessions on active output devices.
#[cfg(windows)]
pub fn list_audio_apps() -> Result<Vec<AudioApp>, crate::BackendError> {
    crate::com::on_mta_thread(enumerate_audio_apps)
}

#[cfg(windows)]
fn enumerate_audio_apps() -> Result<Vec<AudioApp>, crate::BackendError> {
    use wasapi::{DeviceEnumerator, Direction, SessionState};

    let self_pid = std::process::id();
    let enumerator = DeviceEnumerator::new().map_err(crate::BackendError::from_wasapi)?;
    let collection = enumerator
        .get_device_collection(&Direction::Render)
        .map_err(crate::BackendError::from_wasapi)?;
    let mut apps = Vec::new();
    for device in &collection {
        let device = device.map_err(crate::BackendError::from_wasapi)?;
        let manager = device
            .get_iaudiosessionmanager()
            .map_err(crate::BackendError::from_wasapi)?;
        let sessions = manager
            .get_audiosessionenumerator()
            .map_err(crate::BackendError::from_wasapi)?;
        for index in 0..sessions
            .get_count()
            .map_err(crate::BackendError::from_wasapi)?
        {
            let control = sessions
                .get_session(index)
                .map_err(crate::BackendError::from_wasapi)?;
            let pid = control
                .get_process_id()
                .map_err(crate::BackendError::from_wasapi)?;
            if pid == 0 || pid == self_pid {
                continue;
            }
            let active = control
                .get_state()
                .map_err(crate::BackendError::from_wasapi)?
                == SessionState::Active;
            let exe_name = exe_name_for_pid(pid).unwrap_or_else(|| format!("pid-{pid}"));
            let display_name = display_name_or_exe_stem(
                &control
                    .get_display_name()
                    .map_err(crate::BackendError::from_wasapi)?,
                &exe_name,
            );
            let peak = control
                .get_audiometerinformation()
                .and_then(|meter| meter.get_peak_value())
                .unwrap_or(0.0);
            apps.push(AudioApp {
                pid,
                exe_name,
                display_name,
                active,
                peak,
            });
        }
    }
    Ok(merge_audio_apps(apps))
}

/// Lists audio apps currently present in sessions on active output devices.
#[cfg(not(windows))]
pub fn list_audio_apps() -> Result<Vec<AudioApp>, crate::BackendError> {
    Ok(Vec::new())
}

/// Returns every process id whose executable file name matches `exe_name`.
#[cfg(windows)]
pub fn process_ids_by_exe(exe_name: &str) -> Result<Vec<u32>, crate::BackendError> {
    process_ids_by_exe_impl(exe_name)
        .map_err(|error| crate::BackendError::ThreadStart(error.to_string()))
}

/// Returns every process id whose executable file name matches `exe_name`.
#[cfg(not(windows))]
pub fn process_ids_by_exe(_exe_name: &str) -> Result<Vec<u32>, crate::BackendError> {
    Ok(Vec::new())
}

/// Resolves an executable name to the preferred capture process id.
pub fn resolve_app_pid(exe_name: &str) -> Result<u32, crate::BackendError> {
    let sessions = list_audio_apps()?;
    let pids = process_ids_by_exe(exe_name)?;
    resolve_app_pid_from(exe_name, &sessions, &pids).map_err(crate::BackendError::from)
}

#[cfg(windows)]
#[must_use]
fn display_name_or_exe_stem(display_name: &str, exe_name: &str) -> String {
    if !display_name.trim().is_empty() {
        return display_name.to_string();
    }
    exe_name
        .rsplit_once('.')
        .map(|(stem, _ext)| stem)
        .unwrap_or(exe_name)
        .to_string()
}

#[cfg(windows)]
fn exe_name_for_pid(pid: u32) -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()? };
    let mut buffer = [0u16; 32768];
    let mut len = buffer.len() as u32;
    let result = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR(buffer.as_mut_ptr()),
            &mut len,
        )
    };
    let _ = unsafe { CloseHandle(handle) };
    result.ok()?;
    let path = String::from_utf16_lossy(&buffer[..len as usize]);
    path.rsplit(['\\', '/']).next().map(str::to_string)
}

#[cfg(windows)]
fn process_ids_by_exe_impl(exe_name: &str) -> Result<Vec<u32>, SessionError> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }
        .map_err(|error| SessionError::Windows(error.to_string()))?;
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut pids = Vec::new();
    let mut current = unsafe { Process32FirstW(snapshot, &mut entry) }.is_ok();
    while current {
        let name = nul_terminated_utf16(&entry.szExeFile);
        if name.eq_ignore_ascii_case(exe_name) {
            pids.push(entry.th32ProcessID);
        }
        current = unsafe { Process32NextW(snapshot, &mut entry) }.is_ok();
    }
    let _ = unsafe { CloseHandle(snapshot) };
    Ok(pids)
}

#[cfg(windows)]
fn nul_terminated_utf16(value: &[u16]) -> String {
    let len = value.iter().position(|ch| *ch == 0).unwrap_or(value.len());
    String::from_utf16_lossy(&value[..len])
}
