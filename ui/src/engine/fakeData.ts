import type { AudioApp, ClipInfo, DeviceInfo, PadInfo, Settings } from './types'

export function makeDevices(): DeviceInfo[] {
  return [
    { id: 'headphones', name: 'Headphones', direction: 'output', isDefault: true, virtualCable: null },
    { id: 'speakers', name: 'Speakers', direction: 'output', isDefault: false, virtualCable: null },
    { id: 'vb-output', name: 'CABLE Input (VB-Audio Virtual Cable)', direction: 'output', isDefault: false, virtualCable: 'vbcable' },
    { id: 'voicemod-output', name: 'Voicemod Virtual Audio Device', direction: 'output', isDefault: false, virtualCable: 'voicemod' },
    { id: 'mic', name: 'Microphone', direction: 'input', isDefault: true, virtualCable: null },
    { id: 'vb-input', name: 'CABLE Output (VB-Audio Virtual Cable)', direction: 'input', isDefault: false, virtualCable: 'vbcable' },
  ]
}

export function makeApps(): AudioApp[] {
  return [
    { pid: 4024, exe: 'Discord.exe', name: 'Discord', active: true, peak: 0.58 },
    { pid: 9260, exe: 'VALORANT-Win64-Shipping.exe', name: 'VALORANT', active: false, peak: 0.1 },
    { pid: 7112, exe: 'Spotify.exe', name: 'Spotify', active: false, peak: 0.04 },
  ]
}

export function makeClip(id: string, seconds: number, random: () => number): ClipInfo {
  return { id, seconds, peaks: makePeaks(120, Math.round(seconds * 10), random), savedPath: null }
}

export function makePad(slot: number, name: string, seconds: number, source: number[], hotkey: string | null): PadInfo {
  const stride = Math.max(1, Math.floor(source.length / 48))
  const peaks = Array.from({ length: 48 }, (_, index) => source[index * stride] ?? 0)
  return { slot, name, seconds, volume: 0.8, hotkey, peaks }
}

export function makePeaks(count: number, seed: number, random: () => number): number[] {
  let value = (seed % 10) / 20 + 0.15
  return Array.from({ length: count }, (_, index) => {
    value = clamp(value + (random() - 0.5) * 0.22)
    const pulse = index % 17 === 0 ? 0.25 : 0
    return clamp(value + pulse)
  })
}

export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

/** Speech-like level for live strip tick `index`: phrases of about 2.4 s, then pauses. */
export function speechLevel(index: number, random: () => number): number {
  const phase = index % 40
  if (phase >= 24) return 0.02 + random() * 0.03
  return clamp(0.15 + random() * 0.75 * Math.sin((Math.PI * phase) / 24))
}

export function walk(value: number, random: () => number): number {
  return clamp(value + (random() - 0.48) * 0.16)
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function cleanName(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? ''
  return file.replace(/\.[^.]+$/, '')
}

export function requirePad(pads: Array<PadInfo | null>, slot: number): PadInfo {
  const pad = pads[slot]
  if (!pad) {
    throw new Error('Pad is empty')
  }
  return pad
}

export function cloneSettings(settings: Settings): Settings {
  return { ...settings, source: { ...settings.source }, hotkeys: { ...settings.hotkeys } }
}

export function cloneDevices(devices: DeviceInfo[]): DeviceInfo[] {
  return devices.map((device) => ({ ...device }))
}

export function cloneClip(clip: ClipInfo): ClipInfo {
  return { ...clip, peaks: [...clip.peaks] }
}

export function clonePad(pad: PadInfo): PadInfo {
  return { ...pad, peaks: [...pad.peaks] }
}

export function clonePads(pads: Array<PadInfo | null>): Array<PadInfo | null> {
  return pads.map((pad) => (pad ? clonePad(pad) : null))
}
