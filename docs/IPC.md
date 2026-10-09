# Ringpad UI IPC contract

The UI calls Tauri commands with camelCase argument objects and listens to the event names below. Commands reject with a string message.

## Types

`ThemePreference`: `system | light | dark`.

`DeviceInfo`: `id`, `name`, `direction: output | input`, `isDefault`, `virtualCable: vbcable | voicemod | voicemeeter | other | null`.

`AudioApp`: `pid`, `exe`, `name`, `active`, `peak` from `0` to `1`.

`SourceSetting`: `{ kind: 'default' }`, `{ kind: 'device', id }`, or `{ kind: 'app', exe, name }`.

`Hotkeys`: `grab`, `send`, `sendAlt`, `stop`, `save`, `talk`, each a key string or `null`. `talk` defaults to `null`; the others default as in `DEFAULT_HOTKEYS`.

`MicMode`: `open | pushToTalk | toggle`.

`PressTalkKeys`: `off | clips | clipsAndMic`.

`TalkState`: `micOpen` (whether the real mic reaches the cable right now; always true in `open` mode), `holding` (game talk keys Ringpad is holding down right now, as key strings), `blocked` (a sentence saying why Windows refused the key press, or `null`).

`Settings`: theme, source, relaySource, virtualOutput, mic, micEnabled, headphones, sendVolume, monitorVolume, ducking, historySeconds, grabSeconds, hotkeys, startMinimized, startWithWindows, clipRetentionDays, firstRunDone, micMode, pressTalkKeys, gameTalkKeys, talkLeadMs, talkTailMs, talkOnlyApp.

Talk settings and defaults: `micMode` `open`; `pressTalkKeys` `off`; `gameTalkKeys` `['v']` (1 to 3 key strings); `talkLeadMs` `100` (0 to 500); `talkTailMs` `250` (0 to 2000); `talkOnlyApp` `null` (an exe file name such as `VALORANT-Win64-Shipping.exe`; `null` means any app).

`EngineStatus`: `{ kind: 'starting' }`, `{ kind: 'running', sourceLabel }`, `{ kind: 'stopped', reason }`, or `{ kind: 'needsSetup', reason }`.

`ClipInfo`: `id`, `seconds`, `peaks` with 120 values, `savedPath`.

`PadInfo`: `slot` from `0` to `7`, `name`, `seconds`, `volume`, `hotkey`, `peaks` with 48 values.

`Meters`: `source`, `mic`, `outgoing`, each `0` to `1`.

`Playback`: `sending`, `previewing`, `saveArmed`.

`Snapshot`: version, backend, status, settings, devices, clip, pads, playback, virtualCaptureHint, talk.

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
- `test_talk_keys()`: holds `gameTalkKeys` for 2 seconds (ignoring `talkOnlyApp`) and emits `talk` as it presses and releases. Rejects with the `blocked` sentence when Windows refuses the press.

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
- `talk: TalkState`, sent whenever it changes.

## UI decisions

Pad slots are zero-based everywhere in the UI contract. The first pad is `slot: 0`.

The UI cancel link for save-arm calls `stop_all()` because there is no separate cancel-save command.

`open_external` is only called for `https://` links.

## Talk (push-to-talk and the game's talk key)

Mic gate. In `open` mode the real mic is always mixed into the cable (as before). In `pushToTalk` mode it is mixed only while `hotkeys.talk` is held. In `toggle` mode each press of `hotkeys.talk` turns it on or off. Clips and pads always reach the cable. The gate fades over 5 ms so it does not click. The stop hotkey and `stop_all()` also turn a toggled mic off and release any held game keys. With `micMode` not `open` and `hotkeys.talk` `null`, the mic stays off.

Pressing the game's talk key. For games whose voice chat is push-to-talk only (Valorant team voice), Ringpad can hold the game's own key with a normal Windows key press (`SendInput` with scan codes; no driver, nothing injected into games).
- `off`: never.
- `clips`: while a clip or pad plays into the cable, Ringpad holds every key in `gameTalkKeys`. If it is not already holding them, it presses them first and starts the clip `talkLeadMs` later, so the first word is not cut. It releases them `talkTailMs` after the last clip ends.
- `clipsAndMic`: as `clips`, and also while the mic gate is on in `pushToTalk` or `toggle` mode (released `talkTailMs` after both stop). This is toggle-to-talk for push-to-talk games: press `hotkeys.talk` once and Ringpad holds the game key until the next press.
- With `talkOnlyApp` set, keys are pressed only while that exe owns the foreground window (clips still play, without the key, otherwise), so a `v` never lands in a chat box.
- If the user releases a game talk key with their own hand while Ringpad wants it held, Ringpad presses it again. If the user is already holding it, Ringpad does not press it again.
- Ringpad's hotkey listener ignores the synthetic presses Ringpad itself sends.
- On quit Ringpad releases every key it holds. If it crashed while holding keys, it releases them at the next start.
- When the foreground app runs as administrator and Ringpad does not, Windows drops the presses. Ringpad then sets `blocked` to a sentence naming the exe and suggesting running Ringpad as administrator.

`hotkeys.talk` may equal a game talk key (toggle on `v` works). It must not equal another Ringpad hotkey or a pad hotkey. `gameTalkKeys` must not contain a Ringpad hotkey other than `hotkeys.talk`.
