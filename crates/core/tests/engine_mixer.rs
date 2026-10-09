mod common;

use std::sync::{mpsc, Arc};
use std::time::Duration;

use common::{
    assert_all_approx, assert_approx, clip, engine_pair, feed_mic, feed_source, play_headphones,
    play_virtual, BLOCK, ENGINE_RATE,
};
use ringpad_core::engine::{Engine, EngineCommandError, EngineConfig, EngineHandle, SEND_VOLUME};

// test_voice_device_is_recorded_and_forwarded_to_headphones
#[test]
fn voice_device_is_recorded_and_forwarded_to_headphones() {
    let (mut engine, handle) = engine_pair(false, true, false, true);
    feed_source(&mut engine, 0.4, 10);
    assert_all_approx(&play_headphones(&mut engine, 3), 0.4, 1e-6);
    assert_eq!(
        handle.history().last(ENGINE_RATE as usize).len(),
        10 * BLOCK
    );
}

#[test]
fn engine_halves_are_send() {
    fn assert_send<T: Send>() {}
    assert_send::<Engine>();
    assert_send::<EngineHandle>();
}

// test_clips_go_to_virtual_mic_and_headphones_without_reentering_history
#[test]
fn clips_go_to_virtual_mic_and_headphones_without_reentering_history() {
    let (mut engine, mut handle) = engine_pair(true, false, false, true);
    handle
        .play_send_clip(clip(&vec![0.8; ENGINE_RATE as usize]))
        .expect("play");
    assert_all_approx(&play_virtual(&mut engine, 5), 0.8, 1e-6);
    assert_all_approx(&play_headphones(&mut engine, 2), 0.4, 1e-6);
    feed_source(&mut engine, 0.4, 10);
    assert!(handle.history().last(ENGINE_RATE as usize).is_empty());
}

// test_preview_plays_only_in_headphones_and_is_not_re_recorded
#[test]
fn preview_plays_only_in_headphones_and_is_not_re_recorded() {
    let (mut engine, mut handle) = engine_pair(true, false, false, true);
    handle
        .play_preview_clip(clip(&vec![0.8; ENGINE_RATE as usize]))
        .expect("preview");
    assert_all_approx(&play_virtual(&mut engine, 2), 0.0, 1e-6);
    assert_all_approx(&play_headphones(&mut engine, 2), 0.4, 1e-6);
    feed_source(&mut engine, 0.4, 10);
    assert!(handle.history().last(ENGINE_RATE as usize).is_empty());
}

// test_no_preview_player_without_monitoring
#[test]
fn no_preview_player_without_monitoring() {
    let (_engine, handle) = engine_pair(true, false, false, false);
    assert!(!handle.preview_enabled());
}

// test_no_echo_gate_when_recording_a_separate_voice_device
#[test]
fn no_echo_gate_when_recording_a_separate_voice_device() {
    let (mut engine, mut handle) = engine_pair(false, true, false, true);
    handle
        .play_send_clip(clip(&vec![0.8; ENGINE_RATE as usize]))
        .expect("play");
    play_virtual(&mut engine, 5);
    feed_source(&mut engine, 0.4, 10);
    assert_eq!(
        handle.history().last(ENGINE_RATE as usize).len(),
        10 * BLOCK
    );
}

// test_send_volume_scales_only_what_others_hear
#[test]
fn send_volume_scales_only_what_others_hear_when_ducking_disabled() {
    let mut config = EngineConfig::new(ENGINE_RATE, ENGINE_RATE, Some(ENGINE_RATE), ENGINE_RATE);
    config.recording_headphones = true;
    config.monitor_volume = 0.5;
    config.send_volume = 0.6;
    config.ducking = false;
    let (mut engine, mut handle) = Engine::new(config);
    feed_mic(&mut engine, 0.1, 10);
    handle
        .play_send_clip(clip(&vec![0.5; ENGINE_RATE as usize]))
        .expect("play");
    let sent = play_virtual(&mut engine, 5);
    assert_all_approx(&sent[sent.len() - BLOCK..], 0.5 * 0.6 + 0.1, 1e-6);
    assert_all_approx(&play_headphones(&mut engine, 2), 0.25, 1e-6);
}

// test_default_send_volume_is_50_percent
#[test]
fn default_send_volume_is_50_percent() {
    assert_approx(SEND_VOLUME, 0.5, 1e-6);
}

// test_real_mic_is_mixed_into_virtual_mic
#[test]
fn real_mic_is_mixed_into_virtual_mic() {
    let (mut engine, _handle) = engine_pair(true, false, true, true);
    feed_mic(&mut engine, 0.3, 10);
    assert_all_approx(&play_virtual(&mut engine, 3), 0.3, 1e-6);
}

