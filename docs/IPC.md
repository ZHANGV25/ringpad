# Ringpad UI IPC contract

The UI calls Tauri commands with camelCase argument objects and listens to the event names below. Commands reject with a string message.

## Types

`ThemePreference`: `system | light | dark`.

`DeviceInfo`: `id`, `name`, `direction: output | input`, `isDefault`, `virtualCable: vbcable | voicemod | voicemeeter | other | null`.

`AudioApp`: `pid`, `exe`, `name`, `active`, `peak` from `0` to `1`.

`SourceSetting`: `{ kind: 'default' }`, `{ kind: 'device', id }`, or `{ kind: 'app', exe, name }`.

`Hotkeys`: `grab`, `send`, `sendAlt`, `stop`, `save`, each a key string or `null`.

`Settings`: theme, source, relaySource, virtualOutput, mic, micEnabled, headphones, sendVolume, monitorVolume, ducking, historySeconds, grabSeconds, hotkeys, startMinimized, startWithWindows, clipRetentionDays, firstRunDone.

`EngineStatus`: `{ kind: 'starting' }`, `{ kind: 'running', sourceLabel }`, `{ kind: 'stopped', reason }`, or `{ kind: 'needsSetup', reason }`.

`ClipInfo`: `id`, `seconds`, `peaks` with 120 values, `savedPath`.

`PadInfo`: `slot` from `0` to `7`, `name`, `seconds`, `volume`, `hotkey`, `peaks` with 48 values.

`Meters`: `source`, `mic`, `outgoing`, each `0` to `1`.

`Playback`: `sending`, `previewing`, `saveArmed`.

`Snapshot`: version, backend, status, settings, devices, clip, pads, playback, virtualCaptureHint.

## Commands

- `get_snapshot() -> Snapshot`
- `list_devices() -> DeviceInfo[]`
- `list_audio_apps() -> AudioApp[]`
- `update_settings({ patch }) -> Settings`
- `grab_clip() -> ClipInfo`
- `preview_clip()`
- `send_clip()`
- `stop_all()`
- `save_clip_to_pad({ slot }) -> PadInfo`
- `play_pad({ slot })`
- `import_pad({ slot, path }) -> PadInfo`
- `rename_pad({ slot, name }) -> PadInfo`
- `set_pad_volume({ slot, volume }) -> PadInfo`
- `set_pad_hotkey({ slot, hotkey }) -> PadInfo`
- `clear_pad({ slot })`
- `begin_key_capture()`
- `cancel_key_capture()`
- `play_test_tone()`
- `open_external({ url })`
- `open_clips_folder()`

## Events

- `status: EngineStatus`
- `meters: Meters`
- `live: { peaks: number[] }`
- `clip: ClipInfo`
- `pads: (PadInfo | null)[]`
- `playback: Playback`
- `devices: DeviceInfo[]`
- `settings: Settings`
- `key-captured: { key }`
- `error: { message }`

## UI decisions

Pad slots are zero-based everywhere in the UI contract. The first pad is `slot: 0`.

The UI cancel link for save-arm calls `stop_all()` because there is no separate cancel-save command.

`open_external` is only called for `https://` links.
