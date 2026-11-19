use super::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

pub(super) fn start_platform(
    config: ServiceConfig,
    engine: Engine,
) -> Result<AudioService, crate::BackendError> {
    let stop = Arc::new(AtomicBool::new(false));
    let running = Arc::new(AtomicBool::new(false));
    let reason = Arc::new(Mutex::new(None));
    let thread_stop = Arc::clone(&stop);
    let thread_running = Arc::clone(&running);
    let thread_reason = Arc::clone(&reason);
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let thread = thread::Builder::new()
        .name("ringpad-audio".to_string())
        .spawn(move || {
            audio_thread(
                config,
                engine,
                thread_stop,
                thread_running,
                thread_reason,
                ready_tx,
            );
        })
        .map_err(|error| crate::BackendError::ThreadStart(error.to_string()))?;
    match ready_rx
        .recv()
        .map_err(|error| crate::BackendError::ThreadStart(error.to_string()))?
    {
        Ok(source_pid) => Ok(AudioService {
            stop,
            running,
            reason,
            thread: Some(thread),
            source_pid,
        }),
        Err(error) => {
            let _ = thread.join();
            Err(error)
        }
    }
}

fn audio_thread(
    config: ServiceConfig,
    mut engine: Engine,
    stop: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    reason: Arc<Mutex<Option<String>>>,
    ready: std::sync::mpsc::Sender<Result<Option<u32>, crate::BackendError>>,
) {
    let mmcss = mmcss_register();
    let streams = match open_streams(&config).and_then(|streams| {
        start_streams(&streams)?;
        Ok(streams)
    }) {
        Ok(streams) => streams,
        Err(error) => {
            mmcss_revert(mmcss);
            let _ = ready.send(Err(error));
            return;
        }
    };
    running.store(true, Ordering::Release);
    let _ = ready.send(Ok(streams.source_pid));

    let mut source_bytes = vec![0_u8; SCRATCH_FRAMES * BYTES_PER_FRAME];
    let mut source_mono = vec![0.0_f32; SCRATCH_FRAMES];
    let mut mic_bytes = vec![0_u8; SCRATCH_FRAMES * BYTES_PER_FRAME];
    let mut mic_mono = vec![0.0_f32; SCRATCH_FRAMES];
    let mut render_mono = vec![0.0_f32; SCRATCH_FRAMES];
    let mut render_bytes = vec![0_u8; SCRATCH_FRAMES * BYTES_PER_FRAME];
    let started = std::time::Instant::now();
    let mut timeouts = 0_u8;
    let exit_reason = loop {
        if stop.load(Ordering::Acquire) {
            break "stopped".to_string();
        }
        match streams.virtual_mic.event.wait_for_event(200) {
            Ok(()) => timeouts = 0,
            Err(error) => {
                timeouts = timeouts.saturating_add(1);
                if timeouts >= 10 {
                    break format!("render event timed out: {error}");
                }
                continue;
            }
        }
        engine.set_time_seconds(started.elapsed().as_secs_f64());
        if let Some(source) = streams.source.as_ref() {
            if let Err(error) = drain_capture(
                &source.capture,
                &mut source_bytes,
                &mut source_mono,
                |samples| engine.on_source(samples),
            ) {
                break format!("source capture failed: {error}");
            }
        }
        if let Some(mic) = streams.mic.as_ref() {
            if let Err(error) =
                drain_capture(&mic.capture, &mut mic_bytes, &mut mic_mono, |samples| {
                    engine.on_mic(samples)
                })
            {
                break format!("microphone capture failed: {error}");
            }
        }
        if let Err(error) = render_stream(
            &streams.virtual_mic,
            &mut render_mono,
            &mut render_bytes,
            |out| engine.render_virtual_mic(out),
        ) {
            break format!("virtual microphone render failed: {error}");
        }
        if let Some(headphones) = streams.headphones.as_ref() {
            if let Err(error) =
                render_stream(headphones, &mut render_mono, &mut render_bytes, |out| {
                    engine.render_headphones(out)
                })
            {
                break format!("headphone render failed: {error}");
            }
        }
    };
    stop_streams(&streams);
    mmcss_revert(mmcss);
    running.store(false, Ordering::Release);
    if let Ok(mut reason) = reason.lock() {
        *reason = Some(exit_reason);
    }
}

