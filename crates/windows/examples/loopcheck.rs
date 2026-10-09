#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use ringpad_core::clip::clip_from_vec;
    use ringpad_windows::devices::{list_devices, matching_capture_side, pick_virtual_output};
    use ringpad_windows::service::{AudioService, ServiceConfig, SourceSpec};

    wasapi::initialize_mta().ok()?;
    let devices = list_devices()?;
    let virtual_output = pick_virtual_output(&devices, None)?;
    let capture_side = matching_capture_side(&virtual_output, &devices)
        .ok_or("could not find virtual cable capture side")?;

    let config = ServiceConfig {
        source: SourceSpec::DefaultOutputLoopback,
        virtual_output_id: virtual_output.id.clone(),
        mic_id: None,
        headphones_id: None,
        send_volume: 1.0,
        monitor_volume: 0.0,
        ducking: false,
    };
    let (_service, mut handle) = AudioService::start(config)?;

    let mut capture = open_capture(&capture_side.id)?;
    let send_clip = sine(440.0, 1.0, 0.5);
    handle.play_send_clip(clip_from_vec(send_clip))?;
    let recorded = record_mono(&mut capture, 72_000)?;
    let pass_virtual = tone_pass(&recorded, 440.0);
    println!(
        "virtual mic {} 440={:.3} 1000={:.3} delay_samples={:?}",
        label(pass_virtual.pass),
        pass_virtual.target,
        pass_virtual.reference,
        first_above(&recorded, 0.05)
    );

    play_default_output_tone(660.0, 1.0, 0.5)?;
    std::thread::sleep(std::time::Duration::from_millis(200));
    let history = handle.history().last(48_000);
    let pass_source = tone_pass(&history, 660.0);
    println!(
        "source capture {} 660={:.3} 1000={:.3}",
        label(pass_source.pass),
        pass_source.target,
        pass_source.reference
    );

    if pass_virtual.pass && pass_source.pass {
        println!("PASS");
        Ok(())
    } else {
        println!("FAIL");
        std::process::exit(1);
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("loopcheck is only available on Windows");
}

#[cfg(windows)]
struct Capture {
    client: wasapi::AudioClient,
    capture: wasapi::AudioCaptureClient,
    event: wasapi::Handle,
}

#[cfg(windows)]
fn open_capture(id: &str) -> Result<Capture, Box<dyn std::error::Error>> {
    let enumerator = wasapi::DeviceEnumerator::new()?;
    let device = enumerator.get_device(id)?;
    let mut client = device.get_iaudioclient()?;
    client.initialize_client(
        &format(),
        &wasapi::Direction::Capture,
        &wasapi::StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: 0,
        },
    )?;
    let event = client.set_get_eventhandle()?;
    let capture = client.get_audiocaptureclient()?;
    client.start_stream()?;
    Ok(Capture {
        client,
        capture,
        event,
    })
}

#[cfg(windows)]
fn record_mono(
    stream: &mut Capture,
    wanted: usize,
) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    let mut out = Vec::with_capacity(wanted);
    let mut bytes = vec![0_u8; 48_000 * 8];
    let mut mono = vec![0.0_f32; 48_000];
    while out.len() < wanted {
        stream.event.wait_for_event(200)?;
        loop {
            let frames = stream.capture.get_next_packet_size()?.unwrap_or(0) as usize;
            if frames == 0 {
                break;
            }
            let byte_len = frames * 8;
            if byte_len > bytes.len() {
                bytes.resize(byte_len, 0);
                mono.resize(frames, 0.0);
            }
            let (read, info) = stream.capture.read_from_device(&mut bytes[..byte_len])?;
            let read = read as usize;
            if info.flags.silent {
                out.resize(out.len() + read, 0.0);
            } else {
                ringpad_windows::mixdown::stereo_bytes_to_mono(&bytes[..read * 8], &mut mono);
                out.extend_from_slice(&mono[..read]);
            }
            if out.len() >= wanted {
                break;
            }
        }
    }
    let _ = stream.client.stop_stream();
    out.truncate(wanted);
    Ok(out)
}

#[cfg(windows)]
fn play_default_output_tone(
    freq: f32,
    seconds: f32,
    amp: f32,
) -> Result<(), Box<dyn std::error::Error>> {
    let enumerator = wasapi::DeviceEnumerator::new()?;
    let device = enumerator.get_default_device(&wasapi::Direction::Render)?;
    let mut client = device.get_iaudioclient()?;
    client.initialize_client(
        &format(),
        &wasapi::Direction::Render,
        &wasapi::StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: 0,
        },
    )?;
    let event = client.set_get_eventhandle()?;
    let render = client.get_audiorenderclient()?;
    let mut tone = sine(freq, seconds, amp);
    let mut cursor = 0;
    let mut bytes = vec![0_u8; 48_000 * 8];
    let initial = client.get_available_space_in_frames()? as usize;
    write_render(
        &render,
        initial.min(tone.len()),
        &tone,
        &mut cursor,
        &mut bytes,
    )?;
    client.start_stream()?;
    while cursor < tone.len() {
        event.wait_for_event(200)?;
        let frames = client.get_available_space_in_frames()? as usize;
        write_render(&render, frames, &tone, &mut cursor, &mut bytes)?;
    }
    let _ = client.stop_stream();
    tone.clear();
    Ok(())
}

#[cfg(windows)]
fn write_render(
    render: &wasapi::AudioRenderClient,
    frames: usize,
    tone: &[f32],
    cursor: &mut usize,
    bytes: &mut [u8],
) -> Result<(), wasapi::WasapiError> {
    let frames = frames.min(tone.len().saturating_sub(*cursor));
    if frames == 0 {
        return Ok(());
    }
    ringpad_windows::mixdown::mono_to_stereo_bytes(&tone[*cursor..*cursor + frames], bytes);
    render.write_to_device(frames, &bytes[..frames * 8], None)?;
    *cursor += frames;
    Ok(())
}

#[cfg(windows)]
fn format() -> wasapi::WaveFormat {
    wasapi::WaveFormat::new(32, 32, &wasapi::SampleType::Float, 48_000, 2, None)
}

#[cfg(windows)]
fn sine(freq: f32, seconds: f32, amp: f32) -> Vec<f32> {
    let len = (seconds * 48_000.0) as usize;
    (0..len)
        .map(|i| {
            let phase = i as f32 * freq * std::f32::consts::TAU / 48_000.0;
            phase.sin() * amp
        })
        .collect()
}

#[cfg(windows)]
struct ToneResult {
    pass: bool,
    target: f32,
    reference: f32,
}

#[cfg(windows)]
fn tone_pass(samples: &[f32], target_hz: f32) -> ToneResult {
    let target = goertzel(samples, target_hz);
    let reference = goertzel(samples, 1000.0).max(1e-9);
    ToneResult {
        pass: target >= reference * 10.0,
        target,
        reference,
    }
}

#[cfg(windows)]
fn goertzel(samples: &[f32], hz: f32) -> f32 {
    let omega = std::f32::consts::TAU * hz / 48_000.0;
    let coeff = 2.0 * omega.cos();
    let mut s1 = 0.0;
    let mut s2 = 0.0;
    for sample in samples {
        let s0 = sample + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    s1 * s1 + s2 * s2 - coeff * s1 * s2
}

#[cfg(windows)]
fn first_above(samples: &[f32], threshold: f32) -> Option<usize> {
    samples.iter().position(|sample| sample.abs() > threshold)
}

#[cfg(windows)]
fn label(pass: bool) -> &'static str {
    if pass {
        "PASS"
    } else {
        "FAIL"
    }
}
