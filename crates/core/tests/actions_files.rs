mod common;

use std::fs;

use common::{
    assert_all_approx, assert_approx, assert_slice_approx, clip, make_session, play_headphones,
    play_virtual, temp_dir, voice, RATE,
};
use ringpad_core::actions::{
    grab, load_slots, play_pad, save_current_to_pad, send_last, slot_pressed, stop_all,
    toggle_save, ActionEvent, KEY_GRAB, KEY_REPEAT, KEY_SAVE, KEY_STOP, SLOT_KEYS,
};
use ringpad_core::clip_files::{load_wav, save_wav, timestamped_path};

// test_grab_with_silence_says_nothing_heard
#[test]
fn grab_with_silence_reports_nothing_heard() {
    let tmp = temp_dir("grab-silence");
    let (_engine, mut session) = make_session(tmp, true, false);
    session.handle.history().push(&vec![0.0; RATE as usize]);
    assert_eq!(
        grab(&mut session).expect("grab"),
        ActionEvent::NothingHeard { seconds: 5.0 }
    );
    assert!(session.handle.current_send_clip().is_empty());
}

// test_grab_clips_without_playing_and_keeps_a_copy
#[test]
fn grab_clips_without_playing_and_keeps_a_copy() {
    let tmp = temp_dir("grab-copy");
    let (mut engine, mut session) = make_session(tmp.clone(), true, false);
    let mut samples = vec![0.0; RATE as usize];
    samples.extend(voice(1.0, 0.3));
    samples.extend(vec![0.0; RATE as usize]);
    session.handle.history().push(&samples);
    let event = grab(&mut session).expect("grab");
    assert_approx(
        session.handle.current_send_clip().len() as f32,
        1.1 * RATE as f32,
        2.0,
    );
    assert_eq!(fs::read_dir(tmp.join("clips")).expect("clips").count(), 1);
    assert!(matches!(
        event,
        ActionEvent::Clipped {
            previewed: false,
            ..
        }
    ));
    // Grabbing loads the clip without playing it.
    assert_all_approx(&play_virtual(&mut engine, 1), 0.0, 1e-6);
    assert!(!session.handle.sending());
    assert_eq!(
        send_last(&mut session).expect("send"),
        ActionEvent::SendingClip
    );
    // The clip opens with the 50 ms trim pad (50 samples at RATE), then the levelled voice.
    let sent = play_virtual(&mut engine, 1);
    assert_all_approx(&sent[..50], 0.0, 1e-6);
    assert_all_approx(&sent[50..], 0.9, 1e-6);
    assert!(session.handle.sending());
}

// test_grab_previews_to_you_only_and_send_stops_the_preview
#[test]
fn grab_previews_to_you_only_and_send_stops_the_preview() {
    let tmp = temp_dir("grab-preview");
    let (mut engine, mut session) = make_session(tmp, true, true);
    session.handle.history().push(&voice(1.0, 0.3));
    assert!(matches!(
        grab(&mut session).expect("grab"),
        ActionEvent::Clipped {
            previewed: true,
            ..
        }
    ));
    assert_all_approx(&play_headphones(&mut engine, 1), 0.54, 1e-6);
    assert_all_approx(&play_virtual(&mut engine, 1), 0.0, 1e-6);
    assert_eq!(
        send_last(&mut session).expect("send"),
        ActionEvent::SendingClip
    );
    assert_all_approx(&play_virtual(&mut engine, 1), 0.9, 1e-6);
}

// test_stop_key_stops_preview_and_sent_clip
#[test]
fn stop_key_stops_preview_and_sent_clip() {
    let tmp = temp_dir("stop");
    let (mut engine, mut session) = make_session(tmp, true, true);
    session.handle.history().push(&voice(1.0, 0.3));
    grab(&mut session).expect("grab");
    send_last(&mut session).expect("send");
    assert_eq!(stop_all(&mut session).expect("stop"), ActionEvent::Stopped);
    assert_all_approx(&play_virtual(&mut engine, 1), 0.0, 1e-6);
    assert_all_approx(&play_headphones(&mut engine, 1), 0.0, 1e-6);
}