struct Streams {
    /// `None` while recording nothing (see `SourceSpec::Nothing`).
    source: Option<CaptureStream>,
    /// The process an app source records.
    source_pid: Option<u32>,
    mic: Option<CaptureStream>,
    virtual_mic: RenderStream,
    headphones: Option<RenderStream>,
}

struct CaptureStream {
    client: wasapi::AudioClient,
    capture: wasapi::AudioCaptureClient,
    _event: wasapi::Handle,
}

struct RenderStream {
    client: wasapi::AudioClient,
    render: wasapi::AudioRenderClient,
    event: wasapi::Handle,
}

fn open_streams(config: &ServiceConfig) -> Result<Streams, crate::BackendError> {
    let _ = wasapi::initialize_mta();
    let (source, source_pid) = open_source(&config.source)?;
    let mic = config
        .mic_id
        .as_deref()
        .map(open_capture_device)
        .transpose()?;
    let virtual_mic = open_render_device(&config.virtual_output_id)?;
    let headphones = config
        .headphones_id
        .as_deref()
        .map(open_render_device)
        .transpose()?;
    Ok(Streams {
        source,
        source_pid,
        mic,
        virtual_mic,
        headphones,
    })
}

/// Opens the recorded source and, for an app, returns the process it records.
type OpenedSource = (Option<CaptureStream>, Option<u32>);

fn open_source(source: &SourceSpec) -> Result<OpenedSource, crate::BackendError> {
    match source {
        SourceSpec::Nothing => Ok((None, None)),
        SourceSpec::DefaultOutputLoopback => {
            let enumerator =
                wasapi::DeviceEnumerator::new().map_err(crate::BackendError::from_wasapi)?;
            let device = enumerator
                .get_default_device(&wasapi::Direction::Render)
                .map_err(crate::BackendError::from_wasapi)?;
            open_loopback_device(device).map(|stream| (Some(stream), None))
        }
        SourceSpec::DeviceLoopback(id) => {
            let enumerator =
                wasapi::DeviceEnumerator::new().map_err(crate::BackendError::from_wasapi)?;
            let device = enumerator
                .get_device(id)
                .map_err(|_| crate::BackendError::DeviceNotFound(id.clone()))?;
            open_loopback_device(device).map(|stream| (Some(stream), None))
        }
        SourceSpec::App(exe) => {
            let pid = crate::sessions::resolve_app_pid(exe)?;
            let client = wasapi::AudioClient::new_application_loopback_client(pid, true)
                .map_err(crate::BackendError::from_wasapi)?;
            initialize_capture_client(client).map(|stream| (Some(stream), Some(pid)))
        }
    }
}

fn open_capture_device(id: &str) -> Result<CaptureStream, crate::BackendError> {
    let enumerator = wasapi::DeviceEnumerator::new().map_err(crate::BackendError::from_wasapi)?;
    let device = enumerator
        .get_device(id)
        .map_err(|_| crate::BackendError::DeviceNotFound(id.to_string()))?;
    let client = device
        .get_iaudioclient()
        .map_err(crate::BackendError::from_wasapi)?;
    initialize_capture_client(client)
}

fn open_loopback_device(device: wasapi::Device) -> Result<CaptureStream, crate::BackendError> {
    let client = device
        .get_iaudioclient()
        .map_err(crate::BackendError::from_wasapi)?;
    initialize_capture_client(client)
}

fn initialize_capture_client(
    mut client: wasapi::AudioClient,
) -> Result<CaptureStream, crate::BackendError> {
    client
        .initialize_client(&audio_format(), &wasapi::Direction::Capture, &stream_mode())
        .map_err(crate::BackendError::from_wasapi)?;
    let event = client
        .set_get_eventhandle()
        .map_err(crate::BackendError::from_wasapi)?;
    let capture = client
        .get_audiocaptureclient()
        .map_err(crate::BackendError::from_wasapi)?;
    Ok(CaptureStream {
        client,
        capture,
        _event: event,
    })
}

fn open_render_device(id: &str) -> Result<RenderStream, crate::BackendError> {
    let enumerator = wasapi::DeviceEnumerator::new().map_err(crate::BackendError::from_wasapi)?;
    let device = enumerator
        .get_device(id)
        .map_err(|_| crate::BackendError::DeviceNotFound(id.to_string()))?;
    let mut client = device
        .get_iaudioclient()
        .map_err(crate::BackendError::from_wasapi)?;
    client
        .initialize_client(&audio_format(), &wasapi::Direction::Render, &stream_mode())
        .map_err(crate::BackendError::from_wasapi)?;
    let event = client
        .set_get_eventhandle()
        .map_err(crate::BackendError::from_wasapi)?;
    let render = client
        .get_audiorenderclient()
        .map_err(crate::BackendError::from_wasapi)?;
    Ok(RenderStream {
        client,
        render,
        event,
    })
}

