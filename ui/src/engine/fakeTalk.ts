import { keyLabel } from '../keys'
import type { PadInfo, Settings, TalkState } from './types'

const MAIN_HOTKEY_LABELS: Record<keyof Settings['hotkeys'], string> = {
  grab: 'Clip',
  send: 'Send',
  sendAlt: 'Send (second key)',
  stop: 'Stop',
  save: 'Save to pad',
  talk: 'Talk',
}

export interface TalkInputs {
  settings: Settings
  current: TalkState
  heldKeys: Set<string>
  toggledMicOpen: boolean
  clipHolding: boolean
  testingKeys: boolean
}

export function nextTalkState({ settings, current, heldKeys, toggledMicOpen, clipHolding, testingKeys }: TalkInputs): TalkState {
  const micOpen = nextMicOpen(settings, heldKeys, toggledMicOpen)
  const shouldHoldForClips = settings.pressTalkKeys === 'clips' || settings.pressTalkKeys === 'clipsAndMic'
  const shouldHoldForMic = settings.pressTalkKeys === 'clipsAndMic' && settings.micMode !== 'open' && micOpen
  const holding = testingKeys || (clipHolding && shouldHoldForClips) || shouldHoldForMic ? [...settings.gameTalkKeys] : []
  return { micOpen, holding, blocked: current.blocked }
}

export function talkEqual(a: TalkState, b: TalkState): boolean {
  return a.micOpen === b.micOpen && a.blocked === b.blocked && a.holding.join('\0') === b.holding.join('\0')
}

export function validateTalkSettings(settings: Settings, pads: Array<PadInfo | null>): void {
  if (settings.talkLeadMs < 0 || settings.talkLeadMs > 500) throw new Error('Head start must be between 0 and 500 ms.')
  if (settings.talkTailMs < 0 || settings.talkTailMs > 2000) throw new Error('Release delay must be between 0 and 2000 ms.')
  if (settings.gameTalkKeys.length < 1 || settings.gameTalkKeys.length > 3) throw new Error('Choose 1 to 3 game keys.')
  if (new Set(settings.gameTalkKeys).size !== settings.gameTalkKeys.length) throw new Error('Game keys must be unique.')
  const talkKey = settings.hotkeys.talk
  if (talkKey) {
    const conflict = ringpadBindings(settings, pads).find((binding) => binding.key === talkKey)
    if (conflict) throw new Error(`${keyLabel(talkKey)} is used by ${conflict.label}.`)
  }
  const gameConflict = settings.gameTalkKeys
    .map((key) => ({ key, conflict: ringpadBindings(settings, pads).find((binding) => binding.key === key) }))
    .find((item) => item.conflict)
  if (gameConflict?.conflict) throw new Error(`${keyLabel(gameConflict.key)} is used by ${gameConflict.conflict.label}.`)
}

function nextMicOpen(settings: Settings, heldKeys: Set<string>, toggledMicOpen: boolean): boolean {
  if (settings.micMode === 'open') return true
  const talkKey = settings.hotkeys.talk
  if (!talkKey) return false
  return settings.micMode === 'pushToTalk' ? heldKeys.has(talkKey) : toggledMicOpen
}

/** Every key Ringpad listens for except the talk key itself (it may match the game's talk key). */
function ringpadBindings(settings: Settings, pads: Array<PadInfo | null>): Array<{ key: string; label: string }> {
  const main = (Object.keys(settings.hotkeys) as Array<keyof Settings['hotkeys']>).flatMap((name) => {
    const key = settings.hotkeys[name]
    if (!key || name === 'talk') return []
    return [{ key, label: MAIN_HOTKEY_LABELS[name] }]
  })
  const padBindings = pads.flatMap((pad, slot) => (pad?.hotkey ? [{ key: pad.hotkey, label: `Pad ${slot + 1}` }] : []))
  return [...main, ...padBindings]
}
