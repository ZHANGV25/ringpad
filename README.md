# Ringpad

A soundboard for Windows with instant replay for voice chat. Ringpad keeps the last 30 seconds of
game or Discord audio, so one key plays back what someone just said into your mic. It also has
ordinary pads for your own sounds.

Status: early development. The first release (v0.1) is planned for October 2026.

## How it works

- A ring buffer records the audio you already hear (a whole output device, or one app).
- **Clip** (F8) takes the last few seconds, trims silence, evens out the level, and plays it to you only.
- **Send** (F7 or a mouse side button) plays it to everyone through a virtual microphone.
- Your real mic is passed through, so you can keep talking.

Ringpad needs a virtual audio cable to act as a microphone: VB-CABLE (free), Voicemod's virtual
device, or VoiceMeeter.

## Build from source

Requires Rust (stable), Node 22, and the WebView2 runtime (built into Windows 11).

```bash
npm install
npm run dev
```

Tests:

```bash
cargo test --workspace
npm test
```

## Layout

| Path | What |
| --- | --- |
| `crates/core` | Audio engine with no OS code: ring buffer, clips, pads, mixing |
| `crates/windows` | WASAPI capture and playback, per-app capture, Raw Input hotkeys |
| `app` | Tauri 2 shell: window, tray, settings |
| `ui` | React + TypeScript interface, monochrome light and dark themes |

## Privacy

Everything stays on your PC. No accounts, no telemetry.

## License

[MIT](LICENSE)
