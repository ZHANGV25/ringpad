//! Runs COM work on a thread of its own, so callers keep their COM apartment.

/// Runs `work` on a short-lived thread initialised for multithreaded COM.
///
/// Enumerating devices on the caller's thread would initialise it as multithreaded COM,
/// and a UI thread that later needs single-threaded COM (OLE drag and drop) would then
/// fail to start its window.
#[cfg(windows)]
pub(crate) fn on_mta_thread<T: Send>(
    work: impl FnOnce() -> Result<T, crate::BackendError> + Send,
) -> Result<T, crate::BackendError> {
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let _ = wasapi::initialize_mta();
                work()
            })
            .join()
            .unwrap_or_else(|_| {
                Err(crate::BackendError::ThreadStart(
                    "COM worker panicked".to_string(),
                ))
            })
    })
}