// test_grab_without_clips_dir_saves_nothing
#[test]
fn grab_without_clips_dir_saves_nothing() {
    let tmp = temp_dir("no-clips");
    let (_engine, mut session) = make_session(tmp.clone(), false, false);
    session.handle.history().push(&voice(1.0, 0.3));
    grab(&mut session).expect("grab");
    assert!(!tmp.join("clips").exists());
}

// test_replay_last_messages
#[test]
fn replay_last_events() {
    let tmp = temp_dir("replay");
    let (mut engine, mut session) = make_session(tmp, false, false);
    assert_eq!(
        send_last(&mut session).expect("send"),
        ActionEvent::NoClipYet
    );
    session
        .handle
        .load_send_clip(clip(&voice(1.0, 0.3)))
        .expect("load");
    assert_eq!(
        send_last(&mut session).expect("send"),
        ActionEvent::SendingClip
    );
    assert_all_approx(&play_virtual(&mut engine, 1), 0.3, 1e-6);
}

// test_slot_key_plays_saved_clip_or_explains_empty
#[test]
fn slot_key_plays_saved_clip_or_explains_empty() {
    let tmp = temp_dir("slot-play");
    let (mut engine, mut session) = make_session(tmp, false, false);
    assert_eq!(
        slot_pressed(&mut session, 2, 0.0).expect("slot"),
        ActionEvent::EmptyPad { slot: 2 }
    );
    session
        .pads
        .store(2, clip(&voice(0.5, 0.3)), "two")
        .expect("store");
    assert_eq!(
        slot_pressed(&mut session, 2, 0.0).expect("slot"),
        ActionEvent::PlayingPad { slot: 2 }
    );
    assert_all_approx(&play_virtual(&mut engine, 1), 0.3, 1e-6);
}

// test_save_then_slot_key_stores_last_clip_and_file
#[test]
fn save_then_slot_key_stores_last_clip_and_file() {
    let tmp = temp_dir("save-slot");
    let (_engine, mut session) = make_session(tmp.clone(), false, false);
    session
        .handle
        .play_send_clip(clip(&voice(1.0, 0.3)))
        .expect("play");
    assert_eq!(toggle_save(&mut session, 0.0), ActionEvent::SaveArmed);
    assert!(matches!(
        slot_pressed(&mut session, 3, 1.0).expect("save"),
        ActionEvent::SavedToPad { slot: 3, .. }
    ));
    assert!(tmp.join("slots").join("slot3.wav").exists());
    assert_eq!(
        slot_pressed(&mut session, 3, 2.0).expect("play"),
        ActionEvent::PlayingPad { slot: 3 }
    );
}

// test_save_with_nothing_played_explains
#[test]
fn save_with_nothing_played_reports_nothing_to_save() {
    let tmp = temp_dir("save-empty");
    let (_engine, mut session) = make_session(tmp, false, false);
    assert_eq!(toggle_save(&mut session, 0.0), ActionEvent::SaveArmed);
    assert_eq!(
        slot_pressed(&mut session, 1, 1.0).expect("save"),
        ActionEvent::NothingToSave
    );
    assert!(session.pads.get(1).expect("slot").is_none());
}

// test_save_toggle_twice_cancels
#[test]
fn save_toggle_twice_cancels_action() {
    let tmp = temp_dir("save-cancel");
    let (_engine, mut session) = make_session(tmp, false, false);
    assert_eq!(toggle_save(&mut session, 0.0), ActionEvent::SaveArmed);
    assert_eq!(toggle_save(&mut session, 1.0), ActionEvent::SaveCancelled);
}

// test_saved_slots_load_on_next_start
#[test]
fn saved_slots_load_on_next_start() {
    let tmp = temp_dir("load-slots");
    let (_engine, mut session) = make_session(tmp.clone(), false, false);
    session
        .handle
        .play_send_clip(clip(&voice(1.0, 0.3)))
        .expect("play");
    assert_eq!(toggle_save(&mut session, 0.0), ActionEvent::SaveArmed);
    slot_pressed(&mut session, 1, 1.0).expect("save");
    let (_fresh_engine, mut fresh) = make_session(tmp, false, false);
    assert!(load_slots(&mut fresh).is_empty());
    let got = fresh.pads.get(1).expect("slot").expect("filled");
    assert_slice_approx(&got.clip, &voice(1.0, 0.3), 1e-3);
}

