import type { FileDropEvent } from './api'
import type { ClipInfo, DeviceInfo, EngineStatus, Meters, PadInfo, Playback, Settings } from './types'

export type EventName =
  | 'status'
  | 'meters'
  | 'live'
  | 'clip'
  | 'pads'
  | 'playback'
  | 'devices'
  | 'settings'
  | 'key-captured'
  | 'error'
  | 'file-drop'

export interface EventPayloads {
  status: EngineStatus
  meters: Meters
  live: { peaks: number[] }
  clip: ClipInfo
  pads: Array<PadInfo | null>
  playback: Playback
  devices: DeviceInfo[]
  settings: Settings
  'key-captured': { key: string }
  error: { message: string }
  'file-drop': FileDropEvent
}

export type Listener<K extends EventName> = (payload: EventPayloads[K]) => void
