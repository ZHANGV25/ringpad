import type { EngineApi, FileDropEvent, Unsubscribe } from './api'
import {
  DEFAULT_PAD_HOTKEYS,
  DEFAULT_SETTINGS,
  type AudioApp,
  type ClipInfo,
  type DeviceInfo,
  type EngineStatus,
  type Meters,
  type PadInfo,
  type Settings,
  type SettingsPatch,
  type Snapshot,
} from './types'
import type { EventName, EventPayloads, Listener } from './fakeEvents'
import {
  cleanName,
  clamp,
  cloneClip,
  cloneDevices,
  clonePad,
  clonePads,
  cloneSettings,
  makeApps,
  makeClip,
  makeDevices,
  makePad,
  makePeaks,
  speechLevel,
  requirePad,
  seededRandom,
  walk,
} from './fakeData'
interface FakeOptions {
  now?: () => number
  random?: () => number
  startTimers?: boolean
  settings?: Partial<Settings>
  firstRunDone?: boolean
  devices?: DeviceInfo[]
}
const LIVE_PEAKS = 300

export class FakeEngineApi implements EngineApi {
  private readonly listeners = new Map<EventName, Set<(payload: never) => void>>()
  private readonly now: () => number
  private readonly random: () => number
  private meterTimer: number | null = null; private liveTimer: number | null = null; private previewTimer: number | null = null
  private clipCounter = 0
  private lastPadPlayed: number | null = null
  private meters: Meters = { source: 0.2, mic: 0.05, outgoing: 0 }
  private liveTick = 0
  private livePeaks: number[] = []
  private apps = makeApps()
  private readonly devices: DeviceInfo[]
  private status = { kind: 'running' as const, sourceLabel: 'your headphones' }
  private settings: Settings
  private clip: ClipInfo | null = null
  private pads: Array<PadInfo | null> = Array.from({ length: 8 }, () => null)
  private playback = { sending: false, previewing: false, saveArmed: false }
  private keyCapture = false
  public openedUrl: string | null = null
  public clipsFolderOpened = false
  constructor(options: FakeOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.random = options.random ?? seededRandom(7)
    this.livePeaks = Array.from({ length: LIVE_PEAKS }, (_, index) => speechLevel(index, this.random))
    this.liveTick = LIVE_PEAKS
    this.devices = options.devices ?? makeDevices()
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...options.settings,
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...options.settings?.hotkeys },
      firstRunDone: options.firstRunDone ?? options.settings?.firstRunDone ?? false,
    }
    this.settings.virtualOutput = this.settings.virtualOutput ?? 'vb-output'
    this.settings.headphones = this.settings.headphones ?? 'headphones'
    if (options.startTimers !== false) {
      this.meterTimer = window.setInterval(() => this.tickMeters(), 33)
      this.liveTimer = window.setInterval(() => this.tickLive(), 100)
    }
  }

  async getSnapshot(): Promise<Snapshot> {
    return {
      version: '0.1.0',
      backend: 'fake',
      status: this.status,
      settings: cloneSettings(this.settings),
      devices: cloneDevices(this.devices),
      clip: this.clip ? cloneClip(this.clip) : null,
      pads: clonePads(this.pads),
      playback: { ...this.playback },
      virtualCaptureHint: 'CABLE Output (VB-Audio Virtual Cable)',
    }
  }

  async listDevices(): Promise<DeviceInfo[]> {
    this.emit('devices', cloneDevices(this.devices))
    return cloneDevices(this.devices)
  }

  async listAudioApps(): Promise<AudioApp[]> {
    this.apps = this.apps.map((app, index) => ({
      ...app,
      active: index === 0 ? true : app.active,
      peak: clamp(app.peak + (this.random() - 0.5) * 0.2),
    }))
    return this.apps.map((app) => ({ ...app }))
  }

  async updateSettings({ patch }: { patch: SettingsPatch }): Promise<Settings> {
    this.settings = {
      ...this.settings,
      ...patch,
      hotkeys: patch.hotkeys ? { ...this.settings.hotkeys, ...patch.hotkeys } : this.settings.hotkeys,
    }
    this.emit('settings', cloneSettings(this.settings))
    return cloneSettings(this.settings)
  }

  async grabClip(): Promise<ClipInfo> {
    this.clipCounter += 1
    const seconds = this.settings.grabSeconds
    this.clip = makeClip(`clip-${this.now()}-${this.clipCounter}`, seconds, this.random)
    this.playback = { ...this.playback, previewing: true }
    this.emit('clip', cloneClip(this.clip))
    this.emit('playback', { ...this.playback })
    this.previewTimer = window.setTimeout(() => {
      this.playback = { ...this.playback, previewing: false }
      this.emit('playback', { ...this.playback })
    }, 450)
    return cloneClip(this.clip)
  }

  async previewClip(): Promise<void> {
    if (!this.clip) {
      throw new Error('No clip yet')
    }
    this.playback = { ...this.playback, previewing: true }
    this.emit('playback', { ...this.playback })
  }

  async sendClip(): Promise<void> {
    if (!this.clip) {
      throw new Error('No clip yet')
    }
    this.startSending()
  }

  async stopAll(): Promise<void> {
    this.playback = { sending: false, previewing: false, saveArmed: false }
    this.emit('playback', { ...this.playback })
  }

  async saveClipToPad({ slot }: { slot: number }): Promise<PadInfo> {
    if (!this.clip) {
      throw new Error('No clip to save')
    }
    const pad = makePad(slot, `Pad ${slot + 1}`, this.clip.seconds, this.clip.peaks, DEFAULT_PAD_HOTKEYS[slot] ?? null)
    this.pads = this.pads.map((current, index) => (index === slot ? pad : current))
    this.playback = { ...this.playback, saveArmed: false }
    this.emit('pads', clonePads(this.pads))
    this.emit('playback', { ...this.playback })
    return clonePad(pad)
  }

  async playPad({ slot }: { slot: number }): Promise<void> {
    if (!this.pads[slot]) {
      throw new Error('Pad is empty')
    }
    this.lastPadPlayed = slot
    this.startSending()
  }

  async importPad({ slot, path }: { slot: number; path: string }): Promise<PadInfo> {
    const name = cleanName(path) || `Pad ${slot + 1}`
    const pad = makePad(slot, name, 2.8, makePeaks(120, slot + 9, this.random), DEFAULT_PAD_HOTKEYS[slot] ?? null)
    this.pads = this.pads.map((current, index) => (index === slot ? pad : current))
    this.emit('pads', clonePads(this.pads))
    return clonePad(pad)
  }

  async renamePad({ slot, name }: { slot: number; name: string }): Promise<PadInfo> {
    const pad = requirePad(this.pads, slot)
    const next = { ...pad, name: name.trim() || `Pad ${slot + 1}` }
    this.pads = this.pads.map((current, index) => (index === slot ? next : current))
    this.emit('pads', clonePads(this.pads))
    return clonePad(next)
  }

  async setPadVolume({ slot, volume }: { slot: number; volume: number }): Promise<PadInfo> {
    const pad = requirePad(this.pads, slot)
    const next = { ...pad, volume: clamp(volume) }
    this.pads = this.pads.map((current, index) => (index === slot ? next : current))
    this.emit('pads', clonePads(this.pads))
    return clonePad(next)
  }

  async setPadHotkey({ slot, hotkey }: { slot: number; hotkey: string | null }): Promise<PadInfo> {
    const pad = requirePad(this.pads, slot)
    const next = { ...pad, hotkey }
    this.pads = this.pads.map((current, index) => (index === slot ? next : current))
    this.emit('pads', clonePads(this.pads))
    return clonePad(next)
  }

  async clearPad({ slot }: { slot: number }): Promise<void> {
    this.pads = this.pads.map((current, index) => (index === slot ? null : current))
    this.emit('pads', clonePads(this.pads))
  }

  async beginKeyCapture(): Promise<void> {
    this.keyCapture = true
  }

  async cancelKeyCapture(): Promise<void> {
    this.keyCapture = false
  }

  async playTestTone(): Promise<void> {
    this.meters = { ...this.meters, outgoing: 0.92 }
    this.emit('meters', { ...this.meters })
  }

  async openExternal({ url }: { url: string }): Promise<void> {
    if (!url.startsWith('https://')) {
      throw new Error('Only https links can be opened')
    }
    this.openedUrl = url
  }

  async openClipsFolder(): Promise<void> {
    this.clipsFolderOpened = true
  }

  onStatus: EngineApi['onStatus'] = (handler) => this.subscribe('status', handler)
  onMeters: EngineApi['onMeters'] = (handler) => this.subscribe('meters', handler)
  onLive: EngineApi['onLive'] = (handler) => this.subscribe('live', handler)
  onClip: EngineApi['onClip'] = (handler) => this.subscribe('clip', handler)
  onPads: EngineApi['onPads'] = (handler) => this.subscribe('pads', handler)
  onPlayback: EngineApi['onPlayback'] = (handler) => this.subscribe('playback', handler)
  onDevices: EngineApi['onDevices'] = (handler) => this.subscribe('devices', handler)
  onSettings: EngineApi['onSettings'] = (handler) => this.subscribe('settings', handler)
  onKeyCaptured: EngineApi['onKeyCaptured'] = (handler) => this.subscribe('key-captured', handler)
  onError: EngineApi['onError'] = (handler) => this.subscribe('error', handler)
  onFileDrop: EngineApi['onFileDrop'] = (handler) => this.subscribe('file-drop', handler)
  simulateKey(key: string): void {
    if (this.keyCapture) {
      this.keyCapture = false
      this.emit('key-captured', { key })
    }
  }

  emitError(message: string): void {
    this.emit('error', { message })
  }

  emitFileDrop(event: FileDropEvent): void {
    this.emit('file-drop', event)
  }

  /** What the save hotkey does in the real engine: the next pad key saves the clip. */
  armSave(): void {
    this.playback = { ...this.playback, saveArmed: true }
    this.emit('playback', { ...this.playback })
  }

  simulateStatus(status: EngineStatus): void {
    this.emit('status', status)
  }

  lastPad(): number | null {
    return this.lastPadPlayed
  }

  dispose(): void {
    if (this.meterTimer !== null) window.clearInterval(this.meterTimer)
    if (this.liveTimer !== null) window.clearInterval(this.liveTimer)
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer)
  }

  private subscribe<K extends EventName>(name: K, handler: Listener<K>): Unsubscribe {
    const set = this.listeners.get(name) ?? new Set<(payload: never) => void>()
    set.add(handler as (payload: never) => void)
    this.listeners.set(name, set)
    return () => set.delete(handler as (payload: never) => void)
  }

  private emit<K extends EventName>(name: K, payload: EventPayloads[K]): void {
    this.listeners.get(name)?.forEach((handler) => handler(payload as never))
  }

  private tickMeters(): void {
    this.meters = {
      source: walk(this.meters.source, this.random),
      mic: this.settings.micEnabled ? walk(this.meters.mic, this.random) * 0.5 : 0,
      outgoing: this.playback.sending ? walk(this.meters.outgoing || 0.4, this.random) : this.meters.outgoing * 0.82,
    }
    this.emit('meters', { ...this.meters })
  }

  private tickLive(): void {
    this.liveTick += 1
    this.livePeaks = [...this.livePeaks.slice(1 - LIVE_PEAKS), speechLevel(this.liveTick, this.random)]
    this.emit('live', { peaks: [...this.livePeaks] })
  }

  private startSending(): void {
    this.playback = { sending: true, previewing: false, saveArmed: this.playback.saveArmed }
    this.emit('playback', { ...this.playback })
  }
}

export function createFakeApi(options?: FakeOptions): FakeEngineApi {
  return new FakeEngineApi(options)
}