#[test]
fn mic_gate_defaults_open_and_closes_without_muting_clips() {
    let (mut engine, mut handle) = engine_pair(false, false, true, false);
    assert!(handle.mic_open());
    feed_mic(&mut engine, 0.25, 4);
    assert_all_approx(&play_virtual(&mut engine, 1), 0.25, 1e-6);

    handle.set_mic_open(false);
    feed_mic(&mut engine, 0.25, 2);
    let _ = play_virtual(&mut engine, 1);
    handle
        .play_send_clip(clip(&vec![0.7; BLOCK * 2]))
        .expect("play");
    feed_mic(&mut engine, 0.25, 2);
    assert_all_approx(&play_virtual(&mut engine, 1), 0.7, 1e-6);
}

#[test]
fn closed_mic_gate_reaches_exact_silence_after_five_ms() {
    let mut config = EngineConfig::new(ENGINE_RATE, ENGINE_RATE, Some(ENGINE_RATE), ENGINE_RATE);
    config.monitoring = false;
    config.ducking = false;
    let (mut engine, handle) = Engine::new(config);
    handle.set_mic_open(false);
    feed_mic(&mut engine, 0.5, 2);
    let out = play_virtual(&mut engine, 1);
    let fade = ENGINE_RATE as usize * 5 / 1000;
    assert_all_approx(&out[fade..], 0.0, 1e-6);
}

#[test]
fn mic_gate_closes_monotonically_within_five_ms() {
    let mut config = EngineConfig::new(ENGINE_RATE, ENGINE_RATE, Some(ENGINE_RATE), ENGINE_RATE);
    config.monitoring = false;
    config.ducking = false;
    let (mut engine, handle) = Engine::new(config);
    handle.set_mic_open(false);
    feed_mic(&mut engine, 1.0, 2);
    let out = play_virtual(&mut engine, 1);
    for pair in out.windows(2).take(ENGINE_RATE as usize * 5 / 1000) {
        assert!(pair[1] <= pair[0] + 1e-6, "{pair:?}");
    }
    assert_approx(out[ENGINE_RATE as usize * 5 / 1000], 0.0, 1e-6);
}

#[test]
fn mic_gate_reopens_the_real_mic() {
    let (mut engine, handle) = engine_pair(false, false, true, false);
    handle.set_mic_open(false);
    feed_mic(&mut engine, 0.4, 2);
    let _ = play_virtual(&mut engine, 1);
    handle.set_mic_open(true);
    feed_mic(&mut engine, 0.4, 2);
    let out = play_virtual(&mut engine, 1);
    let fade = ENGINE_RATE as usize * 5 / 1000;
    assert_all_approx(&out[fade..], 0.4, 1e-6);
}

// test_no_headphone_stream_when_nothing_to_hear
#[test]
fn no_headphone_player_when_monitoring_off() {
    let (mut engine, _handle) = engine_pair(true, false, false, false);
    assert_all_approx(&play_headphones(&mut engine, 1), 0.0, 1e-6);
}

#[test]
fn virtual_mic_renders_clip_without_real_mic() {
    let (mut engine, mut handle) = engine_pair(false, false, false, false);
    handle
        .play_send_clip(clip(&[0.7; BLOCK]))
        .expect("play without mic");
    assert_all_approx(&play_virtual(&mut engine, 1), 0.7, 1e-6);
}

#[test]
fn forward_source_off_keeps_source_out_of_headphones() {
    let (mut engine, _handle) = engine_pair(false, false, false, true);
    feed_source(&mut engine, 0.6, 2);
    assert_all_approx(&play_headphones(&mut engine, 1), 0.0, 1e-6);
}

#[test]
fn stop_preview_silences_preview_player() {
    let (mut engine, mut handle) = engine_pair(false, false, false, true);
    handle
        .play_preview_clip(clip(&[0.8; ENGINE_RATE as usize]))
        .expect("preview");
    assert_all_approx(&play_headphones(&mut engine, 1), 0.4, 1e-6);
    handle.stop_preview().expect("stop preview");
    assert_all_approx(&play_headphones(&mut engine, 1), 0.0, 1e-6);
}

#[test]
fn stop_all_silences_send_and_preview_players() {
    let (mut engine, mut handle) = engine_pair(false, false, false, true);
    handle
        .play_send_clip(clip(&[0.7; ENGINE_RATE as usize]))
        .expect("send");
    handle
        .play_preview_clip(clip(&[0.8; ENGINE_RATE as usize]))
        .expect("preview");
    play_virtual(&mut engine, 1);
    play_headphones(&mut engine, 1);
    handle.stop_all().expect("stop all");
    assert_all_approx(&play_virtual(&mut engine, 1), 0.0, 1e-6);
    assert_all_approx(&play_headphones(&mut engine, 1), 0.0, 1e-6);
}

#[test]
fn command_queue_reports_full_without_audio_drain() {
    let (_engine, mut handle) = engine_pair(false, false, false, false);
    let mut result = Ok(());
    for _ in 0..128 {
        result = handle.play_send_clip(clip(&[0.1]));
        if result.is_err() {
            break;
        }
    }
    assert_eq!(result, Err(EngineCommandError::QueueFull));
}

