import type {
  ClipInfo,
  DeviceInfo,
  EngineStatus,
  PadInfo,
  Playback,
  Settings,
  Snapshot,
} from '../engine/types'

export interface Notice {
  id: number
  message: string
}

export interface EngineState {
  loaded: boolean
  version: string
  backend: string
  status: EngineStatus
  settings: Settings | null
  devices: DeviceInfo[]
  clip: ClipInfo | null
  pads: Array<PadInfo | null>
  playback: Playback
  virtualCaptureHint: string | null
  livePeaks: number[]
  notice: Notice | null
}

export type EngineAction =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'status'; status: EngineStatus }
  | { type: 'settings'; settings: Settings }
  | { type: 'devices'; devices: DeviceInfo[] }
  | { type: 'clip'; clip: ClipInfo }
  | { type: 'pads'; pads: Array<PadInfo | null> }
  | { type: 'playback'; playback: Playback }
  | { type: 'live'; peaks: number[] }
  | { type: 'error'; message: string; id: number }
  | { type: 'clearError'; id: number }

export const initialEngineState: EngineState = {
  loaded: false,
  version: '',
  backend: '',
  status: { kind: 'starting' },
  settings: null,
  devices: [],
  clip: null,
  pads: Array.from({ length: 8 }, () => null),
  playback: { sending: false, previewing: false, saveArmed: false },
  virtualCaptureHint: null,
  livePeaks: [],
  notice: null,
}

export function engineReducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case 'snapshot':
      return {
        ...state,
        loaded: true,
        version: action.snapshot.version,
        backend: action.snapshot.backend,
        status: action.snapshot.status,
        settings: action.snapshot.settings,
        devices: action.snapshot.devices,
        clip: action.snapshot.clip,
        pads: action.snapshot.pads,
        playback: action.snapshot.playback,
        virtualCaptureHint: action.snapshot.virtualCaptureHint,
      }
    case 'status':
      return { ...state, status: action.status }
    case 'settings':
      return { ...state, settings: action.settings }
    case 'devices':
      return { ...state, devices: action.devices }
    case 'clip':
      return { ...state, clip: action.clip }
    case 'pads':
      return { ...state, pads: action.pads }
    case 'playback':
      return { ...state, playback: action.playback }
    case 'live':
      return { ...state, livePeaks: action.peaks }
    case 'error':
      return { ...state, notice: { id: action.id, message: action.message } }
    case 'clearError':
      return state.notice?.id === action.id ? { ...state, notice: null } : state
    default:
      return state
  }
}
