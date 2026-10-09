import type { EngineApi, FileDropEvent, Unsubscribe } from './api'
import { DEFAULT_PAD_HOTKEYS, DEFAULT_SETTINGS, DEFAULT_TALK, type AudioApp, type ClipInfo, type DeviceInfo, type EngineStatus, type Meters, type PadInfo, type Settings, type SettingsPatch, type Snapshot, type TalkState } from './types'
import type { EventName, EventPayloads, Listener } from './fakeEvents'
import { nextTalkState, talkEqual, validateTalkSettings } from './fakeTalk'
import { cleanName, clamp, cloneClip, cloneDevices, clonePad, clonePads, cloneSettings, cloneTalk, makeApps, makeClip, makeDevices, makePad, makePeaks, requirePad, seededRandom, speechLevel, walk } from './fakeData'
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
  private talk: TalkState = cloneTalk(DEFAULT_TALK)
  private clip: ClipInfo | null = null
  private pads: Array<PadInfo | null> = Array.from({ length: 8 }, () => null)
  private playback = { sending: false, previewing: false, saveArmed: false }
  private keyCapture = false
  private heldKeys = new Set<string>()
  private toggledMicOpen = false
  private clipHolding = false
  private sendingTimer: number | null = null
  private talkTailTimer: number | null = null
  private talkTestTimer: number | null = null
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
    this.recomputeTalk(false)
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
      talk: cloneTalk(this.talk),
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
    const next = {
      ...this.settings,
      ...patch,
      hotkeys: patch.hotkeys ? { ...this.settings.hotkeys, ...patch.hotkeys } : this.settings.hotkeys,
      gameTalkKeys: patch.gameTalkKeys ? [...patch.gameTalkKeys] : this.settings.gameTalkKeys,
    }
    validateTalkSettings(next, this.pads)
    this.settings = {
      ...next,
      hotkeys: { ...next.hotkeys },
      gameTalkKeys: [...next.gameTalkKeys],
    }
    if (this.settings.micMode !== 'toggle') this.toggledMicOpen = false
    this.emit('settings', cloneSettings(this.settings))
    this.recomputeTalk()
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
    this.clipHolding = false
    this.toggledMicOpen = false
    if (this.sendingTimer !== null) window.clearTimeout(this.sendingTimer)
    this.sendingTimer = null
    this.clearTalkTimers()
    this.emit('playback', { ...this.playback })
    this.recomputeTalk()
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

  async testTalkKeys(): Promise<void> {
    if (this.talk.blocked) {
      throw new Error(this.talk.blocked)
    }
    if (this.talkTestTimer !== null) window.clearTimeout(this.talkTestTimer)
    this.talkTestTimer = window.setTimeout(() => {
      this.talkTestTimer = null
      this.recomputeTalk()
    }, 2000)
    this.recomputeTalk()
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
  onTalk: EngineApi['onTalk'] = (handler) => this.subscribe('talk', handler)
  onFileDrop: EngineApi['onFileDrop'] = (handler) => this.subscribe('file-drop', handler)
  simulateKey(key: string): void {
    if (this.keyCapture) {
      this.keyCapture = false
      this.emit('key-captured', { key })
      return
    }
    this.simulateKeyDown(key)
    this.simulateKeyUp(key)
  }

  simulateKeyDown(key: string): void {
    if (this.keyCapture) {
      this.keyCapture = false
      this.emit('key-captured', { key })
      return
    }
    const talkKey = this.settings.hotkeys.talk
    if (!talkKey || key !== talkKey || this.settings.micMode === 'open') {
      return
    }
    if (this.settings.micMode === 'pushToTalk') {
      this.heldKeys = new Set([...this.heldKeys, key])
    } else if (!this.heldKeys.has(key)) {
      this.toggledMicOpen = !this.toggledMicOpen
      this.heldKeys = new Set([...this.heldKeys, key])
    }
    this.recomputeTalk()
  }

  simulateKeyUp(key: string): void {
    if (!this.heldKeys.has(key)) {
      return
    }
    this.heldKeys = new Set([...this.heldKeys].filter((item) => item !== key))
    this.recomputeTalk()
  }

  emitError(message: string): void {
    this.emit('error', { message })
  }

  simulateTalkBlocked(message: string | null): void {
    this.talk = { ...this.talk, blocked: message }
    this.emit('talk', cloneTalk(this.talk))
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
    if (this.sendingTimer !== null) window.clearTimeout(this.sendingTimer)
    this.clearTalkTimers()
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
      mic: this.settings.micEnabled && this.talk.micOpen ? walk(this.meters.mic, this.random) * 0.5 : 0,
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
    this.clipHolding = true
    if (this.sendingTimer !== null) window.clearTimeout(this.sendingTimer)
    this.sendingTimer = window.setTimeout(() => {
      this.sendingTimer = null
      this.playback = { ...this.playback, sending: false }
      this.emit('playback', { ...this.playback })
      this.releaseClipAfterTail()
    }, 650)
    this.emit('playback', { ...this.playback })
    this.recomputeTalk()
  }

  private releaseClipAfterTail(): void {
    if (this.talkTailTimer !== null) window.clearTimeout(this.talkTailTimer)
    this.talkTailTimer = window.setTimeout(() => {
      this.talkTailTimer = null
      this.clipHolding = false
      this.recomputeTalk()
    }, this.settings.talkTailMs)
  }

  private clearTalkTimers(): void {
    if (this.talkTailTimer !== null) window.clearTimeout(this.talkTailTimer)
    if (this.talkTestTimer !== null) window.clearTimeout(this.talkTestTimer)
    this.talkTailTimer = null
    this.talkTestTimer = null
  }

  private recomputeTalk(emitChange = true): void {
    const next = nextTalkState({
      settings: this.settings,
      current: this.talk,
      heldKeys: this.heldKeys,
      toggledMicOpen: this.toggledMicOpen,
      clipHolding: this.clipHolding,
      testingKeys: this.talkTestTimer !== null,
    })
    if (!talkEqual(this.talk, next)) {
      this.talk = next
      if (emitChange) this.emit('talk', cloneTalk(this.talk))
    } else {
      this.talk = next
    }
  }
}

export function createFakeApi(options?: FakeOptions): FakeEngineApi {
  return new FakeEngineApi(options)
}