// test_load_slots_skips_broken_files
#[test]
fn load_slots_skips_broken_files() {
    let tmp = temp_dir("broken-slot");
    let (_engine, mut session) = make_session(tmp.clone(), false, false);
    fs::create_dir_all(tmp.join("slots")).expect("slots");
    fs::write(tmp.join("slots").join("slot2.wav"), b"not a wav").expect("broken");
    let events = load_slots(&mut session);
    assert!(matches!(
        events.as_slice(),
        [ActionEvent::SkippedSlot { slot: 2, .. }]
    ));
}

// test_key_map_covers_every_key
#[test]
fn action_key_constants_cover_every_key() {
    let keys = [KEY_GRAB, KEY_REPEAT, KEY_STOP, KEY_SAVE];
    assert_eq!(keys.len() + SLOT_KEYS.iter().flatten().count(), 8);
}

// test_wav_round_trip
#[test]
fn wav_round_trip() {
    let tmp = temp_dir("wav-roundtrip");
    let clip = [0.0, 0.5, -0.5, 0.25];
    let path = save_wav(&clip, 48_000, tmp.join("a.wav")).expect("save");
    let got = load_wav(path, 48_000).expect("load");
    assert_slice_approx(&got, &clip, 1e-4);
}

// test_save_wav_creates_folder_and_clips_overs
#[test]
fn save_wav_creates_folder_and_clips_overs() {
    let tmp = temp_dir("wav-clip");
    let path = save_wav(&[2.0, -2.0], 48_000, tmp.join("new").join("b.wav")).expect("save");
    assert_slice_approx(&load_wav(path, 48_000).expect("load"), &[1.0, -1.0], 1e-4);
}

// test_load_wav_mixes_stereo_and_resamples
#[test]
fn load_wav_mixes_stereo_and_resamples() {
    let tmp = temp_dir("wav-stereo");
    let path = tmp.join("s.wav");
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: 44_100,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(&path, spec).expect("writer");
    for _ in 0..441 {
        writer.write_sample(16_384_i16).expect("left");
        writer.write_sample(0_i16).expect("right");
    }
    writer.finalize().expect("finalize");
    let got = load_wav(path, 48_000).expect("load");
    assert_eq!(got.len(), 480);
    assert_all_approx(&got, 0.25, 1e-3);
}

// test_load_wav_rejects_non_16_bit
#[test]
fn load_wav_rejects_non_16_bit() {
    let tmp = temp_dir("wav-bad");
    let path = tmp.join("x.wav");
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 8_000,
        bits_per_sample: 8,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(&path, spec).expect("writer");
    writer.write_sample(0_i8).expect("sample");
    writer.finalize().expect("finalize");
    assert!(load_wav(path, 48_000).is_err());
}

// test_timestamped_path_names_a_wav_in_the_folder
#[test]
fn timestamped_path_names_a_wav_in_the_folder() {
    let tmp = temp_dir("timestamp");
    let path = timestamped_path(&tmp).expect("timestamp");
    assert_eq!(path.parent(), Some(tmp.as_path()));
    assert!(path
        .file_name()
        .expect("name")
        .to_string_lossy()
        .starts_with("clip-"));
    assert_eq!(path.extension().expect("ext"), "wav");
}

#[test]
fn pad_volume_scales_playback() {
    let tmp = temp_dir("pad-volume");
    let (mut engine, mut session) = make_session(tmp, false, false);
    session
        .pads
        .store(1, clip(&[0.5, 0.25]), "one")
        .expect("store");
    session.pads.set_volume(1, 0.5).expect("volume");
    assert_eq!(
        play_pad(&mut session, 1).expect("play"),
        ActionEvent::PlayingPad { slot: 1 }
    );
    let sent = play_virtual(&mut engine, 1);
    assert_slice_approx(&sent[..2], &[0.25, 0.125], 1e-6);
}

#[test]
fn save_current_to_pad_can_be_called_directly() {
    let tmp = temp_dir("direct-save");
    let (_engine, mut session) = make_session(tmp.clone(), false, false);
    session.handle.load_send_clip(clip(&[0.1])).expect("load");
    assert_eq!(
        save_current_to_pad(&mut session, 8).expect("save"),
        ActionEvent::SavedToPad {
            slot: 8,
            path: Some(tmp.join("slots").join("slot8.wav"))
        }
    );
}
