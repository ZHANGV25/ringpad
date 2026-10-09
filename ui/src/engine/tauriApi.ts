import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { DragDropEvent } from '@tauri-apps/api/webview'
import type { EngineApi, FileDropEvent, Unsubscribe } from './api'
import { normalizeAsyncUnlisten } from './api'
import type {
  AudioApp,
  ClipInfo,
  DeviceInfo,
  EngineStatus,
  Meters,
  PadInfo,
  Playback,
  Settings,
  SettingsPatch,
  Snapshot,
} from './types'

function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args)
}

function event<T>(name: string, handler: (payload: T) => void): Unsubscribe {
  return normalizeAsyncUnlisten(listen<T>(name, (eventPayload) => handler(eventPayload.payload)))
}

function dragEvent(eventPayload: DragDropEvent): FileDropEvent {
  switch (eventPayload.type) {
    case 'enter':
      return { type: 'enter', paths: eventPayload.paths, position: eventPayload.position }
    case 'over':
      return { type: 'over', position: eventPayload.position }
    case 'drop':
      return { type: 'drop', paths: eventPayload.paths, position: eventPayload.position }
    case 'leave':
      return { type: 'leave' }
    default:
      return { type: 'leave' }
  }
}

export const tauriApi: EngineApi = {
  getSnapshot: () => command<Snapshot>('get_snapshot'),
  listDevices: () => command<DeviceInfo[]>('list_devices'),
  listAudioApps: () => command<AudioApp[]>('list_audio_apps'),
  updateSettings: (args: { patch: SettingsPatch }) => command<Settings>('update_settings', args),
  grabClip: () => command<ClipInfo>('grab_clip'),
  previewClip: () => command<void>('preview_clip'),
  sendClip: () => command<void>('send_clip'),
  stopAll: () => command<void>('stop_all'),
  saveClipToPad: (args: { slot: number }) => command<PadInfo>('save_clip_to_pad', args),
  playPad: (args: { slot: number }) => command<void>('play_pad', args),
  importPad: (args: { slot: number; path: string }) => command<PadInfo>('import_pad', args),
  renamePad: (args: { slot: number; name: string }) => command<PadInfo>('rename_pad', args),
  setPadVolume: (args: { slot: number; volume: number }) => command<PadInfo>('set_pad_volume', args),
  setPadHotkey: (args: { slot: number; hotkey: string | null }) => command<PadInfo>('set_pad_hotkey', args),
  clearPad: (args: { slot: number }) => command<void>('clear_pad', args),
  beginKeyCapture: () => command<void>('begin_key_capture'),
  cancelKeyCapture: () => command<void>('cancel_key_capture'),
  playTestTone: () => command<void>('play_test_tone'),
  openExternal: (args: { url: string }) => command<void>('open_external', args),
  openClipsFolder: () => command<void>('open_clips_folder'),
  onStatus: (handler: (status: EngineStatus) => void) => event('status', handler),
  onMeters: (handler: (meters: Meters) => void) => event('meters', handler),
  onLive: (handler: (payload: { peaks: number[] }) => void) => event('live', handler),
  onClip: (handler: (clip: ClipInfo) => void) => event('clip', handler),
  onPads: (handler: (pads: Array<PadInfo | null>) => void) => event('pads', handler),
  onPlayback: (handler: (playback: Playback) => void) => event('playback', handler),
  onDevices: (handler: (devices: DeviceInfo[]) => void) => event('devices', handler),
  onSettings: (handler: (settings: Settings) => void) => event('settings', handler),
  onKeyCaptured: (handler: (payload: { key: string }) => void) => event('key-captured', handler),
  onError: (handler: (payload: { message: string }) => void) => event('error', handler),
  onFileDrop(handler: (eventPayload: FileDropEvent) => void): Unsubscribe {
    return normalizeAsyncUnlisten(
      getCurrentWebview().onDragDropEvent((eventPayload) => handler(dragEvent(eventPayload.payload))),
    )
  },
}