fn audio_format() -> wasapi::WaveFormat {
    wasapi::WaveFormat::new(
        32,
        32,
        &wasapi::SampleType::Float,
        RATE as usize,
        CHANNELS,
        None,
    )
}

fn stream_mode() -> wasapi::StreamMode {
    wasapi::StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: 0,
    }
}

fn start_streams(streams: &Streams) -> Result<(), crate::BackendError> {
    if let Some(source) = streams.source.as_ref() {
        source
            .client
            .start_stream()
            .map_err(crate::BackendError::from_wasapi)?;
    }
    if let Some(mic) = streams.mic.as_ref() {
        mic.client
            .start_stream()
            .map_err(crate::BackendError::from_wasapi)?;
    }
    streams
        .virtual_mic
        .client
        .start_stream()
        .map_err(crate::BackendError::from_wasapi)?;
    if let Some(headphones) = streams.headphones.as_ref() {
        headphones
            .client
            .start_stream()
            .map_err(crate::BackendError::from_wasapi)?;
    }
    Ok(())
}

fn stop_streams(streams: &Streams) {
    if let Some(source) = streams.source.as_ref() {
        let _ = source.client.stop_stream();
    }
    if let Some(mic) = streams.mic.as_ref() {
        let _ = mic.client.stop_stream();
    }
    let _ = streams.virtual_mic.client.stop_stream();
    if let Some(headphones) = streams.headphones.as_ref() {
        let _ = headphones.client.stop_stream();
    }
}

fn drain_capture(
    capture: &wasapi::AudioCaptureClient,
    bytes: &mut [u8],
    mono: &mut [f32],
    mut consume: impl FnMut(&[f32]),
) -> Result<(), wasapi::WasapiError> {
    loop {
        let frames = capture.get_next_packet_size()?.unwrap_or(0) as usize;
        if frames == 0 {
            return Ok(());
        }
        if frames > mono.len() {
            return Err(wasapi::WasapiError::DataLengthTooShort {
                received: mono.len(),
                expected: frames,
            });
        }
        let byte_len = frames * BYTES_PER_FRAME;
        let (read, info) = capture.read_from_device(&mut bytes[..byte_len])?;
        let read = read as usize;
        if info.flags.silent {
            mono[..read].fill(0.0);
        } else {
            crate::mixdown::stereo_bytes_to_mono(&bytes[..read * BYTES_PER_FRAME], mono);
        }
        consume(&mono[..read]);
    }
}

fn render_stream(
    stream: &RenderStream,
    mono: &mut [f32],
    bytes: &mut [u8],
    mut render: impl FnMut(&mut [f32]),
) -> Result<(), wasapi::WasapiError> {
    let mut frames = stream.client.get_available_space_in_frames()? as usize;
    while frames > 0 {
        let chunk = frames.min(mono.len());
        render(&mut mono[..chunk]);
        crate::mixdown::mono_to_stereo_bytes(&mono[..chunk], &mut bytes[..chunk * BYTES_PER_FRAME]);
        stream
            .render
            .write_to_device(chunk, &bytes[..chunk * BYTES_PER_FRAME], None)?;
        frames -= chunk;
    }
    Ok(())
}

fn mmcss_register() -> Option<windows::Win32::Foundation::HANDLE> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Threading::AvSetMmThreadCharacteristicsW;

    let mut task_index = 0_u32;
    let name: Vec<u16> = "Pro Audio"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    match unsafe { AvSetMmThreadCharacteristicsW(PCWSTR(name.as_ptr()), &mut task_index) } {
        Ok(handle) => Some(handle),
        Err(error) => {
            log::warn!("MMCSS registration failed: {error}");
            None
        }
    }
}

fn mmcss_revert(handle: Option<windows::Win32::Foundation::HANDLE>) {
    if let Some(handle) = handle {
        let _ =
            unsafe { windows::Win32::System::Threading::AvRevertMmThreadCharacteristics(handle) };
    }
}
