mod common;

use std::sync::Arc;
use std::thread;

use common::{assert_all_approx, assert_approx, clip, ramp, RATE};
use ringpad_core::controls::{KeyEdge, SaveArm};
use ringpad_core::dsp::{
    fit_length, normalize, resample, to_channels, to_mono, trim_silence, StreamingResampler,
};
use ringpad_core::engine::{Engine, EngineConfig};
use ringpad_core::fifo::SampleFifo;
use ringpad_core::gate::EchoGate;
use ringpad_core::history::History;
use ringpad_core::pads::{PadBank, PadError};
use ringpad_core::player::ClipPlayer;

// test_to_mono_averages_interleaved_channels
#[test]
fn to_mono_averages_interleaved_channels() {
    assert_eq!(to_mono(&[1.0, 3.0, -2.0, 0.0], 2), vec![2.0, -1.0]);
}

// test_to_mono_passes_mono_through
#[test]
fn to_mono_passes_mono_through() {
    assert_eq!(to_mono(&[0.5, -0.5], 1), vec![0.5, -0.5]);
}

// test_to_channels_interleaves_copies
#[test]
fn to_channels_interleaves_copies() {
    assert_eq!(to_channels(&[1.0, 2.0], 2), vec![1.0, 1.0, 2.0, 2.0]);
}

// test_resample_same_rate_is_identity
#[test]
fn resample_same_rate_returns_equal_samples() {
    assert_eq!(resample(&ramp(10), 48_000, 48_000), ramp(10));
}

// test_resample_changes_length_by_rate_ratio
#[test]
fn resample_changes_length_by_rate_ratio() {
    assert_eq!(resample(&ramp(441), 44_100, 48_000).len(), 480);
}

// test_history_keeps_only_the_newest_capacity
#[test]
fn history_keeps_only_the_newest_capacity() {
    let history = History::new(5);
    for start in (0..12).step_by(3) {
        let chunk: Vec<f32> = ramp(3).into_iter().map(|v| v + start as f32).collect();
        history.push(&chunk);
    }
    assert_eq!(history.last(5), vec![7.0, 8.0, 9.0, 10.0, 11.0]);
}

// test_history_last_on_empty_is_empty
#[test]
fn history_last_on_empty_is_empty() {
    assert!(History::new(5).last(3).is_empty());
}

// test_history_last_returns_what_it_has_when_short
#[test]
fn history_last_returns_what_it_has_when_short() {
    let history = History::new(100);
    history.push(&ramp(4));
    assert_eq!(history.last(10), vec![0.0, 1.0, 2.0, 3.0]);
}

// test_trim_silence_cuts_quiet_edges_with_padding
#[test]
fn trim_silence_cuts_quiet_edges_with_padding() {
    let mut samples = vec![0.0; RATE as usize];
    samples.extend(vec![0.5; RATE as usize / 2]);
    samples.extend(vec![0.0; RATE as usize]);
    let clip = trim_silence(&samples, RATE);
    assert_eq!(clip.len(), RATE as usize / 2 + 2 * (RATE as usize / 20));
    assert_approx(clip.iter().copied().fold(0.0_f32, f32::max), 0.5, 1e-6);
}

// test_trim_silence_all_quiet_returns_empty
#[test]
fn trim_silence_all_quiet_returns_empty() {
    assert!(trim_silence(&vec![0.0; RATE as usize], RATE).is_empty());
}

// test_trim_silence_shorter_than_window_returns_empty
#[test]
fn trim_silence_shorter_than_window_returns_empty() {
    assert!(trim_silence(&[0.5; 5], RATE).is_empty());
}

// test_normalize_raises_peak_to_target
#[test]
fn normalize_raises_peak_to_target() {
    let out = normalize(&[0.3, -0.45]);
    assert_approx(out.iter().map(|v| v.abs()).fold(0.0, f32::max), 0.9, 1e-6);
}

// test_normalize_caps_gain_for_very_quiet_clips
#[test]
fn normalize_caps_gain_for_very_quiet_clips() {
    assert_approx(normalize(&[0.01])[0], 0.08, 1e-6);
}

// test_normalize_leaves_silence_alone
#[test]
fn normalize_leaves_silence_alone() {
    assert_eq!(normalize(&[0.0; 4]), vec![0.0; 4]);
}

// test_fifo_waits_until_primed_then_streams_in_order
#[test]
fn fifo_waits_until_primed_then_streams_in_order() {
    let mut fifo = SampleFifo::new(100, 4);
    fifo.push(&ramp(3));
    assert_eq!(fifo.pull(2), vec![0.0, 0.0]);
    fifo.push(&[3.0, 4.0, 5.0]);
    assert_eq!(fifo.pull(4), vec![0.0, 1.0, 2.0, 3.0]);
    assert_eq!(fifo.pull(2), vec![4.0, 5.0]);
}

