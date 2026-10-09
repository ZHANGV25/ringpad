//! App-side talk controller and crash-marker handling.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use ringpad_core::talk::{Talk, TalkConfig};
use ringpad_windows::{KeyOutput, TalkKeyError};

use crate::dto::TalkState;
use crate::settings::Settings;

const CRASH_MARKER: &str = "talk-held.json";

/// Coordinates core talk state, key output, and the persisted crash marker.
pub struct TalkController {
    talk: Talk,
    output: Box<dyn KeyOutput>,
    game_keys: Vec<String>,
    talk_only_app: Option<String>,
    data_dir: PathBuf,
    blocked: Option<String>,
    last_sent: TalkState,
    test_until: Option<f64>,
}

impl TalkController {
    /// Creates a talk controller from settings and a key output implementation.
    #[must_use]
    pub fn new(settings: Settings, output: Box<dyn KeyOutput>, data_dir: PathBuf) -> Self {
        let talk = Talk::new(config_from_settings(&settings));
        let mut controller = Self {
            talk,
            output,
            game_keys: settings.game_talk_keys.clone(),
            talk_only_app: settings.talk_only_app.clone(),
            data_dir,
            blocked: None,
            last_sent: TalkState {
                mic_open: true,
                holding: Vec::new(),
                blocked: None,
            },
            test_until: None,
        };
        controller.last_sent = controller.snapshot();
        controller
    }

    /// Applies new settings and returns a changed talk event, when any.
    pub fn apply_settings(&mut self, settings: &Settings) -> Option<TalkState> {
        self.talk.set_config(config_from_settings(settings));
        self.game_keys.clone_from(&settings.game_talk_keys);
        self.talk_only_app.clone_from(&settings.talk_only_app);
        self.changed()
    }

    /// Applies a Ringpad talk-key edge.
    pub fn on_talk_key(&mut self, down: bool) -> Option<TalkState> {
        self.talk.talk_key(down);
        self.changed()
    }

    /// Stops talk state and releases all held keys.
    pub fn stop(&mut self) -> Option<TalkState> {
        self.talk.stop();
        self.output.release_all();
        self.blocked = None;
        self.write_marker();
        self.changed()
    }

    /// Records a clip or pad start and syncs game talk keys immediately.
    pub fn before_clip(&mut self, now: f64) -> (Duration, Option<TalkState>) {
        let allowed = self.keys_allowed();
        let wait = self.talk.clip_requested(now, allowed);
        let changed = self.sync(now, false, allowed);
        (Duration::from_secs_f64(wait), changed)
    }

    /// Ticks the talk controller.
    pub fn tick(&mut self, now: f64, sending: bool) -> Option<TalkState> {
        if self.test_until.is_some_and(|until| now < until) {
            return self.changed();
        }
        self.test_until = None;
        let allowed = self.keys_allowed();
        self.sync(now, sending, allowed)
    }

    /// Starts a two-second test hold.
    pub fn start_test(&mut self, now: f64) -> Result<Option<TalkState>, String> {
        self.test_until = Some(now + 2.0);
        self.output
            .hold(&self.game_keys)
            .map_err(|error| error.to_string())?;
        self.blocked = None;
        self.write_marker();
        Ok(self.changed())
    }

    /// Ends a test hold.
    pub fn finish_test(&mut self) -> Option<TalkState> {
        self.test_until = None;
        self.output.release_all();
        self.write_marker();
        self.changed()
    }

    /// Releases all held game talk keys.
    pub fn release_all(&mut self) {
        self.output.release_all();
        self.write_marker();
    }

    /// Returns true when the key was recently sent by Ringpad.
    #[must_use]
    pub fn recently_sent(&self, key: &str) -> bool {
        self.output.recently_sent(key)
    }

    /// Returns the current mic gate value.
    #[must_use]
    pub fn mic_open(&self) -> bool {
        self.talk.mic_open()
    }

