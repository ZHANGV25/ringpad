mod common;

use common::{assert_slice_approx, clip, ramp, RATE};
use ringpad_core::dsp::{resample, to_channels, trim_silence, StreamingResampler};
use ringpad_core::history::History;
use ringpad_core::pads::{PadBank, PadError};

#[test]
fn resample_handles_empty_and_downsampling() {
    assert!(resample(&[], 44_100, 48_000).is_empty());
    assert_eq!(resample(&ramp(480), 48_000, 24_000).len(), 240);
}

#[test]
fn streaming_resampler_equal_rates_and_exact_output_edges() {
    let mut resampler = StreamingResampler::new(48_000, 48_000);
    assert_eq!(resampler.input_needed_for_output(0), 0);
    assert_eq!(resampler.input_needed_for_output(128), 128);
    let mut out = [0.0; 4];
    resampler.process_exact_into(&[1.0, 2.0, 3.0, 4.0], &mut out);
    assert_eq!(out, [1.0, 2.0, 3.0, 4.0]);
    assert_eq!(resampler.input_samples_processed(), 4);
}

#[test]
fn streaming_resampler_upsamples_and_reports_large_input_need() {
    let mut resampler = StreamingResampler::new(24_000, 48_000);
    assert_eq!(resampler.input_needed_for_output(0), 0);
    assert!(resampler.input_needed_for_output(48_000) >= 24_000);
    let mut out = [0.0; 4];
    resampler.process_exact_into(&[0.0, 1.0, 2.0], &mut out);
    assert_slice_approx(&out, &[0.0, 0.5, 1.0, 1.5], 1e-6);
}

#[test]
fn trim_silence_keeps_no_silent_input_with_edge_padding_clamped() {
    let samples = vec![0.2; RATE as usize / 2];
    assert_eq!(trim_silence(&samples, RATE), samples);
}

#[test]
fn history_zero_capacity_negative_seconds_and_large_last_are_safe() {
    assert_eq!(History::new(0).capacity(), 1);
    assert_eq!(History::for_seconds(-1.0, RATE).capacity(), 1);
    let history = History::new(3);
    history.push(&[1.0, 2.0, 3.0, 4.0]);
    assert_eq!(history.last(99), vec![2.0, 3.0, 4.0]);
}

#[test]
fn slot_bank_mutators_apply_to_filled_slots_and_ignore_empty() {
    let mut bank = PadBank::new();
    bank.rename(1, "ignored").expect("rename empty");
    bank.set_volume(1, 0.2).expect("volume empty");
    bank.set_hotkey(1, Some("f1".to_string()))
        .expect("hotkey empty");
    assert!(bank.get(1).expect("empty").is_none());

    bank.store(2, clip(&[0.5]), "two").expect("store two");
    bank.store(1, clip(&[0.25]), "one").expect("store one");
    bank.rename(2, "renamed").expect("rename");
    bank.set_volume(2, 2.0).expect("clamp high");
    bank.set_hotkey(2, Some("f8".to_string())).expect("hotkey");
    let pad = bank.get(2).expect("slot").expect("filled");
    assert_eq!(pad.name, "renamed");
    assert_eq!(pad.volume, 1.0);
    assert_eq!(pad.hotkey.as_deref(), Some("f8"));

    bank.set_volume(2, -1.0).expect("clamp low");
    assert_eq!(bank.get(2).expect("slot").expect("filled").volume, 0.0);
    assert_eq!(
        bank.filled()
            .iter()
            .map(|pad| pad.number)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    bank.clear(2).expect("clear");
    assert!(bank.get(2).expect("slot").is_none());
}

#[test]
fn slot_bank_reports_out_of_range_for_every_mutator() {
    let mut bank = PadBank::new();
    assert!(matches!(
        bank.clear(0),
        Err(PadError::OutOfRange { slot: 0, max: 8 })
    ));
    assert!(matches!(
        bank.rename(9, "bad"),
        Err(PadError::OutOfRange { slot: 9, max: 8 })
    ));
    assert!(matches!(
        bank.set_volume(9, 0.5),
        Err(PadError::OutOfRange { slot: 9, max: 8 })
    ));
    assert!(matches!(
        bank.set_hotkey(0, None),
        Err(PadError::OutOfRange { slot: 0, max: 8 })
    ));
}

#[test]
fn resampler_reports_rates_and_resets_its_position() {
    let mut resampler = StreamingResampler::new(44_100, 48_000);
    assert_eq!(resampler.src_rate(), 44_100);
    assert_eq!(resampler.dst_rate(), 48_000);

    let mut emitted = 0;
    resampler.process_with(&[], |_| emitted += 1);
    assert_eq!(emitted, 0);

    let mut first = Vec::new();
    resampler.process_into(&ramp(441), &mut first);
    assert!(resampler.input_samples_processed() > 0);
    resampler.reset();
    assert_eq!(resampler.input_samples_processed(), 0);
    let mut again = Vec::new();
    resampler.process_into(&ramp(441), &mut again);
    assert_eq!(first, again);
}

#[test]
fn exact_output_ignores_an_empty_output_slice() {
    let mut resampler = StreamingResampler::new(48_000, 48_000);
    resampler.process_exact_into(&[0.5; 4], &mut []);
    assert_eq!(resampler.input_samples_processed(), 0);
}

#[test]
fn mono_to_one_channel_is_a_copy() {
    assert_eq!(to_channels(&[0.1, 0.2], 1), vec![0.1, 0.2]);
    assert_eq!(to_channels(&[0.1, 0.2], 0), vec![0.1, 0.2]);
}
