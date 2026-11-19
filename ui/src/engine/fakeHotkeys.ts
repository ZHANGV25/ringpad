import { DEFAULT_PAD_HOTKEYS, type PadInfo, type Settings } from './types'

/** What a global key press does, as in the real engine (app/src/hotkeys.rs). */
export type HotkeyAction =
  | { kind: 'grab' }
  | { kind: 'send' }
  | { kind: 'stop' }
  | { kind: 'save' }
  | { kind: 'pad'; slot: number }

/** The action bound to `key`, or null. Main keys win over a pad with the same key. */
export function hotkeyAction(key: string, settings: Settings, pads: ReadonlyArray<PadInfo | null>): HotkeyAction | null {
  const { grab, send, sendAlt, stop, save } = settings.hotkeys
  if (key === grab) return { kind: 'grab' }
  if (key === send || key === sendAlt) return { kind: 'send' }
  if (key === stop) return { kind: 'stop' }
  if (key === save) return { kind: 'save' }
  const slot = pads.findIndex((pad, index) => padHotkey(pad, index) === key)
  return slot === -1 ? null : { kind: 'pad', slot }
}

/** An empty slot keeps its default key, as the real pad store does, so F6 then F1 can fill it. */
function padHotkey(pad: PadInfo | null, slot: number): string | null {
  return pad ? pad.hotkey : (DEFAULT_PAD_HOTKEYS[slot] ?? null)
}