    /// Returns the current UI state.
    #[must_use]
    pub fn snapshot(&self) -> TalkState {
        TalkState {
            mic_open: self.talk.mic_open(),
            holding: self.output.holding(),
            blocked: self.blocked.clone(),
        }
    }

    fn sync(&mut self, now: f64, sending: bool, keys_allowed: bool) -> Option<TalkState> {
        if self.talk.want_keys(now, sending, keys_allowed) {
            match self.output.hold(&self.game_keys) {
                Ok(()) => self.blocked = None,
                Err(TalkKeyError::Blocked(message)) => self.blocked = Some(message),
                Err(error) => self.blocked = Some(error.to_string()),
            }
        } else {
            self.output.release_all();
            self.blocked = None;
        }
        self.write_marker();
        self.changed()
    }

    fn keys_allowed(&self) -> bool {
        let Some(only_app) = self.talk_only_app.as_deref() else {
            return true;
        };
        ringpad_windows::talk_keys::foreground_exe()
            .is_some_and(|exe| exe.eq_ignore_ascii_case(only_app))
    }

    fn changed(&mut self) -> Option<TalkState> {
        let state = self.snapshot();
        if state == self.last_sent {
            None
        } else {
            self.last_sent = state.clone();
            Some(state)
        }
    }

    fn write_marker(&self) {
        let holding = self.output.holding();
        let path = marker_path(&self.data_dir);
        if holding.is_empty() {
            let _ = fs::remove_file(path);
            return;
        }
        if let Err(error) = fs::create_dir_all(&self.data_dir) {
            log::warn!("talk marker directory failed: {error}");
            return;
        }
        match serde_json::to_vec(&holding) {
            Ok(bytes) => {
                if let Err(error) = fs::write(path, bytes) {
                    log::warn!("talk marker write failed: {error}");
                }
            }
            Err(error) => log::warn!("talk marker serialize failed: {error}"),
        }
    }
}

/// Releases keys from a previous crashed run and removes its marker.
pub fn release_crash_marker(data_dir: &Path) {
    let path = marker_path(data_dir);
    let keys = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Vec<String>>(&bytes).ok());
    if let Some(keys) = keys {
        ringpad_windows::talk_keys::release_keys(&keys);
    }
    let _ = fs::remove_file(path);
}

fn config_from_settings(settings: &Settings) -> TalkConfig {
    TalkConfig {
        mic_mode: settings.mic_mode.into(),
        press_mode: settings.press_talk_keys.into(),
        lead_seconds: f64::from(settings.talk_lead_ms) / 1000.0,
        tail_seconds: f64::from(settings.talk_tail_ms) / 1000.0,
    }
}

