import { DEFAULT_TALK } from '../engine/types'
import type {
  ClipInfo,
  DeviceInfo,
  EngineStatus,
  PadInfo,
  Playback,
  Settings,
  Snapshot,
  TalkState,
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
  talk: TalkState
  virtualCaptureHint: string | null
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
  | { type: 'talk'; talk: TalkState }
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
  talk: DEFAULT_TALK,
  virtualCaptureHint: null,
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
        talk: action.snapshot.talk,
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
    case 'talk':
      return { ...state, talk: action.talk }
    case 'error':
      return { ...state, notice: { id: action.id, message: action.message } }
    case 'clearError':
      return state.notice?.id === action.id ? { ...state, notice: null } : state
    default:
      return state
  }
}
