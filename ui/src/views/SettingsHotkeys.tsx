import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PAD_HOTKEYS, type Hotkeys, type PadInfo, type Settings } from '../engine/types'
import type { EngineApi, Unsubscribe } from '../engine/api'
import { keyLabel } from '../keys'
import { KeyChip } from '../components/controls'
import { useEngine } from '../state/EngineProvider'

type MainHotkey = keyof Hotkeys
export type HotkeyTarget = { kind: 'main'; key: MainHotkey } | { kind: 'pad'; slot: number }

interface Binding {
  label: string
  target: HotkeyTarget
  value: string | null
}

interface PendingConflict {
  key: string
  conflict: Binding
}

const MAIN_KEYS: readonly MainHotkey[] = ['grab', 'send', 'sendAlt', 'stop', 'save', 'talk']

const MAIN_LABELS: Record<MainHotkey, string> = {
  grab: 'Clip',
  send: 'Send',
  sendAlt: 'Send (second key)',
  stop: 'Stop',
  save: 'Save to pad',
  talk: 'Talk',
}

interface HotkeysTabProps {
  settings: Settings
  pads: Array<PadInfo | null>
}

export function HotkeysTab({ settings, pads }: HotkeysTabProps) {
  return (
    <>
      <section className="group">
        <span className="label">Actions</span>
        <div className="hotkey-list">
          {MAIN_KEYS.map((key) => (
            <HotkeyRow
              key={key}
              label={MAIN_LABELS[key]}
              target={{ kind: 'main', key }}
              value={settings.hotkeys[key]}
              hint={key === 'talk' ? 'Set it in Talk' : undefined}
              readOnly={key === 'talk'}
            />
          ))}
        </div>
      </section>
      <section className="group">
        <span className="label">Pads</span>
        <div className="hotkey-list">
          {pads.map((pad, slot) => (
            <HotkeyRow
              key={slot}
              label={pad?.name ?? `Pad ${slot + 1}`}
              hint={padHint(pad, slot)}
              target={{ kind: 'pad', slot }}
              value={pad?.hotkey ?? DEFAULT_PAD_HOTKEYS[slot] ?? null}
              readOnly={!pad}
            />
          ))}
        </div>
        <span className="hint">
          Mouse side buttons work too. If a button does nothing, your mouse software may remap it; whatever it sends
          shows up here when you press Change.
        </span>
      </section>
    </>
  )
}

interface HotkeyRowProps {
  label: string
  target: HotkeyTarget
  value: string | null
  hint?: string
  readOnly?: boolean
}

export function HotkeyRow({ label, target, value, hint, readOnly }: HotkeyRowProps) {
  const { api, state } = useEngine()
  const [capturing, setCapturing] = useState(false)
  const [pending, setPending] = useState<PendingConflict | null>(null)
  const latest = useRef({ settings: state.settings, pads: state.pads, target })

  useEffect(() => {
    latest.current = { settings: state.settings, pads: state.pads, target }
  })

  useEffect(() => {
    if (!capturing) return undefined
    let captured = false
    const off = once(
      api.onKeyCaptured(({ key }) => {
        captured = true
        off()
        setCapturing(false)
        // Escape cancels capture; it is never bound.
        if (key === 'escape') return
        const { settings, pads, target: current } = latest.current
        if (!settings) return
        const conflict = findConflict(key, current, settings, pads)
        if (conflict) setPending({ key, conflict })
        else void applyBinding(api, settings, current, key, null)
      }),
    )
    void api.beginKeyCapture()
    return () => {
      off()
      if (!captured) void api.cancelKeyCapture()
    }
  }, [api, capturing])

  if (pending && state.settings) {
    const settings = state.settings
    return (
      <div className="hotkey-row conflict">
        <span className="hotkey-name">
          <span>{label}</span>
          <span className="hint">
            {keyLabel(pending.key)} is used by {pending.conflict.label}. Use it here instead?
          </span>
        </span>
        <span className="hotkey-actions">
          <button
            type="button"
            className="button small primary"
            onClick={() => {
              setPending(null)
              void applyBinding(api, settings, target, pending.key, pending.conflict.target)
            }}
          >
            Replace
          </button>
          <button type="button" className="button small" onClick={() => setPending(null)}>
            Cancel
          </button>
        </span>
      </div>
    )
  }
  return (
    <div className="hotkey-row">
      <span className="hotkey-name">
        <span>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </span>
      <KeyChip name={value} faint={readOnly} capturing={capturing} />
      <span className="hotkey-actions">
        {capturing ? (
          <button type="button" className="button small ghost" onClick={() => setCapturing(false)}>
            Cancel
          </button>
        ) : (
          <>
            <button type="button" className="button small" disabled={readOnly} onClick={() => setCapturing(true)}>
              Change
            </button>
            <button
              type="button"
              className="button small ghost"
              disabled={readOnly || value === null}
              aria-label={`Clear ${label} hotkey`}
              onClick={() => state.settings && void applyBinding(api, state.settings, target, null, null)}
            >
              Clear
            </button>
          </>
        )}
      </span>
    </div>
  )
}

function padHint(pad: PadInfo | null, slot: number): string | undefined {
  if (!pad) return 'Empty: save a clip to this pad first'
  return pad.name === `Pad ${slot + 1}` ? undefined : `Pad ${slot + 1}`
}

function once(unsubscribe: Unsubscribe): Unsubscribe {
  let done = false
  return () => {
    if (done) return
    done = true
    unsubscribe()
  }
}

function findConflict(
  key: string,
  target: HotkeyTarget,
  settings: Settings,
  pads: Array<PadInfo | null>,
): Binding | null {
  return bindingsFor(settings, pads).find((binding) => binding.value === key && !sameTarget(binding.target, target)) ?? null
}

function bindingsFor(settings: Settings, pads: Array<PadInfo | null>): Binding[] {
  const main = MAIN_KEYS.map((key): Binding => ({
    label: MAIN_LABELS[key],
    target: { kind: 'main', key },
    value: settings.hotkeys[key],
  }))
  const padBindings = pads.flatMap((pad, slot): Binding[] =>
    pad?.hotkey ? [{ label: `Pad ${slot + 1}`, target: { kind: 'pad', slot }, value: pad.hotkey }] : [],
  )
  return [...main, ...padBindings]
}

function sameTarget(a: HotkeyTarget, b: HotkeyTarget): boolean {
  if (a.kind === 'main' && b.kind === 'main') return a.key === b.key
  if (a.kind === 'pad' && b.kind === 'pad') return a.slot === b.slot
  return false
}

/**
 * Binds `key` to `target`, first clearing `clearing` (the action that held the key before).
 * Main hotkeys change in one settings patch so the cleared and the new binding cannot race.
 */
export async function applyBinding(
  api: EngineApi,
  settings: Settings,
  target: HotkeyTarget,
  key: string | null,
  clearing: HotkeyTarget | null,
): Promise<void> {
  const hotkeys = [clearing, target].reduce<Hotkeys>((current, item) => {
    if (item?.kind !== 'main') return current
    return { ...current, [item.key]: item === clearing ? null : key }
  }, settings.hotkeys)
  if (clearing?.kind === 'pad') await api.setPadHotkey({ slot: clearing.slot, hotkey: null })
  if (hotkeys !== settings.hotkeys) await api.updateSettings({ patch: { hotkeys } })
  if (target.kind === 'pad') await api.setPadHotkey({ slot: target.slot, hotkey: key })
}