fn marker_path(data_dir: &Path) -> PathBuf {
    data_dir.join(CRASH_MARKER)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{MicModeSetting, PressTalkKeysSetting};
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct FakeState {
        held: Vec<String>,
        fail: Option<String>,
    }

    struct FakeOutput(Arc<Mutex<FakeState>>);

    impl KeyOutput for FakeOutput {
        fn hold(&mut self, keys: &[String]) -> Result<(), TalkKeyError> {
            let mut state = self
                .0
                .lock()
                .map_err(|error| TalkKeyError::Blocked(format!("fake lock failed: {error}")))?;
            if let Some(message) = state.fail.clone() {
                return Err(TalkKeyError::Blocked(message));
            }
            state.held = keys.to_vec();
            Ok(())
        }

        fn release_all(&mut self) {
            if let Ok(mut state) = self.0.lock() {
                state.held.clear();
            }
        }

        fn holding(&self) -> Vec<String> {
            self.0
                .lock()
                .map(|state| state.held.clone())
                .unwrap_or_default()
        }

        fn recently_sent(&self, key: &str) -> bool {
            self.0
                .lock()
                .is_ok_and(|state| state.held.iter().any(|held| held == key))
        }
    }

    fn controller(
        settings: Settings,
    ) -> (TalkController, Arc<Mutex<FakeState>>, tempfile::TempDir) {
        let fake = Arc::new(Mutex::new(FakeState::default()));
        let dir = tempfile::tempdir().expect("tempdir");
        (
            TalkController::new(
                settings,
                Box::new(FakeOutput(Arc::clone(&fake))),
                dir.path().to_path_buf(),
            ),
            fake,
            dir,
        )
    }

    fn settings() -> Settings {
        Settings {
            press_talk_keys: PressTalkKeysSetting::Clips,
            game_talk_keys: vec!["v".to_string()],
            ..Settings::default()
        }
    }

    #[test]
    fn clip_in_clips_mode_holds_then_releases_after_tail() {
        let (mut talk, _fake, _dir) = controller(settings());
        let (lead, _) = talk.before_clip(1.0);
        assert_eq!(lead, Duration::from_millis(100));
        assert_eq!(talk.snapshot().holding, vec!["v"]);
        assert!(talk.tick(1.2, true).is_none());
        assert!(talk.tick(1.45, false).is_none());
        let changed = talk.tick(1.451, false).expect("released");
        assert!(changed.holding.is_empty());
    }

    #[test]
    fn lead_is_zero_when_already_holding() {
        let (mut talk, _fake, _dir) = controller(settings());
        assert_eq!(talk.before_clip(1.0).0, Duration::from_millis(100));
        assert_eq!(talk.before_clip(1.01).0, Duration::ZERO);
    }

    #[test]
    fn toggle_clips_and_mic_holds_until_next_press() {
        let mut settings = settings();
        settings.mic_mode = MicModeSetting::Toggle;
        settings.press_talk_keys = PressTalkKeysSetting::ClipsAndMic;
        let (mut talk, _fake, _dir) = controller(settings);
        talk.on_talk_key(true);
        talk.on_talk_key(false);
        assert_eq!(talk.tick(1.0, false).expect("hold").holding, vec!["v"]);
        talk.on_talk_key(true);
        talk.on_talk_key(false);
        assert!(talk.tick(1.251, false).expect("release").holding.is_empty());
    }

    #[test]
    fn ptt_controls_the_mic_gate() {
        let mut settings = settings();
        settings.mic_mode = MicModeSetting::PushToTalk;
        let (mut talk, _fake, _dir) = controller(settings);
        assert!(!talk.mic_open());
        talk.on_talk_key(true);
        assert!(talk.mic_open());
        talk.on_talk_key(false);
        assert!(!talk.mic_open());
    }

    #[test]
    fn blocked_sets_and_success_clears() {
        let (mut talk, fake, _dir) = controller(settings());
        fake.lock().expect("fake").fail = Some("blocked".to_string());
        assert_eq!(
            talk.before_clip(1.0).1.expect("blocked").blocked.as_deref(),
            Some("blocked")
        );
        fake.lock().expect("fake").fail = None;
        assert_eq!(talk.tick(1.01, false).expect("clear").blocked, None);
    }

    #[test]
    fn app_mismatch_never_holds_and_stop_releases() {
        let mut gated = settings();
        gated.talk_only_app = Some("not-the-foreground.exe".to_string());
        let (mut talk, _fake, _dir) = controller(gated);
        assert_eq!(talk.before_clip(1.0).0, Duration::ZERO);
        assert!(talk.snapshot().holding.is_empty());

        let (mut talk, _fake, _dir) = controller(settings());
        talk.before_clip(2.0);
        assert!(!talk.snapshot().holding.is_empty());
        assert!(talk.stop().expect("stop").holding.is_empty());
    }

    #[test]
    fn crash_marker_is_written_and_removed() {
        let (mut talk, _fake, dir) = controller(settings());
        talk.before_clip(1.0);
        assert!(dir.path().join(CRASH_MARKER).exists());
        talk.stop();
        assert!(!dir.path().join(CRASH_MARKER).exists());
    }
}
