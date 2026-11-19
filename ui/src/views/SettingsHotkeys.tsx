import { useEffect, useRef, useState } from 'react'
import type { Hotkeys, PadInfo, Settings } from '../engine/types'
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
/** The talk key lives with your voice, under Mic. */
const SHOWN_KEYS: readonly MainHotkey[] = ['grab', 'send', 'stop', 'save', 'sendAlt']

const MAIN_LABELS: Record<MainHotkey, string> = {
  grab: 'Clip',
  send: 'Send',
  sendAlt: 'Also send',
  stop: 'Stop',
  save: 'Save to pad',
  talk: 'Talk',
}

interface HotkeysTabProps {
  settings: Settings
  pads: Array<PadInfo | null>
}

export function HotkeysTab({ settings, pads }: HotkeysTabProps) {
  const filled = pads.flatMap((pad, slot) => (pad ? [{ pad, slot }] : []))
  const hints: Partial<Record<MainHotkey, string>> = {
    grab: `Grabs the last ${settings.grabSeconds} s`,
    send: 'Plays the clip to your team',
    stop: 'Stops whatever is playing',
    save: 'Then press a pad’s key',
  }
  return (
    <>
      <section className="group">
        <span className="label">Clips</span>
        <div className="hotkey-list">
          {SHOWN_KEYS.map((key) => (
            <HotkeyRow key={key} label={MAIN_LABELS[key]} hint={hints[key]} target={{ kind: 'main', key }} value={settings.hotkeys[key]} />
          ))}
        </div>
        <span className="hint">Mouse side buttons work too.</span>
      </section>
      <section className="group">
        <span className="label">Pads</span>
        {filled.length > 0 ? (
          <div className="hotkey-list">
            {filled.map(({ pad, slot }) => (
              <HotkeyRow key={slot} label={pad.name} hint={padHint(pad, slot)} target={{ kind: 'pad', slot }} value={pad.hotkey} />
            ))}
          </div>
        ) : (
          <span className="hint">Fill a pad to give it a key.</span>
        )}
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
  /** Setup leaves Clear out, so a key can't be lost by accident. */
  clearable?: boolean
}

export function HotkeyRow({ label, target, value, hint, readOnly, clearable = true }: HotkeyRowProps) {
  const { api, state } = useEngine()
  const [capturing, setCapturing] = useState(false)
  const [pending, setPending] = useState<PendingConflict | null>(null)
  const latest = useRef({ settings: state.settings, pads: state.pads, target })

  useEffect(() => {
    latest.current = { settings: state.settings, pads: state.pads, target }
  })

  const escapeCaptured = useEscapeEndsCapture(capturing, () => setCapturing(false))

  useEffect(() => {
    if (!capturing) return undefined
    let captured = false
    const off = once(
      api.onKeyCaptured(({ key }) => {
        captured = true
        off()
        setCapturing(false)
        // Escape cancels capture; it is never bound.
        if (key === 'escape') {
          escapeCaptured()
          return
        }
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
  }, [api, capturing, escapeCaptured])

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
            {clearable ? (
              <button
                type="button"
                className="button small ghost"
                disabled={readOnly || value === null}
                aria-label={`Clear ${label} hotkey`}
                onClick={() => state.settings && void applyBinding(api, state.settings, target, null, null)}
              >
                Clear
              </button>
            ) : null}
          </>
        )}
      </span>
    </div>
  )
}

function padHint(pad: PadInfo, slot: number): string | undefined {
  return pad.name === `Pad ${slot + 1}` ? undefined : `Pad ${slot + 1}`
}

/** How long after the engine reports Escape the same key press may still reach the page. */
const ESCAPE_ECHO_MS = 500

/**
 * Lets Escape end a key capture and nothing else. One press reaches both the page and the
 * engine, in either order, and the pad sheet around a hotkey row closes on Escape too.
 * Returns what to call when the engine reports Escape, so its page echo is held back as well.
 */
function useEscapeEndsCapture(capturing: boolean, stop: () => void): () => void {
  const echoUntil = useRef(0)
  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  })
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!capturing && performance.now() > echoUntil.current) return
      event.stopImmediatePropagation()
      echoUntil.current = 0
      stopRef.current()
    }
    // Capture phase on the window runs before the sheet's own Escape listener.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing])
  const [escapeCaptured] = useState(() => () => {
    echoUntil.current = performance.now() + ESCAPE_ECHO_MS
  })
  return escapeCaptured
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
