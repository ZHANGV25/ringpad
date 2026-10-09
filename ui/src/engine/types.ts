import type { ThemePreference } from '../theme'

export type { ThemePreference }

export interface DeviceInfo {
  id: string
  name: string
  direction: 'output' | 'input'
  isDefault: boolean
  virtualCable: 'vbcable' | 'voicemod' | 'voicemeeter' | 'other' | null
}

export interface AudioApp {
  pid: number
  exe: string
  name: string
  active: boolean
  peak: number
}

export type SourceSetting =
  | { kind: 'default' }
  | { kind: 'device'; id: string }
  | { kind: 'app'; exe: string; name: string }

export interface Hotkeys {
  grab: string | null
  send: string | null
  sendAlt: string | null
  stop: string | null
  save: string | null
}

export interface Settings {
  theme: ThemePreference
  source: SourceSetting
  virtualOutput: string | null
  mic: string | null
  micEnabled: boolean
  headphones: string | null
  sendVolume: number
  monitorVolume: number
  ducking: boolean
  historySeconds: number
  grabSeconds: number
  hotkeys: Hotkeys
  startMinimized: boolean
  startWithWindows: boolean
  clipRetentionDays: number
  firstRunDone: boolean
}

export type EngineStatus =
  | { kind: 'starting' }
  | { kind: 'running'; sourceLabel: string }
  | { kind: 'stopped'; reason: string }
  | { kind: 'needsSetup'; reason: string }

export interface ClipInfo {
  id: string
  seconds: number
  peaks: number[]
  savedPath: string | null
}

export interface PadInfo {
  slot: number
  name: string
  seconds: number
  volume: number
  hotkey: string | null
  peaks: number[]
}

export interface Meters {
  source: number
  mic: number
  outgoing: number
}

export interface Playback {
  sending: boolean
  previewing: boolean
  saveArmed: boolean
}

export interface Snapshot {
  version: string
  backend: string
  status: EngineStatus
  settings: Settings
  devices: DeviceInfo[]
  clip: ClipInfo | null
  pads: Array<PadInfo | null>
  playback: Playback
  virtualCaptureHint: string | null
}

export type SettingsPatch = Partial<Settings>

export const DEFAULT_HOTKEYS: Hotkeys = {
  grab: 'f8',
  send: 'f7',
  sendAlt: 'mouse5',
  stop: 'f9',
  save: 'f6',
}

export const DEFAULT_PAD_HOTKEYS: ReadonlyArray<string | null> = [
  'f1',
  'f2',
  'f3',
  'f4',
  null,
  null,
  null,
  null,
]

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  source: { kind: 'default' },
  virtualOutput: null,
  mic: null,
  micEnabled: false,
  headphones: null,
  sendVolume: 0.5,
  monitorVolume: 0.6,
  ducking: true,
  historySeconds: 30,
  grabSeconds: 5,
  hotkeys: DEFAULT_HOTKEYS,
  startMinimized: false,
  startWithWindows: false,
  clipRetentionDays: 7,
  firstRunDone: false,
}

export function makeEmptyPads(): Array<PadInfo | null> {
  return Array.from({ length: 8 }, () => null)
}
