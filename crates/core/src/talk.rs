//! Pure push-to-talk and game-talk-key state.

/// How Ringpad gates the real microphone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MicMode {
    /// The mic is always open.
    Open,
    /// The mic is open while the Ringpad talk key is held.
    PushToTalk,
    /// Each Ringpad talk-key press toggles the mic.
    Toggle,
}

/// When Ringpad should press the game's talk key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PressMode {
    /// Never press game talk keys.
    Off,
    /// Press game talk keys while clips or pads send audio.
    Clips,
    /// Press game talk keys for clips and for Ringpad talk-key mic activity.
    ClipsAndMic,
}

/// Talk behavior configuration.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TalkConfig {
    /// Mic gate mode.
    pub mic_mode: MicMode,
    /// Game-talk-key press mode.
    pub press_mode: PressMode,
    /// Seconds to hold keys before starting a clip when needed.
    pub lead_seconds: f64,
    /// Seconds to keep keys held after activity stops.
    pub tail_seconds: f64,
}

/// Talk state machine without clocks or OS calls.
pub struct Talk {
    config: TalkConfig,
    talk_down: bool,
    toggled: bool,
    pending_until: Option<f64>,
    tail_until: Option<f64>,
}

impl Talk {
    /// Creates talk state with `config`.
    #[must_use]
    pub fn new(config: TalkConfig) -> Self {
        Self {
            config,
            talk_down: false,
            toggled: false,
            pending_until: None,
            tail_until: None,
        }
    }

    /// Replaces the configuration.
    pub fn set_config(&mut self, config: TalkConfig) {
        if self.config.mic_mode != config.mic_mode {
            self.talk_down = false;
            self.toggled = false;
        }
        self.config = config;
    }

    /// Applies a Ringpad talk-key edge.
    pub fn talk_key(&mut self, down: bool) {
        match self.config.mic_mode {
            MicMode::Open => {}
            MicMode::PushToTalk => self.talk_down = down,
            MicMode::Toggle if down && !self.talk_down => {
                self.toggled = !self.toggled;
                self.talk_down = true;
            }
            MicMode::Toggle => self.talk_down = down,
        }
    }

    /// Releases all talk state immediately.
    pub fn stop(&mut self) {
        self.talk_down = false;
        self.toggled = false;
        self.pending_until = None;
        self.tail_until = None;
    }

    /// Returns whether the real mic should be open.
    #[must_use]
    pub fn mic_open(&self) -> bool {
        match self.config.mic_mode {
            MicMode::Open => true,
            MicMode::PushToTalk => self.talk_down,
            MicMode::Toggle => self.toggled,
        }
    }

    /// Records an about-to-start clip or pad and returns required lead time.
    pub fn clip_requested(&mut self, now: f64, keys_allowed: bool) -> f64 {
        if self.config.press_mode == PressMode::Off || !keys_allowed {
            return 0.0;
        }
        let wait = if self.keys_wanted_at(now, false, keys_allowed) {
            0.0
        } else {
            self.config.lead_seconds.max(0.0)
        };
        self.pending_until = Some(now + wait + 0.25);
        wait
    }

    /// Returns whether game talk keys should be held at `now`.
    pub fn want_keys(&mut self, now: f64, sending: bool, keys_allowed: bool) -> bool {
        if self.config.press_mode == PressMode::Off || !keys_allowed {
            self.tail_until = None;
            if !keys_allowed {
                self.pending_until = None;
            }
            return false;
        }
        if sending {
            self.pending_until = None;
        }
        if self.active_at(now, sending) {
            self.tail_until = Some(now + self.config.tail_seconds.max(0.0));
            true
        } else {
            self.tail_until.is_some_and(|until| now <= until)
        }
    }

    fn keys_wanted_at(&self, now: f64, sending: bool, keys_allowed: bool) -> bool {
        self.config.press_mode != PressMode::Off
            && keys_allowed
            && (self.active_at(now, sending) || self.tail_until.is_some_and(|until| now <= until))
    }

    fn active_at(&self, now: f64, sending: bool) -> bool {
        sending
            || self.pending_until.is_some_and(|until| now <= until)
            || self.mic_activity_wants_keys()
    }