// test_fifo_pads_with_silence_on_underrun_and_reprimes
#[test]
fn fifo_pads_with_silence_on_underrun_and_reprimes() {
    let mut fifo = SampleFifo::new(100, 2);
    fifo.push(&ramp(3));
    assert_eq!(fifo.pull(5), vec![0.0, 1.0, 2.0, 0.0, 0.0]);
    fifo.push(&[9.0]);
    assert_eq!(fifo.pull(1), vec![0.0]);
    fifo.push(&[8.0]);
    assert_eq!(fifo.pull(2), vec![9.0, 8.0]);
}

// test_fifo_drops_oldest_past_max
#[test]
fn fifo_drops_oldest_past_max() {
    let mut fifo = SampleFifo::new(4, 1);
    fifo.push(&ramp(6));
    assert_eq!(fifo.pull(4), vec![2.0, 3.0, 4.0, 5.0]);
}

// test_player_plays_clip_then_silence
#[test]
fn player_plays_clip_then_silence() {
    let mut player = ClipPlayer::new();
    player.play(clip(&[1.0, 2.0, 3.0]));
    assert_eq!(player.pull(2), vec![1.0, 2.0]);
    assert_eq!(player.pull(2), vec![3.0, 0.0]);
    assert!(!player.playing());
}

// test_player_stop_and_replay
#[test]
fn player_stop_and_replay() {
    let mut player = ClipPlayer::new();
    player.play(clip(&[1.0, 2.0]));
    player.stop();
    assert_eq!(player.pull(2), vec![0.0, 0.0]);
    assert!(player.replay());
    assert_eq!(player.pull(2), vec![1.0, 2.0]);
}

// test_player_replay_without_clip_reports_false
#[test]
fn player_replay_without_clip_reports_false() {
    assert!(!ClipPlayer::new().replay());
}

// test_player_load_does_not_play_until_replay
#[test]
fn player_load_does_not_play_until_replay() {
    let mut player = ClipPlayer::new();
    player.load(clip(&[1.0, 2.0]));
    assert!(!player.playing());
    assert_eq!(player.pull(2), vec![0.0, 0.0]);
    assert_eq!(&*player.current(), &[1.0, 2.0]);
    assert!(player.replay());
    assert_eq!(player.pull(2), vec![1.0, 2.0]);
}

// test_player_load_while_playing_lets_playback_finish
#[test]
fn player_load_while_playing_lets_playback_finish() {
    let mut player = ClipPlayer::new();
    player.play(clip(&[1.0, 2.0, 3.0]));
    assert_eq!(player.pull(1), vec![1.0]);
    player.load(clip(&[9.0]));
    assert_eq!(player.pull(3), vec![2.0, 3.0, 0.0]);
    assert!(player.replay());
    assert_eq!(player.pull(1), vec![9.0]);
}

// test_player_current_is_last_clip_even_after_stop
#[test]
fn player_current_is_last_clip_even_after_stop() {
    let mut player = ClipPlayer::new();
    assert!(player.current().is_empty());
    player.play(clip(&[1.0]));
    player.stop();
    assert_eq!(&*player.current(), &[1.0]);
}

// test_slot_bank_store_and_get
#[test]
fn slot_bank_store_and_get() {
    let mut bank = PadBank::new();
    assert!(bank.get(1).expect("slot").is_none());
    bank.store(1, clip(&[1.0]), "one").expect("store");
    assert_eq!(&*bank.get(1).expect("slot").expect("filled").clip, &[1.0]);
    assert_eq!(
        bank.filled().iter().map(|p| p.number).collect::<Vec<_>>(),
        vec![1]
    );
}

// test_fit_length_pads_or_cuts
#[test]
fn fit_length_pads_or_cuts() {
    assert_eq!(fit_length(&[1.0, 2.0], 3), vec![1.0, 2.0, 0.0]);
    assert_eq!(fit_length(&[1.0, 2.0, 3.0], 2), vec![1.0, 2.0]);
}

// test_echo_gate_closes_while_and_shortly_after_clip_plays
#[test]
fn echo_gate_closes_while_and_shortly_after_clip_plays() {
    let mut gate = EchoGate::new(0.3);
    assert!(gate.is_open(0.0));
    gate.mark(1.0);
    assert!(!gate.is_open(1.0));
    assert!(!gate.is_open(1.29));
    assert!(gate.is_open(1.31));
}

// test_slot_bank_rejects_out_of_range
#[test]
fn slot_bank_rejects_out_of_range() {
    let mut bank = PadBank::new();
    assert!(matches!(
        bank.store(9, clip(&[0.0]), "bad"),
        Err(PadError::OutOfRange { .. })
    ));
    assert!(matches!(bank.get(0), Err(PadError::OutOfRange { .. })));
}