#[test]
fn retired_clip_overflow_path_is_nonblocking_until_garbage_collection() {
    let (mut engine, mut handle) = engine_pair(false, false, false, false);
    for index in 0..300 {
        handle
            .load_send_clip(clip(&[index as f32]))
            .expect("load after drain");
        play_virtual(&mut engine, 1);
    }
    handle.collect_garbage();
    handle
        .load_send_clip(clip(&[1.0]))
        .expect("queue remains usable");
    play_virtual(&mut engine, 1);
}

#[test]
fn ducking_scales_mic_while_clip_plays_and_releases_smoothly() {
    let mut config = EngineConfig::new(ENGINE_RATE, ENGINE_RATE, Some(ENGINE_RATE), ENGINE_RATE);
    config.monitoring = false;
    config.send_volume = 0.0;
    config.ducking = true;
    config.duck_gain = 0.15;
    let (mut engine, mut handle) = Engine::new(config);
    feed_mic(&mut engine, 1.0, 3);
    handle
        .play_send_clip(clip(&vec![0.5; BLOCK]))
        .expect("play");
    let mut out = Vec::new();
    for _ in 0..24 {
        feed_mic(&mut engine, 1.0, 1);
        let mut block = vec![0.0; BLOCK];
        engine.render_virtual_mic(&mut block);
        out.extend(block);
    }
    assert!(out[BLOCK - 1] < 0.25);
    assert!(out[BLOCK + (ENGINE_RATE as usize * 150 / 1000)] > 0.95);
    let max_step = out
        .windows(2)
        .map(|pair| (pair[1] - pair[0]).abs())
        .fold(0.0_f32, f32::max);
    assert!(max_step <= (0.85 / (ENGINE_RATE as f32 * 0.010)) + 1e-4);
}

#[test]
fn threaded_handle_drives_audio_thread_without_locks() {
    let mut config = EngineConfig::new(1_000, 1_000, Some(1_000), 1_000);
    config.monitoring = true;
    config.send_volume = 0.5;
    config.ducking = false;
    let (mut engine, mut handle) = Engine::new(config);
    let (start_tx, start_rx) = mpsc::channel();
    let (done_tx, done_rx) = mpsc::channel();
    let audio = std::thread::spawn(move || {
        start_rx.recv().expect("start");
        let mut max_sent = 0.0_f32;
        for _ in 0..32 {
            engine.on_source(&[0.25; 16]);
            engine.on_mic(&[0.0; 16]);
            let mut virtual_mic = [0.0; 16];
            engine.render_virtual_mic(&mut virtual_mic);
            let mut headphones = [0.0; 16];
            engine.render_headphones(&mut headphones);
            max_sent = virtual_mic
                .iter()
                .fold(max_sent, |peak, sample| peak.max(*sample));
        }
        done_tx.send(max_sent).expect("done");
    });

    handle.set_send_volume(0.5);
    handle.set_monitor_volume(0.25);
    handle.set_duck_gain(0.2);
    handle.set_ducking(false);
    handle
        .play_preview_clip(clip(&[0.1; 64]))
        .expect("preview command");
    handle
        .play_send_clip(clip(&[0.8; 64]))
        .expect("send command");
    assert!(handle.meters().outgoing >= 0.0);
    start_tx.send(()).expect("start");
    let max_sent = done_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("audio thread");
    audio.join().expect("join");
    assert_approx(max_sent, 0.4, 1e-6);
    handle.stop_all().expect("stop");
    handle.collect_garbage();
}

#[test]
fn retired_clip_is_freed_by_collect_garbage_not_audio_thread() {
    let (mut engine, mut handle) = engine_pair(false, false, false, true);
    let first = clip(&[0.4; 16]);
    handle.load_send_clip(Arc::clone(&first)).expect("first");
    play_virtual(&mut engine, 1);
    assert_eq!(Arc::strong_count(&first), 3);

    handle.load_send_clip(clip(&[0.5; 16])).expect("second");
    play_virtual(&mut engine, 1);
    assert_eq!(Arc::strong_count(&first), 2);

    handle.collect_garbage();
    assert_eq!(Arc::strong_count(&first), 1);
}

#[test]
fn history_length_follows_the_config_within_limits() {
    let mut config = EngineConfig::new(1_000, 1_000, None, 1_000);
    config.history_seconds = 45.0;
    let (_engine, handle) = Engine::new(config.clone());
    assert_eq!(handle.history().capacity(), 45_000);

    config.history_seconds = 2.0;
    let (_engine, handle) = Engine::new(config.clone());
    assert_eq!(handle.history().capacity(), 10_000);

    config.history_seconds = 500.0;
    let (_engine, handle) = Engine::new(config);
    assert_eq!(handle.history().capacity(), 120_000);
}