    fn mic_activity_wants_keys(&self) -> bool {
        self.config.press_mode == PressMode::ClipsAndMic
            && self.config.mic_mode != MicMode::Open
            && self.mic_open()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(mic_mode: MicMode, press_mode: PressMode) -> TalkConfig {
        TalkConfig {
            mic_mode,
            press_mode,
            lead_seconds: 0.1,
            tail_seconds: 0.25,
        }
    }

    #[test]
    fn mic_modes_follow_their_rules() {
        let mut open = Talk::new(config(MicMode::Open, PressMode::Off));
        open.talk_key(false);
        assert!(open.mic_open());

        let mut ptt = Talk::new(config(MicMode::PushToTalk, PressMode::Off));
        assert!(!ptt.mic_open());
        ptt.talk_key(true);
        assert!(ptt.mic_open());
        ptt.talk_key(false);
        assert!(!ptt.mic_open());

        let mut toggle = Talk::new(config(MicMode::Toggle, PressMode::Off));
        toggle.talk_key(true);
        assert!(toggle.mic_open());
        toggle.talk_key(true);
        assert!(toggle.mic_open());
        toggle.talk_key(false);
        assert!(toggle.mic_open());
        toggle.talk_key(true);
        assert!(!toggle.mic_open());
    }

    #[test]
    fn off_never_wants_keys() {
        let mut talk = Talk::new(config(MicMode::Toggle, PressMode::Off));
        talk.talk_key(true);
        assert_eq!(talk.clip_requested(0.0, true), 0.0);
        assert!(!talk.want_keys(0.0, true, true));
    }

    #[test]
    fn clips_want_keys_while_sending_and_for_tail() {
        let mut talk = Talk::new(config(MicMode::Open, PressMode::Clips));
        assert!(talk.want_keys(1.0, true, true));
        assert!(talk.want_keys(1.25, false, true));
        assert!(!talk.want_keys(1.251, false, true));
    }

    #[test]
    fn lead_only_when_not_already_wanted() {
        let mut talk = Talk::new(config(MicMode::Open, PressMode::Clips));
        assert_eq!(talk.clip_requested(1.0, true), 0.1);
        assert!(talk.want_keys(1.0, false, true));
        assert_eq!(talk.clip_requested(1.05, true), 0.0);
    }

    #[test]
    fn pending_clip_bridges_lead_and_gap_then_expires() {
        let mut talk = Talk::new(config(MicMode::Open, PressMode::Clips));
        assert_eq!(talk.clip_requested(2.0, true), 0.1);
        assert!(talk.want_keys(2.0, false, true));
        assert!(talk.want_keys(2.34, false, true));
        assert!(talk.want_keys(2.35, true, true));
        assert!(talk.want_keys(2.6, false, true));

        let mut expires = Talk::new(config(MicMode::Open, PressMode::Clips));
        assert_eq!(expires.clip_requested(3.0, true), 0.1);
        assert!(expires.want_keys(3.35, false, true));
        assert!(expires.want_keys(3.6, false, true));
        assert!(!expires.want_keys(3.601, false, true));
    }

    #[test]
    fn clips_and_mic_follows_non_open_mic_modes() {
        let mut ptt = Talk::new(config(MicMode::PushToTalk, PressMode::ClipsAndMic));
        ptt.talk_key(true);
        assert!(ptt.want_keys(0.0, false, true));
        ptt.talk_key(false);
        assert!(ptt.want_keys(0.25, false, true));
        assert!(!ptt.want_keys(0.251, false, true));

        let mut toggle = Talk::new(config(MicMode::Toggle, PressMode::ClipsAndMic));
        toggle.talk_key(true);
        assert!(toggle.want_keys(1.0, false, true));

        let mut open = Talk::new(config(MicMode::Open, PressMode::ClipsAndMic));
        assert!(!open.want_keys(1.0, false, true));
    }

    #[test]
    fn keys_allowed_false_is_immediate_and_does_not_record_pending() {
        let mut talk = Talk::new(config(MicMode::Open, PressMode::Clips));
        assert!(talk.want_keys(1.0, true, true));
        assert_eq!(talk.clip_requested(1.1, false), 0.0);
        assert!(!talk.want_keys(1.1, true, false));
        assert!(!talk.want_keys(1.2, false, true));
    }

    #[test]
    fn stop_and_set_config_reset_live_mic_state() {
        let mut talk = Talk::new(config(MicMode::Toggle, PressMode::ClipsAndMic));
        talk.talk_key(true);
        assert!(talk.mic_open());
        assert!(talk.want_keys(0.0, false, true));
        talk.stop();
        assert!(!talk.mic_open());
        assert!(!talk.want_keys(0.0, false, true));

        talk.talk_key(true);
        assert!(talk.mic_open());
        talk.set_config(config(MicMode::PushToTalk, PressMode::ClipsAndMic));
        assert!(!talk.mic_open());
    }
}
