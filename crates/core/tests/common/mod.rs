#![allow(dead_code)]

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use ringpad_core::actions::Session;
use ringpad_core::clip::clip_from_vec;
use ringpad_core::engine::{Engine, EngineConfig, EngineHandle};

pub const RATE: u32 = 1000;
pub const ENGINE_RATE: u32 = 48_000;
pub const BLOCK: usize = 480;

pub fn ramp(n: usize) -> Vec<f32> {
    (0..n).map(|i| i as f32).collect()
}

pub fn voice(seconds: f32, level: f32) -> Vec<f32> {
    vec![level; (seconds * RATE as f32) as usize]
}

pub fn assert_approx(a: f32, b: f32, eps: f32) {
    assert!((a - b).abs() <= eps, "{a} != {b} within {eps}");
}

pub fn assert_slice_approx(actual: &[f32], expected: &[f32], eps: f32) {
    assert_eq!(actual.len(), expected.len());
    for (a, b) in actual.iter().zip(expected) {
        assert_approx(*a, *b, eps);
    }
}

pub fn assert_all_approx(actual: &[f32], expected: f32, eps: f32) {
    for &sample in actual {
        assert_approx(sample, expected, eps);
    }
}

pub fn temp_dir(name: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("ringpad-core-{name}-{stamp}"));
    fs::create_dir_all(&path).expect("temp dir");
    path
}

pub fn clip(samples: &[f32]) -> Arc<[f32]> {
    clip_from_vec(samples.to_vec())
}

pub fn make_session(tmp: PathBuf, clips: bool, preview: bool) -> (Engine, Session) {
    let mut config = EngineConfig::new(RATE, RATE, None, RATE);
    config.monitoring = preview;
    config.send_volume = 1.0;
    config.ducking = false;
    let (engine, handle) = Engine::new(config);
    let mut session = Session::new(handle);
    session.clips_dir = clips.then(|| tmp.join("clips"));
    session.slots_dir = Some(tmp.join("slots"));
    (engine, session)
}

pub fn engine_pair(
    recording_headphones: bool,
    forward_source: bool,
    mic: bool,
    monitoring: bool,
) -> (Engine, EngineHandle) {
    let mut config = EngineConfig::new(
        ENGINE_RATE,
        ENGINE_RATE,
        mic.then_some(ENGINE_RATE),
        ENGINE_RATE,
    );
    config.recording_headphones = recording_headphones;
    config.forward_source = forward_source;
    config.monitoring = monitoring;
    config.monitor_volume = 0.5;
    config.send_volume = 1.0;
    config.ducking = false;
    Engine::new(config)
}

pub fn feed_source(engine: &mut Engine, level: f32, blocks: usize) {
    let data = vec![level; BLOCK];
    for _ in 0..blocks {
        engine.on_source(&data);
    }
}

pub fn feed_mic(engine: &mut Engine, level: f32, blocks: usize) {
    let data = vec![level; BLOCK];
    for _ in 0..blocks {
        engine.on_mic(&data);
    }
}

pub fn play_virtual(engine: &mut Engine, blocks: usize) -> Vec<f32> {
    let mut out = Vec::new();
    for _ in 0..blocks {
        let mut block = vec![0.0; BLOCK];
        engine.render_virtual_mic(&mut block);
        out.extend(block);
    }
    out
}

pub fn play_headphones(engine: &mut Engine, blocks: usize) -> Vec<f32> {
    let mut out = Vec::new();
    for _ in 0..blocks {
        let mut block = vec![0.0; BLOCK];
        engine.render_headphones(&mut block);
        out.extend(block);
    }
    out
}
