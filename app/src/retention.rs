//! Clip retention cleanup.

use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};

use thiserror::Error;

/// Retention cleanup error.
#[derive(Debug, Error)]
pub enum RetentionError {
    /// Filesystem error.
    #[error("{0}")]
    Io(#[from] std::io::Error),
}

/// Deletes clip WAV files older than `retention_days`. Zero keeps everything.
pub fn cleanup_clips(
    dir: &Path,
    retention_days: u32,
    now: SystemTime,
) -> Result<(), RetentionError> {
    if retention_days == 0 {
        return Ok(());
    }
    let max_age = Duration::from_secs(u64::from(retention_days) * 24 * 60 * 60);
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if !metadata.is_file() || !is_wav(&entry.path()) {
            continue;
        }
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let age = now.duration_since(modified).unwrap_or(Duration::ZERO);
        if age > max_age {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn is_wav(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("wav"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deletes_files_older_than_retention() {
        let dir = tempfile::tempdir().expect("tempdir");
        let old = dir.path().join("old.wav");
        let fresh = dir.path().join("fresh.wav");
        let notes = dir.path().join("notes.txt");
        let now = SystemTime::now();
        let nine_days_ago = now - Duration::from_secs(9 * 24 * 60 * 60);
        for path in [&old, &fresh, &notes] {
            fs::write(path, b"data").expect("write");
        }
        for path in [&old, &notes] {
            fs::OpenOptions::new()
                .write(true)
                .open(path)
                .expect("open")
                .set_modified(nine_days_ago)
                .expect("set modified");
        }
        cleanup_clips(dir.path(), 7, now).expect("cleanup");
        assert!(!old.exists());
        assert!(fresh.exists());
        assert!(notes.exists(), "only clip WAVs are removed");
    }

    #[test]
    fn zero_retention_keeps_everything() {
        let dir = tempfile::tempdir().expect("tempdir");
        let old = dir.path().join("old.wav");
        fs::write(&old, b"old").expect("write old");
        cleanup_clips(dir.path(), 0, SystemTime::now()).expect("cleanup");
        assert!(old.exists());
    }
}