// test_key_edge_fires_once_per_press_ignoring_autorepeat
#[test]
fn key_edge_fires_once_per_press_ignoring_autorepeat() {
    let mut edge = KeyEdge::new();
    assert!(edge.update("f8", true));
    assert!(!edge.update("f8", true));
    assert!(!edge.update("f8", false));
    assert!(edge.update("f8", true));
}

// test_key_edge_tracks_keys_independently
#[test]
fn key_edge_tracks_keys_independently() {
    let mut edge = KeyEdge::new();
    assert!(edge.update("f1", true));
    assert!(edge.update("f2", true));
    assert!(!edge.update("f1", true));
}

// test_save_arm_toggle_and_consume
#[test]
fn save_arm_toggle_and_consume() {
    let mut arm = SaveArm::new(5.0);
    assert!(arm.toggle(0.0));
    assert!(arm.consume(1.0));
    assert!(!arm.consume(1.5));
}

// test_save_arm_toggle_twice_cancels
#[test]
fn save_arm_toggle_twice_cancels() {
    let mut arm = SaveArm::new(5.0);
    assert!(arm.toggle(0.0));
    assert!(!arm.toggle(1.0));
    assert!(!arm.consume(1.5));
}

// test_save_arm_expires
#[test]
fn save_arm_expires() {
    let mut arm = SaveArm::new(5.0);
    assert!(arm.toggle(0.0));
    assert!(!arm.consume(5.1));
}

// test_save_arm_expired_toggle_rearms
#[test]
fn save_arm_expired_toggle_rearms() {
    let mut arm = SaveArm::new(5.0);
    assert!(arm.toggle(0.0));
    assert!(arm.toggle(10.0));
    assert!(arm.consume(11.0));
}

#[test]
fn streaming_resampler_constant_stays_constant_and_length_tracks_ratio() {
    let mut resampler = StreamingResampler::new(44_100, 48_000);
    let mut out = Vec::new();
    for _ in 0..100 {
        resampler.process_into(&[0.25; 37], &mut out);
    }
    let expected = ((100.0 * 37.0) * 48_000.0 / 44_100.0_f64).round() as usize;
    assert_eq!(out.len(), expected);
    assert_all_approx(&out, 0.25, 1e-6);
}

#[test]
fn fifo_priming_and_latency_bound_defaults() {
    let mut fifo = SampleFifo::from_seconds(1000, 0.12, 0.03);
    fifo.push(&ramp(200));
    assert_eq!(fifo.len(), 120);
    let out = fifo.pull(120);
    assert_eq!(out[0], 80.0);
    assert_eq!(out[119], 199.0);
}

#[test]
fn history_capture_path_accepts_threaded_producer() {
    let history = Arc::new(History::new(16));
    let producer = Arc::clone(&history);
    let handle = thread::spawn(move || producer.push_from_audio(&ramp(8)));
    handle.join().expect("producer");
    assert_eq!(history.last(8), ramp(8));
}

#[test]
fn history_last_is_safe_while_audio_thread_writes() {
    let history = Arc::new(History::new(256));
    let producer = Arc::clone(&history);
    let handle = thread::spawn(move || {
        for chunk in 0..64 {
            let start = chunk * 32;
            let samples: Vec<f32> = (start..start + 32).map(|value| value as f32).collect();
            producer.push_from_audio(&samples);
        }
    });
    for _ in 0..64 {
        let got = history.last(64);
        assert!(got.windows(2).all(|pair| pair[0] < pair[1]));
    }
    handle.join().expect("producer");
}

#[test]
fn headphones_resampler_does_not_drift_on_odd_callbacks() {
    let config = EngineConfig::new(48_000, 48_000, None, 44_100);
    let (mut engine, _handle) = Engine::new(config);
    let mut total_out = 0;
    for size in [127, 333, 511, 29, 1001].into_iter().cycle().take(200) {
        let mut out = vec![0.0; size];
        engine.render_headphones(&mut out);
        total_out += size;
    }
    let expected = (total_out as f64) * 48_000.0 / 44_100.0;
    let consumed = engine.headphone_engine_samples_consumed() as f64;
    assert!((consumed - expected).abs() <= 1.0);
}

#[test]
fn pads_one_to_eight_bounds() {
    let mut pads = PadBank::new();
    for slot in 1..=8 {
        pads.store(slot, clip(&[slot as f32]), format!("slot {slot}"))
            .expect("store");
    }
    assert_eq!(pads.filled().len(), 8);
    assert!(pads.get(0).is_err());
    assert!(pads.get(9).is_err());
}
