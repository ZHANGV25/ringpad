import type {
  AudioApp,
  CableInstall,
  ClipInfo,
  DeviceInfo,
  EngineStatus,
  Meters,
  MicUser,
  PadInfo,
  Playback,
  Settings,
  SettingsPatch,
  Snapshot,
  TalkState,
} from './types'

export type Unsubscribe = () => void

export interface PhysicalPoint {
  x: number
  y: number
}

export type FileDropEvent =
  | { type: 'enter'; paths: string[]; position: PhysicalPoint }
  | { type: 'over'; position: PhysicalPoint }
  | { type: 'drop'; paths: string[]; position: PhysicalPoint }
  | { type: 'leave' }

export interface EngineApi {
  getSnapshot(): Promise<Snapshot>
  listDevices(): Promise<DeviceInfo[]>
  listAudioApps(): Promise<AudioApp[]>
  /** Apps recording from a microphone right now, such as Discord in a call. */
  micUsers(): Promise<MicUser[]>
  updateSettings(args: { patch: SettingsPatch }): Promise<Settings>
  grabClip(): Promise<ClipInfo>
  previewClip(): Promise<void>
  sendClip(): Promise<void>
  stopAll(): Promise<void>
  saveClipToPad(args: { slot: number }): Promise<PadInfo>
  playPad(args: { slot: number }): Promise<void>
  importPad(args: { slot: number; path: string }): Promise<PadInfo>
  /** Opens Windows' file picker for a sound; null when it is closed without one. */
  pickSoundFile(): Promise<string | null>
  renamePad(args: { slot: number; name: string }): Promise<PadInfo>
  setPadVolume(args: { slot: number; volume: number }): Promise<PadInfo>
  setPadHotkey(args: { slot: number; hotkey: string | null }): Promise<PadInfo>
  clearPad(args: { slot: number }): Promise<void>
  beginKeyCapture(): Promise<void>
  cancelKeyCapture(): Promise<void>
  playTestTone(): Promise<void>
  openExternal(args: { url: string }): Promise<void>
  openClipsFolder(): Promise<void>
  testTalkKeys(): Promise<void>
  installVirtualMic(): Promise<CableInstall>
  onStatus(handler: (status: EngineStatus) => void): Unsubscribe
  onMeters(handler: (meters: Meters) => void): Unsubscribe
  onLive(handler: (payload: { peaks: number[] }) => void): Unsubscribe
  onClip(handler: (clip: ClipInfo) => void): Unsubscribe
  onPads(handler: (pads: Array<PadInfo | null>) => void): Unsubscribe
  onPlayback(handler: (playback: Playback) => void): Unsubscribe
  onDevices(handler: (devices: DeviceInfo[]) => void): Unsubscribe
  onSettings(handler: (settings: Settings) => void): Unsubscribe
  onKeyCaptured(handler: (payload: { key: string }) => void): Unsubscribe
  onError(handler: (payload: { message: string }) => void): Unsubscribe
  onTalk(handler: (talk: TalkState) => void): Unsubscribe
  onFileDrop(handler: (event: FileDropEvent) => void): Unsubscribe
  dispose?(): void
}

export function normalizeAsyncUnlisten(promise: Promise<Unsubscribe>): Unsubscribe {
  let disposed = false
  let inner: Unsubscribe | null = null
  promise.then((unlisten) => {
    if (disposed) {
      unlisten()
    } else {
      inner = unlisten
    }
  }).catch(() => undefined)
  return () => {
    disposed = true
    inner?.()
  }
}
