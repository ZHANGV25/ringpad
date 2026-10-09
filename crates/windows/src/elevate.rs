//! Runs a program through the Windows admin prompt and waits for it to finish.

use std::path::Path;
use std::time::Duration;

/// How an elevated run ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElevatedRun {
    /// The program ran and exited with this code.
    Exited(u32),
    /// The user answered No at the admin prompt.
    Declined,
    /// The program was still running when the time limit passed.
    TimedOut,
}

/// Starts `program` with `args` as administrator (Windows asks the user first) and waits up to
/// `limit` for it to exit. The program's own folder is its working directory.
#[cfg(windows)]
pub fn run_elevated(
    program: &Path,
    args: &str,
    limit: Duration,
) -> Result<ElevatedRun, crate::BackendError> {
    use std::ffi::OsStr;
    use std::mem::size_of;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, ERROR_CANCELLED, WAIT_OBJECT_0, WAIT_TIMEOUT};
    use windows::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject};
    use windows::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let wide = |text: &OsStr| -> Vec<u16> { text.encode_wide().chain(Some(0)).collect() };
    let verb = wide(OsStr::new("runas"));
    let file = wide(program.as_os_str());
    let params = wide(OsStr::new(args));
    let folder = program.parent().map(|parent| wide(parent.as_os_str()));
    let mut info = SHELLEXECUTEINFOW {
        cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC,
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: PCWSTR(params.as_ptr()),
        lpDirectory: folder
            .as_ref()
            .map_or(PCWSTR::null(), |folder| PCWSTR(folder.as_ptr())),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    // SAFETY: `info` is fully initialised and every string it points to outlives the call.
    if let Err(error) = unsafe { ShellExecuteExW(&mut info) } {
        if error.code() == ERROR_CANCELLED.to_hresult() {
            return Ok(ElevatedRun::Declined);
        }
        return Err(crate::BackendError::Launch(format!(
            "{}: {error}",
            program.display()
        )));
    }
    let process = info.hProcess;
    if process.is_invalid() {
        // Windows handed the run to an existing process; nothing to wait on.
        return Ok(ElevatedRun::Exited(0));
    }
    let millis = u32::try_from(limit.as_millis()).unwrap_or(u32::MAX - 1);
    // SAFETY: `process` is a live handle owned here and closed below.
    let waited = unsafe { WaitForSingleObject(process, millis) };
    let result = if waited == WAIT_OBJECT_0 {
        let mut code = 0u32;
        // SAFETY: as above; `code` is a valid out pointer.
        unsafe { GetExitCodeProcess(process, &mut code) }
            .map(|()| ElevatedRun::Exited(code))
            .map_err(|error| crate::BackendError::Launch(error.to_string()))
    } else if waited == WAIT_TIMEOUT {
        Ok(ElevatedRun::TimedOut)
    } else {
        Err(crate::BackendError::Launch(format!(
            "waiting for {} failed",
            program.display()
        )))
    };
    // SAFETY: the handle came from ShellExecuteExW and is not used after this.
    let _ = unsafe { CloseHandle(process) };
    result
}

/// Starts `program` as administrator. Only Windows has an admin prompt.
#[cfg(not(windows))]
pub fn run_elevated(
    program: &Path,
    _args: &str,
    _limit: Duration,
) -> Result<ElevatedRun, crate::BackendError> {
    Err(crate::BackendError::Launch(format!(
        "{}: needs Windows",
        program.display()
    )))
}
